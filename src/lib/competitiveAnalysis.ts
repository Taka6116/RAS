/**
 * 競合分析・戦略提案（サーバー専用）。
 *
 * 競合の公式サイト（Tier 1）をページ単位で収集し、5軸で整理する。
 * Ahrefs のドメイン別オーガニックKWと仮説ペルソナを組み合わせ、
 * RICE CLOUD が取るべき優先施策までを Claude で構造化生成する。
 *
 * ※ RAS では GA4/Search Console 連携が未構成のため、
 *    戦略生成は「競合観測事実 + KW機会 + ペルソナ」のみで行う。
 */

import { getS3ObjectAsText, putS3Object } from '@/lib/s3Reference'
import { generateWithClaude } from '@/lib/api/claude'
import { fetchApiUsage, fetchOrganicKeywords } from '@/lib/ahrefsApi'
import { loadPersonaDocument } from '@/lib/personaGeneration'

const CONFIG_KEY = 'competitive-analysis/config.json'
const RESULTS_KEY = 'competitive-analysis/results.json'
const HISTORY_KEY = 'competitive-analysis/history.json'
const MAX_HISTORY = 15
const MAX_SOURCE_CHARS = 8_000

export type CompetitorType = 'direct' | 'indirect'
export type StrategyPriority = 'high' | 'medium' | 'low'
export type StrategyPhase = 'awareness' | 'research' | 'comparison' | 'decision'

export interface CompetitorConfig {
  id: string
  name: string
  domain: string
  type: CompetitorType
  note: string
  urls: CompetitorUrl[]
}

export interface CompetitorUrl {
  url: string
  label: string
}

export interface SourceFact {
  text: string
  sourceUrl: string
  tier: 'Tier1'
  confirmedAt: string
}

export interface CompetitorFiveAxes {
  message: SourceFact[]
  pricing: SourceFact[]
  offering: SourceFact[]
  positioning: SourceFact[]
  authority: SourceFact[]
}

export interface CompetitorPageSource {
  url: string
  label: string
  fetchedAt: string
  httpStatus: number
  title: string
  description: string
  headings: string[]
  textExcerpt: string
}

export interface CompetitorKeyword {
  keyword: string
  volume: number
  position: number | null
  traffic: number | null
  url: string
}

export interface CompetitorResult {
  competitorId: string
  updatedAt: string
  pages: Record<string, CompetitorPageSource>
  axes?: CompetitorFiveAxes
  keywords?: CompetitorKeyword[]
  keywordUpdatedAt?: string
  error?: string
}

export interface KeywordOpportunity {
  keyword: string
  volume: number
  competitors: Array<{ name: string; position: number | null; url: string }>
  selfPosition: number | null
  opportunity: 'gap' | 'weak' | 'defend'
}

export interface PositioningPoint {
  name: string
  x: number
  y: number
  rationale: string
  isSelf?: boolean
}

export interface StrategyAction {
  title: string
  description: string
  priority: StrategyPriority
  phase: StrategyPhase
  category: '訴求' | 'コンテンツ' | 'SEO' | 'CV導線' | 'サイト改善' | 'その他'
  target: string
  kpi: string
}

export interface CompetitiveStrategyReport {
  generatedAt: string
  summary: string
  observedFacts: string[]
  opportunities: string[]
  positioning: {
    xAxis: string
    yAxis: string
    points: PositioningPoint[]
    whitespace: string
  }
  funnelCoverage: Array<{
    phase: StrategyPhase
    self: string
    competitor: string
    implication: string
  }>
  actions: StrategyAction[]
  caveats: string[]
}

export interface CompetitiveAnalysisDocument {
  updatedAt: string
  competitors: Record<string, CompetitorResult>
  /** Ahrefs取得済みの自社KW。画面表示のたびにAPIを消費しないため保存する */
  selfKeywords?: CompetitorKeyword[]
  selfKeywordUpdatedAt?: string
  report?: CompetitiveStrategyReport
}

export interface CompetitiveAnalysisSnapshot {
  date: string
  savedAt: string
  document: CompetitiveAnalysisDocument
}

