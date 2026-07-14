import type { ArticleSummary } from './types'

export const CONTENT_TOPICS = [
  { id: 'erp', label: 'ERP・基幹システム', patterns: ['erp', '基幹システム', '統合基幹', 'システム刷新', 'リプレイス'] },
  { id: 'netsuite', label: 'NetSuite', patterns: ['netsuite', 'ネットスイート', 'oracle netsuite'] },
  { id: 'dynamics', label: 'Dynamics 365', patterns: ['dynamics', 'd365', 'business central'] },
  { id: 'power-platform', label: 'Power Platform', patterns: ['power platform', 'power apps', 'power automate', 'power bi', 'power pages'] },
  { id: 'implementation', label: '導入・移行', patterns: ['導入', '移行', 'マイグレーション', '導入支援'] },
  { id: 'operations', label: '業務改善・DX', patterns: ['dx', '業務改善', '業務効率', '自動化', 'rpa', 'ワークフロー', 'デジタル化'] },
  { id: 'finance', label: '会計・財務', patterns: ['会計', '財務', '経理', '管理会計', '決算', '連結'] },
  { id: 'sales-inventory', label: '販売・在庫', patterns: ['販売管理', '在庫管理', '受注', '発注', '倉庫', 'scm'] },
  { id: 'recovery', label: 'リカバリー・PMO', patterns: ['リカバリー', '立て直し', '失敗', '炎上', 'pmo', 'プロジェクト管理'] },
] as const

export type ContentTopicId = typeof CONTENT_TOPICS[number]['id'] | 'other'
export type FunnelStage = 'awareness' | 'research' | 'comparison' | 'decision'

export const FUNNEL_STAGES: Record<FunnelStage, { label: string; description: string; color: string }> = {
  awareness: { label: '認知', description: '基礎理解・課題認識', color: '#60A5E8' },
  research: { label: '情報収集', description: '方法・手順・知識収集', color: '#2F80C9' },
  comparison: { label: '比較検討', description: '比較・選定・判断基準', color: '#215D9C' },
  decision: { label: '意思決定', description: '支援・費用・導入判断', color: '#163F70' },
}

export interface ClassifiedArticle {
  article: ArticleSummary
  topic: ContentTopicId
  stage: FunnelStage
}

function articleText(article: ArticleSummary): string {
  return [
    article.title,
    article.refinedTitle,
    article.targetKeyword,
    ...(article.wordpressTags ?? []),
  ].join(' ').toLowerCase()
}

export function classifyTopic(article: ArticleSummary): ContentTopicId {
  const text = articleText(article)
  const topic = CONTENT_TOPICS.find(item => item.patterns.some(pattern => text.includes(pattern)))
  return topic?.id ?? 'other'
}

export function classifyFunnelStage(article: ArticleSummary): FunnelStage {
  const text = articleText(article)
  if (/(費用|価格|料金|見積|導入支援|コンサル|相談|事例|失敗|炎上|リカバリー|立て直し|ベンダー)/.test(text)) {
    return 'decision'
  }
  if (/(比較|選び方|おすすめ|違い|vs\b|メリット|デメリット|選定)/.test(text)) {
    return 'comparison'
  }
  if (/(導入|手順|方法|期間|移行|マイグレーション|機能|活用|設定)/.test(text)) {
    return 'research'
  }
  return 'awareness'
}

export function classifyArticle(article: ArticleSummary): ClassifiedArticle {
  return {
    article,
    topic: classifyTopic(article),
    stage: classifyFunnelStage(article),
  }
}

export function topicLabel(topicId: ContentTopicId): string {
  return CONTENT_TOPICS.find(topic => topic.id === topicId)?.label ?? 'その他'
}

export function isPublished(article: ArticleSummary): boolean {
  return article.status === 'published' || article.wordpressPostStatus === 'publish' || article.wordpressPostStatus === 'published'
}

export function isScheduled(article: ArticleSummary): boolean {
  return Boolean(article.scheduledDate) || article.wordpressPostStatus === 'future'
}
