/**
 * 自動下書き投稿（サーバー専用）。
 *
 * 指定曜日・時刻（JST）に、Ahrefsデータ・競合分析のKW機会・既存記事を
 * 統合してターゲットKWを自動選定し、記事生成（一次執筆→推敲→スラッグ生成）
 * →S3保存→WordPress下書き投稿までを実行する。
 *
 * 実行トリガーは Vercel Cron（毎時起動）＋本モジュールのJST判定。
 * 設定・実行履歴は S3 の automation/auto-draft.json に保存する。
 */

import { getS3ObjectAsBuffer, getS3ObjectAsText, getS3ObjectsAsTextBatch, listS3Objects, putS3Object } from './s3Reference'
import { analyzeKeywords } from './ahrefsAnalyzer'
import { buildKwPrompt } from './kwPromptBuilder'
import { generateFirstDraftFromPrompt, refineArticleWithGemini, generateSlugFromGemini } from './api/gemini'
import { postToWordPress } from './wordpress'
import { buildKeywordOpportunities, loadCompetitiveAnalysis, loadCompetitorConfig } from './competitiveAnalysis'
import { embedText, loadEmbeddingIndex, topKByCosine } from './embeddings'
import type { AhrefsDataset } from './ahrefsCsvParser'
import type { SavedArticle } from './types'

const CONFIG_KEY = 'automation/auto-draft.json'
const KW_PREFIX = 'kw-analysis/'
const KW_INDEX_KEY = `${KW_PREFIX}index.json`
const ARTICLES_PREFIX = 'articles/'
const MAX_HISTORY = 20

// ── 設定・履歴 ────────────────────────────────────────

export interface AutoDraftRun {
  ranAt: string
  trigger: 'cron' | 'manual'
  status: 'success' | 'error'
  keyword?: string
  /** KW選定の理由（履歴で振り返れるように保存） */
  keywordReason?: string
  articleId?: string
  articleTitle?: string
  wordpressUrl?: string
  /** アイキャッチに使ったインポート画像のID（直近との重複回避に使用） */
  imageId?: string
  error?: string
}

export interface AutoDraftConfig {
  enabled: boolean
  /** 実行する曜日（0=日, 1=月, ... 6=土） */
  daysOfWeek: number[]
  /** 実行時刻（JSTの時。0〜23） */
  hourJst: number
  /** AIへの追加指示（記事の方向性など） */
  extraInstruction: string
  /** cronの当日二重実行防止（JSTのYYYY-MM-DD） */
  lastRunDate?: string
  history: AutoDraftRun[]
}

export const DEFAULT_AUTO_DRAFT_CONFIG: AutoDraftConfig = {
  enabled: false,
  daysOfWeek: [1, 3, 5],
  hourJst: 10,
  extraInstruction: '',
  history: [],
}

export async function loadAutoDraftConfig(): Promise<AutoDraftConfig> {
  const obj = await getS3ObjectAsText(CONFIG_KEY)
  if (!obj) return { ...DEFAULT_AUTO_DRAFT_CONFIG }
  try {
    const parsed = JSON.parse(obj.content) as Partial<AutoDraftConfig>
    return {
      enabled: parsed.enabled === true,
      daysOfWeek: Array.isArray(parsed.daysOfWeek) && parsed.daysOfWeek.length > 0
        ? parsed.daysOfWeek.filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
        : [...DEFAULT_AUTO_DRAFT_CONFIG.daysOfWeek],
      hourJst: Number.isInteger(parsed.hourJst) && (parsed.hourJst as number) >= 0 && (parsed.hourJst as number) <= 23
        ? (parsed.hourJst as number)
        : DEFAULT_AUTO_DRAFT_CONFIG.hourJst,
      extraInstruction: typeof parsed.extraInstruction === 'string' ? parsed.extraInstruction : '',
      lastRunDate: typeof parsed.lastRunDate === 'string' ? parsed.lastRunDate : undefined,
      history: Array.isArray(parsed.history) ? (parsed.history as AutoDraftRun[]).slice(0, MAX_HISTORY) : [],
    }
  } catch {
    return { ...DEFAULT_AUTO_DRAFT_CONFIG }
  }
}

export async function saveAutoDraftConfig(config: AutoDraftConfig): Promise<void> {
  const ok = await putS3Object(CONFIG_KEY, JSON.stringify(config, null, 2))
  if (!ok) throw new Error('自動下書き設定のS3保存に失敗しました')
}

