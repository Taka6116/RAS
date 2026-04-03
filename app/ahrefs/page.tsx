'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X, Search, Sparkles, Globe, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { AhrefsDataset, AhrefsDatasetType } from '@/lib/ahrefsCsvParser'
import { analyzeKeywords, detectTrends, getCategoryCounts, mergeAndAnalyze, type ScoredKeyword, type TrendKeyword, type CategoryCount } from '@/lib/ahrefsAnalyzer'

const PAGE_SIZE = 50

type TabKey = 'opportunity' | 'organic' | 'trends' | 'all'

interface DatasetMeta {
  id: string
  fileName: string
  type: AhrefsDatasetType
  rowCount: number
  uploadedAt: string
}

function fmtNum(n: number): string { return n.toLocaleString('ja-JP') }
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })
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

function generateAutoPrompt(row: ScoredKeyword): string {
  const vs = row.volume > 1000 ? '包括的で網羅的な' : 'ニッチで専門的な'
  const ks = row.kd < 30
    ? '上位表示のチャンスが高い。基本を押さえつつRICE CLOUDの独自視点（アジャイル導入・リカバリー実績）で差別化'
    : '競合が強い。RICE CLOUDの実体験・具体的数値で競合記事との差別化が必須'
  return `以下のターゲットキーワードに対して、検索ユーザーの意図に応える記事を執筆してください。

ターゲットキーワード: ${row.keyword}
月間検索ボリューム: ${row.volume}
競合難易度(KD): ${row.kd}

【執筆方針】
・検索ボリューム${row.volume}のキーワードなので、${vs}内容にすること
・競合難易度KD=${row.kd}なので、${ks}
・RICE CLOUDのSaaS(ERP)導入支援（Oracle NetSuite / Microsoft Dynamics 365 / Power Platform）の知見を活かした実践的な内容にすること
・アジャイル手法による低コスト・短納期の導入メリットを具体的に盛り込むこと
・プロジェクトリカバリー（他社失敗案件の立て直し）の実績・知見があれば触れること`
}

