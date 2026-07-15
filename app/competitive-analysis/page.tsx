'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crosshair,
  ExternalLink,
  History,
  Lightbulb,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import type {
  ActionPlan,
  CompetitiveAnalysisDocument,
  CompetitiveAnalysisSnapshot,
  CompetitorConfig,
  KeywordOpportunity,
  StrategyAction,
  StrategyPriority,
  StrategyPhase,
} from '@/lib/competitiveAnalysis'

type Tab = 'competitors' | 'comparison' | 'strategy'

const AXES = [
  { key: 'message', label: 'LP・メッセージ' },
  { key: 'pricing', label: '価格・利用条件' },
  { key: 'offering', label: '機能・提供範囲' },
  { key: 'positioning', label: 'ポジショニング' },
  { key: 'authority', label: '集客・権威性' },
] as const

const PRIORITY: Record<StrategyPriority, { label: string; color: string; gradient: string }> = {
  high: { label: '優先度 高', color: '#e53e4f', gradient: 'linear-gradient(90deg, #e53e4f, #f4708a)' },
  medium: { label: '優先度 中', color: '#f59e0b', gradient: 'linear-gradient(90deg, #f59e0b, #fbbf24)' },
  low: { label: '優先度 低', color: '#64748b', gradient: 'linear-gradient(90deg, #64748b, #94a3b8)' },
}

const PHASES: Record<StrategyPhase, { label: string; color: string }> = {
  awareness: { label: '認知', color: '#0ea5e9' },
  research: { label: '情報収集', color: '#14b8a6' },
  comparison: { label: '比較検討', color: '#f59e0b' },
  decision: { label: '意思決定', color: '#e53e4f' },
}

/**
 * ファネル各段の形状。各段の上辺幅＝前段の下辺幅になるよう
 * clip-path を計算してあり、段間で輪郭が自然につながる。
 */
const FUNNEL_PHASES: Record<StrategyPhase, {
  english: string
  gradient: string
  width: string
  clipPath: string
}> = {
  awareness: {
    english: 'Attention',
    gradient: 'linear-gradient(180deg, #7CC3F0, #5FB0E8)',
    width: '100%',
    clipPath: 'polygon(0 0, 100% 0, 89.5% 100%, 10.5% 100%)',
  },
  research: {
    english: 'Interest',
    gradient: 'linear-gradient(180deg, #55A4E4, #3E8FD6)',
    width: '79%',
    clipPath: 'polygon(0 0, 100% 0, 86.7% 100%, 13.3% 100%)',
  },
  comparison: {
    english: 'Desire',
    gradient: 'linear-gradient(180deg, #3579BE, #2A65A6)',
    width: '58%',
    clipPath: 'polygon(0 0, 100% 0, 81.9% 100%, 18.1% 100%)',
  },
  decision: {
    english: 'Action',
    gradient: 'linear-gradient(180deg, #234F84, #1B3F6C)',
    width: '37%',
    clipPath: 'polygon(0 0, 100% 0, 71.6% 100%, 28.4% 100%)',
  },
}

