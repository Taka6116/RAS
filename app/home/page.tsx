'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  CalendarClock,
  FileEdit,
  FileText,
  Lightbulb,
  LineChart,
  PenSquare,
  RefreshCw,
  BarChart3,
} from 'lucide-react'
import type { ArticleSummary } from '@/lib/types'
import type { AhrefsDataset } from '@/lib/ahrefsCsvParser'
import { mergeAndAnalyze, type ScoredKeyword } from '@/lib/ahrefsAnalyzer'
import {
  CONTENT_TOPICS,
  FUNNEL_STAGES,
  classifyArticle,
  isPublished,
  isScheduled,
  topicLabel,
  type ContentTopicId,
  type FunnelStage,
} from '@/lib/contentPortfolio'

interface PerformanceArticleLite {
  id: string
  title: string
  targetKeyword: string
  latestPosition: number | null
  positionChange: number | null
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function todayLabel(): string {
  return new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}

export default function HomePage() {
  const [articles, setArticles] = useState<ArticleSummary[]>([])
  const [datasets, setDatasets] = useState<AhrefsDataset[]>([])
  const [performance, setPerformance] = useState<PerformanceArticleLite[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'analytics' | 'details'>('analytics')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [articleResult, ahrefsResult, perfResult] = await Promise.allSettled([
      fetch('/api/articles?mode=summary', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/ahrefs', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/performance', { cache: 'no-store' }).then(r => r.json()),
    ])
    if (articleResult.status === 'fulfilled' && Array.isArray(articleResult.value.articles)) {
      setArticles(articleResult.value.articles)
    }
    if (ahrefsResult.status === 'fulfilled' && Array.isArray(ahrefsResult.value.datasets)) {
      setDatasets(ahrefsResult.value.datasets)
    }
    if (perfResult.status === 'fulfilled' && Array.isArray(perfResult.value.articles)) {
      setPerformance(perfResult.value.articles)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  const drafts = useMemo(() => articles.filter(a => !isPublished(a) && !isScheduled(a)), [articles])
  const published = useMemo(() => articles.filter(isPublished), [articles])

  const upcoming = useMemo(() => {
    const now = new Date()
    const weekLater = new Date(now.getTime() + 7 * 86_400_000)
    return articles
      .filter(isScheduled)
      .filter(a => {
        if (!a.scheduledDate) return false
        const d = new Date(`${a.scheduledDate}T${a.scheduledTime || '00:00'}:00`)
        return d >= new Date(now.getTime() - 86_400_000) && d <= weekLater
      })
      .sort((a, b) => `${a.scheduledDate}${a.scheduledTime}`.localeCompare(`${b.scheduledDate}${b.scheduledTime}`))
      .slice(0, 5)
  }, [articles])

  const keywordGaps = useMemo(() => {
    const existing = new Set(articles.map(a => normalizeKeyword(a.targetKeyword || '')).filter(Boolean))
    const keywordDatasets = datasets.filter(dataset => dataset.type === 'keywords')
    const scored = mergeAndAnalyze(keywordDatasets.map(dataset => dataset.keywords))
    const unique = new Map<string, ScoredKeyword>()
    for (const keyword of scored) {
      const normalized = normalizeKeyword(keyword.keyword)
      if (!normalized || existing.has(normalized) || unique.has(normalized) || keyword.priority < 2) continue
      unique.set(normalized, keyword)
    }
    return Array.from(unique.values()).slice(0, 3)
  }, [articles, datasets])

  const movers = useMemo(
    () =>
      performance
        .filter(a => a.latestPosition != null && a.positionChange != null && a.positionChange !== 0)
        .sort((a, b) => Math.abs(b.positionChange!) - Math.abs(a.positionChange!))
        .slice(0, 3),
    [performance]
  )
  const measuredCount = useMemo(() => performance.filter(a => a.latestPosition != null).length, [performance])

  /** 公開済み記事を公開月ごとに集計（直近6か月） */
  const monthlyPublished = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit' })
    const months: Array<{ key: string; label: string; count: number }> = []
    const now = new Date()
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      const key = formatter.format(date)
      months.push({ key, label: `${date.getMonth() + 1}月`, count: 0 })
    }
    for (const article of published) {
      const rawDate = article.scheduledDate || article.createdAt
      const date = new Date(rawDate)
      if (Number.isNaN(date.getTime())) continue
      const key = formatter.format(new Date(date.getFullYear(), date.getMonth(), 1))
      const month = months.find(item => item.key === key)
      if (month) month.count++
    }
    return months
  }, [published])

