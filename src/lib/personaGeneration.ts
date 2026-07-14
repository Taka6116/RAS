/**
 * 仮説ペルソナ生成（サーバー専用）。
 *
 * RICE CLOUD（ERP・SaaS導入支援会社）の見込み顧客＝エンドユーザー企業側の
 * 人物像を、S3（data-for-ras）に実在するデータから推定する。
 *
 * 一次データ（存在するものだけを使う。全て任意）:
 * 1. S3 の記事データ（articles/。RICE CLOUDが狙うテーマ・対象KWの実態）
 * 2. S3 の参照資料（materials_for_articles/。会社・サービス・顧客に関する資料）
 * 3. S3 の匿名導入事例（case-studies/ 配下の .md）※あれば
 * 4. WordPress の「導入事例・インタビュー」記事 ※あれば
 * 5. Ahrefs KWデータ（検索需要の定量データ。ブランドKW除外）
 *
 * これらを Claude に渡し、マーケティング戦略用の
 * 「ペルソナ × フェーズ × チャネル × カスタマージャーニー」を
 * 構造化JSONで生成して S3（personas/personas.json）に保存する。
 */

import { generateWithClaude } from '@/lib/api/claude'
import { getS3ObjectAsText, putS3Object, listS3Objects, getS3ObjectsAsTextBatch } from '@/lib/s3Reference'
import { loadRecentDatasets } from '@/lib/ahrefsLoader'
import { fetchInterviewPosts } from '@/lib/wpInterviews'
import type { AhrefsKeywordRow } from '@/lib/ahrefsCsvParser'
import type { SavedArticle } from '@/lib/types'

const PERSONAS_KEY = 'personas/personas.json'
const CASE_STUDIES_PREFIX = 'case-studies/'
const ARTICLES_PREFIX = 'articles/'

/** 1インタビューあたりプロンプトに渡す最大文字数 */
const MAX_INTERVIEW_CHARS = 6000
/** 事例集の最大文字数 */
const MAX_CASE_STUDY_CHARS = 8000
/** 参照資料の最大文字数 */
const MAX_MATERIAL_CHARS = 8000
/** プロンプトに渡す記事数と1記事あたりの抜粋文字数 */
const MAX_ARTICLES = 25
const MAX_ARTICLE_EXCERPT_CHARS = 700
/** プロンプトに渡すKW数 */
const MAX_KEYWORDS = 60

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface PersonaJourneyStage {
  /** フェーズ名（認知 / 情報収集 / 比較検討 / 意思決定 / 導入後） */
  phase: string
  /** そのフェーズでの心理状態・行動 */
  state: string
  /** 主な接点チャネル */
  touchpoints: string[]
  /** 求めている情報 */
  needs: string
  /** 障壁・離脱リスク（※推測を含む） */
  barriers: string
  /** RICE CLOUDが取るべき施策 */
  actions: string
}

export interface PersonaChannelStrategy {
  channel: string
  priority: '高' | '中' | '低'
  approach: string
}

export interface HypothesisPersona {
  id: string
  /** 仮名＋類型（例: 「基幹刷新型・田中さん」） */
  name: string
  /** 一言サマリー */
  tagline: string
  attributes: {
    age: string
    role: string
    industry: string
    companySize: string
    region: string
  }
  background: string
  goals: string[]
  pains: string[]
  /** ERP/SaaS導入検討の引き金となった出来事 */
  triggers: string[]
  infoSources: string[]
  decisionCriteria: string[]
  /** インタビュー・事例由来の象徴的なひと言 */
  quote: string
  /** このペルソナが検索しそうなKW（Ahrefsデータと突合） */
  keywords: string[]
  journey: PersonaJourneyStage[]
  channelStrategy: PersonaChannelStrategy[]
}

export interface PersonaDocument {
  personas: HypothesisPersona[]
  /** 全ペルソナ横断のマーケティング戦略示唆 */
  overallInsights: string[]
  /** データ上の限界・注意点（生存者バイアス等） */
  caveats: string[]
  dataSources: {
    interviewCount: number
    interviewTitles: string[]
    hasCaseStudies: boolean
    ahrefsKeywordCount: number
    /** 材料に使ったS3記事数（旧データには存在しない） */
    articleCount?: number
    /** S3参照資料（materials_for_articles/）を使ったか */
    hasMaterials?: boolean
  }
  generatedAt: string
}

// ─────────────────────────────────────────────
// 保存・読み込み
// ─────────────────────────────────────────────

export async function loadPersonaDocument(): Promise<PersonaDocument | null> {
  const obj = await getS3ObjectAsText(PERSONAS_KEY)
  if (!obj) return null
  try {
    return JSON.parse(obj.content) as PersonaDocument
  } catch {
    return null
  }
}