/**
 * 初期値はERP/SaaS導入領域の代表的なプレイヤー（サンプル）。
 * 実際の競合に合わせて画面から編集・追加してください。
 */
export const DEFAULT_COMPETITORS: CompetitorConfig[] = [
  {
    id: 'grandit',
    name: 'GRANDIT',
    domain: 'grandit.jp',
    type: 'direct',
    note: '国産コンソーシアム型ERP。中堅企業向けWeb-ERPとして競合。',
    urls: [{ url: 'https://www.grandit.jp/', label: 'トップページ' }],
  },
  {
    id: 'oro-zac',
    name: 'オロ（ZAC）',
    domain: 'oro.com',
    type: 'direct',
    note: 'プロジェクト型ビジネス向けクラウドERP「ZAC」を提供。',
    urls: [{ url: 'https://www.oro.com/zac/', label: 'ZAC 製品ページ' }],
  },
  {
    id: 'moneyforward',
    name: 'マネーフォワード クラウドERP',
    // apex(moneyforward.com)はB2C家計簿アプリのKWが支配的なため、
    // 法人向けサブドメインに絞ってERP戦略に関連するKWを取得する。
    domain: 'biz.moneyforward.com',
    type: 'indirect',
    note: '中堅・上場企業向けのクラウド型バックオフィスSaaS群。',
    urls: [{ url: 'https://biz.moneyforward.com/', label: 'ビジネス向けトップ' }],
  },
  {
    id: 'freee',
    name: 'freee',
    domain: 'freee.co.jp',
    type: 'indirect',
    note: '中小企業向けクラウド会計・ERP。SMB領域のSEO競合。',
    urls: [{ url: 'https://www.freee.co.jp/', label: 'トップページ' }],
  },
  {
    id: 'biz-integral',
    name: 'Biz∫（ビズインテグラル）',
    domain: 'biz-integral.com',
    type: 'direct',
    note: 'NTTデータ・ビズインテグラルの国産ERP。大企業〜中堅向け。',
    urls: [{ url: 'https://www.biz-integral.com/', label: 'トップページ' }],
  },
  {
    id: 'superstream',
    name: 'SuperStream',
    // superstream.canon-its.co.jp は現存せず（ENOTFOUND）。
    // 製品トップは canon-its.co.jp 配下の /solution/industry/cross-industry/superstream。
    domain: 'canon-its.co.jp',
    type: 'indirect',
    note: '会計・人事給与に強い国産パッケージ。会計領域KWで競合。',
    urls: [{ url: 'https://www.canon-its.co.jp/solution/industry/cross-industry/superstream', label: 'SuperStream 製品トップ' }],
  },
]

function isoDateJst(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return m?.[1] ?? ''
}

function metaContent(html: string, name: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'name') || attr(tag, 'property')).toLowerCase()
    if (key === name.toLowerCase()) return decodeEntities(attr(tag, 'content'))
  }
  return ''
}

function extractHeadings(html: string): string[] {
  const out: string[] = []
  const re = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[2]!)
    if (text) out.push(`H${m[1]}: ${text}`)
  }
  return out.slice(0, 25)
}

function isAllowedCompetitorUrl(raw: string, competitor: CompetitorConfig): boolean {
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'https:' &&
      (parsed.hostname === competitor.domain || parsed.hostname.endsWith(`.${competitor.domain}`))
  } catch {
    return false
  }
}