  /** 公開済み記事をコンテンツカテゴリ・ファネル段階で集計 */
  const contentBreakdown = useMemo(() => {
    const topics = new Map<ContentTopicId, number>()
    const stages = new Map<FunnelStage, number>()
    for (const article of published) {
      const classified = classifyArticle(article)
      topics.set(classified.topic, (topics.get(classified.topic) ?? 0) + 1)
      stages.set(classified.stage, (stages.get(classified.stage) ?? 0) + 1)
    }
    return {
      topics: Array.from(topics.entries())
        .map(([id, count]) => ({ id, label: topicLabel(id), count }))
        .sort((a, b) => b.count - a.count),
      stages: (Object.keys(FUNNEL_STAGES) as FunnelStage[]).map(id => ({
        id,
        ...FUNNEL_STAGES[id],
        count: stages.get(id) ?? 0,
      })),
    }
  }, [published])

  const recentPublished = useMemo(
    () => [...published]
      .sort((a, b) => (b.scheduledDate || b.createdAt).localeCompare(a.scheduledDate || a.createdAt))
      .slice(0, 6),
    [published]
  )
  const maxMonthlyCount = Math.max(...monthlyPublished.map(item => item.count), 1)
  const maxTopicCount = Math.max(...contentBreakdown.topics.map(item => item.count), 1)

  return (
    <div className="w-full max-w-6xl py-8">
      {/* ヘッダー */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#64748B]">{todayLabel()}</p>
          <h1 className="mt-1 text-2xl font-bold text-[#1A1A2E]">ホーム</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            {tab === 'analytics'
              ? '公開記事のカテゴリ・投稿時期・ファネル構成をひと目で確認できます。'
              : 'RICE CLOUDの記事運用の現在地と、今日やるべきことを確認できます。'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] px-3.5 py-2.5 text-[13px] font-semibold text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />更新
          </button>
          <Link
            href="/editor"
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white transition-all hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, #0056A0 0%, #009AE0 60%, #33C0F0 100%)',
              boxShadow: '0 2px 12px rgba(0,154,224,0.35)',
            }}
          >
            <PenSquare size={16} />
            記事を作成する
          </Link>
        </div>
      </div>