async function savePersonaDocument(doc: PersonaDocument): Promise<void> {
  const ok = await putS3Object(PERSONAS_KEY, JSON.stringify(doc, null, 2))
  if (!ok) throw new Error('ペルソナのS3保存に失敗しました')
}

// ─────────────────────────────────────────────
// 入力データ収集
// ─────────────────────────────────────────────

/** S3 の case-studies/ 配下の .md をまとめて読み込む（上限文字数まで） */
async function loadCaseStudies(): Promise<string> {
  try {
    const objects = await listS3Objects(CASE_STUDIES_PREFIX)
    const mdKeys = objects.filter(o => o.key.endsWith('.md')).map(o => o.key)
    if (mdKeys.length === 0) return ''
    const results = await getS3ObjectsAsTextBatch(mdKeys)
    let combined = ''
    for (const r of results) {
      const name = r.key.split('/').pop() ?? r.key
      combined += `\n\n【事例: ${name}】\n${r.content}`
      if (combined.length >= MAX_CASE_STUDY_CHARS) break
    }
    return combined.slice(0, MAX_CASE_STUDY_CHARS).trim()
  } catch (e) {
    console.warn('[Persona] 事例集の読み込み失敗（なしで続行）:', e)
    return ''
  }
}

/** プロンプトに渡す記事ダイジェスト（タイトル・KW・本文抜粋） */
interface ArticleDigest {
  title: string
  targetKeyword: string
  excerpt: string
}