/** JSTの現在時刻情報 */
export function jstNowParts(): { date: string; day: number; hour: number } {
  const jst = new Date(Date.now() + 9 * 3_600_000)
  return {
    date: jst.toISOString().slice(0, 10),
    day: jst.getUTCDay(),
    hour: jst.getUTCHours(),
  }
}

// ── KW自動選定 ────────────────────────────────────────

interface DatasetMeta {
  id: string
  fileName: string
  type: 'keywords' | 'organic'
  rowCount: number
  uploadedAt: string
}

export interface SelectedKeyword {
  keyword: string
  volume?: number
  kd?: number
  cpc?: number
  trend?: 'up' | 'down' | 'stable'
  detectedCategory?: string
  /** 選定理由（履歴・プロンプトに使用） */
  reason: string
}

function normalizeKeyword(keyword: string): string {
  return keyword.toLocaleLowerCase('ja-JP').replace(/\s+/g, '').replace(/[　・、。，,]/g, '')
}

async function loadAhrefsDatasets(): Promise<{ keywordRows: AhrefsDataset['keywords']; organicRows: AhrefsDataset['keywords'] }> {
  const indexObj = await getS3ObjectAsText(KW_INDEX_KEY)
  if (!indexObj) return { keywordRows: [], organicRows: [] }
  let metas: DatasetMeta[] = []
  try {
    metas = JSON.parse(indexObj.content) as DatasetMeta[]
  } catch {
    return { keywordRows: [], organicRows: [] }
  }
  const objects = await getS3ObjectsAsTextBatch(metas.map(m => `${KW_PREFIX}datasets/${m.id}.json`))
  const keywordRows: AhrefsDataset['keywords'] = []
  const organicRows: AhrefsDataset['keywords'] = []
  for (const obj of objects) {
    try {
      const dataset = JSON.parse(obj.content) as AhrefsDataset
      if (dataset.type === 'organic') organicRows.push(...dataset.keywords)
      else keywordRows.push(...dataset.keywords)
    } catch { /* skip malformed */ }
  }
  return { keywordRows, organicRows }
}

async function loadExistingArticleKeywords(): Promise<{ normalizedKeywords: Set<string>; titles: string[] }> {
  const objects = await listS3Objects(ARTICLES_PREFIX)
  const contents = await getS3ObjectsAsTextBatch(objects.filter(o => o.key.endsWith('.json')).map(o => o.key))
  const normalizedKeywords = new Set<string>()
  const titles: string[] = []
  for (const obj of contents) {
    try {
      const article = JSON.parse(obj.content) as SavedArticle
      if (article.targetKeyword?.trim()) normalizedKeywords.add(normalizeKeyword(article.targetKeyword))
      const title = article.refinedTitle || article.title
      if (title) titles.push(title)
    } catch { /* skip malformed */ }
  }
  return { normalizedKeywords, titles }
}

/** 競合ブランド名を含むKWは自社記事のターゲットにしない */
async function loadCompetitorBrandTokens(): Promise<string[]> {
  const config = await loadCompetitorConfig().catch(() => [])
  const tokens = new Set<string>()
  for (const c of config) {
    // 名前から括弧・記号を除いた主要トークン
    for (const part of c.name.split(/[（）()\s・/]+/)) {
      const t = part.trim().toLocaleLowerCase('ja-JP')
      if (t.length >= 3) tokens.add(t)
    }
    // ドメインの最初のラベル（biz.moneyforward.com → moneyforward の抽出は2番目）
    const labels = c.domain.split('.')
    for (const label of labels.slice(0, -1)) {
      if (label.length >= 4 && label !== 'www' && label !== 'biz') tokens.add(label.toLocaleLowerCase())
    }
  }
  return [...tokens]
}

/**
 * Ahrefs・競合分析・既存記事を統合してターゲットKWを1つ選ぶ。
 *
 * 目的は「順位が上がり、実際の流入増加が見込めるKW」を選ぶこと。
 * スコア = Ahrefs機会スコア(volume/KD/CPC) + priority加点 + 競合ギャップ加点
 *        + トラフィック期待値加点 + 追い上げ圏（21〜50位）加点。
 * 除外: 既存記事のターゲットKW / 自社が既に20位以内のKW /
 *       競合ブランド名を含むKW / 過去の自動実行で使用したKW / branded判定のKW。
 */
