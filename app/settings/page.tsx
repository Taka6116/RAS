'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SiteSettings } from '@/lib/siteSettings'
import { DEFAULT_SITE_SETTINGS } from '@/lib/siteSettings'
import BrandTab from '@/components/settings/BrandTab'
import CtaTab from '@/components/settings/CtaTab'
import ContentTab from '@/components/settings/ContentTab'
import StyleTab from '@/components/settings/StyleTab'

type TabKey = 'brand' | 'cta' | 'content' | 'style' | 'extra' | 'semantic'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'brand', label: 'ブランド' },
  { key: 'cta', label: 'CTA' },
  { key: 'content', label: 'コンテンツ' },
  { key: 'style', label: 'スタイル(CSS)' },
  { key: 'extra', label: '追加CTAブロック' },
  { key: 'semantic', label: '意味検索インデックス' },
]

interface IndexStats {
  exists: boolean
  count: number
  updatedAt: string | null
  model: string | null
  bySource?: Record<string, number>
}

function SemanticIndexPanel() {
  const [stats, setStats] = useState<IndexStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [reindexing, setReindexing] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/embeddings/reindex', { cache: 'no-store' })
      const data = await res.json()
      setStats(data)
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  const handleReindex = useCallback(async () => {
    if (!confirm('S3の参照資料・導入事例・過去記事をすべてベクトル化します。データ量により数分かかることがあります。実行しますか？')) return
    setReindexing(true)
    setMsg(null)
    try {
      const res = await fetch('/api/embeddings/reindex', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '再構築に失敗しました')
      setMsg({ kind: 'ok', text: `インデックスを再構築しました（${data.count} チャンク）。` })
      await loadStats()
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : '再構築に失敗しました' })
    } finally {
      setReindexing(false)
    }
  }, [loadStats])

  const sourceLabel: Record<string, string> = {
    materials: '参照資料',
    'case-studies': '導入事例',
    articles: '過去記事',
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-[#0A2540] mb-1">意味検索インデックス</h2>
        <p className="text-sm text-[#475569]">
          S3の参照資料・匿名導入事例・過去記事をBedrock Titanでベクトル化し、一次執筆時に「意味が近い資料の活用」と「過去記事とトーンが被らない独自性」を両立させます。資料や記事を追加・更新したら再構築してください。
        </p>
      </div>

      {msg && (
        <div
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{
            background: msg.kind === 'ok' ? '#ECFDF5' : '#FEF2F2',
            color: msg.kind === 'ok' ? '#065F46' : '#991B1B',
            border: `1px solid ${msg.kind === 'ok' ? '#A7F3D0' : '#FECACA'}`,
          }}
        >
          {msg.text}
        </div>
      )}

      <div className="rounded-xl border border-[#E2E8F0] p-5 bg-[#F8FAFC]">
        {loading ? (
          <p className="text-sm text-[#64748B]">読み込み中…</p>
        ) : !stats?.exists ? (
          <p className="text-sm text-[#64748B]">まだインデックスがありません。下のボタンで作成してください。</p>
        ) : (
          <div className="space-y-2 text-sm text-[#334155]">
            <div className="flex justify-between">
              <span className="text-[#64748B]">総チャンク数</span>
              <span className="font-semibold">{stats.count}</span>
            </div>
            {stats.bySource && Object.entries(stats.bySource).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-[#64748B]">{sourceLabel[k] ?? k}</span>
                <span className="font-semibold">{v}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span className="text-[#64748B]">最終更新</span>
              <span className="font-semibold">{stats.updatedAt ? new Date(stats.updatedAt).toLocaleString('ja-JP') : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">モデル</span>
              <span className="font-mono text-xs">{stats.model ?? '-'}</span>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleReindex}
        disabled={reindexing}
        className="px-5 py-2.5 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #0056A0 0%, #009AE0 60%, #33C0F0 100%)' }}
      >
        {reindexing ? 'インデックス再構築中…（数分かかる場合があります）' : 'インデックスを再構築する'}
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS)
  const [initial, setInitial] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [tab, setTab] = useState<TabKey>('brand')

  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(initial), [settings, initial])

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/site-settings', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '読み込みに失敗しました')
      setSettings(data.settings)
      setInitial(data.settings)
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : '読み込みに失敗しました' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/site-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '保存に失敗しました')
      setSettings(data.settings)
      setInitial(data.settings)
      setMessage({ kind: 'ok', text: '保存しました。プレビュー・WP投稿に反映されます。' })
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : '保存に失敗しました' })
    } finally {
      setSaving(false)
    }
  }, [settings])

  const handleReset = useCallback(async () => {
    if (!confirm('デフォルト設定に戻します。よろしいですか？')) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/site-settings', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'リセットに失敗しました')
      setSettings(data.settings)
      setInitial(data.settings)
      setMessage({ kind: 'ok', text: 'デフォルトに戻しました。' })
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'リセットに失敗しました' })
    } finally {
      setSaving(false)
    }
  }, [])

  return (
    <div className="w-full max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0A2540]">サイト設定</h1>
          <p className="text-sm text-[#475569] mt-1">
            CTA・ブランド情報・関連記事・CSSをUIから編集できます。プレビュー画面とWordPress投稿の両方に反映されます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || loading}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#CBD5E1] text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-50"
          >
            デフォルトに戻す
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || !dirty}
            className="px-5 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
            style={{ background: dirty ? '#009AE0' : '#94A3B8' }}
          >
            {saving ? '保存中…' : dirty ? '保存する' : '変更なし'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className="mb-4 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{
            background: message.kind === 'ok' ? '#ECFDF5' : '#FEF2F2',
            color: message.kind === 'ok' ? '#065F46' : '#991B1B',
            border: `1px solid ${message.kind === 'ok' ? '#A7F3D0' : '#FECACA'}`,
          }}
        >
          {message.text}
        </div>
      )}

      <div className="flex border-b border-[#E2E8F0] mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="px-4 py-3 text-sm font-semibold transition-colors"
            style={{
              color: tab === t.key ? '#009AE0' : '#64748B',
              borderBottom: tab === t.key ? '3px solid #009AE0' : '3px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-[#64748B] text-sm">読み込み中…</div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-sm">
          {tab === 'brand' && <BrandTab settings={settings} onChange={setSettings} />}
          {tab === 'cta' && <CtaTab settings={settings} onChange={setSettings} mode="main" />}
          {tab === 'content' && <ContentTab settings={settings} onChange={setSettings} />}
          {tab === 'style' && <StyleTab settings={settings} onChange={setSettings} />}
          {tab === 'extra' && <CtaTab settings={settings} onChange={setSettings} mode="extra" />}
          {tab === 'semantic' && <SemanticIndexPanel />}
        </div>
      )}
    </div>
  )
}