/** マークダウン・HTML混じりの本文をプレーンテキスト化して抜粋を作る */
function toExcerpt(content: string, maxChars: number): string {
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*`\-|]/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
}

/**
 * S3 の articles/ から記事ダイジェストを読み込む。
 * RICE CLOUDがどんなテーマ・KWで誰に向けて発信しているかの実データとして使う。
 */
async function loadArticleDigests(): Promise<ArticleDigest[]> {
  try {
    const objects = await listS3Objects(ARTICLES_PREFIX)
    const jsonKeys = objects.filter(o => o.key.endsWith('.json')).map(o => o.key)
    if (jsonKeys.length === 0) return []
    const results = await getS3ObjectsAsTextBatch(jsonKeys)
    const digests: (ArticleDigest & { createdAt: string })[] = []
    for (const r of results) {
      try {
        const article = JSON.parse(r.content) as SavedArticle
        const title = (article.refinedTitle || article.title || '').trim()
        if (!title) continue
        digests.push({
          title,
          targetKeyword: article.targetKeyword?.trim() ?? '',
          excerpt: toExcerpt(article.refinedContent || article.originalContent || '', MAX_ARTICLE_EXCERPT_CHARS),
          createdAt: article.createdAt ?? '',
        })
      } catch { /* 壊れたJSONはスキップ */ }
    }
    return digests
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_ARTICLES)
      .map(({ title, targetKeyword, excerpt }) => ({ title, targetKeyword, excerpt }))
  } catch (e) {
    console.warn('[Persona] S3記事の読み込み失敗（なしで続行）:', e)
    return []
  }
}

/**
 * S3 の参照資料（materials_for_articles/ 配下の .md/.txt/.csv）をまとめて読み込む。
 * 会社・サービス・顧客理解の背景資料として使う。
 */
async function loadMaterials(): Promise<string> {
  try {
    const raw = process.env.S3_DRAFT_MATERIALS_PREFIX?.trim()
    const prefix = raw && raw.length > 0 ? (raw.endsWith('/') ? raw : `${raw}/`) : 'materials_for_articles/'
    const objects = await listS3Objects(prefix)
    const textKeys = objects
      .filter(o => /\.(md|txt|csv)$/i.test(o.key))
      .map(o => o.key)
    if (textKeys.length === 0) return ''
    const results = await getS3ObjectsAsTextBatch(textKeys)
    let combined = ''
    for (const r of results) {
      const name = r.key.split('/').pop() ?? r.key
      combined += `\n\n【資料: ${name}】\n${r.content}`
      if (combined.length >= MAX_MATERIAL_CHARS) break
    }
    return combined.slice(0, MAX_MATERIAL_CHARS).trim()
  } catch (e) {
    console.warn('[Persona] 参照資料の読み込み失敗（なしで続行）:', e)
    return ''
  }
}

/** Ahrefsの直近データセットから非ブランドKWをボリューム降順で集める */
async function collectTopKeywords(): Promise<AhrefsKeywordRow[]> {
  try {
    const datasets = await loadRecentDatasets(6)
    const byKeyword = new Map<string, AhrefsKeywordRow>()
    for (const ds of datasets) {
      for (const row of ds.keywords) {
        if (row.branded) continue
        if (!row.keyword?.trim()) continue
        const existing = byKeyword.get(row.keyword)
        if (!existing || row.volume > existing.volume) {
          byKeyword.set(row.keyword, row)
        }
      }
    }
    return [...byKeyword.values()]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, MAX_KEYWORDS)
  } catch (e) {
    console.warn('[Persona] Ahrefsデータ読み込み失敗（KWなしで続行）:', e)
    return []
  }
}

// ─────────────────────────────────────────────
// プロンプト構築
// ─────────────────────────────────────────────

function buildPersonaPrompt(input: {
  articles: ArticleDigest[]
  materials: string
  interviews: { title: string; text: string }[]
  caseStudies: string
  keywords: AhrefsKeywordRow[]
}): string {
  const articleBlocks = input.articles
    .map((a, i) => `【記事${i + 1}】${a.title}${a.targetKeyword ? `（対象KW: ${a.targetKeyword}）` : ''}\n${a.excerpt}`)
    .join('\n\n')

  const interviewBlocks = input.interviews
    .map((p, i) => {
      const body = p.text.length > MAX_INTERVIEW_CHARS
        ? `${p.text.slice(0, MAX_INTERVIEW_CHARS)}\n…（以下略）`
        : p.text
      return `【事例・インタビュー${i + 1}】${p.title}\n${body}`
    })
    .join('\n\n---\n\n')

  const kwLines = input.keywords
    .map(k => `- ${k.keyword}（月間検索数: ${k.volume}${k.intents ? ` / 意図: ${k.intents}` : ''}）`)
    .join('\n')

  return `あなたはB2Bマーケティングストラテジストです。

「株式会社RICE CLOUD（ライスクラウド）」は、Oracle NetSuite・Microsoft Dynamics 365・Power Platform などのERP/SaaSの導入支援・定着支援・導入失敗リカバリーを行う会社です。
RICE CLOUDのマーケティング戦略立案のため、以下のデータから **RICE CLOUDの見込み顧客（＝ERP/SaaSの導入を検討する事業会社側の担当者・意思決定者）** の仮説ペルソナを作成してください。
RICE CLOUD社内の人物やRICE CLOUDの競合他社の人物ではなく、あくまで「RICE CLOUDにとってのエンドユーザー企業側の人物像」であることに注意してください。

# データ

## 1. RICE CLOUDが公開・作成しているSEO記事（誰のどんな課題に向けて発信しているかの実データ）
${articleBlocks || '（記事データなし）'}

## 2. 会社・サービス・顧客に関する参照資料
${input.materials || '（参照資料なし）'}

## 3. 導入事例・お客様インタビュー（実在顧客の生の声。あれば最重要）
${interviewBlocks || '（インタビューなし。記事テーマとKWから顧客像を推定してください）'}

## 4. 匿名化された支援事例集
${input.caseStudies || '（事例資料なし）'}

## 5. 実際の検索キーワードデータ（Ahrefs。検索需要の定量データ）
${kwLines || '（KWデータなし）'}

# 作成指示

1. 上記データから読み取れる「ERP/SaaS導入を検討するエンドユーザー企業側の人物」を **3つの仮説ペルソナ** に整理してください。年齢層・業種・立場・導入検討の動機（基幹システム刷新型／成長スケール型／導入失敗リカバリー型など）が互いに異なる類型にすること。
2. 各ペルソナの課題・迷い・決断理由は、記事が想定している読者課題・検索KWの意図・（あれば）事例の記述から導いてください。quote には、そのペルソナが言いそうな象徴的なひと言を入れてください（事例がある場合は事例の記述に基づくこと）。
3. keywords には、このペルソナが検索しそうなKWを上記Ahrefsデータ・記事の対象KWの中から優先的に選んでください（データにない語を補う場合は末尾に置く）。
4. journey は必ず「認知」「情報収集」「比較検討」「意思決定」「導入後」の5フェーズで作成してください。barriers（離脱リスク）は推測を含むため、断定を避けた表現にすること。
5. channelStrategy は SEO記事・セミナー／ウェビナー・展示会・パートナー／ベンダー連携・広告・メール／ナーチャリングなど、RICE CLOUDが現実に取りうるチャネルで、ペルソナごとに優先度をつけてください。
6. overallInsights には、3ペルソナを横断して「どのフェーズ×チャネルに注力すべきか」の戦略示唆を4〜6個書いてください。
7. caveats には、このペルソナの限界を明記してください（実在顧客インタビュー${input.interviews.length}件・記事${input.articles.length}本からの推定であり実顧客の検証を経ていない、など、実際に使ったデータ量に即して書くこと）。
8. 社名・個人名など特定可能な固有名詞はペルソナに含めないでください（仮名を使うこと）。
9. 出力が長くなりすぎないよう、各フィールドは簡潔に書いてください（journey の各セルは80字以内、配列項目は各60字以内、goals/pains などの配列は3〜4個まで）。

# 出力形式

以下のJSONのみを出力してください。コードフェンスや説明文は不要です。

{
  "personas": [
    {
      "id": "persona-1",
      "name": "類型名・仮名（例: 基幹刷新型・田中さん）",
      "tagline": "一言サマリー",
      "attributes": { "age": "50代前半", "role": "情報システム部長", "industry": "製造業", "companySize": "従業員200名・年商50億円", "region": "首都圏" },
      "background": "背景・現在の状況（200字程度）",
      "goals": ["達成したいこと"],
      "pains": ["不安・悩み"],
      "triggers": ["ERP/SaaS導入検討のきっかけ"],
      "infoSources": ["情報収集チャネル"],
      "decisionCriteria": ["パートナー選定・意思決定の基準"],
      "quote": "象徴的なひと言",
      "keywords": ["検索しそうなKW"],
      "journey": [
        { "phase": "認知", "state": "心理状態・行動", "touchpoints": ["接点"], "needs": "求める情報", "barriers": "離脱リスク（推測）", "actions": "RICE CLOUDが取るべき施策" }
      ],
      "channelStrategy": [
        { "channel": "チャネル名", "priority": "高", "approach": "具体的なアプローチ" }
      ]
    }
  ],
  "overallInsights": ["戦略示唆"],
  "caveats": ["データ上の限界・注意点"]
}`
}

// ─────────────────────────────────────────────
// JSON抽出
// ─────────────────────────────────────────────

function extractJson(text: string): string {
  const cleaned = text.replace(/```(?:json)?/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AIの出力からJSONを抽出できませんでした')
  }
  return cleaned.slice(start, end + 1)
}

