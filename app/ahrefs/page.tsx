'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Trash2, X, TrendingUp, TrendingDown, Target, ArrowRight, Search, ChevronDown, Sparkles, Globe, Minus } from 'lucide-react'
import Button from '@/components/ui/Button'
import type { AhrefsKeywordRow, AhrefsDataset, AhrefsDatasetType } from '@/lib/ahrefsCsvParser'
import { analyzeKeywords, detectTrends, getCategories, type ScoredKeyword, type TrendKeyword } from '@/lib/ahrefsAnalyzer'

const PAGE_SIZE = 50

function formatNum(n: number): string {
  return n.toLocaleString('ja-JP')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function kdColor(kd: number): string {
  if (kd <= 30) return '#16a34a'
  if (kd <= 60) return '#ca8a04'
  return '#dc2626'
}

function kdBg(kd: number): string {
  if (kd <= 30) return '#f0fdf4'
  if (kd <= 60) return '#fefce8'
  return '#fef2f2'
}

function TrendBadge({ trend, pct }: { trend: 'up' | 'down' | 'stable'; pct?: number }) {
  if (trend === 'up') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
        <TrendingUp size={11} /> {pct != null ? `+${pct}%` : '上昇'}
      </span>
    )
  }
  if (trend === 'down') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">
        <TrendingDown size={11} /> {pct != null ? `${pct}%` : '下降'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
      <Minus size={11} /> 安定
    </span>
  )
}

function generateAutoPrompt(row: ScoredKeyword): string {
  const volumeStrategy = row.volume > 1000 ? '包括的で網羅的な' : 'ニッチで専門的な'
  const kdStrategy = row.kd < 30
    ? '上位表示のチャンスが高い。基本を押さえつつRICE CLOUDの独自視点（アジャイル導入・リカバリー実績）で差別化'
    : '競合が強い。RICE CLOUDの実体験・具体的数値で競合記事との差別化が必須'

  return `以下のターゲットキーワードに対して、検索ユーザーの意図に応える記事を執筆してください。

ターゲットキーワード: ${row.keyword}
月間検索ボリューム: ${row.volume}
競合難易度(KD): ${row.kd}

【執筆方針】
・検索ボリューム${row.volume}のキーワードなので、${volumeStrategy}内容にすること
・競合難易度KD=${row.kd}なので、${kdStrategy}
・RICE CLOUDのSaaS(ERP)導入支援（Oracle NetSuite / Microsoft Dynamics 365 / Power Platform）の知見を活かした実践的な内容にすること
・アジャイル手法による低コスト・短納期の導入メリットを具体的に盛り込むこと
・プロジェクトリカバリー（他社失敗案件の立て直し）の実績・知見があれば触れること`
}

type SortKey = 'score' | 'volume' | 'kd' | 'traffic' | 'trafficChange'