function extractJson(text: string): string {
  const cleaned = text.replace(/```(?:json)?/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI応答からJSONを抽出できませんでした')
  return cleaned.slice(start, end + 1)
}

/**
 * Claudeは長い構造化出力で、まれに末尾のカンマ・配列閉じを落とすことがある。
 * JSON.parseが失敗した場合は、同じ内容を再分析させず「JSON構文の修復」だけを
 * 短い追加呼び出しで行う。
 */
async function generateJson<T>(prompt: string, maxTokens = 6_000): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await generateWithClaude(prompt, { maxTokens, temperature: 0.35 })
      try {
        return JSON.parse(extractJson(raw)) as T
      } catch (parseError) {
        console.warn('[CompetitiveAnalysis] JSON構文エラー。修復を試行します:', parseError)
        const repaired = await generateWithClaude(
          `次のテキストはJSONとして出力されるべきでしたが、構文エラーがあります。
内容・キー・値をなるべく維持し、厳密に有効なJSONオブジェクトだけを返してください。
説明、Markdown、コードフェンスは一切出力しないでください。

${raw.slice(0, 24_000)}`,
          { maxTokens: Math.min(maxTokens, 5_000), temperature: 0 },
        )
        return JSON.parse(extractJson(repaired)) as T
      }
    } catch (error) {
      lastError = error
      console.warn(`[CompetitiveAnalysis] Claude response failed (${attempt + 1}/2)`, error)
    }
  }
  throw new Error(`AI分析の生成に失敗しました: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

/**
 * 保存済み設定の移行。
 * マネーフォワードの対象ドメインを apex(moneyforward.com) から
 * 法人向けサブドメイン(biz.moneyforward.com)へ寄せ、B2CノイズKWを避ける。
 */
function migrateCompetitorConfig(config: CompetitorConfig[]): CompetitorConfig[] {
  return config.map(c => {
    if (c.id === 'moneyforward' && c.domain === 'moneyforward.com') {
      return { ...c, domain: 'biz.moneyforward.com' }
    }
    // 旧SuperStream設定（存在しないドメイン・404だった旧パス）を現行の製品トップへ寄せる
    if (
      c.id === 'superstream' &&
      (c.domain === 'superstream.canon-its.co.jp' ||
        c.urls.some(u => u.url.includes('/products/superstream')))
    ) {
      return {
        ...c,
        domain: 'canon-its.co.jp',
        urls: [{ url: 'https://www.canon-its.co.jp/solution/industry/cross-industry/superstream', label: 'SuperStream 製品トップ' }],
      }
    }
    return c
  })
}

export async function loadCompetitorConfig(): Promise<CompetitorConfig[]> {
  const obj = await getS3ObjectAsText(CONFIG_KEY)
  if (!obj) return DEFAULT_COMPETITORS
  try {
    const parsed = JSON.parse(obj.content)
    return Array.isArray(parsed) && parsed.length > 0
      ? migrateCompetitorConfig(parsed as CompetitorConfig[])
      : DEFAULT_COMPETITORS
  } catch {
    return DEFAULT_COMPETITORS
  }
}

export async function saveCompetitorConfig(config: CompetitorConfig[]): Promise<void> {
  const ok = await putS3Object(CONFIG_KEY, JSON.stringify(config, null, 2))
  if (!ok) throw new Error('競合設定のS3保存に失敗しました')
}

export async function loadCompetitiveAnalysis(): Promise<CompetitiveAnalysisDocument> {
  const obj = await getS3ObjectAsText(RESULTS_KEY)
  if (!obj) return { updatedAt: '', competitors: {} }
  try {
    const parsed = JSON.parse(obj.content) as CompetitiveAnalysisDocument
    return {
      updatedAt: parsed.updatedAt ?? '',
      competitors: parsed.competitors ?? {},
      selfKeywords: parsed.selfKeywords,
      selfKeywordUpdatedAt: parsed.selfKeywordUpdatedAt,
      report: parsed.report,
    }
  } catch {
    return { updatedAt: '', competitors: {} }
  }
}

async function saveCompetitiveAnalysis(doc: CompetitiveAnalysisDocument): Promise<void> {
  const ok = await putS3Object(RESULTS_KEY, JSON.stringify(doc, null, 2))
  if (!ok) throw new Error('競合分析結果のS3保存に失敗しました')
}

export async function loadCompetitiveHistory(): Promise<CompetitiveAnalysisSnapshot[]> {
  const obj = await getS3ObjectAsText(HISTORY_KEY)
  if (!obj) return []
  try {
    const parsed = JSON.parse(obj.content)
    return Array.isArray(parsed) ? parsed as CompetitiveAnalysisSnapshot[] : []
  } catch {
    return []
  }
}

async function snapshotAnalysis(doc: CompetitiveAnalysisDocument): Promise<void> {
  const date = isoDateJst()
  const history = await loadCompetitiveHistory()
  const snapshot: CompetitiveAnalysisSnapshot = { date, savedAt: new Date().toISOString(), document: doc }
  const next = [snapshot, ...history.filter(h => h.date !== date)]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_HISTORY)
  await putS3Object(HISTORY_KEY, JSON.stringify(next))
}

export async function fetchCompetitorPage(
  competitor: CompetitorConfig,
  page: CompetitorUrl,
): Promise<CompetitorPageSource> {
  if (!isAllowedCompetitorUrl(page.url, competitor)) {
    throw new Error(`競合ドメイン（${competitor.domain}）配下のHTTPS URLのみ取得できます`)
  }
  let response: Response
  try {
    response = await fetch(page.url, {
      headers: {
        // 一部サイトはbot風UAを弾くため一般的なブラウザUAを使用する
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      cache: 'no-store',
    })
  } catch (e) {
    // fetch自体の失敗（DNS/接続/TLS）は原因コードを添えて分かりやすくする
    const cause = (e as { cause?: { code?: string } })?.cause?.code
    const reason = cause === 'ENOTFOUND'
      ? 'ドメインが見つかりません（URLが変わった可能性）'
      : cause === 'UND_ERR_CONNECT_TIMEOUT'
        ? '接続タイムアウト'
        : (e instanceof Error ? e.message : '不明なエラー')
    throw new Error(`${page.url} の取得に失敗: ${reason}`)
  }
  // 404等のエラーページを分析対象にするとAIが「確認できませんでした」を返すだけなので、
  // ここで明示的に失敗させてURLの誤りに気づけるようにする
  if (!response.ok) {
    throw new Error(`${page.url} がHTTP ${response.status}を返しました（ページが移転・削除された可能性）`)
  }
  const html = await response.text()
  const body = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return {
    url: page.url,
    label: page.label,
    fetchedAt: new Date().toISOString(),
    httpStatus: response.status,
    title: titleMatch ? stripTags(titleMatch[1]!) : '',
    description: metaContent(html, 'description'),
    headings: extractHeadings(body),
    textExcerpt: stripTags(body).slice(0, MAX_SOURCE_CHARS),
  }
}

function fact(value: unknown, page: CompetitorPageSource): SourceFact[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    .slice(0, 5)
    .map(text => ({ text, sourceUrl: page.url, tier: 'Tier1', confirmedAt: page.fetchedAt }))
}

interface AxesResponse {
  message?: string[]
  pricing?: string[]
  offering?: string[]
  positioning?: string[]
  authority?: string[]
}

async function analyzeFiveAxes(competitor: CompetitorConfig, pages: CompetitorPageSource[]): Promise<CompetitorFiveAxes> {
  const source = pages.map(p =>
    `URL: ${p.url}\nTITLE: ${p.title}\nDESCRIPTION: ${p.description}\nHEADINGS:\n${p.headings.join('\n')}\nTEXT:\n${p.textExcerpt}`,
  ).join('\n\n---\n\n')
  const parsed = await generateJson<AxesResponse>(`あなたはBtoB/ERP・SaaS業界の競合リサーチャーです。
競合「${competitor.name}」の公式サイトから取得した一次情報だけを使い、以下の5軸で観測事実を抜き出してください。
推測、評価、一般論は禁止です。価格が確認できない場合は空配列にしてください。
各項目は1文、最大5件にしてください。

${source}

JSONのみを返してください。
{
  "message":["LP・メッセージの観測事実"],
  "pricing":["価格・無料プランの観測事実"],
  "offering":["機能・提供範囲の観測事実"],
  "positioning":["誰に何を提供するかの観測事実"],
  "authority":["実績・導入事例・専門性・権威性の観測事実"]
}`)
  const sourcePage = pages[0]
  if (!sourcePage) throw new Error('分析できる競合ページがありません')
  return {
    message: fact(parsed.message, sourcePage),
    pricing: fact(parsed.pricing, sourcePage),
    offering: fact(parsed.offering, sourcePage),
    positioning: fact(parsed.positioning, sourcePage),
    authority: fact(parsed.authority, sourcePage),
  }
}

/** 競合の選択ページを収集し、5軸に構造化して保存する */
export async function analyzeCompetitor(
  competitorId: string,
  pages?: CompetitorUrl[],
): Promise<CompetitorResult> {
  const config = await loadCompetitorConfig()
  const competitor = config.find(c => c.id === competitorId)
  if (!competitor) throw new Error('指定された競合が見つかりません')
  const targets = pages?.length ? pages : competitor.urls
  // 一部のページ取得が失敗しても、成功したページだけで分析を継続する
  const settled = await Promise.allSettled(targets.map(page => fetchCompetitorPage(competitor, page)))
  const sourcePages = settled
    .filter((r): r is PromiseFulfilledResult<CompetitorPageSource> => r.status === 'fulfilled')
    .map(r => r.value)
  if (sourcePages.length === 0) {
    const reasons = settled
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => (r.reason instanceof Error ? r.reason.message : String(r.reason)))
    throw new Error(reasons[0] ?? '競合ページを取得できませんでした')
  }
  const axes = await analyzeFiveAxes(competitor, sourcePages)
  const doc = await loadCompetitiveAnalysis()
  const current = doc.competitors[competitor.id]
  const result: CompetitorResult = {
    competitorId: competitor.id,
    updatedAt: new Date().toISOString(),
    pages: Object.fromEntries(sourcePages.map(page => [page.url, page])),
    axes,
    keywords: current?.keywords,
    keywordUpdatedAt: current?.keywordUpdatedAt,
  }
  doc.competitors[competitor.id] = result
  doc.updatedAt = result.updatedAt
  await saveCompetitiveAnalysis(doc)
  return result
}

/** 競合ドメインのAhrefsオーガニックKWを取得・保存する */
export async function refreshCompetitorKeywords(competitorId: string): Promise<CompetitorResult> {
  const config = await loadCompetitorConfig()
  const competitor = config.find(c => c.id === competitorId)
  if (!competitor) throw new Error('指定された競合が見つかりません')
  const rows = await fetchOrganicKeywords({ target: competitor.domain, limit: 500 })
  const keywords: CompetitorKeyword[] = rows.map(row => ({
    keyword: row.keyword,
    volume: row.volume,
    position: row.position,
    traffic: row.currentTraffic,
    url: row.url,
  }))
  const doc = await loadCompetitiveAnalysis()
  // 自社KWは初回のみ同時取得して保存する。以降の画面表示ではS3保存済みデータを使う。
  if (!doc.selfKeywords) {
    const selfDomain = process.env.AHREFS_TARGET_DOMAIN?.trim()
    if (selfDomain) {
      const selfRows = await fetchOrganicKeywords({ target: selfDomain, limit: 500 })
      doc.selfKeywords = selfRows.map(row => ({
        keyword: row.keyword,
        volume: row.volume,
        position: row.position,
        traffic: row.currentTraffic,
        url: row.url,
      }))
      doc.selfKeywordUpdatedAt = new Date().toISOString()
    }
  }
  const current = doc.competitors[competitor.id]
  const result: CompetitorResult = {
    competitorId: competitor.id,
    updatedAt: new Date().toISOString(),
    pages: current?.pages ?? {},
    axes: current?.axes,
    keywords,
    keywordUpdatedAt: new Date().toISOString(),
  }
  doc.competitors[competitor.id] = result
  doc.updatedAt = result.updatedAt
  await saveCompetitiveAnalysis(doc)
  return result
}

function normalizedKeyword(keyword: string): string {
  return keyword.toLocaleLowerCase('ja-JP').replace(/\s+/g, '').replace(/[　・、。，,]/g, '')
}

function selfKeywordMap(rows: CompetitorKeyword[]): Map<string, CompetitorKeyword> {
  const map = new Map<string, CompetitorKeyword>()
  for (const row of rows) map.set(normalizedKeyword(row.keyword), row)
  return map
}

/** 自社と競合のAhrefs取得済みKWから、実行候補を抽出する */
export async function buildKeywordOpportunities(doc?: CompetitiveAnalysisDocument): Promise<KeywordOpportunity[]> {
  const analysis = doc ?? await loadCompetitiveAnalysis()
  const config = await loadCompetitorConfig()
  // Ahrefsを画面表示のたびに呼ばず、競合KW更新時に保存した自社データを使う。
  const self = selfKeywordMap(analysis.selfKeywords ?? [])
  const candidate = new Map<string, KeywordOpportunity>()
  // 1社（例: freeeのB2C会計KW）がボリュームで機会一覧を独占しないよう、
  // 競合ごとの寄与上限を設けて多様性を確保する。
  const PER_COMPETITOR_LIMIT = 15
  for (const [id, result] of Object.entries(analysis.competitors)) {
    const competitor = config.find(c => c.id === id)
    if (!competitor) continue
    const rows = (result.keywords ?? [])
      .filter(row => (row.position === null || row.position <= 30) && row.volume >= 20)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, PER_COMPETITOR_LIMIT)
    for (const row of rows) {
      const key = normalizedKeyword(row.keyword)
      const own = self.get(key)
      const opportunity = !own ? 'gap' : (own.position ?? 100) > 20 ? 'weak' : 'defend'
      const current = candidate.get(key) ?? {
        keyword: row.keyword,
        volume: row.volume,
        competitors: [],
        selfPosition: own?.position ?? null,
        opportunity,
      }
      current.volume = Math.max(current.volume, row.volume)
      current.competitors.push({ name: competitor.name, position: row.position, url: row.url })
      if (opportunity === 'gap' || (opportunity === 'weak' && current.opportunity === 'defend')) current.opportunity = opportunity
      candidate.set(key, current)
    }
  }
  return [...candidate.values()]
    .filter(item => item.opportunity !== 'defend')
    .sort((a, b) => b.volume - a.volume || b.competitors.length - a.competitors.length)
    .slice(0, 50)
}

