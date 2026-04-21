'use client'

import type { SiteSettings } from '@/lib/siteSettings'
import { FormField, TextArea, SectionHeader } from './FormField'
import { DEFAULT_SITE_SETTINGS } from '@/lib/siteSettings'

export default function StyleTab({
  settings,
  onChange,
}: {
  settings: SiteSettings
  onChange: (s: SiteSettings) => void
}) {
  const s = settings.styles
  const update = (patch: Partial<SiteSettings['styles']>) =>
    onChange({ ...settings, styles: { ...s, ...patch } })

  const resetField = (key: keyof SiteSettings['styles']) => () =>
    update({ [key]: DEFAULT_SITE_SETTINGS.styles[key] } as Partial<SiteSettings['styles']>)

  return (
    <div>
      <SectionHeader title="スタイル (CSS直編集)" description="プレビュー画面・WP投稿の見出し・本文段落のインラインCSSを直接編集できます。" />

      <div className="mb-5 p-3 rounded-lg bg-[#FEF3C7] border border-[#FCD34D] text-xs text-[#92400E]">
        ⚠ 値はそのまま <code>style=&quot;…&quot;</code> 属性に設定されます。CSS構文（<code>prop:value;</code>）のみ入力してください。
      </div>

      <StyleRow label="H2 見出しCSS" value={s.h2Css} preview={`<h2 style="${s.h2Css}">サンプル見出し</h2>`}
        onChange={v => update({ h2Css: v })} onReset={resetField('h2Css')} />
      <StyleRow label="H3 見出しCSS" value={s.h3Css} preview={`<h3 style="${s.h3Css}">サンプル小見出し</h3>`}
        onChange={v => update({ h3Css: v })} onReset={resetField('h3Css')} />
      <StyleRow label="H4 見出しCSS" value={s.h4Css} preview={`<h4 style="${s.h4Css}">サンプル小小見出し</h4>`}
        onChange={v => update({ h4Css: v })} onReset={resetField('h4Css')} />
      <StyleRow label="本文段落CSS（p）" value={s.bodyCss} preview={`<p style="${s.bodyCss}">サンプル段落テキストです。</p>`}
        onChange={v => update({ bodyCss: v })} onReset={resetField('bodyCss')} />
    </div>
  )
}

function StyleRow({
  label, value, preview, onChange, onReset,
}: {
  label: string
  value: string
  preview: string
  onChange: (v: string) => void
  onReset: () => void
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-semibold text-[#0A2540]">{label}</label>
        <button type="button" onClick={onReset} className="text-xs text-[#009AE0] hover:underline">デフォルトに戻す</button>
      </div>
      <FormField label="">
        <TextArea rows={3} value={value} onChange={e => onChange(e.target.value)} />
      </FormField>
      <div className="text-xs text-[#64748B] mb-1">プレビュー:</div>
      <div className="p-4 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]" dangerouslySetInnerHTML={{ __html: preview }} />
    </div>
  )
}
