'use client'

import type { SiteSettings } from '@/lib/siteSettings'
import { FormField, TextInput, ColorInput, TextArea, SectionHeader } from './FormField'

export default function BrandTab({
  settings,
  onChange,
}: {
  settings: SiteSettings
  onChange: (s: SiteSettings) => void
}) {
  const b = settings.brand
  const update = (patch: Partial<SiteSettings['brand']>) =>
    onChange({ ...settings, brand: { ...b, ...patch } })

  return (
    <div>
      <SectionHeader title="ブランド情報" description="会社名・ロゴ・カラーなど、ヘッダー／フッター／JSON-LDに反映されます。" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        <FormField label="会社名（正式名）" hint="JSON-LD Organization.name / フッター会社名に使用">
          <TextInput value={b.companyName} onChange={e => update({ companyName: e.target.value })} />
        </FormField>

        <FormField label="プロダクト名" hint="記事カードやフッター補足に使用">
          <TextInput value={b.productName} onChange={e => update({ productName: e.target.value })} />
        </FormField>

        <FormField label="電話番号（表示用）" hint="任意">
          <TextInput value={b.phone} onChange={e => update({ phone: e.target.value })} placeholder="03-xxxx-xxxx" />
        </FormField>

        <FormField label="サイトURL" hint="JSON-LD url / メインサイトのトップURL">
          <TextInput value={b.siteUrl} onChange={e => update({ siteUrl: e.target.value })} placeholder="https://www.rice-cloud.info" />
        </FormField>

        <FormField label="ロゴURL" hint="public/配下なら /logo-w.webp のように">
          <TextInput value={b.logoUrl} onChange={e => update({ logoUrl: e.target.value })} />
        </FormField>

        <FormField label="住所（フッター表示）" hint="改行可">
          <TextArea rows={3} value={b.address} onChange={e => update({ address: e.target.value })} />
        </FormField>
      </div>

      <SectionHeader title="カラー" description="プレビュー画面のヘッダー・フッター・ボタン・CTAに反映されます。" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        <FormField label="プライマリカラー" hint="CTAボタン・リンクなど">
          <ColorInput value={b.primaryColor} onChange={v => update({ primaryColor: v })} />
        </FormField>
        <FormField label="アクセントカラー" hint="リンクテキスト・サブボタン">
          <ColorInput value={b.accentColor} onChange={v => update({ accentColor: v })} />
        </FormField>
        <FormField label="ヘッダー背景色">
          <ColorInput value={b.headerBgColor} onChange={v => update({ headerBgColor: v })} />
        </FormField>
        <FormField label="フッター背景色">
          <ColorInput value={b.footerBgColor} onChange={v => update({ footerBgColor: v })} />
        </FormField>
        <FormField label="お問い合わせボタン色" hint="ヘッダー右上のボタン">
          <ColorInput value={b.inquiryButtonColor} onChange={v => update({ inquiryButtonColor: v })} />
        </FormField>
      </div>
    </div>
  )
}
