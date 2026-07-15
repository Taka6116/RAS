'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  LineChart,
  Minus,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'
import PageGroupTabs from '@/components/PageGroupTabs'

interface PerformancePoint {
  date: string
  day: number
  position: number | null
  traffic: number | null
}

interface PerformanceArticle {
  id: string
  title: string
  targetKeyword: string
  publishedDate: string
  wordpressUrl?: string
  status: string
  volume: number
  series: PerformancePoint[]
  firstPosition: number | null
  latestPosition: number | null
  bestPosition: number | null
  positionChange: number | null
}

interface UnmatchedKeyword {
  keyword: string
  position: number | null
  volume: number
  traffic: number | null
  url: string
}

interface PerformanceResponse {
  snapshots: { date: string; keywordCount: number }[]
  articles: PerformanceArticle[]
  unmatchedKeywords: UnmatchedKeyword[]
  error?: string
}

/** 経過日数×順位の折れ線チャート（順位なので上が1位） */
function PositionChart({ series }: { series: PerformancePoint[] }) {
  const measured = series.filter(p => p.position != null)
  if (measured.length === 0) return null

  const W = 560
  const H = 150
  const PAD = { top: 12, right: 16, bottom: 26, left: 34 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const days = series.map(p => p.day)
  const minDay = Math.min(...days)
  const maxDay = Math.max(...days)
  const daySpan = Math.max(maxDay - minDay, 1)

  const maxPos = Math.max(...measured.map(p => p.position!), 10)
  const yMax = Math.ceil(maxPos / 10) * 10

  const x = (day: number) => PAD.left + ((day - minDay) / daySpan) * innerW
  const y = (pos: number) => PAD.top + ((pos - 1) / Math.max(yMax - 1, 1)) * innerH

  const points = measured.map(p => `${x(p.day).toFixed(1)},${y(p.position!).toFixed(1)}`)
  const gridPositions = [1, ...Array.from({ length: yMax / 10 }, (_, i) => (i + 1) * 10)]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="公開日からの経過日数と検索順位の推移">
      {gridPositions.map(pos => (
        <g key={pos}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(pos)} y2={y(pos)} stroke="#E7F0F6" strokeWidth={1} />
          <text x={PAD.left - 6} y={y(pos) + 3.5} textAnchor="end" fontSize={10} fill="#94A3B8">
            {pos}位
          </text>
        </g>
      ))}
      {/* X軸ラベル（最初・中間・最新） */}
      {[series[0], series[Math.floor((series.length - 1) / 2)], series[series.length - 1]]
        .filter((p, i, arr) => p && arr.findIndex(q => q?.day === p.day) === i)
        .map(p => (
          <text key={p!.day} x={x(p!.day)} y={H - 8} textAnchor="middle" fontSize={10} fill="#94A3B8">
            {p!.day}日
          </text>
        ))}
      {points.length > 1 && (
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#009AE0"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {measured.map(p => (
        <circle key={`${p.date}-${p.day}`} cx={x(p.day)} cy={y(p.position!)} r={4} fill="#009AE0" stroke="white" strokeWidth={1.5}>
          <title>{`${p.date}（${p.day}日目）: ${p.position}位${p.traffic != null ? ` / 推定流入 ${p.traffic}` : ''}`}</title>
        </circle>
      ))}
    </svg>
  )
}