export async function selectTargetKeyword(config: AutoDraftConfig): Promise<SelectedKeyword> {
  const [{ keywordRows, organicRows }, existing, brandTokens, analysisDoc] = await Promise.all([
    loadAhrefsDatasets(),
    loadExistingArticleKeywords(),
    loadCompetitorBrandTokens(),
    loadCompetitiveAnalysis().catch(() => null),
  ])
  const opportunities = analysisDoc ? await buildKeywordOpportunities(analysisDoc).catch(() => []) : []

  const usedByAutomation = new Set(
    config.history.filter(h => h.keyword).map(h => normalizeKeyword(h.keyword!))
  )
  const ownRanking = new Map<string, number>()
  for (const row of organicRows) {
    if (row.position != null) {
      const key = normalizeKeyword(row.keyword)
      const current = ownRanking.get(key)
      if (current == null || row.position < current) ownRanking.set(key, row.position)
    }
  }
  const opportunityMap = new Map(opportunities.map(o => [normalizeKeyword(o.keyword), o]))

  const isExcluded = (keyword: string): boolean => {
    const norm = normalizeKeyword(keyword)
    if (!norm) return true
    if (existing.normalizedKeywords.has(norm)) return true
    if (usedByAutomation.has(norm)) return true
    const ownPos = ownRanking.get(norm)
    if (ownPos != null && ownPos <= 20) return true
    const lower = keyword.toLocaleLowerCase('ja-JP')
    if (brandTokens.some(t => lower.includes(t))) return true
    return false
  }

  // 第一候補: Ahrefs KWデータセットをスコアリング
  if (keywordRows.length > 0) {
    const scored = analyzeKeywords(keywordRows)
    let best: { row: (typeof scored)[number]; total: number; gapBonus: number; trafficBonus: number; climbBonus: number; ownPos?: number } | null = null
    for (const row of scored) {
      if (row.branded) continue
      if (row.volume < 30) continue
      if (isExcluded(row.keyword)) continue
      const norm = normalizeKeyword(row.keyword)
      const opp = opportunityMap.get(norm)
      const gapBonus = opp?.opportunity === 'gap' ? 15 : opp?.opportunity === 'weak' ? 8 : 0
      // トラフィック期待値（KW Explorer由来データのみ持つ）を加点し、実流入増を重視
      const trafficBonus = row.trafficPotential > 0 ? Math.min(row.trafficPotential / 200, 10) : 0
      // 21〜50位は「追い上げれば1ページ目に届く」圏内として優先度を上げる
      const ownPos = ownRanking.get(norm)
      const climbBonus = ownPos != null && ownPos <= 50 ? 12 : 0
      const total = row.opportunityScore + row.priority * 5 + gapBonus + trafficBonus + climbBonus
      if (!best || total > best.total) best = { row, total, gapBonus, trafficBonus, climbBonus, ownPos }
    }
    if (best) {
      const { row, gapBonus, trafficBonus, climbBonus, ownPos } = best
      const reasonParts = [
        `月間検索${row.volume}回 / KD${row.kd} / 機会スコア${row.opportunityScore}`,
        row.priority >= 3 ? '優先度: 即攻め' : row.priority === 2 ? '優先度: 高' : '',
        gapBonus >= 15 ? '競合が上位表示中だが自社は未露出（ギャップKW）' : gapBonus >= 8 ? '自社の露出が弱いKW' : '',
        climbBonus > 0 ? `現在${ownPos}位（追い上げれば上位表示・流入増が見込める圏内）` : '',
        trafficBonus > 0 ? `トラフィック期待値あり（上位表示時の見込み流入が高い）` : '',
      ].filter(Boolean)
      return {
        keyword: row.keyword,
        volume: row.volume,
        kd: row.kd,
        cpc: row.cpc,
        trend: row.trend,
        detectedCategory: row.detectedCategory,
        reason: reasonParts.join('。'),
      }
    }
  }

  // 第二候補: 競合分析のギャップKW（Ahrefs KWデータセットが無い/全滅の場合）
  const gapCandidates = opportunities
    .filter(o => o.opportunity === 'gap' && o.volume >= 30 && !isExcluded(o.keyword))
    .sort((a, b) => b.volume - a.volume)
  const gap = gapCandidates[0]
  if (gap) {
    return {
      keyword: gap.keyword,
      volume: gap.volume,
      reason: `競合（${gap.competitors.map(c => c.name).join('・')}）が上位表示中だが自社は未露出のギャップKW。月間検索${gap.volume}回`,
    }
  }

  throw new Error('選定できるキーワードがありません。KW分析ページでAhrefsデータを取得するか、競合分析でKWを更新してください。')
}