export default function AhrefsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dataset, setDataset] = useState<AhrefsDataset | null>(null)
  const [meta, setMeta] = useState<{ uploadedAt: string; fileName: string; rowCount: number; type: AhrefsDatasetType } | null>(null)
  const [scored, setScored] = useState<ScoredKeyword[]>([])
  const [trends, setTrends] = useState<TrendKeyword[]>([])
  const [categories, setCategories] = useState<string[]>([])

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [minVolume, setMinVolume] = useState(0)
  const [maxKd, setMaxKd] = useState(100)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [hideBranded, setHideBranded] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [showCount, setShowCount] = useState(PAGE_SIZE)
  const [showTrends, setShowTrends] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ahrefs')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'データの取得に失敗しました')

      if (json.data) {
        const ds = json.data as AhrefsDataset
        setDataset(ds)
        setMeta(json.meta)
        const s = analyzeKeywords(ds.keywords)
        setScored(s)
        setTrends(detectTrends(ds.keywords))
        setCategories(getCategories(s))
      } else {
        setDataset(null)
        setMeta(null)
        setScored([])
        setTrends([])
        setCategories([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length || uploading) return
    setUploading(true)
    setError(null)
    const file = fileList[0]
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/ahrefs', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'アップロードに失敗しました')
      await fetchData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'アップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }, [uploading, fetchData])

  const handleDelete = useCallback(async () => {
    if (!confirm('KW分析データを全て削除しますか？')) return
    try {
      const res = await fetch('/api/ahrefs', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '削除に失敗しました')
      setDataset(null)
      setMeta(null)
      setScored([])
      setTrends([])
      setCategories([])
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }, [])

  const handleWriteArticle = (row: ScoredKeyword) => {
    const prompt = generateAutoPrompt(row)
    const params = new URLSearchParams({
      kwTarget: row.keyword,
      kwPrompt: prompt,
    })
    router.push(`/editor?${params.toString()}`)
  }

  const filtered = scored.filter(kw => {
    if (searchQuery && !kw.keyword.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (kw.volume < minVolume) return false
    if (kw.kd > maxKd) return false
    if (selectedCategory !== 'all' && kw.detectedCategory !== selectedCategory) return false
    if (hideBranded && kw.branded) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case 'score': return b.opportunityScore - a.opportunityScore
      case 'volume': return b.volume - a.volume
      case 'kd': return a.kd - b.kd
      case 'traffic': return (b.currentTraffic ?? 0) - (a.currentTraffic ?? 0)
      case 'trafficChange': return (b.trafficChange ?? 0) - (a.trafficChange ?? 0)
      default: return 0
    }
  })

  const visible = sorted.slice(0, showCount)
  const isOrganic = dataset?.type === 'organic'

  return (
    <div className="w-full py-8">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A2E]">KW分析（Ahrefs）</h1>
          <p className="text-sm text-[#64748B] mt-1">
            AhrefsのCSVをアップロードし、狙い目キーワードを特定。ワンクリックで記事作成を開始できます。
          </p>
        </div>
        {dataset && (
          <button
            type="button"
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
          >
            <Trash2 size={14} /> データを削除
          </button>
        )}
      </div>

      {meta && (
        <div className="mt-3 mb-6 flex flex-wrap items-center gap-3 text-xs text-[#64748B]">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
            {meta.type === 'organic' ? 'Organic Keywords' : 'Keywords Explorer'}
          </span>
          <span>{meta.fileName}</span>
          <span>|</span>
          <span>{formatNum(meta.rowCount)} キーワード</span>
          <span>|</span>
          <span>アップロード: {formatDate(meta.uploadedAt)}</span>
        </div>
      )}

      {/* Upload area */}
      <div
        className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-colors mb-6 ${
          dragOver ? 'border-[#009AE0] bg-[#F0F4FF]' : 'border-[#D0E3F0] bg-white'
        }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files) }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={e => { handleUpload(e.target.files); e.target.value = '' }}
          disabled={uploading}
        />
        <Upload className="mx-auto text-[#94A3B8]" size={36} />
        <p className="mt-2 text-sm font-medium text-[#1A1A2E]">
          {uploading ? 'アップロード中...' : 'AhrefsのCSVをここにドラッグ＆ドロップ'}
        </p>
        <p className="mt-1 text-xs text-[#64748B]">
          Keywords Explorer または Organic Keywords のCSVエクスポートに対応（タブ区切りも自動検出）
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <X size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && !dataset && (
        <div className="text-center py-16 text-[#64748B] text-sm">読み込み中...</div>
      )}

      {!loading && !dataset && (
        <div className="rounded-xl border border-[#D0E3F0] bg-white p-12 text-center">
          <Target className="mx-auto text-[#94A3B8] mb-3" size={48} />
          <p className="text-lg font-bold text-[#1A1A2E] mb-2">データがありません</p>
          <p className="text-sm text-[#64748B]">
            AhrefsからエクスポートしたCSVをアップロードすると、KW分析ダッシュボードが表示されます。
          </p>
        </div>
      )}

      {dataset && scored.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="総KW数" value={formatNum(scored.length)} />
            <SummaryCard label="平均KD" value={String(Math.round(scored.reduce((s, k) => s + k.kd, 0) / scored.length))} />
            <SummaryCard
              label="上昇トレンド"
              value={String(trends.filter(t => t.trend === 'up').length)}
              accent="green"
            />
            <SummaryCard
              label="低KD (≤30)"
              value={String(scored.filter(k => k.kd <= 30).length)}
              accent="blue"
            />
          </div>

          {/* Trend highlights */}
          {trends.length > 0 && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setShowTrends(!showTrends)}
                className="flex items-center gap-2 text-sm font-semibold text-[#1A1A2E] hover:text-[#009AE0] transition-colors"
              >
                <TrendingUp size={16} />
                トレンドキーワード ({trends.length}件)
                <ChevronDown size={14} className={`transition-transform ${showTrends ? 'rotate-180' : ''}`} />
              </button>
              {showTrends && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {trends.slice(0, 12).map(t => (
                    <div key={t.keyword} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-[#D0E3F0]">
                      <span className="text-sm text-[#1A1A2E] truncate mr-2">{t.keyword}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-[#64748B]">Vol: {formatNum(t.volume)}</span>
                        <TrendBadge trend={t.trend} pct={t.changePercent} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filter bar */}
          <div className="rounded-xl border border-[#D0E3F0] bg-white p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">キーワード検索</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="キーワードを検索..."
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[#D0E3F0] focus:outline-none focus:ring-2 focus:ring-[#009AE0]/30"
                  />
                </div>
              </div>
              <div className="w-[130px]">
                <label className="block text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">Volume ≥</label>
                <input
                  type="number"
                  value={minVolume || ''}
                  onChange={e => setMinVolume(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#D0E3F0] focus:outline-none focus:ring-2 focus:ring-[#009AE0]/30"
                />
              </div>
              <div className="w-[130px]">
                <label className="block text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">KD ≤</label>
                <input
                  type="number"
                  value={maxKd === 100 ? '' : maxKd}
                  onChange={e => setMaxKd(parseInt(e.target.value) || 100)}
                  placeholder="100"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#D0E3F0] focus:outline-none focus:ring-2 focus:ring-[#009AE0]/30"
                />
              </div>
              <div className="w-[160px]">
                <label className="block text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">カテゴリ</label>
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#D0E3F0] bg-white focus:outline-none focus:ring-2 focus:ring-[#009AE0]/30"
                >
                  <option value="all">すべて</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="w-[140px]">
                <label className="block text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">ソート</label>
                <select
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value as SortKey)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#D0E3F0] bg-white focus:outline-none focus:ring-2 focus:ring-[#009AE0]/30"
                >
                  <option value="score">スコア順</option>
                  <option value="volume">Volume順</option>
                  <option value="kd">KD順（低い順）</option>
                  {isOrganic && <option value="traffic">Traffic順</option>}
                  {isOrganic && <option value="trafficChange">Traffic変動順</option>}
                </select>
              </div>
              {isOrganic && (
                <label className="flex items-center gap-1.5 cursor-pointer py-2">
                  <input
                    type="checkbox"
                    checked={hideBranded}
                    onChange={e => setHideBranded(e.target.checked)}
                    className="rounded border-[#D0E3F0]"
                  />
                  <span className="text-xs text-[#64748B]">ブランドKW除外</span>
                </label>
              )}
            </div>
            <div className="mt-2 text-xs text-[#94A3B8]">
              {formatNum(filtered.length)} / {formatNum(scored.length)} 件表示
            </div>
          </div>

          {/* Main table */}
          <div className="rounded-xl border border-[#D0E3F0] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#D0E3F0] bg-[#F8FAFC]">
                    <th className="text-left py-3 px-4 font-semibold text-[#64748B] min-w-[200px]">キーワード</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#64748B] w-[100px]">Volume</th>
                    <th className="text-center py-3 px-4 font-semibold text-[#64748B] w-[70px]">KD</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#64748B] w-[70px]">CPC</th>
                    <th className="text-center py-3 px-4 font-semibold text-[#64748B] w-[80px]">トレンド</th>
                    <th className="text-left py-3 px-4 font-semibold text-[#64748B] w-[100px]">カテゴリ</th>
                    {isOrganic && (
                      <>
                        <th className="text-right py-3 px-4 font-semibold text-[#64748B] w-[70px]">順位</th>
                        <th className="text-right py-3 px-4 font-semibold text-[#64748B] w-[90px]">Traffic</th>
                        <th className="text-right py-3 px-4 font-semibold text-[#64748B] w-[90px]">変動</th>
                      </>
                    )}
                    <th className="text-right py-3 px-4 font-semibold text-[#64748B] w-[80px]">スコア</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#64748B] w-[120px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((kw, i) => (
                    <tr
                      key={`${kw.keyword}-${i}`}
                      className={`border-b border-[#D0E3F0] hover:bg-[#F8FAFC]/60 transition-colors ${kw.branded ? 'opacity-50' : ''}`}
                    >
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-[#1A1A2E] truncate max-w-[280px]">{kw.keyword}</div>
                        {kw.parentTopic && (
                          <div className="text-[10px] text-[#94A3B8] truncate">親: {kw.parentTopic}</div>
                        )}
                        {kw.url && (
                          <a
                            href={kw.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-[#009AE0] hover:underline truncate block max-w-[280px]"
                          >
                            <Globe size={10} className="inline mr-0.5" />{kw.url.replace(/^https?:\/\//, '').slice(0, 50)}
                          </a>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-[#1A1A2E]">
                        {formatNum(kw.volume)}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-bold"
                          style={{ color: kdColor(kw.kd), backgroundColor: kdBg(kw.kd) }}
                        >
                          {kw.kd}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-[#64748B]">
                        {kw.cpc > 0 ? `¥${formatNum(Math.round(kw.cpc * 150))}` : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <TrendBadge trend={kw.trend} />
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-[#F1F5F9] text-[#475569] truncate max-w-[100px]">
                          {kw.detectedCategory}
                        </span>
                      </td>
                      {isOrganic && (
                        <>
                          <td className="py-2.5 px-4 text-right text-[#64748B]">
                            {kw.position != null ? kw.position : '-'}
                          </td>
                          <td className="py-2.5 px-4 text-right text-[#64748B]">
                            {kw.currentTraffic != null ? formatNum(kw.currentTraffic) : '-'}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {kw.trafficChange != null ? (
                              <span className={kw.trafficChange > 0 ? 'text-green-600 font-medium' : kw.trafficChange < 0 ? 'text-red-600 font-medium' : 'text-[#64748B]'}>
                                {kw.trafficChange > 0 ? '+' : ''}{formatNum(kw.trafficChange)}
                              </span>
                            ) : '-'}
                          </td>
                        </>
                      )}
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div
                            className="h-2 rounded-full bg-[#D0E3F0] w-12"
                            title={`スコア: ${kw.opportunityScore}`}
                          >
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(kw.opportunityScore / 10 * 100, 100)}%`,
                                backgroundColor: '#009AE0',
                              }}
                            />
                          </div>
                          <span className="text-xs font-bold text-[#1A1A2E] w-8 text-right">
                            {kw.opportunityScore}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleWriteArticle(kw)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white transition-colors"
                          style={{ backgroundColor: '#009AE0' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0080C0')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#009AE0')}
                        >
                          <Sparkles size={12} />
                          記事作成
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {sorted.length > showCount && (
            <div className="flex justify-center mt-4">
              <Button
                variant="ghost"
                onClick={() => setShowCount(prev => prev + PAGE_SIZE)}
                className="text-sm"
              >
                さらに{Math.min(PAGE_SIZE, sorted.length - showCount)}件表示
                <ArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'blue' }) {
  const bg = accent === 'green' ? 'bg-green-50 border-green-200' : accent === 'blue' ? 'bg-blue-50 border-blue-200' : 'bg-white border-[#D0E3F0]'
  const textColor = accent === 'green' ? 'text-green-700' : accent === 'blue' ? 'text-blue-700' : 'text-[#1A1A2E]'
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${textColor}`}>{value}</div>
    </div>
  )
}