function collectFacts(config: CompetitorConfig[], doc: CompetitiveAnalysisDocument): string {
  return config.map(c => {
    const axes = doc.competitors[c.id]?.axes
    if (!axes) return `${c.name}: 未分析`
    const texts = (items: SourceFact[]) => items.slice(0, 2).map(x => x.text.slice(0, 180)).join(' / ')
    return `${c.name}
メッセージ: ${texts(axes.message)}
価格: ${texts(axes.pricing) || '未確認'}
提供: ${texts(axes.offering)}
立ち位置: ${texts(axes.positioning)}
権威性: ${texts(axes.authority)}`
  }).join('\n\n')
}

interface StrategyResponse {
  summary?: string
  observedFacts?: string[]
  opportunities?: string[]
  positioning?: CompetitiveStrategyReport['positioning']
  funnelCoverage?: CompetitiveStrategyReport['funnelCoverage']
  actions?: StrategyAction[]
  caveats?: string[]
}

function priorities(v: unknown): StrategyPriority {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'medium'
}

function phases(v: unknown): StrategyPhase {
  return v === 'awareness' || v === 'research' || v === 'comparison' || v === 'decision' ? v : 'research'
}

/** 第3段階: 競合・KW機会・ペルソナを統合し、施策を生成して履歴保存 */
export async function generateCompetitiveStrategy(): Promise<CompetitiveStrategyReport> {
  const [config, doc, personas, opportunities] = await Promise.all([
    loadCompetitorConfig(),
    loadCompetitiveAnalysis(),
    loadPersonaDocument(),
    buildKeywordOpportunities(),
  ])
  const competitorFacts = collectFacts(config, doc)
  const personaText = personas
    ? personas.personas.slice(0, 4).map(p => `${p.name}: 課題=${p.pains.slice(0, 3).join('、')} 判断基準=${p.decisionCriteria.slice(0, 3).join('、')}`).join('\n')
    : 'ペルソナ未生成'
  const kwText = opportunities.slice(0, 12)
    .map(k => `${k.keyword}(vol${k.volume}, ${k.opportunity}, 競合:${k.competitors.map(c => c.name).join('・')})`)
    .join(' / ') || '未取得（競合KWを先に更新してください）'
  const parsed = await generateJson<StrategyResponse>(`あなたはERP/SaaS導入支援会社「株式会社RICE CLOUD（ライスクラウド）」の戦略コンサルタントです。
以下の競合公式情報（Tier1）・KW機会・仮説ペルソナから、比較表で終わらずRICE CLOUDが実行すべき施策を提案してください。
RICE CLOUDの強みは、アジャイル型のERP導入・導入失敗案件のリカバリー実績・NetSuite/Dynamics 365/Power Platformの実装力です。
事実と仮説を混同せず、根拠が不足する内容は caveats に残してください。一般論（高品質、丁寧等）ではなく、対象ページ/KW/導線まで具体化してください。
※GA4/Search Consoleの自社実測データは未連携のため、SEO実績に関する記述は推測であることを caveats に明記してください。
出力は簡潔にしてください。文字列中の改行は禁止です。observedFacts と opportunities は各4件以内、actionsは4件以内、caveatsは2件以内にしてください。descriptionは100文字以内にしてください。

## 競合の観測事実
${competitorFacts}

## KW機会（Ahrefs 競合×自社）
${kwText}

## 仮説ペルソナ
${personaText}

JSONのみを返してください。末尾カンマは禁止です。
{
 "summary":"3〜5文",
 "observedFacts":["競合の観測事実（出典に基づく）"],
 "opportunities":["自社が取るべき差別化機会"],
 "positioning":{"xAxis":"横軸名(低い側→高い側)の形式 例: ターゲット企業規模(小→大)","yAxis":"縦軸名(低い側→高い側)の形式","points":[{"name":"RICE CLOUD","x":50,"y":50,"rationale":"根拠","isSelf":true},{"name":"競合名","x":50,"y":50,"rationale":"根拠"}],"whitespace":"空白領域と狙い。必ず座標範囲を(x:60-80, y:70-90)の形式で文中に含める"},
 "funnelCoverage":[{"phase":"awareness|research|comparison|decision","self":"自社の現状","competitor":"競合の強み","implication":"打ち手"}],
 "actions":[{"title":"20字以内","description":"具体施策","priority":"high|medium|low","phase":"awareness|research|comparison|decision","category":"訴求|コンテンツ|SEO|CV導線|サイト改善|その他","target":"対象URLまたはKW","kpi":"追うKPI"}],
 "caveats":["データの限界"]
}`)
  const report: CompetitiveStrategyReport = {
    generatedAt: new Date().toISOString(),
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    observedFacts: Array.isArray(parsed.observedFacts) ? parsed.observedFacts.filter((x): x is string => typeof x === 'string').slice(0, 8) : [],
    opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.filter((x): x is string => typeof x === 'string').slice(0, 8) : [],
    positioning: parsed.positioning?.points ? parsed.positioning : { xAxis: '専門性', yAxis: '提供範囲', points: [], whitespace: '' },
    funnelCoverage: Array.isArray(parsed.funnelCoverage) ? parsed.funnelCoverage.map(item => ({
      phase: phases(item.phase),
      self: item.self ?? '',
      competitor: item.competitor ?? '',
      implication: item.implication ?? '',
    })).slice(0, 4) : [],
    actions: Array.isArray(parsed.actions) ? parsed.actions
      .filter(action => action && typeof action.title === 'string' && typeof action.description === 'string')
      .map(action => ({ ...action, priority: priorities(action.priority), phase: phases(action.phase) }))
      .slice(0, 8) : [],
    caveats: Array.isArray(parsed.caveats) ? parsed.caveats.filter((x): x is string => typeof x === 'string').slice(0, 5) : [],
  }
  if (!report.summary || report.actions.length === 0) throw new Error('戦略提案の応答が不完全でした')
  doc.report = report
  doc.updatedAt = report.generatedAt
  await saveCompetitiveAnalysis(doc)
  await snapshotAnalysis(doc)
  return report
}

export async function getAhrefsUsage() {
  return fetchApiUsage()
}
