import type { AhrefsKeywordRow } from './ahrefsCsvParser'

export type PriorityLevel = 3 | 2 | 1 | 0

export interface ScoredKeyword extends AhrefsKeywordRow {
  opportunityScore: number
  trend: 'up' | 'down' | 'stable'
  detectedCategory: string
  priority: PriorityLevel
}

export interface TrendKeyword {
  keyword: string
  volume: number
  previousVolume: number
  trend: 'up' | 'down' | 'stable'
  changePercent: number
  isNew: boolean
  detectedCategory: string
}

const CATEGORIES = [
  { category: 'ERP全般', patterns: ['erp', '基幹システム', '統合基幹', 'enterprise resource planning'] },
  { category: 'NetSuite', patterns: ['netsuite', 'ネットスイート', 'oracle netsuite'] },
  { category: 'Dynamics 365', patterns: ['dynamics', 'dynamics 365', 'dynamics365', 'd365'] },
  { category: 'Power Platform', patterns: ['power platform', 'power apps', 'power automate', 'power bi', 'power pages'] },
  { category: 'SaaS導入', patterns: ['saas', 'クラウドerp', 'クラウド導入', 'saas導入', 'クラウド移行'] },
  { category: 'DX推進', patterns: ['dx', 'デジタルトランスフォーメーション', 'デジタル化', '業務改革'] },
  { category: '業務効率化', patterns: ['業務効率', '生産性', '自動化', 'rpa', '業務改善', 'ワークフロー'] },
  { category: '導入・移行', patterns: ['導入', '移行', 'マイグレーション', 'リプレイス', '入れ替え', '刷新'] },
  { category: '会計・財務', patterns: ['会計', '財務', '経理', '決算', '連結', '管理会計', '原価'] },
  { category: '販売・在庫', patterns: ['販売管理', '在庫管理', '受注', '発注', '倉庫', 'scm', 'サプライチェーン'] },
  { category: 'プロジェクト管理', patterns: ['プロジェクト管理', 'pmo', 'プロジェクトリカバリー', '失敗', '立て直し'] },
  { category: 'アジャイル', patterns: ['アジャイル', 'スクラム', '短納期', 'スプリント'] },
  { category: 'コスト・費用', patterns: ['コスト', '費用', '価格', '料金', '見積', 'roi', '投資対効果'] },
  { category: '比較・選定', patterns: ['比較', '選定', '選び方', 'おすすめ', 'ランキング', '違い'] },
  { category: 'AI・先端技術', patterns: ['ai', '人工知能', 'copilot', '機械学習', 'chatgpt', '生成ai'] },
  { category: '中堅・中小企業', patterns: ['中堅企業', '中小企業', 'sme', '中堅'] },
]

function detectCategory(keyword: string, ahrefsCategory: string): string {
  const lower = keyword.toLowerCase()
  for (const { category, patterns } of CATEGORIES) {
    for (const p of patterns) {
      if (lower.includes(p)) return category
    }
  }
  if (ahrefsCategory) return ahrefsCategory
  return 'その他'
}

function calcOpportunityScore(row: AhrefsKeywordRow): number {
  const volScore = Math.min(row.volume / 1000, 10)
  const kdScore = (100 - row.kd) / 10
  const cpcBonus = Math.min(row.cpc / 500, 2)
  return Math.round((volScore * 4 + kdScore * 5 + cpcBonus * 1) * 10) / 10
}

function calcPriority(
  score: number, kd: number, volume: number, trend: 'up' | 'down' | 'stable',
): PriorityLevel {
  if (score >= 50 && kd <= 30 && volume >= 100) return 3
  if (score >= 40 && kd <= 30 && trend === 'up') return 3
  if (score >= 40 && kd <= 50) return 2
  if (kd <= 20 && volume >= 100) return 2
  if (score >= 20) return 1
  return 0
}

