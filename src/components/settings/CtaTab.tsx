'use client'

import type { SiteSettings, ExtraCtaBlock } from '@/lib/siteSettings'
import { FormField, TextInput, TextArea, SectionHeader } from './FormField'

export default function CtaTab({
  settings,
  onChange,
  mode,
}: {
  settings: SiteSettings
  onChange: (s: SiteSettings) => void
  mode: 'main' | 'extra'
}) {
  if (mode === 'extra') return <ExtraBlocksSection settings={settings} onChange={onChange} />
  return <MainCtaSection settings={settings} onChange={onChange} />
}

function MainCtaSection({ settings, onChange }: { settings: SiteSettings; onChange: (s: SiteSettings) => void }) {
  const c = settings.cta
  const update = (patch: Partial<SiteSettings['cta']>) =>
    onChange({ ...settings, cta: { ...c, ...patch } })

  return (
    <div>
      <SectionHeader title="メインCTA" description="プレビュー画面とWordPress投稿本文の「まとめ」直前に挿入されるCTAバナー。" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        <FormField label="お問い合わせURL" hint="例: https://www.example.com/contact/">
          <TextInput value={c.inquiryUrl} onChange={e => update({ inquiryUrl: e.target.value })} />
        </FormField>
        <FormField label="お問い合わせラベル">
          <TextInput value={c.inquiryLabel} onChange={e => update({ inquiryLabel: e.target.value })} />
        </FormField>
        <FormField label="導入事例URL">
          <TextInput value={c.caseStudyUrl} onChange={e => update({ caseStudyUrl: e.target.value })} />
        </FormField>
        <FormField label="導入事例ラベル">
          <TextInput value={c.caseStudyLabel} onChange={e => update({ caseStudyLabel: e.target.value })} />
        </FormField>
        <FormField label="バナー見出し">
          <TextInput value={c.bannerHeadline} onChange={e => update({ bannerHeadline: e.target.value })} />
        </FormField>
        <FormField label="バナー画像URL（任意）" hint="設定するとテキスト版ではなく画像版バナーに切り替わります">
          <TextInput value={c.bannerImageUrl} onChange={e => update({ bannerImageUrl: e.target.value })} />
        </FormField>
      </div>

      <SectionHeader title="上級: 完全カスタムHTML" description="空でない場合、上記のバナーHTML生成を上書きします（プレビュー・WP投稿両方）。" />
      <FormField label="advancedHtml" hint="HTMLを直接記述できます。信頼できるHTMLのみ入力してください。">
        <TextArea
          rows={10}
          value={c.advancedHtml}
          onChange={e => update({ advancedHtml: e.target.value })}
          placeholder="<div>...</div>"
        />
      </FormField>

      {c.advancedHtml && (
        <div className="mt-3">
          <div className="text-xs text-[#64748B] mb-1">プレビュー:</div>
          <div
            className="p-4 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]"
            dangerouslySetInnerHTML={{ __html: c.advancedHtml }}
          />
        </div>
      )}
    </div>
  )
}

function ExtraBlocksSection({ settings, onChange }: { settings: SiteSettings; onChange: (s: SiteSettings) => void }) {
  const blocks = settings.extraCtaBlocks
  const update = (next: ExtraCtaBlock[]) => onChange({ ...settings, extraCtaBlocks: next })

  const addBlock = () => {
    update([
      ...blocks,
      {
        id: `cta-${Date.now()}`,
        label: '追加CTA',
        html: '<div style="text-align:center;margin:32px 0;padding:16px;background:#E6F5FC;border-radius:8px;">任意のHTML</div>',
        insertBefore: 'last-h2',
      },
    ])
  }

  return (
    <div>
      <SectionHeader title="追加CTAブロック" description="任意の位置に挿入するCTA。プレビュー・WP投稿に反映。" />
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={addBlock}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#009AE0] text-white"
        >
          + ブロックを追加
        </button>
      </div>
      {blocks.length === 0 && (
        <p className="text-sm text-[#64748B] py-8 text-center border border-dashed border-[#CBD5E1] rounded-lg">
          追加CTAブロックはまだありません
        </p>
      )}
      {blocks.map((b, i) => (
        <div key={b.id} className="mb-5 p-4 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <FormField label="ラベル（管理用）">
              <TextInput
                value={b.label}
                onChange={e => {
                  const next = [...blocks]
                  next[i] = { ...b, label: e.target.value }
                  update(next)
                }}
              />
            </FormField>
            <FormField label="挿入位置">
              <select
                value={b.insertBefore}
                onChange={e => {
                  const next = [...blocks]
                  next[i] = { ...b, insertBefore: e.target.value as ExtraCtaBlock['insertBefore'] }
                  update(next)
                }}
                className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#009AE0]"
              >
                <option value="h2-matome">「まとめ」H2の直前</option>
                <option value="last-h2">最後のH2の直前</option>
                <option value="none">末尾に追加</option>
              </select>
            </FormField>
          </div>
          <FormField label="HTML">
            <TextArea
              rows={6}
              value={b.html}
              onChange={e => {
                const next = [...blocks]
                next[i] = { ...b, html: e.target.value }
                update(next)
              }}
            />
          </FormField>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => update(blocks.filter((_, idx) => idx !== i))}
              className="text-xs font-semibold text-[#DC2626] hover:underline"
            >
              削除
            </button>
          </div>
          {b.html && (
            <div className="mt-2">
              <div className="text-xs text-[#64748B] mb-1">プレビュー:</div>
              <div
                className="p-3 border border-[#E2E8F0] rounded-lg bg-white"
                dangerouslySetInnerHTML={{ __html: b.html }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