// ─────────────────────────────────────────────
// メイン: 生成
// ─────────────────────────────────────────────

export async function generatePersonaDocument(): Promise<PersonaDocument> {
  // 1. 一次データ収集（並列。存在しないソースは空として扱う）
  const [articles, materials, interviews, caseStudies, keywords] = await Promise.all([
    loadArticleDigests(),
    loadMaterials(),
    fetchInterviewPosts(),
    loadCaseStudies(),
    collectTopKeywords(),
  ])

  if (articles.length === 0 && !materials && interviews.length === 0 && !caseStudies && keywords.length === 0) {
    throw new Error(
      'ペルソナ生成の材料が見つかりません（S3の記事・参照資料・事例集、WordPressの事例記事、Ahrefsデータのいずれも取得できませんでした）',
    )
  }

  console.log(
    `[Persona] 材料: 記事${articles.length}件 / 資料${materials ? 'あり' : 'なし'} / インタビュー${interviews.length}件 / 事例集${caseStudies ? 'あり' : 'なし'} / KW${keywords.length}件`,
  )

  // 2. AI生成（Claude Bedrock）
  const prompt = buildPersonaPrompt({
    articles,
    materials,
    interviews,
    caseStudies,
    keywords,
  })

  // JSONが途中で切れる事故を防ぐため出力上限を大きめに取り、パース失敗時は1回だけ再試行する。
  let parsed: {
    personas?: HypothesisPersona[]
    overallInsights?: string[]
    caveats?: string[]
  } | null = null

  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await generateWithClaude(prompt, { maxTokens: 32000, temperature: 0.5 })
    try {
      parsed = JSON.parse(extractJson(raw))
      break
    } catch (e) {
      console.warn(`[Persona] JSONパース失敗（試行${attempt}/2、出力${raw.length}文字）:`, e)
      if (attempt === 2) {
        throw new Error('AIの出力を解析できませんでした。もう一度「ペルソナを生成」を押してください。')
      }
    }
  }

  // 3. 検証
  if (!parsed) {
    throw new Error('AIの出力を解析できませんでした。もう一度「ペルソナを生成」を押してください。')
  }
  if (!Array.isArray(parsed.personas) || parsed.personas.length === 0) {
    throw new Error('AIの出力にペルソナが含まれていませんでした')
  }

  const doc: PersonaDocument = {
    personas: parsed.personas,
    overallInsights: parsed.overallInsights ?? [],
    caveats: parsed.caveats ?? [],
    dataSources: {
      interviewCount: interviews.length,
      interviewTitles: interviews.map(p => p.title),
      hasCaseStudies: Boolean(caseStudies),
      ahrefsKeywordCount: keywords.length,
      articleCount: articles.length,
      hasMaterials: Boolean(materials),
    },
    generatedAt: new Date().toISOString(),
  }

  // 4. S3保存
  await savePersonaDocument(doc)
  console.log(`[Persona] 生成完了: ${doc.personas.length}ペルソナを保存`)

  return doc
}