      <nav className="mb-6 flex gap-5 border-b" style={{ borderColor: '#D0E3F0' }}>
        {([
          ['analytics', '投稿分析'],
          ['details', 'その他詳細'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="border-b-2 -mb-px pb-2.5 text-sm font-semibold transition-colors"
            style={{
              color: tab === key ? '#0A2540' : '#64748B',
              borderColor: tab === key ? '#0A2540' : 'transparent',
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'analytics' && (
        <div className="space-y-6">
          {/* 投稿分析の概要 */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: '公開済み記事', value: published.length, color: '#16A34A', text: false },
              { label: '今月の公開', value: monthlyPublished[monthlyPublished.length - 1]?.count ?? 0, color: '#009AE0', text: false },
              { label: '最多カテゴリ', value: contentBreakdown.topics[0]?.label ?? '—', color: '#7C3AED', text: true },
              { label: '直近6か月の投稿数', value: monthlyPublished.reduce((sum, item) => sum + item.count, 0), color: '#E67E22', text: false },
            ].map(card => (
              <div key={card.label} className="rounded-xl border border-[#D0E3F0] bg-white p-4">
                <p className="text-[11px] font-semibold text-[#64748B]">{card.label}</p>
                <p
                  className={`${card.text ? 'mt-2 text-base' : 'mt-1 text-3xl'} font-black`}
                  style={{ color: card.color }}
                >
                  {loading ? '—' : card.value}
                  {!card.text && <span className="ml-1 text-xs font-semibold text-[#94A3B8]">件</span>}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* 月別投稿数 */}
            <section className="rounded-xl border border-[#D0E3F0] bg-white p-5">
              <div className="mb-5 flex items-center gap-2">
                <BarChart3 size={18} className="text-[#009AE0]" />
                <div>
                  <h2 className="font-bold text-[#1A1A2E]">月別の公開記事数</h2>
                  <p className="text-[11px] text-[#94A3B8]">公開済み記事・直近6か月</p>
                </div>
              </div>
              {loading ? (
                <p className="py-16 text-center text-sm text-[#94A3B8]">読み込み中…</p>
              ) : (
                <div className="flex h-52 items-end justify-between gap-3 border-b border-[#E7F0F6] px-2 pt-4">
                  {monthlyPublished.map(item => (
                    <div key={item.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-xs font-bold tabular-nums text-[#0A2540]">{item.count}件</span>
                      <div
                        className="w-full max-w-12 rounded-t-md transition-all"
                        style={{
                          height: `${Math.max(item.count > 0 ? 12 : 3, (item.count / maxMonthlyCount) * 150)}px`,
                          background: item.count > 0 ? 'linear-gradient(180deg, #33C0F0, #009AE0)' : '#E7F0F6',
                        }}
                      />
                      <span className="pb-2 text-[11px] font-semibold text-[#64748B]">{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* カテゴリ別 */}
            <section className="rounded-xl border border-[#D0E3F0] bg-white p-5">
              <div className="mb-5 flex items-center gap-2">
                <FileText size={18} className="text-[#7C3AED]" />
                <div>
                  <h2 className="font-bold text-[#1A1A2E]">カテゴリ別の投稿構成</h2>
                  <p className="text-[11px] text-[#94A3B8]">タイトル・対象KW・タグから自動分類</p>
                </div>
              </div>
              {loading ? (
                <p className="py-16 text-center text-sm text-[#94A3B8]">読み込み中…</p>
              ) : contentBreakdown.topics.length === 0 ? (
                <p className="py-16 text-center text-sm text-[#94A3B8]">公開済み記事がまだありません。</p>
              ) : (
                <div className="space-y-3">
                  {contentBreakdown.topics.slice(0, 6).map(item => (
                    <div key={item.id}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-[#334155]">{item.label}</span>
                        <span className="font-bold tabular-nums text-[#0A2540]">{item.count}件</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#E7F0F6]">
                        <div className="h-full rounded-full bg-[#7C3AED]" style={{ width: `${(item.count / maxTopicCount) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ファネルと直近公開 */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <section className="rounded-xl border border-[#D0E3F0] bg-white p-5 xl:col-span-2">
              <div className="mb-5 flex items-center gap-2">
                <Lightbulb size={18} className="text-[#E67E22]" />
                <div>
                  <h2 className="font-bold text-[#1A1A2E]">検討段階別の構成</h2>
                  <p className="text-[11px] text-[#94A3B8]">記事がカバーする読者の検討フェーズ</p>
                </div>
              </div>
              <div className="space-y-3">
                {contentBreakdown.stages.map(stage => (
                  <div key={stage.id} className="flex items-center gap-3">
                    <div className="w-20 text-xs font-semibold text-[#334155]">{stage.label}</div>
                    <div className="h-7 flex-1 overflow-hidden rounded-md bg-[#F1F5F9]">
                      <div
                        className="flex h-full min-w-8 items-center justify-end rounded-md px-2 text-[11px] font-bold text-white"
                        style={{
                          width: `${published.length ? Math.max((stage.count / published.length) * 100, stage.count ? 12 : 0) : 0}%`,
                          background: stage.color,
                        }}
                      >
                        {stage.count > 0 && `${stage.count}件`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-[#D0E3F0] bg-white p-5 xl:col-span-3">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarClock size={18} className="text-[#16A34A]" />
                  <h2 className="font-bold text-[#1A1A2E]">最近公開された記事</h2>
                </div>
                <Link href="/published" className="inline-flex items-center gap-1 text-xs font-semibold text-[#009AE0] hover:underline">
                  記事一覧へ<ArrowRight size={12} />
                </Link>
              </div>
              {loading ? (
                <p className="py-12 text-center text-sm text-[#94A3B8]">読み込み中…</p>
              ) : recentPublished.length === 0 ? (
                <p className="py-12 text-center text-sm text-[#94A3B8]">公開済み記事がまだありません。</p>
              ) : (
                <div className="divide-y divide-[#E7F0F6]">
                  {recentPublished.map(article => {
                    const classified = classifyArticle(article)
                    return (
                      <div key={article.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[#334155]">{article.refinedTitle || article.title}</p>
                          <p className="mt-0.5 truncate text-[11px] text-[#94A3B8]">
                            {article.targetKeyword || 'KW未設定'} / {topicLabel(classified.topic)}
                          </p>
                        </div>
                        <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums text-[#64748B]">
                          {(article.scheduledDate || article.createdAt).slice(0, 10)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === 'details' && (
        <>
      {/* サマリーカード */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: '下書き・作成済み', value: drafts.length, href: '/articles', color: '#0A2540' },
          { label: '今後7日の投稿予定', value: upcoming.length, href: '/schedule', color: '#7C3AED' },
          { label: '公開済み記事', value: published.length, href: '/published', color: '#16A34A' },
          { label: '順位計測中の記事', value: measuredCount, href: '/performance', color: '#009AE0' },
        ].map(card => (
          <Link key={card.label} href={card.href} className="rounded-xl border border-[#D0E3F0] bg-white p-4 transition-shadow hover:shadow-md">
            <p className="text-[11px] font-semibold text-[#64748B]">{card.label}</p>
            <p className="mt-1 text-3xl font-black tabular-nums" style={{ color: card.color }}>
              {loading ? '—' : card.value}
              <span className="ml-1 text-xs font-semibold text-[#94A3B8]">件</span>
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* 今週の投稿予定 */}
        <section className="rounded-xl border border-[#D0E3F0] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock size={18} className="text-[#7C3AED]" />
              <h2 className="font-bold text-[#1A1A2E]">今週の投稿予定</h2>
            </div>
            <Link href="/schedule" className="inline-flex items-center gap-1 text-xs font-semibold text-[#009AE0] hover:underline">
              スケジュールへ<ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-[#94A3B8]">読み込み中…</p>
          ) : upcoming.length === 0 ? (
            <p className="rounded-lg bg-[#F8FAFC] px-4 py-8 text-center text-sm text-[#94A3B8]">今後7日間の投稿予定はありません。</p>
          ) : (
            <div className="divide-y divide-[#E7F0F6]">
              {upcoming.map(article => (
                <div key={article.id} className="flex items-center justify-between gap-3 py-2.5">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#334155]">
                    {article.refinedTitle || article.title}
                  </p>
                  <span className="flex-shrink-0 rounded-md bg-violet-50 px-2 py-1 text-[11px] font-bold tabular-nums text-violet-700">
                    {article.scheduledDate}{article.scheduledTime ? ` ${article.scheduledTime}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 成果ハイライト */}
        <section className="rounded-xl border border-[#D0E3F0] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LineChart size={18} className="text-[#009AE0]" />
              <h2 className="font-bold text-[#1A1A2E]">成果ハイライト</h2>
            </div>
            <Link href="/performance" className="inline-flex items-center gap-1 text-xs font-semibold text-[#009AE0] hover:underline">
              成果測定へ<ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-[#94A3B8]">読み込み中…</p>
          ) : movers.length === 0 ? (
            <p className="rounded-lg bg-[#F8FAFC] px-4 py-8 text-center text-sm text-[#94A3B8]">
              順位変動のあった記事はまだありません。KW分析の「APIから今すぐ更新」で履歴を蓄積すると表示されます。
            </p>
          ) : (
            <div className="divide-y divide-[#E7F0F6]">
              {movers.map(article => (
                <div key={article.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#334155]">{article.title}</p>
                    <p className="text-[11px] text-[#94A3B8]">{article.targetKeyword} / 現在 {article.latestPosition}位</p>
                  </div>
                  {article.positionChange! > 0 ? (
                    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      <ArrowUpRight size={12} />{article.positionChange}位
                    </span>
                  ) : (
                    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                      <ArrowDownRight size={12} />{Math.abs(article.positionChange!)}位
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 次に作るべき記事 */}
        <section className="rounded-xl border border-[#D0E3F0] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb size={18} className="text-[#E67E22]" />
              <h2 className="font-bold text-[#1A1A2E]">次に作るべき記事</h2>
            </div>
            <Link href="/article-analytics" className="inline-flex items-center gap-1 text-xs font-semibold text-[#009AE0] hover:underline">
              記事分析へ<ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-[#94A3B8]">読み込み中…</p>
          ) : keywordGaps.length === 0 ? (
            <p className="rounded-lg bg-[#F8FAFC] px-4 py-8 text-center text-sm text-[#94A3B8]">
              優先度の高い未作成KWはありません。KW分析でデータを更新すると提案されます。
            </p>
          ) : (
            <div className="divide-y divide-[#E7F0F6]">
              {keywordGaps.map(keyword => (
                <div key={keyword.keyword} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-[#1A1A2E]">{keyword.keyword}</p>
                      <span className="flex-shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                        {keyword.priority === 3 ? '★★★ 即攻め' : '★★ 有望'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#94A3B8]">Vol {keyword.volume.toLocaleString()} / KD {keyword.kd}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 直近の下書き */}
        <section className="rounded-xl border border-[#D0E3F0] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-[#0A2540]" />
              <h2 className="font-bold text-[#1A1A2E]">直近の下書き・作成済み</h2>
            </div>
            <Link href="/articles" className="inline-flex items-center gap-1 text-xs font-semibold text-[#009AE0] hover:underline">
              一覧へ<ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-[#94A3B8]">読み込み中…</p>
          ) : drafts.length === 0 ? (
            <p className="rounded-lg bg-[#F8FAFC] px-4 py-8 text-center text-sm text-[#94A3B8]">下書きはありません。</p>
          ) : (
            <div className="divide-y divide-[#E7F0F6]">
              {drafts.slice(0, 5).map(article => (
                <Link key={article.id} href={`/editor?articleId=${article.id}&step=5`} className="group flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#334155] group-hover:text-[#009AE0]">
                      {article.refinedTitle || article.title || '（無題）'}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">{article.targetKeyword || 'KW未設定'}</p>
                  </div>
                  <FileEdit size={14} className="flex-shrink-0 text-[#94A3B8] group-hover:text-[#009AE0]" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
        </>
      )}
    </div>
  )
}