function detectSvTrend(svTrend: number[]): { trend: 'up' | 'down' | 'stable'; changePercent: number } {
  if (svTrend.length < 6) return { trend: 'stable', changePercent: 0 }

  const recent6 = svTrend.slice(-6)
  const older6 = svTrend.length >= 12 ? svTrend.slice(-12, -6) : svTrend.slice(0, Math.min(6, svTrend.length - 6))

  if (older6.length === 0) return { trend: 'stable', changePercent: 0 }

  const recentAvg = recent6.reduce((a, b) => a + b, 0) / recent6.length
  const olderAvg = older6.reduce((a, b) => a + b, 0) / older6.length

  if (olderAvg === 0) return { trend: recentAvg > 0 ? 'up' : 'stable', changePercent: 0 }

  const changeRate = (recentAvg - olderAvg) / olderAvg
  const changePercent = Math.round(changeRate * 1000) / 10

  if (changeRate > 0.1) return { trend: 'up', changePercent }
  if (changeRate < -0.1) return { trend: 'down', changePercent }
  return { trend: 'stable', changePercent }
}

function detectTrafficTrend(row: AhrefsKeywordRow): { trend: 'up' | 'down' | 'stable'; changePercent: number } {
  if (row.trafficChange === null || row.previousTraffic === null) return { trend: 'stable', changePercent: 0 }
  if (row.previousTraffic === 0) {
    return { trend: row.trafficChange > 0 ? 'up' : 'stable', changePercent: 0 }
  }
  const rate = row.trafficChange / row.previousTraffic
  const pct = Math.round(rate * 1000) / 10
  if (rate > 0.1) return { trend: 'up', changePercent: pct }
  if (rate < -0.1) return { trend: 'down', changePercent: pct }
  return { trend: 'stable', changePercent: pct }
}

export function analyzeKeywords(keywords: AhrefsKeywordRow[]): ScoredKeyword[] {
  return keywords
    .map(row => {
      const trendInfo = row.svTrend.length > 0
        ? detectSvTrend(row.svTrend)
        : detectTrafficTrend(row)
      const score = calcOpportunityScore(row)

      return {
        ...row,
        opportunityScore: score,
        trend: trendInfo.trend,
        detectedCategory: detectCategory(row.keyword, row.category),
        priority: calcPriority(score, row.kd, row.volume, trendInfo.trend),
      }
    })
    .sort((a, b) => b.priority - a.priority || b.opportunityScore - a.opportunityScore)
}

export function detectTrends(keywords: AhrefsKeywordRow[]): TrendKeyword[] {
  return keywords
    .filter(kw => kw.svTrend.length >= 6 || kw.trafficChange !== null)
    .map(kw => {
      const info = kw.svTrend.length >= 6
        ? detectSvTrend(kw.svTrend)
        : detectTrafficTrend(kw)

      let previousVolume = 0
      if (kw.svTrend.length >= 12) {
        const older6 = kw.svTrend.slice(-12, -6)
        previousVolume = Math.round(older6.reduce((a, b) => a + b, 0) / older6.length)
      } else if (kw.previousTraffic != null) {
        previousVolume = kw.previousTraffic
      }

      const isNew = previousVolume === 0 && kw.volume > 0

      return {
        keyword: kw.keyword,
        volume: kw.volume,
        previousVolume,
        trend: info.trend,
        changePercent: isNew ? 100 : info.changePercent,
        isNew,
        detectedCategory: detectCategory(kw.keyword, kw.category),
      }
    })
    .filter(t => t.trend !== 'stable')
    .sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1
      return b.volume - a.volume
    })
}

export function getCategories(scored: ScoredKeyword[]): string[] {
  const set = new Set<string>()
  for (const kw of scored) set.add(kw.detectedCategory)
  return Array.from(set).sort()
}

export interface CategoryCount {
  category: string
  count: number
}

export function getCategoryCounts(scored: ScoredKeyword[]): CategoryCount[] {
  const map = new Map<string, number>()
  for (const kw of scored) {
    map.set(kw.detectedCategory, (map.get(kw.detectedCategory) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}

export function mergeAndAnalyze(
  datasetsKeywords: AhrefsKeywordRow[][],
): ScoredKeyword[] {
  const all: AhrefsKeywordRow[] = []
  for (const kws of datasetsKeywords) all.push(...kws)
  return analyzeKeywords(all)
}