function ChangeBadge({ change }: { change: number | null }) {
  if (change == null) return null
  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
        <ArrowUpRight size={12} />{change}位 改善
      </span>
    )
  }
  if (change < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
        <ArrowDownRight size={12} />{Math.abs(change)}位 悪化
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
      <Minus size={12} />変動なし
    </span>
  )
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/performance', { cache: 'no-store' })
      const json = (await res.json()) as PerformanceResponse
      if (!res.ok) throw new Error(json.error || '成果データの取得に失敗しました')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : '成果データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  const articles = useMemo(() => data?.articles ?? [], [data])
  const snapshots = data?.snapshots ?? []
  const measuredArticles = useMemo(() => articles.filter(a => a.latestPosition != null), [articles])
  const improvedCount = useMemo(() => measuredArticles.filter(a => (a.positionChange ?? 0) > 0).length, [measuredArticles])

  return (
    <div className="w-full max-w-6xl py-8">
      <PageGroupTabs group="analysis" />
      <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#1A1A2E]">
            <LineChart size={24} className="text-[#009AE0]" />
            成果測定
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            公開した記事の対象KWがAhrefsの自社流入KWにどう現れているかを、公開日からの経過日数×順位で追跡します。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchData()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#009AE0] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#0080C0] disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />更新
        </button>
      </div>

      <div className="mb-7 rounded-lg border border-[#B9E0F5] bg-[#EDF9FF] px-4 py-3 text-xs leading-relaxed text-[#24526A]">
        順位データは<Link href="/ahrefs" className="mx-0.5 font-bold underline underline-offset-2">KW分析</Link>の「APIから今すぐ更新」を実行するたびに1日1回分の履歴として蓄積されます（現在 {snapshots.length} 回分）。
        定期的に更新するほどグラフの精度が上がります。対象KWがAhrefsの自社流入TOP圏に入っていない記事は「圏外」と表示されます。
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />{error}
        </div>
      )}

      {/* サマリー */}
      <div className="mb-7 grid grid-cols-3 gap-3">
        {[
          { label: '追跡対象の記事', value: articles.length, suffix: '件', hint: '公開済み・対象KWあり' },
          { label: '順位計測中', value: measuredArticles.length, suffix: '件', hint: '自社流入KWに検出' },
          { label: '順位が改善', value: improvedCount, suffix: '件', hint: '初回計測より上昇' },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-[#D0E3F0] bg-white p-4">
            <p className="text-[11px] font-semibold text-[#64748B]">{card.label}</p>
            <p className="mt-1 text-3xl font-black tabular-nums text-[#1A1A2E]">
              {loading ? '—' : card.value}
              <span className="ml-1 text-xs font-semibold text-[#94A3B8]">{card.suffix}</span>
            </p>
            <p className="mt-0.5 text-[10px] text-[#94A3B8]">{card.hint}</p>
          </div>
        ))}
      </div>

      {/* 記事ごとの推移 */}
      <section className="mb-6 space-y-4">
        {loading ? (
          <p className="rounded-xl border border-[#D0E3F0] bg-white px-4 py-10 text-center text-sm text-[#94A3B8]">読み込み中…</p>
        ) : articles.length === 0 ? (
          <p className="rounded-xl border border-[#D0E3F0] bg-white px-4 py-10 text-center text-sm text-[#94A3B8]">
            追跡対象の記事がまだありません。対象KWを設定した記事をWordPressに公開すると、ここに表示されます。
          </p>
        ) : (
          articles.map(article => {
            const elapsed = article.publishedDate
              ? Math.max(0, Math.round((Date.now() - new Date(`${article.publishedDate}T00:00:00Z`).getTime()) / 86_400_000))
              : null
            return (
              <div key={article.id} className="rounded-xl border border-[#D0E3F0] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-[#1A1A2E]">{article.title}</h2>
                      {article.wordpressUrl && (
                        <a href={article.wordpressUrl} target="_blank" rel="noopener noreferrer" className="text-[#009AE0] hover:text-[#0080C0]" aria-label="投稿記事を開く">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-[#64748B]">
                      KW: <span className="font-semibold text-[#334155]">{article.targetKeyword}</span>
                      {article.volume > 0 && ` / Vol ${article.volume.toLocaleString()}`}
                      {article.publishedDate && ` / 公開 ${article.publishedDate}`}
                      {elapsed != null && `（${elapsed}日経過）`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {article.latestPosition != null ? (
                      <>
                        <span className="text-2xl font-black tabular-nums text-[#0A2540]">
                          {article.latestPosition}
                          <span className="ml-0.5 text-xs font-semibold text-[#94A3B8]">位</span>
                        </span>
                        <ChangeBadge change={article.positionChange} />
                      </>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">圏外</span>
                    )}
                  </div>
                </div>

                {article.latestPosition != null ? (
                  <div className="mt-3">
                    <PositionChart series={article.series} />
                    <p className="mt-1 text-right text-[10px] text-[#94A3B8]">
                      横軸: 公開日からの経過日数 / 縦軸: 検索順位（上ほど良い）
                      {article.bestPosition != null && ` / 最高 ${article.bestPosition}位`}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg bg-[#F8FAFC] px-3 py-2.5 text-[11px] leading-relaxed text-[#94A3B8]">
                    このKWはまだ自社流入KWのTOP圏に検出されていません。順位がつき始めると自動でグラフ化されます。
                  </p>
                )}
              </div>
            )
          })
        )}
      </section>

      {/* 記事と未紐付けの流入KW */}
      {!loading && (data?.unmatchedKeywords?.length ?? 0) > 0 && (
        <section className="rounded-xl border border-[#D0E3F0] bg-white p-5">
          <div className="mb-1 flex items-center gap-2">
            <TrendingUp size={18} className="text-[#E67E22]" />
            <h2 className="font-bold text-[#1A1A2E]">記事と紐付いていない流入KW</h2>
          </div>
          <p className="mb-4 text-[11px] text-[#94A3B8]">
            自社サイトが順位を持っているのに、RASの記事の対象KWに設定されていないキーワードです。該当記事の対象KWに設定すると追跡できます。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-[11px] text-[#64748B]">
                  <th className="border-b border-[#D0E3F0] px-3 py-2 font-semibold">キーワード</th>
                  <th className="border-b border-[#D0E3F0] px-3 py-2 text-right font-semibold">順位</th>
                  <th className="border-b border-[#D0E3F0] px-3 py-2 text-right font-semibold">Vol</th>
                  <th className="border-b border-[#D0E3F0] px-3 py-2 text-right font-semibold">推定流入</th>
                </tr>
              </thead>
              <tbody>
                {data!.unmatchedKeywords.map(row => (
                  <tr key={row.keyword} className="hover:bg-[#F8FCFF]">
                    <td className="border-b border-[#E7F0F6] px-3 py-2.5 font-semibold text-[#334155]">{row.keyword}</td>
                    <td className="border-b border-[#E7F0F6] px-3 py-2.5 text-right tabular-nums text-[#1A1A2E]">{row.position != null ? `${row.position}位` : '—'}</td>
                    <td className="border-b border-[#E7F0F6] px-3 py-2.5 text-right tabular-nums text-[#64748B]">{row.volume.toLocaleString()}</td>
                    <td className="border-b border-[#E7F0F6] px-3 py-2.5 text-right tabular-nums text-[#64748B]">{row.traffic != null ? row.traffic.toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