export default function AhrefsPage() {
  const router = useRouter()
  const [datasets, setDatasets] = useState<AhrefsDataset[]>([])
  const [index, setIndex] = useState<DatasetMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const [activeTab, setActiveTab] = useState<TabKey>('opportunity')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCount, setShowCount] = useState(PAGE_SIZE)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ahrefs')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'データの取得に失敗しました')
      setDatasets(json.datasets ?? [])
      setIndex(json.index ?? [])
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

  const handleDeleteDataset = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/ahrefs?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '削除に失敗しました')
      await fetchData()
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }, [fetchData])

  const handleWriteArticle = (row: ScoredKeyword) => {
    const params = new URLSearchParams({ kwTarget: row.keyword, kwPrompt: generateAutoPrompt(row) })
    router.push(`/editor?${params.toString()}`)
  }

  const allScored = useMemo(() => mergeAndAnalyze(datasets.map(d => d.keywords)), [datasets])
  const kwScored = useMemo(() => {
    const kwDs = datasets.filter(d => d.type === 'keywords')
    return kwDs.length > 0 ? mergeAndAnalyze(kwDs.map(d => d.keywords)) : []
  }, [datasets])
  const organicScored = useMemo(() => {
    const orgDs = datasets.filter(d => d.type === 'organic')
    return orgDs.length > 0 ? mergeAndAnalyze(orgDs.map(d => d.keywords)) : []
  }, [datasets])
  const allTrends = useMemo(() => detectTrends(datasets.flatMap(d => d.keywords)), [datasets])

  const activeData = useMemo(() => {
    switch (activeTab) {
      case 'opportunity': return kwScored
      case 'organic': return organicScored
      case 'all': return allScored
      default: return allScored
    }
  }, [activeTab, kwScored, organicScored, allScored])

  const categoryCounts = useMemo(() => getCategoryCounts(allScored), [allScored])

  const filtered = useMemo(() => {
    let list = activeData
    if (selectedCategory !== 'all') {
      list = list.filter(kw => kw.detectedCategory === selectedCategory)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(kw => kw.keyword.toLowerCase().includes(q))
    }
    return list
  }, [activeData, selectedCategory, searchQuery])

  const filteredTrends = useMemo(() => {
    let list = allTrends
    if (selectedCategory !== 'all') {
      list = list.filter(t => t.detectedCategory === selectedCategory)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t => t.keyword.toLowerCase().includes(q))
    }
    return list
  }, [allTrends, selectedCategory, searchQuery])

  const visible = filtered.slice(0, showCount)
  const isOrganicTab = activeTab === 'organic'

  const kwTotal = kwScored.length
  const organicTotal = organicScored.length
  const opportunityCount = kwScored.filter(k => k.opportunityScore >= 50).length
  const trendCount = allTrends.length

  useEffect(() => { setShowCount(PAGE_SIZE) }, [activeTab, selectedCategory, searchQuery])

  const hasData = datasets.length > 0

  return (
    <div className="w-full py-8">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-1">KW分析ダッシュボード</h1>
      <p className="text-sm text-[#64748B] mb-6">
        AhrefsのCSVデータから狙い目キーワードを分析し、記事制作につなげます。
      </p>

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
          type="file"
          accept=".csv,.tsv"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={e => { handleUpload(e.target.files); e.target.value = '' }}
          disabled={uploading}
        />
        <Upload className="mx-auto text-[#94A3B8]" size={36} />
        <p className="mt-2 text-sm font-medium text-[#1A1A2E]">
          {uploading ? 'アップロード中...' : 'AhrefsのCSVをドラッグ＆ドロップ、またはクリック'}
        </p>
        <p className="mt-1 text-xs text-[#64748B]">
          Keywords Explorer / Site Explorer (Organic Keywords) のCSV対応
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <X size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Dataset badges */}
      {index.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {index.map(m => (
            <span
              key={m.id}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                m.type === 'organic'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
            >
              <span className="font-bold">{m.type === 'organic' ? '競合' : 'KW'}</span>
              <span className="truncate max-w-[200px]">{m.fileName.replace(/\.csv$/i, '')}</span>
              <span>{fmtNum(m.rowCount)}件</span>
              <span>{fmtDate(m.uploadedAt)}</span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); handleDeleteDataset(m.id) }}
                className="ml-0.5 hover:text-red-600 transition-colors"
                title="削除"
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      {loading && !hasData && (
        <div className="text-center py-16 text-[#64748B] text-sm">読み込み中...</div>
      )}

      {!loading && !hasData && (
        <div className="rounded-xl border border-[#D0E3F0] bg-white p-12 text-center">
          <Upload className="mx-auto text-[#94A3B8] mb-3" size={48} />
          <p className="text-lg font-bold text-[#1A1A2E] mb-2">データがありません</p>
          <p className="text-sm text-[#64748B]">
            AhrefsからエクスポートしたCSVをアップロードすると、KW分析ダッシュボードが表示されます。
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="KW総数" value={fmtNum(kwTotal)} />
            <SummaryCard label="狙い目（スコア50+）" value={fmtNum(opportunityCount)} accent="blue" />
            <SummaryCard label="競合KW" value={fmtNum(organicTotal)} accent="purple" />
            <SummaryCard label="トレンドKW" value={fmtNum(trendCount)} accent="green" />
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-[#009AE0] text-white border-[#009AE0]'
                  : 'bg-white text-[#475569] border-[#D0E3F0] hover:border-[#009AE0]'
              }`}
            >
              すべて ({fmtNum(allScored.length)})
            </button>
            {categoryCounts.map(cc => (
              <button
                key={cc.category}
                type="button"
                onClick={() => setSelectedCategory(selectedCategory === cc.category ? 'all' : cc.category)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  selectedCategory === cc.category
                    ? 'bg-[#009AE0] text-white border-[#009AE0]'
                    : 'bg-white text-[#475569] border-[#D0E3F0] hover:border-[#009AE0]'
                }`}
              >
                {cc.category} ({fmtNum(cc.count)})
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-4 border-b border-[#D0E3F0]">
            {([
              { key: 'opportunity' as TabKey, label: '狙い目KW' },
              { key: 'organic' as TabKey, label: '競合KW' },
              { key: 'trends' as TabKey, label: 'トレンド' },
              { key: 'all' as TabKey, label: '全データ' },
            ]).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-semibold transition-colors relative ${
                  activeTab === tab.key
                    ? 'text-[#009AE0]'
                    : 'text-[#64748B] hover:text-[#1A1A2E]'
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#009AE0] rounded-t" />
                )}
              </button>
            ))}
          </div>

          {/* Search bar (shared across all tabs) */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="キーワードを検索..."
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-[#D0E3F0] bg-white focus:outline-none focus:ring-2 focus:ring-[#009AE0]/30"
            />
          </div>

          {/* Trends tab */}
          {activeTab === 'trends' ? (
            <TrendsTableView trends={filteredTrends} />
          ) : (
            <>

              {/* Table */}
              <div className="rounded-xl border border-[#D0E3F0] bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-fixed">
                    <thead>
                      <tr className="border-b border-[#D0E3F0] bg-[#F8FAFC]">
                        <th className="text-left py-3 px-4 font-semibold text-[#64748B]" style={{ width: isOrganicTab ? '22%' : '30%' }}>キーワード</th>
                        <th className="text-right py-3 px-4 font-semibold text-[#64748B]" style={{ width: '10%' }}>Volume</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#64748B]" style={{ width: '7%' }}>KD</th>
                        <th className="text-right py-3 px-4 font-semibold text-[#64748B]" style={{ width: '8%' }}>CPC</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#64748B]" style={{ width: '8%' }}>スコア</th>
                        {isOrganicTab && (
                          <>
                            <th className="text-center py-3 px-4 font-semibold text-[#64748B]" style={{ width: '7%' }}>順位</th>
                            <th className="text-right py-3 px-4 font-semibold text-[#64748B]" style={{ width: '10%' }}>流入変動</th>
                          </>
                        )}
                        <th className="text-center py-3 px-4 font-semibold text-[#64748B]" style={{ width: isOrganicTab ? '10%' : '14%' }}>カテゴリ</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#64748B]" style={{ width: isOrganicTab ? '10%' : '11%' }}>アクション</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((kw, i) => (
                        <tr
                          key={`${kw.keyword}-${i}`}
                          className="border-b border-[#D0E3F0] hover:bg-[#F8FAFC]/60 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="font-semibold text-[#1A1A2E] truncate">{kw.keyword}</div>
                            {kw.url && (
                              <a
                                href={kw.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-[#009AE0] hover:underline truncate block"
                              >
                                {kw.url.replace(/^https?:\/\//, '').slice(0, 50)}
                              </a>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-[#1A1A2E]">
                            {fmtNum(kw.volume)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className="inline-block px-2 py-0.5 rounded text-xs font-bold"
                              style={{ color: kdColor(kw.kd), backgroundColor: kdBg(kw.kd) }}
                            >
                              {kw.kd}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-[#64748B]">
                            {kw.cpc > 0 ? `¥${fmtNum(Math.round(kw.cpc * 150))}` : '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-sm font-bold" style={{ color: '#009AE0' }}>
                              {kw.opportunityScore}
                            </span>
                          </td>
                          {isOrganicTab && (
                            <>
                              <td className="py-3 px-4 text-center text-[#64748B]">
                                {kw.position != null ? kw.position : '-'}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {kw.trafficChange != null ? (
                                  <span className={kw.trafficChange > 0 ? 'text-green-600 font-semibold' : kw.trafficChange < 0 ? 'text-red-600 font-semibold' : 'text-[#64748B]'}>
                                    {kw.trafficChange > 0 ? '+' : ''}{fmtNum(kw.trafficChange)}
                                  </span>
                                ) : '-'}
                              </td>
                            </>
                          )}
                          <td className="py-3 px-4 text-center">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-[#F1F5F9] text-[#475569]">
                              {kw.detectedCategory}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleWriteArticle(kw)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-colors"
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
                      {visible.length === 0 && (
                        <tr>
                          <td colSpan={isOrganicTab ? 9 : 7} className="py-12 text-center text-[#94A3B8] text-sm">
                            {activeTab === 'opportunity' && kwScored.length === 0
                              ? 'Keywords ExplorerのCSVをアップロードしてください'
                              : activeTab === 'organic' && organicScored.length === 0
                                ? 'Organic KeywordsのCSVをアップロードしてください'
                                : '条件に一致するキーワードがありません'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {filtered.length > showCount && (
                <div className="flex justify-center mt-4">
                  <button
                    type="button"
                    onClick={() => setShowCount(prev => prev + PAGE_SIZE)}
                    className="px-6 py-2 rounded-lg text-sm font-medium text-[#009AE0] border border-[#009AE0] hover:bg-[#009AE0]/5 transition-colors"
                  >
                    さらに{Math.min(PAGE_SIZE, filtered.length - showCount)}件表示
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'blue' | 'purple' }) {
  const styles = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  }
  const s = accent ? styles[accent] : 'bg-white border-[#D0E3F0] text-[#1A1A2E]'
  const [bgBorder, textColor] = [s.split(' ').slice(0, 2).join(' '), s.split(' ').slice(2).join(' ')]
  return (
    <div className={`rounded-xl border p-4 ${bgBorder}`}>
      <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${textColor}`}>{value}</div>
    </div>
  )
}

function TrendsTableView({ trends }: { trends: TrendKeyword[] }) {
  if (trends.length === 0) {
    return (
      <div className="rounded-xl border border-[#D0E3F0] bg-white p-12 text-center text-sm text-[#94A3B8]">
        トレンドデータがありません。SV trendデータを含むCSVをアップロードしてください。
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-[#D0E3F0] bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-[#D0E3F0] bg-[#F8FAFC]">
              <th className="text-left py-3 px-4 font-semibold text-[#64748B]" style={{ width: '35%' }}>キーワード</th>
              <th className="text-right py-3 px-4 font-semibold text-[#64748B]" style={{ width: '15%' }}>前回Vol</th>
              <th className="text-right py-3 px-4 font-semibold text-[#64748B]" style={{ width: '15%' }}>今回Vol</th>
              <th className="text-right py-3 px-4 font-semibold text-[#64748B]" style={{ width: '15%' }}>変化率</th>
              <th className="text-center py-3 px-4 font-semibold text-[#64748B]" style={{ width: '10%' }}>状態</th>
            </tr>
          </thead>
          <tbody>
            {trends.map((t, i) => (
              <tr key={`${t.keyword}-${i}`} className="border-b border-[#D0E3F0] hover:bg-[#F8FAFC]/60 transition-colors">
                <td className="py-3 px-4">
                  <span className="font-semibold text-[#1A1A2E]">{t.keyword}</span>
                </td>
                <td className="py-3 px-4 text-right text-[#64748B]">
                  {fmtNum(t.previousVolume)}
                </td>
                <td className="py-3 px-4 text-right font-medium text-[#1A1A2E]">
                  {fmtNum(t.volume)}
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={t.changePercent > 0 ? 'text-green-600 font-semibold' : t.changePercent < 0 ? 'text-red-600 font-semibold' : 'text-[#64748B]'}>
                    {t.changePercent > 0 ? '+' : ''}{t.changePercent}%
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  {t.isNew ? (
                    <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#F1F5F9] text-[#64748B] border border-[#D0E3F0]">
                      NEW
                    </span>
                  ) : t.trend === 'up' ? (
                    <TrendingUp size={16} className="inline text-green-600" />
                  ) : (
                    <TrendingDown size={16} className="inline text-red-500" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
