'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SiteSettings } from '@/lib/siteSettings'
import { DEFAULT_SITE_SETTINGS } from '@/lib/siteSettings'
import BrandTab from '@/components/settings/BrandTab'
import CtaTab from '@/components/settings/CtaTab'
import ContentTab from '@/components/settings/ContentTab'
import StyleTab from '@/components/settings/StyleTab'

type TabKey = 'brand' | 'cta' | 'content' | 'style' | 'extra'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'brand', label: 'ブランド' },
  { key: 'cta', label: 'CTA' },
  { key: 'content', label: 'コンテンツ' },
  { key: 'style', label: 'スタイル(CSS)' },
  { key: 'extra', label: '追加CTAブロック' },
]

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
        </div>
      )}
    </div>
  )
}
