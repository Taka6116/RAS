'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X, Search, Sparkles, Globe, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { AhrefsDataset, AhrefsDatasetType } from '@/lib/ahrefsCsvParser'
import { analyzeKeywords, detectTrends, getCategoryCounts, mergeAndAnalyze, type ScoredKeyword, type TrendKeyword, type CategoryCount, type PriorityLevel } from '@/lib/ahrefsAnalyzer'

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
  const priorityLabels: Record<number, string> = {
    3: '★★★（最優先 — 低難易度・十分なボリューム。上位表示の勝算あり）',
    2: '★★（有望 — 記事計画に入れるべきKW）',
    1: '★（検討中 — 余力があれば着手）',
    0: '（参考レベル）',
  }

  let volumeStrategy = ''
  if (row.volume > 5000) volumeStrategy = '・検索ボリュームが非常に大きいため、包括的かつ網羅的な内容にすること。記事の情報量で勝負'
  else if (row.volume > 1000) volumeStrategy = '・十分な検索ボリュームがあるため、幅広い検索意図をカバーする構成にすること'
  else if (row.volume > 300) volumeStrategy = '・中規模ボリューム。ニッチな専門性と具体性で上位を狙える領域'
  else volumeStrategy = '・ニッチキーワード。深い専門知識と具体的な事例で差別化すること'

  let kdStrategy = ''
  if (row.kd <= 10) kdStrategy = '・競合がほぼ不在。基本を丁寧に押さえつつRICE CLOUDの独自事例を入れれば上位表示可能'
  else if (row.kd <= 30) kdStrategy = '・競合難易度が低い。基本を押さえつつRICE CLOUDの独自視点（アジャイル導入・リカバリー実績）で差別化すれば上位表示の勝算あり'
  else if (row.kd <= 50) kdStrategy = '・中程度の競合。RICE CLOUDの実体験・具体的数値で既存記事との差別化が必要'
  else kdStrategy = '・競合が強い領域。RICE CLOUDにしか書けない現場知見・独自データで差別化が必須。一般論は避けること'

  let cpcStrategy = ''
  if (row.cpc > 3) cpcStrategy = '\n・CPCが高く商業的意図が強い。CTAへの導線を丁寧に設計し、コンバージョンを意識した構成にすること'
  else if (row.cpc > 0) cpcStrategy = '\n・一定の商業的価値あり。記事末尾のCTAを自然かつ説得力のある形にすること'

  let trendNote = ''
  if (row.trend === 'up') trendNote = '\n・トレンド: 検索需要が上昇中。タイムリーな記事が効果的'
  else if (row.trend === 'down') trendNote = '\n・トレンド: 検索需要は下降傾向。エバーグリーンな切り口を推奨'

  const categoryIntents: Record<string, string> = {
    'NetSuite': '\n・Oracle NetSuiteの特徴・強み・他製品との違いを知りたい',
    'Dynamics 365': '\n・Microsoft Dynamics 365の適用範囲・ライセンス体系を理解したい',
    'Power Platform': '\n・Power Platform（Power Apps/Automate/BI）で何ができるかを知りたい',
    'コスト・費用': '\n・ERP導入にかかる費用の相場感・ROIの考え方を知りたい',
    '比較・選定': '\n・複数のERP製品を比較し、自社に最適なものを選定したい',
    '導入・移行': '\n・既存システムからの移行手順・リスク・期間を理解したい',
    '会計・財務': '\n・ERP導入による会計・財務業務の効率化・自動化の具体像を知りたい',
    '販売・在庫': '\n・販売管理・在庫管理のシステム化で解決できる課題を知りたい',
  }
  const extraIntent = categoryIntents[row.detectedCategory] ?? ''

  return `あなたはBtoB領域に特化したSEO・LLMOに強いコンテンツ戦略コンサルタント兼編集者であり、10年以上の実務経験を持ちます。現在は株式会社RICE CLOUD（ライスクラウド）のマーケティング兼ライターとして、ERP/SaaS導入領域における検索上位記事の制作を担っています。

単なる情報整理ではなく、検索意図の解像度を高め、意思決定を前進させる記事設計を行ってください。

■目的

・ERP/SaaS導入の非指名検索ユーザーの流入獲得
・専門性・信頼性・独自性の担保（E-E-A-T強化）
・ユーザーの検索意図（ペイン）の「ERP導入の複雑さに圧倒され、失敗を恐れている。何から始めればよいか分からない。」に応える内容にする

■テーマ

「${row.keyword}」

■KWデータに基づく執筆方針

・ターゲットキーワード: ${row.keyword}
・月間検索ボリューム: ${fmtNum(row.volume)}
・競合難易度(KD): ${row.kd}
・推定CPC: ¥${fmtNum(Math.round(row.cpc * 150))}
・カテゴリ: ${row.detectedCategory}
・優先度: ${priorityLabels[row.priority] ?? ''}${trendNote}
${volumeStrategy}
${kdStrategy}${cpcStrategy}

■検索意図の整理（必ず踏まえる）

以下の複数の検索意図を統合して記事を設計すること：

・ERP/SaaS導入とは何かを知りたい（基礎理解）
・自社に合った導入方法の判断基準がほしい（意思決定）
・ERP導入で失敗したくない、プロジェクト炎上は回避したい（リスク回避）${extraIntent}

■ターゲット

・ERP導入を検討し始めた中堅〜大企業の経営企画・IT部門・DX推進担当者
・業務改善・基幹システム刷新を視野に入れているが、進め方に不安がある層
・「何から手をつけるべきか分からない」状態の意思決定初期層

■必須条件

・AWS S3 data-for-ras/materials_for_rice_cloud/ に格納されているデータを参照し、RICE CLOUDの独自性のある内容に反映すること
・RICE CLOUDの実務知見・過去プロジェクトの経験をベースに記述すること
・必要に応じて、実際の現場で使われた表現や意思決定の言葉を引用形式で入れること
・可能であれば、実務で使われた言葉や現場の意思決定を1〜2文引用すること
・机上の空論ではなく、「現場で実際に起きている意思決定」をベースに記述すること
・RICE CLOUDの強みである「アジャイル手法による導入」「プロジェクトリカバリー（他社失敗案件の立て直し）」の内容をどこかに自然な形で入れること

■構成要件（SEO・LLMO最適化）

以下の構造で出力してください：

①タイトル（32文字以内・クリックされる設計）
②導入文（検索意図への共感＋記事の価値提示）
③結論要約（LLMO向けに先出しで要点整理）
④本文（見出し構造）
　- H2：本文の内容に合わせてください（「1. 」番号付き形式）
　- H2：本文の内容に合わせてください
　- H2：本文の内容に合わせてください
　- H3：各ポイントを具体的に解説（「1-1. 」形式）
⑤RICE CLOUDならではの視点（独自性）
⑥まとめ
⑦CTA（導入事例・相談への自然な導線）
⑧よくある質問（FAQ）— Q. と A. の形式で5つ程度

■品質要件

・専門性がありながらも読みやすい（IT部門以外の経営層でも理解できるレベル）
・抽象論ではなく、具体例・示唆を含める
・冗長表現は避け、簡潔かつ論理的に
・AIっぽさを排除（テンプレ感・不自然な言い回しNG）
・「近年〜」「DXが叫ばれる中〜」「ERPとは〜」から始まる定型導入は禁止

■SEO・LLMO要件

・ターゲットKW「${row.keyword}」を軸に、共起語・関連キーワードを自然に含める
・検索意図（情報収集・比較検討）を満たす
・箇条書き・構造化でAIが理解しやすい形式
・結論ファーストで要点を明確化

■出力形式

記事本文の最後に以下も必ず出力してください：

・SEOキーワードリスト（主要KW・関連KW・ロングテール）
・LLMO対策で意識したポイント（簡潔に3つ）`
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
  const [selectedPriority, setSelectedPriority] = useState<'all' | PriorityLevel>('all')
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

  const categoryCounts = useMemo(() => getCategoryCounts(activeData), [activeData])

  const filtered = useMemo(() => {
    let list = activeData
    if (selectedPriority !== 'all') {
      list = list.filter(kw => kw.priority === selectedPriority)
    }
    if (selectedCategory !== 'all') {
      list = list.filter(kw => kw.detectedCategory === selectedCategory)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(kw => kw.keyword.toLowerCase().includes(q))
    }
    return list
  }, [activeData, selectedPriority, selectedCategory, searchQuery])

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

  const activeTotal = activeData.length
  const p3Count = activeData.filter(k => k.priority === 3).length
  const p2Count = activeData.filter(k => k.priority === 2).length
  const trendCount = allTrends.length

  useEffect(() => { setShowCount(PAGE_SIZE); setSelectedPriority('all'); setSelectedCategory('all') }, [activeTab])
  useEffect(() => { setShowCount(PAGE_SIZE) }, [selectedPriority, selectedCategory, searchQuery])

  const hasData = datasets.length > 0

  return (
    <div
      className="w-full py-8"
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files) }}
    >
      {dragOver && (
        <div className="fixed inset-0 bg-[#009AE0]/10 border-2 border-dashed border-[#009AE0] rounded-xl z-50 pointer-events-none flex items-center justify-center">
          <p className="text-[#009AE0] font-semibold text-lg">CSVをドロップしてインポート</p>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A2E] mb-1">KW分析ダッシュボード</h1>
          <p className="text-sm text-[#64748B]">
            AhrefsのCSVデータから狙い目キーワードを分析し、記事制作につなげます。
          </p>
        </div>
        <div className="relative flex-shrink-0">
          <input
            type="file"
            accept=".csv,.tsv"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={e => { handleUpload(e.target.files); e.target.value = '' }}
            disabled={uploading}
          />
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-[#D0E3F0] bg-white hover:border-[#009AE0] hover:bg-[#F0F4FF] transition-colors text-sm font-medium text-[#475569] whitespace-nowrap"
          >
            <Upload size={16} className="text-[#94A3B8]" />
            {uploading ? 'アップロード中...' : 'CSVインポート'}
          </button>
        </div>
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
            <SummaryCard label="KW総数" value={fmtNum(activeTotal)} />
            <SummaryCard label="★★★ 即攻め" value={fmtNum(p3Count)} accent="amber" />
            <SummaryCard label="★★ 有望" value={fmtNum(p2Count)} accent="blue" />
            <SummaryCard label="トレンドKW" value={fmtNum(trendCount)} accent="green" />
          </div>

          {/* Priority pills (hidden on trends tab) */}
          {activeTab !== 'trends' && (
            <div className="flex flex-wrap gap-2 mb-3">
              {([
                { key: 'all' as const, label: 'すべて', count: activeData.length },
                { key: 3 as PriorityLevel, label: '★★★ 即攻め', count: p3Count },
                { key: 2 as PriorityLevel, label: '★★ 有望', count: p2Count },
                { key: 1 as PriorityLevel, label: '★ 余力', count: activeData.filter(k => k.priority === 1).length },
                { key: 0 as PriorityLevel, label: '対象外', count: activeData.filter(k => k.priority === 0).length },
              ]).map(p => (
                <button
                  key={String(p.key)}
                  type="button"
                  onClick={() => setSelectedPriority(selectedPriority === p.key ? 'all' : p.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    selectedPriority === p.key
                      ? p.key === 3 ? 'bg-amber-500 text-white border-amber-500'
                        : p.key === 2 ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-[#009AE0] text-white border-[#009AE0]'
                      : 'bg-white text-[#475569] border-[#D0E3F0] hover:border-[#009AE0]'
                  }`}
                >
                  {p.label} ({fmtNum(p.count)})
                </button>
              ))}
            </div>
          )}

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
              すべて ({fmtNum(activeData.length)})
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
                        <th className="text-left py-3 px-4 font-semibold text-[#64748B]" style={{ width: isOrganicTab ? '20%' : '28%' }}>キーワード</th>
                        <th className="text-right py-3 px-4 font-semibold text-[#64748B]" style={{ width: isOrganicTab ? '9%' : '10%' }}>Volume</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#64748B]" style={{ width: isOrganicTab ? '6%' : '7%' }}>KD</th>
                        <th className="text-right py-3 px-4 font-semibold text-[#64748B]" style={{ width: isOrganicTab ? '7%' : '8%' }}>CPC</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#64748B]" style={{ width: isOrganicTab ? '8%' : '9%' }}>優先度</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#64748B]" style={{ width: isOrganicTab ? '7%' : '8%' }}>スコア</th>
                        {isOrganicTab && (
                          <>
                            <th className="text-center py-3 px-4 font-semibold text-[#64748B]" style={{ width: '6%' }}>順位</th>
                            <th className="text-right py-3 px-4 font-semibold text-[#64748B]" style={{ width: '9%' }}>流入変動</th>
                          </>
                        )}
                        <th className="text-center py-3 px-4 font-semibold text-[#64748B]" style={{ width: isOrganicTab ? '10%' : '13%' }}>カテゴリ</th>
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
                            <PriorityBadge level={kw.priority} />
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
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-colors whitespace-nowrap"
                              style={{ backgroundColor: kw.priority === 3 ? '#E67E22' : '#009AE0' }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = kw.priority === 3 ? '#CF6D17' : '#0080C0')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = kw.priority === 3 ? '#E67E22' : '#009AE0')}
                            >
                              <Sparkles size={12} />
                              記事作成
                            </button>
                          </td>
                        </tr>
                      ))}
                      {visible.length === 0 && (
                        <tr>
                          <td colSpan={isOrganicTab ? 10 : 8} className="py-12 text-center text-[#94A3B8] text-sm">
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

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'blue' | 'purple' | 'amber' }) {
  const styles = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
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

function PriorityBadge({ level }: { level: PriorityLevel }) {
  if (level === 3) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-600 border border-amber-200">
      ★★★
    </span>
  )
  if (level === 2) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200">
      ★★
    </span>
  )
  if (level === 1) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
      ★
    </span>
  )
  return <span className="text-xs text-gray-300">−</span>
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
