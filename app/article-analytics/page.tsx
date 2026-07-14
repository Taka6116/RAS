'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, BarChart3, CheckCircle2, FileEdit, FileText, Lightbulb, RefreshCw, Target } from 'lucide-react'
import type { AhrefsDataset } from '@/lib/ahrefsCsvParser'
import { mergeAndAnalyze, type ScoredKeyword } from '@/lib/ahrefsAnalyzer'
import { buildKwPrompt } from '@/lib/kwPromptBuilder'
import {
  CONTENT_TOPICS,
  FUNNEL_STAGES,
  classifyArticle,
  isPublished,
  isScheduled,
  topicLabel,
  type ClassifiedArticle,
  type ContentTopicId,
  type FunnelStage,
} from '@/lib/contentPortfolio'
import type { ArticleSummary } from '@/lib/types'

const STAGES: FunnelStage[] = ['awareness', 'research', 'comparison', 'decision']

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function StatusPill({ article }: { article: ArticleSummary }) {
  if (isPublished(article)) return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">公開済み</span>
  if (isScheduled(article)) return <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">予約済み</span>
  if (article.wordpressPostStatus === 'draft') return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">WP下書き</span>
  if (article.status === 'ready') return <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">作成済み</span>
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">下書き</span>
}

export default function ArticleAnalyticsPage() {
  const router = useRouter()
  const [articles, setArticles] = useState<ArticleSummary[]>([])
  const [datasets, setDatasets] = useState<AhrefsDataset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [articleResult, ahrefsResult] = await Promise.allSettled([
        fetch('/api/articles?mode=summary', { cache: 'no-store' }).then(async response => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'S3の記事データを取得できませんでした')
          return data
        }),
        fetch('/api/ahrefs', { cache: 'no-store' }).then(async response => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Ahrefsデータを取得できませんでした')
          return data
        }),
      ])

      if (articleResult.status === 'rejected') throw articleResult.reason
      setArticles(Array.isArray(articleResult.value.articles) ? articleResult.value.articles : [])

      if (ahrefsResult.status === 'fulfilled') {
        setDatasets(Array.isArray(ahrefsResult.value.datasets) ? ahrefsResult.value.datasets : [])
      } else {
        setDatasets([])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'コンテンツデータの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  const classified = useMemo(() => articles.map(classifyArticle), [articles])
  const topicRows = useMemo(() => [...CONTENT_TOPICS, { id: 'other' as const, label: 'その他', patterns: [] }].map(topic => ({
    ...topic,
    articles: classified.filter(article => article.topic === topic.id),
  })), [classified])

  const stageRows = useMemo(() => STAGES.map(stage => ({
    stage,
    meta: FUNNEL_STAGES[stage],
    articles: classified.filter(article => article.stage === stage),
  })), [classified])

  const qualityIssues = useMemo(() => {
    const issues: { label: string; detail: string; articles: ArticleSummary[] }[] = []
    const missingKeyword = articles.filter(article => !article.targetKeyword?.trim())
    if (missingKeyword.length) issues.push({ label: 'ターゲットKW未設定', detail: '記事の意図・重複を判定できません', articles: missingKeyword })

    const likelyTypo = articles.filter(article => normalizeKeyword(article.targetKeyword) === 'epr')
    if (likelyTypo.length) issues.push({ label: 'KW表記の確認候補', detail: '「EPR」は「ERP」の入力誤りの可能性があります', articles: likelyTypo })

    const groups = new Map<string, ArticleSummary[]>()
    for (const article of articles) {
      const keyword = normalizeKeyword(article.targetKeyword || '')
      if (!keyword) continue
      groups.set(keyword, [...(groups.get(keyword) ?? []), article])
    }
    for (const [keyword, group] of groups) {
      if (group.length > 1) issues.push({ label: `重複候補: ${keyword}`, detail: '同一ターゲットKWの記事が複数あります', articles: group })
    }
    return issues.slice(0, 6)
  }, [articles])

  const keywordGaps = useMemo(() => {
    const existing = new Set(articles.map(article => normalizeKeyword(article.targetKeyword || '')).filter(Boolean))
    const keywordDatasets = datasets.filter(dataset => dataset.type === 'keywords')
    const scored = mergeAndAnalyze(keywordDatasets.map(dataset => dataset.keywords))
    const unique = new Map<string, ScoredKeyword>()
    for (const keyword of scored) {
      const normalized = normalizeKeyword(keyword.keyword)
      if (!normalized || existing.has(normalized) || unique.has(normalized) || keyword.priority < 2) continue
      unique.set(normalized, keyword)
    }
    return Array.from(unique.values()).slice(0, 8)
  }, [articles, datasets])

  const handleWriteArticle = useCallback((keyword: ScoredKeyword) => {
    const topic = topicLabel(classifyArticle({
      id: 'candidate',
      title: keyword.keyword,
      refinedTitle: '',
      targetKeyword: keyword.keyword,
      status: 'draft',
      createdAt: '',
      wordCount: 0,
      imageUrl: '',
      excerpt: '',
    }).topic)
    const prompt = buildKwPrompt({
      keyword: keyword.keyword,
      volume: keyword.volume,
      kd: keyword.kd,
      cpc: keyword.cpc,
      detectedCategory: keyword.detectedCategory,
      priorityLabel: keyword.priority === 3 ? '★★★ 即攻め' : '★★ 有望',
      score: keyword.opportunityScore,
      gap: { tagName: topic, articleCount: 0 },
    })
    router.push(`/editor?${new URLSearchParams({ kwTarget: keyword.keyword, kwPrompt: prompt }).toString()}`)
  }, [router])

  return (
    <div className="w-full max-w-6xl py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A2E] flex items-center gap-2">
            <BarChart3 size={24} className="text-[#009AE0]" />
            コンテンツポートフォリオ
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            S3に保存された記事データを基に、テーマ・検討段階・次に作るべき記事を整理します。
          </p>
        </div>
        <button type="button" onClick={() => void fetchData()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg bg-[#009AE0] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#0080C0] disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />更新
        </button>
      </div>

      <div className="mb-7 rounded-lg border border-[#B9E0F5] bg-[#EDF9FF] px-4 py-3 text-xs leading-relaxed text-[#24526A]">
        WordPressのカテゴリ・タグ運用には依存せず、記事タイトル・対象KW・公開状態からRICE CLOUD独自のテーマと検討段階を自動分類しています。
      </div>

      {error && <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" />{error}</div>}

      <div className="mb-7 max-w-xs rounded-xl border border-[#D0E3F0] bg-white p-4">
        <p className="text-[11px] font-semibold text-[#64748B]">管理記事数（S3に保存された全記事）</p>
        <p className="mt-1 text-3xl font-black tabular-nums text-[#1A1A2E]">{loading ? '—' : articles.length}<span className="ml-1 text-xs font-semibold text-[#94A3B8]">件</span></p>
      </div>

      <section className="mb-6 rounded-xl border border-[#D0E3F0] bg-white p-5">
        <div className="mb-5 flex items-center gap-2"><Target size={18} className="text-[#009AE0]" /><div><h2 className="font-bold text-[#1A1A2E]">テーマ × 検討段階</h2><p className="text-[11px] text-[#94A3B8]">記事の偏りと、次に強化するテーマを確認できます。</p></div></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
            <thead><tr className="text-left text-[11px] text-[#64748B]"><th className="border-b border-[#D0E3F0] px-3 py-2 font-semibold">テーマ</th>{STAGES.map(stage => <th key={stage} className="border-b border-[#D0E3F0] px-3 py-2 text-center font-semibold">{FUNNEL_STAGES[stage].label}</th>)}<th className="border-b border-[#D0E3F0] px-3 py-2 text-center font-semibold">合計</th></tr></thead>
            <tbody>{topicRows.map(row => {
              const total = row.articles.length
              return <tr key={row.id} className="hover:bg-[#F8FCFF]"><td className="border-b border-[#E7F0F6] px-3 py-3 font-semibold text-[#334155]">{row.label}</td>{STAGES.map(stage => {
                const count = row.articles.filter(article => article.stage === stage).length
                return <td key={stage} className="border-b border-[#E7F0F6] px-3 py-3 text-center"><span className={`inline-flex min-w-8 justify-center rounded-md px-2 py-1 text-xs font-bold ${count ? 'bg-[#E6F5FC] text-[#0080C0]' : 'bg-[#F5F7F9] text-[#A0AEC0]'}`}>{count}</span></td>
              })}<td className="border-b border-[#E7F0F6] px-3 py-3 text-center font-black text-[#1A1A2E]">{total}</td></tr>
            })}</tbody>
          </table>
        </div>
      </section>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-[#D0E3F0] bg-white p-5">
          <div className="mb-4 flex items-center gap-2"><FileText size={18} className="text-[#009AE0]" /><div><h2 className="font-bold text-[#1A1A2E]">検討段階の構成</h2><p className="text-[11px] text-[#94A3B8]">ファネルのどこに記事が集中しているかを表示します。</p></div></div>
          <div className="space-y-3">{stageRows.map(row => {
            const pct = articles.length ? Math.round(row.articles.length / articles.length * 100) : 0
            return <div key={row.stage}><div className="mb-1 flex justify-between text-xs"><span className="font-bold text-[#334155]">{row.meta.label}<span className="ml-2 font-normal text-[#94A3B8]">{row.meta.description}</span></span><span className="font-bold text-[#1A1A2E]">{row.articles.length}件</span></div><div className="h-2.5 overflow-hidden rounded-full bg-[#EDF2F7]"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: row.meta.color }} /></div></div>
          })}</div>
        </section>

        <section className="rounded-xl border border-[#D0E3F0] bg-white p-5">
          <div className="mb-4 flex items-center gap-2"><AlertCircle size={18} className="text-[#E67E22]" /><div><h2 className="font-bold text-[#1A1A2E]">品質・運用チェック</h2><p className="text-[11px] text-[#94A3B8]">対象KWの不足・重複候補を確認します。</p></div></div>
          {qualityIssues.length === 0 ? <p className="flex items-center gap-2 py-7 text-sm text-emerald-700"><CheckCircle2 size={17} />現在、確認が必要な項目はありません。</p> : <div className="space-y-2">{qualityIssues.map(issue => <div key={issue.label} className="rounded-lg border border-[#F5D9B5] bg-[#FFF9F0] px-3 py-2.5"><p className="text-xs font-bold text-[#A95809]">{issue.label}</p><p className="mt-0.5 text-[11px] text-[#64748B]">{issue.detail}（{issue.articles.length}件）</p></div>)}</div>}
        </section>
      </div>

      <section className="rounded-xl border border-[#D0E3F0] bg-white p-5">
        <div className="mb-1 flex items-center gap-2"><Lightbulb size={18} className="text-[#E67E22]" /><h2 className="font-bold text-[#1A1A2E]">次に作るべき記事</h2></div>
        <p className="mb-4 text-[11px] text-[#94A3B8]">Ahrefsの「有望・即攻め」KWのうち、S3の記事データに未登録のものを表示します。</p>
        {datasets.length === 0 ? <p className="rounded-lg bg-[#F8FAFC] px-4 py-6 text-center text-sm text-[#94A3B8]">Ahrefsの重点KWデータを取得すると、記事ギャップを提案できます。</p> : keywordGaps.length === 0 ? <p className="rounded-lg bg-[#F8FAFC] px-4 py-6 text-center text-sm text-[#94A3B8]">優先度の高い未作成KWは見つかりませんでした。</p> : <div className="divide-y divide-[#E7F0F6]">{keywordGaps.map(keyword => <div key={keyword.keyword} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><div className="flex items-center gap-2"><p className="text-sm font-bold text-[#1A1A2E]">{keyword.keyword}</p><span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{keyword.priority === 3 ? '★★★ 即攻め' : '★★ 有望'}</span></div><p className="mt-1 text-[11px] text-[#64748B]">Vol {keyword.volume.toLocaleString()} / KD {keyword.kd} / {keyword.detectedCategory}</p></div><button type="button" onClick={() => handleWriteArticle(keyword)} className="inline-flex items-center gap-1.5 rounded-md border border-[#009AE0] px-3 py-1.5 text-xs font-bold text-[#0080C0] hover:bg-[#009AE0] hover:text-white"><FileEdit size={13} />このKWで記事作成</button></div>)}</div>}
      </section>
    </div>
  )
}