// ── アイキャッチ画像の選定 ────────────────────────────────

const IMPORTED_IMAGES_PREFIX = 'images/imported/'
/** この回数分の直近実行で使った画像は再利用しない */
const IMAGE_REUSE_LOOKBACK = 5

interface ImportedImageMeta {
  id: string
  key: string
  title?: string
  filename?: string
}

interface SelectedImage {
  id: string
  base64: string
  mimeType: string
}

/**
 * 画像ページのインポート画像からランダムに1枚選ぶ。
 * 直近5回の実行で使った画像は除外し、なるべくばらけるようにする。
 * （全画像が直近使用済みの場合は全体から選び直す）
 */
async function pickImportedImage(history: AutoDraftRun[]): Promise<SelectedImage | null> {
  try {
    const objects = await listS3Objects(IMPORTED_IMAGES_PREFIX)
    const metaKeys = objects.filter(o => o.key.endsWith('.json')).map(o => o.key)
    if (metaKeys.length === 0) return null
    const contents = await getS3ObjectsAsTextBatch(metaKeys)
    const metas: ImportedImageMeta[] = []
    for (const obj of contents) {
      try {
        const meta = JSON.parse(obj.content) as ImportedImageMeta
        if (meta.id && meta.key) metas.push(meta)
      } catch { /* skip malformed */ }
    }
    if (metas.length === 0) return null

    const recentlyUsed = new Set(
      history
        .filter(h => h.imageId)
        .slice(0, IMAGE_REUSE_LOOKBACK)
        .map(h => h.imageId!)
    )
    const candidates = metas.filter(m => !recentlyUsed.has(m.id))
    const pool = candidates.length > 0 ? candidates : metas
    const chosen = pool[Math.floor(Math.random() * pool.length)]!

    const image = await getS3ObjectAsBuffer(chosen.key)
    if (!image) return null
    const ext = chosen.key.includes('.') ? chosen.key.slice(chosen.key.lastIndexOf('.') + 1).toLowerCase() : 'jpg'
    const mimeType = image.contentType
      ?? (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg')
    return {
      id: chosen.id,
      base64: Buffer.from(image.body).toString('base64'),
      mimeType,
    }
  } catch (e) {
    console.warn('[autoDraft] アイキャッチ画像の選定に失敗（画像なしで続行）:', (e as Error)?.message)
    return null
  }
}

// ── 記事生成コンテキスト ────────────────────────────────

/**
 * 一次執筆に渡す参照資料を集める。
 * 意味検索（embeddings）があれば関連チャンクを、なければ
 * materials_for_articles/ のテキストを先頭から上限まで連結する。
 */
async function collectDataContext(prompt: string, keyword: string): Promise<{ dataContext?: string; avoidToneSample?: string }> {
  const CONTEXT_LIMIT = 100_000
  try {
    const index = await loadEmbeddingIndex()
    if (index && index.chunks.length > 0) {
      const queryVec = await embedText(`${prompt}\n${keyword}`)
      const refChunks = topKByCosine(queryVec, index.chunks, 8, ['materials', 'case-studies'])
      const parts = refChunks.map(c => `--- 関連資料（意味検索）：${c.title} ---\n${c.text}`)
      let avoidToneSample: string | undefined
      const similar = topKByCosine(queryVec, index.chunks, 1, ['articles'])
      if (similar.length > 0 && similar[0]!.score > 0.5) {
        avoidToneSample = similar[0]!.text.slice(0, 1500)
      }
      if (parts.length > 0) {
        return { dataContext: parts.join('\n\n').slice(0, CONTEXT_LIMIT), avoidToneSample }
      }
    }
  } catch (e) {
    console.warn('[autoDraft] 意味検索に失敗、資料全文連結にフォールバック:', (e as Error)?.message)
  }

  // フォールバック: materials_for_articles/ のテキストを連結
  try {
    const keys = (await listS3Objects('materials_for_articles/'))
      .map(o => o.key)
      .filter(k => /\.(md|txt|csv)$/i.test(k))
    if (keys.length === 0) return {}
    const objects = await getS3ObjectsAsTextBatch(keys)
    const joined = objects
      .map(o => `--- 資料（S3）：${o.key.split('/').pop()} ---\n${o.content}`)
      .join('\n\n')
    return { dataContext: joined.slice(0, CONTEXT_LIMIT) || undefined }
  } catch {
    return {}
  }
}

// ── 実行パイプライン ────────────────────────────────────

/**
 * 自動下書き投稿を1回実行する。
 * KW選定 → 記事生成 → S3保存 → WordPress下書き投稿 → 履歴保存。
 * 成否にかかわらず履歴に記録し、実行結果を返す。
 */
export async function runAutoDraft(trigger: 'cron' | 'manual'): Promise<AutoDraftRun> {
  const config = await loadAutoDraftConfig()
  const ranAt = new Date().toISOString()

  const record = async (run: AutoDraftRun): Promise<AutoDraftRun> => {
    config.history = [run, ...config.history].slice(0, MAX_HISTORY)
    if (trigger === 'cron') config.lastRunDate = jstNowParts().date
    await saveAutoDraftConfig(config).catch(e => console.error('[autoDraft] 履歴保存に失敗:', e))
    return run
  }

  try {
    // 1. KW選定
    const selected = await selectTargetKeyword(config)
    console.log(`[autoDraft] ターゲットKW選定: 「${selected.keyword}」 (${selected.reason})`)

    // 2. プロンプト組み立て
    let prompt = buildKwPrompt({
      keyword: selected.keyword,
      volume: selected.volume,
      kd: selected.kd,
      cpc: selected.cpc,
      trend: selected.trend,
      detectedCategory: selected.detectedCategory,
    })
    prompt += `\n\n【このKWを選定した根拠（自動選定）】\n${selected.reason}`
    if (config.extraInstruction.trim()) {
      prompt += `\n\n【運用担当者からの追加指示（必ず反映すること）】\n${config.extraInstruction.trim()}`
    }

    // 3. 参照資料収集 → 一次執筆 → 推敲 → スラッグ
    const { dataContext, avoidToneSample } = await collectDataContext(prompt, selected.keyword)
    const { title, content } = await generateFirstDraftFromPrompt(prompt, selected.keyword, dataContext, avoidToneSample)
    const { refinedTitle, refinedContent } = await refineArticleWithGemini(title, content, selected.keyword)
    const slug = await generateSlugFromGemini(refinedTitle || title, selected.keyword, refinedContent)

    // 4. アイキャッチ画像: インポート画像からランダム選定（直近5回使用分は除外）
    const image = await pickImportedImage(config.history)

    // 5. SavedArticle をS3保存
    const articleId = `auto-${Date.now()}`
    const article: SavedArticle = {
      id: articleId,
      title,
      refinedTitle: refinedTitle || title,
      targetKeyword: selected.keyword,
      originalContent: content,
      refinedContent,
      imageUrl: image ? `data:${image.mimeType};base64,${image.base64}` : '',
      status: 'draft',
      createdAt: ranAt,
      slug,
      wordCount: refinedContent.length,
    }
    await putS3Object(`${ARTICLES_PREFIX}${articleId}.json`, JSON.stringify(article))

    // 6. WordPressへ下書き投稿（画像があればアイキャッチとしてアップロード）
    const wpResult = await postToWordPress(
      {
        title: refinedTitle || title,
        content: refinedContent,
        targetKeyword: selected.keyword,
        slug,
        ...(image ? { imageBase64: image.base64, imageBase64MimeType: image.mimeType } : {}),
      },
      'draft'
    )
    article.wordpressUrl = wpResult.link
    article.wordpressPostStatus = wpResult.status
    await putS3Object(`${ARTICLES_PREFIX}${articleId}.json`, JSON.stringify(article))

    return await record({
      ranAt,
      trigger,
      status: 'success',
      keyword: selected.keyword,
      keywordReason: selected.reason,
      articleId,
      articleTitle: refinedTitle || title,
      wordpressUrl: wpResult.link,
      imageId: image?.id,
    })
  } catch (error) {
    console.error('[autoDraft] 実行に失敗:', error)
    return await record({
      ranAt,
      trigger,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