function fmtDate(iso?: string): string {
  if (!iso) return '未実行'
  return new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function tabDate(date: string) {
  const [, month, day] = date.split('-').map(Number)
  return `${month}/${day}`
}

function asPercent(value: number) {
  return `${Math.round(value)}%`
}

/**
 * AIが返す軸ラベル「ターゲット企業規模(小→大)」を
 * { name: '企業規模', low: '小', high: '大' } に分解する。
 * 括弧・矢印がない場合は低い/高いで代替する。
 */
function parseAxisLabel(raw: string): { name: string; low: string; high: string } {
  const m = raw.match(/^(.*?)[（(]\s*(.+?)\s*(?:→|⇒|➔|〜|~)\s*(.+?)\s*[)）]\s*$/)
  if (m) return { name: m[1]!.trim() || raw, low: m[2]!.trim(), high: m[3]!.trim() }
  return { name: raw, low: '低い', high: '高い' }
}

/**
 * 空白領域テキストに「x:60-80」「y:70-90」形式の座標が含まれる場合に抽出する。
 * 見つからなければ null（ゾーンの描画をスキップ）。
 */
function parseWhitespaceZone(text: string): { x1: number; x2: number; y1: number; y2: number } | null {
  const x = text.match(/x\s*[:：]\s*(\d{1,3})\s*[-–〜~]\s*(\d{1,3})/i)
  const y = text.match(/y\s*[:：]\s*(\d{1,3})\s*[-–〜~]\s*(\d{1,3})/i)
  if (!x || !y) return null
  const clamp = (n: number) => Math.max(0, Math.min(100, n))
  return {
    x1: clamp(Number(x[1])), x2: clamp(Number(x[2])),
    y1: clamp(Number(y[1])), y2: clamp(Number(y[2])),
  }
}

export default function CompetitiveAnalysisPage() {
  const [config, setConfig] = useState<CompetitorConfig[]>([])
  const [document, setDocument] = useState<CompetitiveAnalysisDocument>({ updatedAt: '', competitors: {} })
  const [history, setHistory] = useState<CompetitiveAnalysisSnapshot[]>([])
  const [opportunities, setOpportunities] = useState<KeywordOpportunity[]>([])
  const [usage, setUsage] = useState<{ units_used_this_month: number; units_limit_per_month: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('competitors')
  // 施策の実行手順モーダル
  const [planAction, setPlanAction] = useState<StrategyAction | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  // 生成済みプランはタイトルをキーにキャッシュし、再クリック時の再生成を避ける
  const [planCache, setPlanCache] = useState<Record<string, ActionPlan>>({})
  const [viewDate, setViewDate] = useState('latest')
  const [urlDrafts, setUrlDrafts] = useState<Record<string, { label: string; url: string }>>({})

  const refresh = useCallback(async () => {
    const response = await fetch('/api/competitive-analysis', { cache: 'no-store' })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error ?? '競合分析データの取得に失敗しました')
    setConfig(body.config ?? [])
    setDocument(body.document ?? { updatedAt: '', competitors: {} })
    setHistory(body.history ?? [])
    setOpportunities(body.opportunities ?? [])
    const nextUsage = body.usage
    setUsage(
      nextUsage &&
        Number.isFinite(Number(nextUsage.units_used_this_month)) &&
        Number.isFinite(Number(nextUsage.units_limit_per_month))
        ? {
            units_used_this_month: Number(nextUsage.units_used_this_month),
            units_limit_per_month: Number(nextUsage.units_limit_per_month),
          }
        : null,
    )
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : '競合分析データの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    })()
  }, [refresh])

  const view = useMemo(() => {
    if (viewDate !== 'latest') {
      const snapshot = history.find(item => item.date === viewDate)
      if (snapshot) return { document: snapshot.document, historical: true }
    }
    return { document, historical: false }
  }, [viewDate, history, document])

  const invoke = async (action: string, body: Record<string, unknown> = {}) => {
    setRunning(action)
    setError(null)
    try {
      const response = await fetch('/api/competitive-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? '処理に失敗しました')
      await refresh()
      return result
    } catch (e) {
      setError(e instanceof Error ? e.message : '処理に失敗しました')
      return null
    } finally {
      setRunning(null)
    }
  }

  const analyzeAll = async () => {
    setRunning('analyze-all')
    setError(null)
    // 1社が失敗しても他社の分析は続行し、失敗はまとめて表示する
    const failures: string[] = []
    for (const competitor of config) {
      try {
        const response = await fetch('/api/competitive-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'analyze-competitor', competitorId: competitor.id }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) failures.push(`${competitor.name}: ${body.error ?? '分析に失敗しました'}`)
      } catch {
        failures.push(`${competitor.name}: 通信に失敗しました`)
      }
    }
    await refresh()
    if (failures.length > 0) setError(failures.join(' / '))
    setRunning(null)
  }

  const openActionPlan = async (action: StrategyAction) => {
    setPlanAction(action)
    setPlanError(null)
    if (planCache[action.title]) return // キャッシュ済みなら生成しない
    setPlanLoading(true)
    try {
      const response = await fetch('/api/competitive-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'action-plan', strategyAction: action }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? '実行手順の生成に失敗しました')
      setPlanCache(prev => ({ ...prev, [action.title]: body.plan as ActionPlan }))
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : '実行手順の生成に失敗しました')
    } finally {
      setPlanLoading(false)
    }
  }

  const addMonitoringUrl = async (competitor: CompetitorConfig) => {
    const draft = urlDrafts[competitor.id]
    if (!draft?.url?.trim()) return
    try {
      const parsed = new URL(draft.url.trim())
      if (parsed.protocol !== 'https:' || !(parsed.hostname === competitor.domain || parsed.hostname.endsWith(`.${competitor.domain}`))) {
        throw new Error(`${competitor.domain} 配下のHTTPS URLを指定してください`)
      }
      const next = config.map(item => item.id === competitor.id
        ? { ...item, urls: [...item.urls, { url: parsed.toString(), label: draft.label.trim() || '監視ページ' }] }
        : item)
      setRunning('save-config')
      const response = await fetch('/api/competitive-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-config', config: next }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? '監視URLの保存に失敗しました')
      setUrlDrafts(prev => ({ ...prev, [competitor.id]: { label: '', url: '' } }))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '監視URLの保存に失敗しました')
    } finally {
      setRunning(null)
    }
  }

  const report = view.document.report
  const isAnalyzed = (id: string) => Boolean(view.document.competitors[id]?.axes)

  if (loading) {
    return (
      <div className="w-full py-20 flex items-center justify-center gap-3">
        <Loader2 className="animate-spin" size={20} style={{ color: '#009AE0' }} />
        <span className="text-sm" style={{ color: '#64748B' }}>競合分析を読み込んでいます...</span>
      </div>
    )
  }

  return (
    <div className="w-full py-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: '#1A1A2E' }}>
            <Crosshair size={21} />
            競合分析・戦略提案
          </h1>
          <p className="text-sm mt-1 max-w-3xl" style={{ color: '#64748B' }}>
            競合の公式情報、検索KW機会、仮説ペルソナを統合し、RICE CLOUDが次に実行する施策まで整理します。
          </p>
        </div>
        {usage && (
          <div className="rounded-[10px] px-3 py-2 text-[11px]" style={{ background: 'rgba(0,154,224,0.06)', border: '1px solid #D0E3F0' }}>
            <span style={{ color: '#64748B' }}>Ahrefs API: </span>
            <strong style={{ color: '#1A1A2E' }}>{usage.units_used_this_month.toLocaleString()} / {usage.units_limit_per_month.toLocaleString()} units</strong>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-5 rounded-[12px] px-4 py-3 flex gap-2 text-sm" style={{ background: 'rgba(229,62,79,0.08)', border: '1px solid rgba(229,62,79,0.28)', color: '#c02637' }}>
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b mb-6" style={{ borderColor: '#D0E3F0' }}>
        <div className="flex gap-5">
          {([
            ['competitors', '競合一覧'],
            ['comparison', '比較・機会'],
            ['strategy', '戦略・施策'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors"
              style={tab === key ? { color: '#0A2540', borderColor: '#0A2540' } : { color: '#64748B', borderColor: 'transparent' }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 pb-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold mr-1" style={{ color: '#64748B' }}>
            <History size={12} />履歴
          </span>
          <button
            onClick={() => setViewDate('latest')}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold"
            style={viewDate === 'latest' ? { background: '#0A2540', color: '#fff' } : { background: 'rgba(20,44,92,0.06)', color: '#64748B' }}
          >
            最新
          </button>
          {history.map(item => (
            <button
              key={item.date}
              onClick={() => setViewDate(item.date)}
              className="px-2.5 py-1 rounded-full text-[11px] font-bold"
              style={viewDate === item.date ? { background: '#0A2540', color: '#fff' } : { background: 'rgba(20,44,92,0.06)', color: '#64748B' }}
            >
              {tabDate(item.date)}
            </button>
          ))}
        </div>
      </div>

      {view.historical && (
        <div className="mb-5 rounded-[10px] px-3 py-2 text-[12px] font-semibold" style={{ background: 'rgba(245,158,11,0.10)', color: '#92600a' }}>
          過去の分析結果を表示しています。最新の情報に戻るには「最新」を選択してください。
        </div>
      )}

      {tab === 'competitors' && (
        <div className="space-y-5">
          <div className="rounded-[16px] p-5 flex flex-wrap justify-between gap-4" style={{ background: 'linear-gradient(135deg, rgba(0,154,224,0.06), rgba(0,174,238,0.06))', border: '1px solid #D0E3F0' }}>
            <div>
              <p className="text-sm font-bold" style={{ color: '#1A1A2E' }}>第1段階: 公式情報を5軸で収集</p>
              <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                各社の登録URLを実際に確認し、観測できる事実だけを「訴求・価格・提供範囲・立ち位置・権威性」に整理します。出典はすべて公式サイト（Tier 1）です。
              </p>
            </div>
            <button
              onClick={() => void analyzeAll()}
              disabled={Boolean(running) || view.historical}
              className="inline-flex items-center gap-2 px-5 min-h-[42px] rounded-[11px] text-sm font-bold text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #009AE0, #00AEEE)', boxShadow: '0 4px 14px rgba(0,154,224,0.28)' }}
            >
              {running === 'analyze-all' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {running === 'analyze-all' ? '全社を分析中...' : '全競合を分析'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {config.map(competitor => {
              const result = view.document.competitors[competitor.id]
              return (
                <div key={competitor.id} className="rounded-[16px] p-5" style={{ background: '#FFFFFF', border: '1px solid #D0E3F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex gap-2 items-center">
                        <h2 className="font-bold text-sm" style={{ color: '#1A1A2E' }}>{competitor.name}</h2>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: competitor.type === 'direct' ? 'rgba(229,62,79,0.10)' : 'rgba(100,116,139,0.10)', color: competitor.type === 'direct' ? '#c02637' : '#475569' }}>
                          {competitor.type === 'direct' ? '直接競合' : '間接競合'}
                        </span>
                      </div>
                      <p className="text-[12px] mt-1 leading-relaxed" style={{ color: '#64748B' }}>{competitor.note}</p>
                    </div>
                    {result?.axes ? <CheckCircle2 size={18} style={{ color: '#0f9d58' }} /> : <span className="text-[11px]" style={{ color: '#94A3B8' }}>未分析</span>}
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {competitor.urls.map(page => (
                      <a key={page.url} href={page.url} target="_blank" rel="noreferrer" className="flex gap-1.5 items-center text-[11px] hover:underline" style={{ color: '#009AE0' }}>
                        <ExternalLink size={11} />{page.label}: {page.url}
                      </a>
                    ))}
                  </div>
                  {!view.historical && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      <input
                        value={urlDrafts[competitor.id]?.label ?? ''}
                        onChange={event => setUrlDrafts(prev => ({ ...prev, [competitor.id]: { label: event.target.value, url: prev[competitor.id]?.url ?? '' } }))}
                        placeholder="ページ名（任意）"
                        className="w-[115px] px-2 py-1 rounded-[7px] text-[11px]"
                        style={{ border: '1px solid #D0E3F0', background: 'white', color: '#1A1A2E' }}
                      />
                      <input
                        value={urlDrafts[competitor.id]?.url ?? ''}
                        onChange={event => setUrlDrafts(prev => ({ ...prev, [competitor.id]: { label: prev[competitor.id]?.label ?? '', url: event.target.value } }))}
                        placeholder="追加監視URL"
                        className="flex-1 min-w-[150px] px-2 py-1 rounded-[7px] text-[11px]"
                        style={{ border: '1px solid #D0E3F0', background: 'white', color: '#1A1A2E' }}
                      />
                      <button
                        onClick={() => void addMonitoringUrl(competitor)}
                        disabled={Boolean(running)}
                        className="px-2.5 py-1 rounded-[7px] text-[11px] font-bold disabled:opacity-50"
                        style={{ background: 'rgba(20,44,92,0.07)', color: '#64748B' }}
                      >
                        URL追加
                      </button>
                    </div>
                  )}

                  {result?.axes ? (
                    <div className="space-y-2.5">
                      {AXES.map(axis => {
                        const facts = result.axes?.[axis.key] ?? []
                        return (
                          <div key={axis.key}>
                            <p className="text-[11px] font-bold" style={{ color: '#64748B' }}>{axis.label}</p>
                            <p className="text-[12px] leading-relaxed" style={{ color: '#1A1A2E' }}>
                              {facts[0]?.text ?? '公式ページから確認できませんでした'}
                            </p>
                          </div>
                        )
                      })}
                      <p className="text-[10px]" style={{ color: '#94A3B8' }}>確認: {fmtDate(result.updatedAt)} / Tier 1: 公式サイト</p>
                    </div>
                  ) : (
                    <p className="text-[12px]" style={{ color: '#94A3B8' }}>分析すると、ここに5軸の観測事実と出典が表示されます。</p>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => void invoke('analyze-competitor', { competitorId: competitor.id })}
                      disabled={Boolean(running) || view.historical}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-bold"
                      style={{ background: 'rgba(0,154,224,0.08)', color: '#009AE0' }}
                    >
                      {running === 'analyze-competitor' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {result?.axes ? '再収集' : '公式情報を収集'}
                    </button>
                    <button
                      onClick={() => void invoke('refresh-keywords', { competitorId: competitor.id })}
                      disabled={Boolean(running) || view.historical}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-bold"
                      style={{ background: 'rgba(20,44,92,0.06)', color: '#64748B' }}
                    >
                      <BarChart3 size={12} />
                      {result?.keywords ? `Ahrefs更新（${result.keywords.length}KW）` : 'Ahrefs KWを取得'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'comparison' && (
        <div className="space-y-6">
          <div className="rounded-[16px] p-5" style={{ background: '#FFFFFF', border: '1px solid #D0E3F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 className="text-base font-bold mb-1" style={{ color: '#1A1A2E' }}>第2段階: 競合の強みと検索機会</h2>
            <p className="text-[12px] mb-4" style={{ color: '#64748B' }}>競合の公式サイトの観測事実と、Ahrefsのドメイン別オーガニックKWを自社のデータと照合します。</p>
            <div className="overflow-x-auto">
              <table className="min-w-[780px] w-full text-left text-[12px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid #D0E3F0', color: '#64748B' }}>
                    <th className="py-2 pr-4 font-bold">競合</th>
                    {AXES.map(axis => <th className="py-2 pr-4 font-bold" key={axis.key}>{axis.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {config.map(competitor => {
                    const axes = view.document.competitors[competitor.id]?.axes
                    return (
                      <tr key={competitor.id} style={{ borderBottom: '1px solid #D0E3F0' }}>
                        <td className="py-3 pr-4 font-bold whitespace-nowrap" style={{ color: '#1A1A2E' }}>{competitor.name}</td>
                        {AXES.map(axis => (
                          <td key={axis.key} className="py-3 pr-4 align-top leading-relaxed max-w-[220px]" style={{ color: '#64748B' }}>
                            {axes?.[axis.key][0]?.text ?? '—'}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[16px] p-5" style={{ background: '#FFFFFF', border: '1px solid #D0E3F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex flex-wrap justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold" style={{ color: '#1A1A2E' }}>検索KWの機会</h2>
                <p className="text-[12px] mt-1" style={{ color: '#64748B' }}>「競合が上位なのに自社が未露出／弱い」KWを、Ahrefs取得済みデータから抽出します。</p>
              </div>
              <span className="px-2.5 py-1 rounded-full h-fit text-[11px] font-bold" style={{ background: 'rgba(0,154,224,0.08)', color: '#009AE0' }}>{opportunities.length}件</span>
            </div>
            {opportunities.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: '#94A3B8' }}>
                各競合で「Ahrefs KWを取得」を実行すると、ここにキーワード機会が表示されます。
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[700px] w-full text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #D0E3F0', color: '#64748B' }}>
                      <th className="text-left py-2 pr-4">KW</th>
                      <th className="text-right py-2 pr-4">Vol.</th>
                      <th className="text-left py-2 pr-4">状況</th>
                      <th className="text-left py-2">上位競合</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.slice(0, 20).map(row => (
                      <tr key={row.keyword} style={{ borderBottom: '1px solid #D0E3F0' }}>
                        <td className="py-2.5 pr-4 font-bold" style={{ color: '#1A1A2E' }}>{row.keyword}</td>
                        <td className="py-2.5 pr-4 text-right">{row.volume.toLocaleString()}</td>
                        <td className="py-2.5 pr-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: row.opportunity === 'gap' ? 'rgba(229,62,79,0.10)' : 'rgba(245,158,11,0.12)', color: row.opportunity === 'gap' ? '#c02637' : '#92600a' }}>
                            {row.opportunity === 'gap' ? '自社未露出' : '自社が弱い'}
                          </span>
                        </td>
                        <td className="py-2.5" style={{ color: '#64748B' }}>{row.competitors.map(c => `${c.name}（${c.position ?? '—'}位）`).join(' / ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'strategy' && (
        <div className="space-y-6">
          <div className="rounded-[16px] p-5 flex flex-wrap justify-between gap-4" style={{ background: 'linear-gradient(135deg, rgba(0,154,224,0.06), rgba(0,174,238,0.06))', border: '1px solid #D0E3F0' }}>
            <div>
              <p className="text-sm font-bold" style={{ color: '#1A1A2E' }}>第3段階: RICE CLOUDの戦略・施策へ翻訳</p>
              <p className="text-xs mt-1 max-w-3xl" style={{ color: '#64748B' }}>
                競合の観測事実、検索KW機会、仮説ペルソナをClaudeが統合し、フェーズ別の差別化機会と実行順を提案します。
              </p>
            </div>
            <button
              onClick={() => void invoke('generate-strategy')}
              disabled={Boolean(running) || view.historical}
              className="inline-flex items-center gap-2 px-5 min-h-[42px] rounded-[11px] text-sm font-bold text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #009AE0, #00AEEE)', boxShadow: '0 4px 14px rgba(0,154,224,0.28)' }}
            >
              {running === 'generate-strategy' ? <Loader2 size={16} className="animate-spin" /> : <Lightbulb size={16} />}
              {report ? '戦略を再生成' : '戦略・施策を生成'}
            </button>
          </div>

          {!report ? (
            <div className="rounded-[16px] p-14 text-center" style={{ background: '#FFFFFF', border: '1.5px dashed #D0E3F0' }}>
              <p className="font-medium" style={{ color: '#64748B' }}>まだ戦略レポートがありません</p>
              <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>先に競合情報を収集し、「戦略・施策を生成」を実行してください。</p>
            </div>
          ) : (
            <>
              <div className="rounded-[16px] p-6" style={{ background: 'linear-gradient(135deg, rgba(10,37,64,0.04), rgba(0,174,238,0.05))', border: '1px solid #D0E3F0' }}>
                <div className="flex justify-between gap-3 flex-wrap mb-3">
                  <h2 className="font-bold" style={{ color: '#1A1A2E' }}>結論: RICE CLOUDが取るべき方向</h2>
                  <span className="text-[11px]" style={{ color: '#94A3B8' }}>{fmtDate(report.generatedAt)}</span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#1A1A2E' }}>{report.summary}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-[16px] p-5" style={{ background: '#FFFFFF', border: '1px solid #D0E3F0' }}>
                  <h2 className="text-sm font-bold mb-3" style={{ color: '#1A1A2E' }}>観測事実</h2>
                  <ul className="space-y-2">
                    {report.observedFacts.map((item, index) => <li key={index} className="flex gap-2 text-[13px] leading-relaxed"><CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#0f9d58' }} /><span>{item}</span></li>)}
                  </ul>
                </div>
                <div className="rounded-[16px] p-5" style={{ background: '#FFFFFF', border: '1px solid #D0E3F0' }}>
                  <h2 className="text-sm font-bold mb-3" style={{ color: '#1A1A2E' }}>差別化の機会</h2>
                  <ul className="space-y-2">
                    {report.opportunities.map((item, index) => <li key={index} className="flex gap-2 text-[13px] leading-relaxed"><Lightbulb size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} /><span>{item}</span></li>)}
                  </ul>
                </div>
              </div>

              <div className="rounded-[16px] p-6" style={{ background: '#FFFFFF', border: '1px solid #D0E3F0' }}>
                {(() => {
                  const xAxis = parseAxisLabel(report.positioning.xAxis)
                  const yAxis = parseAxisLabel(report.positioning.yAxis)
                  const zone = parseWhitespaceZone(report.positioning.whitespace)
                  return (
                    <>
                      <h2 className="font-bold mb-1" style={{ color: '#1A1A2E' }}>ポジショニングマップ</h2>
                      <p className="text-[12px] mb-4" style={{ color: '#64748B' }}>
                        横軸: {xAxis.name}（{xAxis.low} → {xAxis.high}）／ 縦軸: {yAxis.name}（{yAxis.low} → {yAxis.high}）
                      </p>
                      {/* 縦軸ラベル（左）＋マップ本体 */}
                      <div className="flex gap-2">
                        <div className="hidden sm:flex flex-col items-center justify-between py-1 w-6 flex-shrink-0">
                          <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: '#64748B', writingMode: 'vertical-rl' }}>{yAxis.high}</span>
                          <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: '#0A2540', writingMode: 'vertical-rl' }}>{yAxis.name}</span>
                          <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: '#64748B', writingMode: 'vertical-rl' }}>{yAxis.low}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="relative h-[340px] rounded-[12px] overflow-hidden" style={{ background: 'linear-gradient(135deg, #f8fbff, #f6f3ff)', border: '1px solid #D0E3F0' }}>
                            {/* 狙う空白領域（AI出力に座標が含まれる場合のみ描画） */}
                            {zone && (
                              <div
                                className="absolute rounded-[8px] flex items-start justify-end p-1.5"
                                style={{
                                  left: `${Math.min(zone.x1, zone.x2)}%`,
                                  width: `${Math.abs(zone.x2 - zone.x1)}%`,
                                  bottom: `${Math.min(zone.y1, zone.y2)}%`,
                                  height: `${Math.abs(zone.y2 - zone.y1)}%`,
                                  background: 'rgba(0,154,224,0.08)',
                                  border: '2px dashed rgba(0,154,224,0.45)',
                                }}
                              >
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,154,224,0.85)', color: 'white' }}>狙う空白領域</span>
                              </div>
                            )}
                            {/* 4象限の補助線 */}
                            <div className="absolute left-1/2 top-0 bottom-0 border-l" style={{ borderColor: 'rgba(20,44,92,0.14)' }} />
                            <div className="absolute top-1/2 left-0 right-0 border-t" style={{ borderColor: 'rgba(20,44,92,0.14)' }} />
                            {/* プロット（自社はブランド色＋大きめ、競合はグレー） */}
                            {report.positioning.points.map(point => (
                              <div key={point.name} className="absolute -translate-x-1/2 translate-y-1/2 group flex flex-col items-center" style={{ left: `${Math.max(6, Math.min(94, point.x))}%`, bottom: `${Math.max(8, Math.min(92, point.y))}%` }}>
                                <div
                                  className={`rounded-full whitespace-nowrap font-bold text-white ${point.isSelf ? 'px-3 py-1.5 text-[12px]' : 'px-2.5 py-1 text-[11px]'}`}
                                  style={{
                                    background: point.isSelf ? 'linear-gradient(135deg, #009AE0, #0A2540)' : '#64748b',
                                    boxShadow: point.isSelf ? '0 4px 12px rgba(0,120,200,0.35)' : '0 3px 8px rgba(10,30,80,0.18)',
                                    border: point.isSelf ? '2px solid white' : 'none',
                                  }}
                                >
                                  {point.name}
                                </div>
                                <div className="hidden group-hover:block absolute z-10 top-full left-1/2 -translate-x-1/2 mt-1 w-52 p-2 rounded-[8px] text-[10px] leading-relaxed" style={{ background: '#1A1A2E', color: 'white' }}>{point.rationale}</div>
                              </div>
                            ))}
                          </div>
                          {/* 横軸ラベル（下） */}
                          <div className="flex items-center justify-between mt-1.5 px-1">
                            <span className="text-[10px] font-bold" style={{ color: '#64748B' }}>← {xAxis.low}</span>
                            <span className="text-[10px] font-bold" style={{ color: '#0A2540' }}>{xAxis.name}</span>
                            <span className="text-[10px] font-bold" style={{ color: '#64748B' }}>{xAxis.high} →</span>
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-[12px] leading-relaxed" style={{ color: '#64748B' }}><strong style={{ color: '#0080C0' }}>狙う空白領域:</strong> {report.positioning.whitespace}</p>
                      {/* 各プロットの根拠一覧（ホバー不要で読める） */}
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                        {report.positioning.points.map(point => (
                          <div key={point.name} className="flex items-start gap-2 rounded-[10px] px-3 py-2" style={{ background: point.isSelf ? 'rgba(0,154,224,0.06)' : '#FAFCFE', border: `1px solid ${point.isSelf ? 'rgba(0,154,224,0.35)' : '#E8F0F7'}` }}>
                            <span className="mt-[3px] inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: point.isSelf ? '#009AE0' : '#64748b' }} />
                            <p className="text-[11px] leading-relaxed" style={{ color: '#334155' }}>
                              <strong style={{ color: '#1A1A2E' }}>{point.name}</strong>
                              <span className="mx-1" style={{ color: '#CBD5E1' }}>—</span>
                              {point.rationale}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  )
                })()}
              </div>

              <div className="rounded-[16px] p-6" style={{ background: '#FFFFFF', border: '1px solid #D0E3F0' }}>
                <div className="flex gap-2 items-center mb-4"><Users size={16} style={{ color: '#009AE0' }} /><h2 className="font-bold" style={{ color: '#1A1A2E' }}>ペルソナ × ファネル別の競争状況</h2></div>
                <p className="text-[12px] mb-6" style={{ color: '#64748B' }}>検討段階が進むほど対象者は絞られます。各段階での自社・競合の訴求と、優先すべき打ち手を確認できます。</p>
                <div className="space-y-2">
                  {(['awareness', 'research', 'comparison', 'decision'] as StrategyPhase[]).map(phase => {
                    const row = report.funnelCoverage.find(item => item.phase === phase)
                    const meta = PHASES[phase]
                    const funnel = FUNNEL_PHASES[phase]
                    return (
                      <div key={phase} className="flex flex-col md:flex-row md:items-stretch gap-3">
                        {/* 左: ファネル段 */}
                        <div className="hidden md:flex w-[280px] flex-shrink-0 items-stretch">
                          <div
                            className="mx-auto flex items-center justify-center text-white min-h-[108px]"
                            style={{ width: funnel.width, clipPath: funnel.clipPath, background: funnel.gradient }}
                          >
                            <div className="text-center leading-tight px-2">
                              <p className={phase === 'decision' ? 'text-[13px] font-black' : 'text-[15px] font-black'}>{meta.label}</p>
                              <p className={`${phase === 'decision' ? 'text-[9px]' : 'text-[10px]'} font-semibold tracking-wider opacity-85 uppercase`}>{funnel.english}</p>
                            </div>
                          </div>
                        </div>
                        {/* モバイル: 段階ラベル */}
                        <div className="md:hidden flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
                          <span className="text-[13px] font-black" style={{ color: '#1A1A2E' }}>{meta.label}</span>
                          <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: '#94A3B8' }}>{funnel.english}</span>
                        </div>
                        {/* 右: 詳細カード */}
                        <div
                          className="flex-1 rounded-[12px] px-4 py-3.5 flex flex-col justify-center gap-1.5"
                          style={{ background: '#FAFCFE', border: '1px solid #D0E3F0', borderLeft: `4px solid ${meta.color}` }}
                        >
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-1.5">
                            <p className="text-[12px] leading-relaxed">
                              <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold align-[1px]" style={{ background: 'rgba(0,154,224,0.10)', color: '#0080C0' }}>自社</span>
                              <span style={{ color: '#334155' }}>{row?.self ?? '—'}</span>
                            </p>
                            <p className="text-[12px] leading-relaxed">
                              <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold align-[1px]" style={{ background: 'rgba(229,62,79,0.08)', color: '#e53e4f' }}>競合</span>
                              <span style={{ color: '#334155' }}>{row?.competitor ?? '—'}</span>
                            </p>
                          </div>
                          <p className="text-[12px] font-semibold leading-relaxed flex items-start gap-1" style={{ color: '#0A2540' }}>
                            <ChevronRight size={13} className="flex-shrink-0 mt-[3px]" style={{ color: meta.color }} />
                            {row?.implication ?? '—'}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-[16px] p-6" style={{ background: '#FFFFFF', border: '1px solid #D0E3F0' }}>
                <h2 className="font-bold mb-4" style={{ color: '#1A1A2E' }}>実行する施策</h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {(['high', 'medium', 'low'] as StrategyPriority[]).map(priority => {
                    const meta = PRIORITY[priority]
                    const actions = report.actions.filter(item => item.priority === priority)
                    return <div key={priority}>
                      <div className="rounded-t-[10px] px-3 py-2 text-white text-[12px] font-black" style={{ background: meta.gradient }}>{meta.label}（{actions.length}件）</div>
                      <div className="rounded-b-[10px] p-2.5 space-y-2 min-h-[100px]" style={{ background: 'rgba(0,154,224,0.03)', border: '1px solid #D0E3F0', borderTop: 'none' }}>
                        {actions.length === 0 ? <p className="text-center text-[11px] pt-5" style={{ color: '#94A3B8' }}>なし</p> : actions.map((action, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => void openActionPlan(action)}
                            className="w-full text-left rounded-[10px] p-3 transition-all hover:shadow-md hover:-translate-y-px"
                            style={{ background: 'white', border: '1px solid #D0E3F0' }}
                          >
                            <div className="flex gap-1.5 items-center mb-1 flex-wrap"><Target size={12} style={{ color: '#009AE0' }} /><strong className="text-[12px]">{action.title}</strong><span className="px-1.5 py-0 rounded-full text-[10px]" style={{ color: PHASES[action.phase].color, background: `${PHASES[action.phase].color}18` }}>{PHASES[action.phase].label}</span></div>
                            <p className="text-[11px] leading-relaxed" style={{ color: '#64748B' }}>{action.description}</p>
                            <p className="mt-2 text-[10px]"><strong>対象:</strong> {action.target}</p>
                            <p className="text-[10px]"><strong>KPI:</strong> {action.kpi}</p>
                            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold" style={{ color: '#0080C0' }}>
                              <ListChecks size={11} />実行手順を見る<ChevronRight size={11} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  })}
                </div>
              </div>

              {report.caveats.length > 0 && <div className="rounded-[12px] p-4 text-[12px]" style={{ background: 'rgba(100,116,139,0.06)', border: '1px solid #D0E3F0', color: '#64748B' }}><strong>データの読み方の注意</strong>{report.caveats.map((item, index) => <p key={index}>・{item}</p>)}</div>}
            </>
          )}
        </div>
      )}

      {planAction && (
        <ActionPlanModal
          action={planAction}
          plan={planCache[planAction.title] ?? null}
          loading={planLoading}
          error={planError}
          onClose={() => setPlanAction(null)}
          onRetry={() => void openActionPlan(planAction)}
        />
      )}
    </div>
  )
}

function ActionPlanModal({
  action,
  plan,
  loading,
  error,
  onClose,
  onRetry,
}: {
  action: StrategyAction
  plan: ActionPlan | null
  loading: boolean
  error: string | null
  onClose: () => void
  onRetry: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,30,60,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-[18px] flex flex-col"
        style={{ background: '#FFFFFF', boxShadow: '0 24px 60px rgba(10,30,80,0.35)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-6 py-4 flex items-start justify-between gap-3" style={{ background: 'linear-gradient(135deg, #0A2540, #0080C0)' }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>{PHASES[action.phase].label}</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>{action.category}</span>
            </div>
            <h3 className="text-white font-black text-[16px] leading-tight">{action.title}</h3>
            <p className="text-white/80 text-[12px] mt-1 leading-relaxed">{action.description}</p>
          </div>
          <button type="button" onClick={onClose} className="flex-shrink-0 rounded-full p-1 transition-colors hover:bg-white/20">
            <X size={18} className="text-white" />
          </button>
        </div>

        {/* ボディ */}
        <div className="px-6 py-5 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: '#009AE0' }} />
              <p className="text-[13px] font-bold" style={{ color: '#0A2540' }}>実行手順を生成しています…</p>
              <p className="text-[11px]" style={{ color: '#94A3B8' }}>AIがこの施策のToDoを具体化しています（10〜30秒）</p>
            </div>
          )}

          {!loading && error && (
            <div className="py-10 text-center">
              <AlertTriangle size={24} className="mx-auto mb-2" style={{ color: '#e53e4f' }} />
              <p className="text-[13px] mb-4" style={{ color: '#c02637' }}>{error}</p>
              <button type="button" onClick={onRetry} className="px-4 py-2 rounded-[10px] text-[12px] font-bold text-white" style={{ background: '#009AE0' }}>
                もう一度生成する
              </button>
            </div>
          )}

          {!loading && !error && plan && (
            <div className="space-y-5">
              {/* ゴール＋期間 */}
              <div className="rounded-[12px] p-4" style={{ background: 'rgba(0,154,224,0.06)', border: '1px solid rgba(0,154,224,0.25)' }}>
                <div className="flex items-center gap-1.5 mb-1.5"><Target size={13} style={{ color: '#0080C0' }} /><span className="text-[11px] font-black" style={{ color: '#0080C0' }}>ゴール</span></div>
                <p className="text-[13px] leading-relaxed" style={{ color: '#1A1A2E' }}>{plan.goal}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {plan.estimatedPeriod && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold" style={{ background: 'white', color: '#0A2540', border: '1px solid #D0E3F0' }}>
                      <Clock size={11} style={{ color: '#0080C0' }} />目安期間: {plan.estimatedPeriod}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold" style={{ background: 'white', color: '#0A2540', border: '1px solid #D0E3F0' }}>
                    <Crosshair size={11} style={{ color: '#0080C0' }} />対象: {action.target}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold" style={{ background: 'white', color: '#0A2540', border: '1px solid #D0E3F0' }}>
                    <BarChart3 size={11} style={{ color: '#0080C0' }} />KPI: {action.kpi}
                  </span>
                </div>
              </div>

              {/* 手順 */}
              <div>
                <div className="flex items-center gap-1.5 mb-3"><ListChecks size={15} style={{ color: '#009AE0' }} /><h4 className="font-black text-[13px]" style={{ color: '#1A1A2E' }}>実行手順</h4></div>
                <ol className="space-y-3">
                  {plan.steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-black text-white" style={{ background: 'linear-gradient(135deg, #009AE0, #0A2540)' }}>{i + 1}</div>
                      <div className="flex-1 pb-1">
                        <p className="text-[13px] font-bold" style={{ color: '#1A1A2E' }}>{step.title}</p>
                        {step.detail && <p className="text-[12px] leading-relaxed mt-0.5" style={{ color: '#475569' }}>{step.detail}</p>}
                        {step.deliverable && (
                          <p className="text-[11px] mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded" style={{ background: 'rgba(0,154,224,0.08)', color: '#0080C0' }}>
                            成果物: {step.deliverable}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* 完了基準 */}
              {plan.successCriteria && (
                <div className="rounded-[12px] p-4" style={{ background: '#FAFCFE', border: '1px solid #D0E3F0' }}>
                  <div className="flex items-center gap-1.5 mb-1.5"><CheckCircle2 size={13} style={{ color: '#16a34a' }} /><span className="text-[11px] font-black" style={{ color: '#16a34a' }}>完了の判断基準</span></div>
                  <p className="text-[12px] leading-relaxed" style={{ color: '#334155' }}>{plan.successCriteria}</p>
                </div>
              )}

              {/* リソース・注意 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {plan.resources.length > 0 && (
                  <div className="rounded-[12px] p-4" style={{ background: '#FAFCFE', border: '1px solid #D0E3F0' }}>
                    <div className="flex items-center gap-1.5 mb-2"><Wrench size={13} style={{ color: '#0080C0' }} /><span className="text-[11px] font-black" style={{ color: '#0A2540' }}>必要なリソース</span></div>
                    <ul className="space-y-1">
                      {plan.resources.map((r, i) => <li key={i} className="text-[12px] leading-relaxed flex gap-1.5" style={{ color: '#334155' }}><span style={{ color: '#009AE0' }}>・</span>{r}</li>)}
                    </ul>
                  </div>
                )}
                {plan.risks.length > 0 && (
                  <div className="rounded-[12px] p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.28)' }}>
                    <div className="flex items-center gap-1.5 mb-2"><ShieldAlert size={13} style={{ color: '#d97706' }} /><span className="text-[11px] font-black" style={{ color: '#b45309' }}>つまずきやすい点</span></div>
                    <ul className="space-y-1">
                      {plan.risks.map((r, i) => <li key={i} className="text-[12px] leading-relaxed flex gap-1.5" style={{ color: '#334155' }}><span style={{ color: '#d97706' }}>・</span>{r}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
