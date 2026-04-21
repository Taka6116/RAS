'use client'

import type { SiteSettings, RelatedArticle, HeaderNavItem } from '@/lib/siteSettings'
import { FormField, TextInput, TextArea, SectionHeader } from './FormField'

export default function ContentTab({
  settings,
  onChange,
}: {
  settings: SiteSettings
  onChange: (s: SiteSettings) => void
}) {
  const c = settings.content
  const update = (patch: Partial<SiteSettings['content']>) =>
    onChange({ ...settings, content: { ...c, ...patch } })

  return (
    <div>
      <SectionHeader title="パンくず・COLUMNラベル" description="プレビュー画面の上部に表示されます。" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
        <FormField label="COLUMN ラベル"><TextInput value={c.columnLabel} onChange={e => update({ columnLabel: e.target.value })} /></FormField>
        <FormField label="COLUMN サブラベル"><TextInput value={c.columnSubLabel} onChange={e => update({ columnSubLabel: e.target.value })} /></FormField>
        <FormField label="パンくず: トップ"><TextInput value={c.breadcrumbs.home} onChange={e => update({ breadcrumbs: { ...c.breadcrumbs, home: e.target.value } })} /></FormField>
        <FormField label="パンくず: カテゴリ"><TextInput value={c.breadcrumbs.category} onChange={e => update({ breadcrumbs: { ...c.breadcrumbs, category: e.target.value } })} /></FormField>
        <FormField label="パンくず: セクション"><TextInput value={c.breadcrumbs.section} onChange={e => update({ breadcrumbs: { ...c.breadcrumbs, section: e.target.value } })} /></FormField>
        <FormField label="フッター著作表記"><TextInput value={c.footerCopyright} onChange={e => update({ footerCopyright: e.target.value })} /></FormField>
      </div>

      <SectionHeader title="ヘッダーナビ" description="カンマ区切りで入力してください。" />
      <FormField label="ヘッダーナビ項目">
        <TextInput
          value={c.headerNav.map(n => n.label).join(', ')}
          onChange={e => {
            const items: HeaderNavItem[] = e.target.value
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
              .map(label => ({ label }))
            update({ headerNav: items })
          }}
        />
      </FormField>

      <SectionHeader title="フッターナビ" />
      <FormField label="フッターナビ項目（カンマ区切り）">
        <TextInput
          value={c.footerNav.join(', ')}
          onChange={e => update({ footerNav: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
        />
      </FormField>

      <SectionHeader title="関連記事" description="プレビュー画面の「こんなお役立ち情報もあります」に表示されます。" />
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => update({ relatedArticles: [...c.relatedArticles, { title: '', href: '#', category: '', imageUrl: '', date: '' }] })}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#009AE0] text-white"
        >
          + 関連記事を追加
        </button>
      </div>
      {c.relatedArticles.map((a, i) => (
        <div key={i} className="mb-4 p-4 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <FormField label="タイトル">
              <TextInput value={a.title} onChange={e => updateArticle(i, { title: e.target.value })} />
            </FormField>
            <FormField label="URL">
              <TextInput value={a.href} onChange={e => updateArticle(i, { href: e.target.value })} />
            </FormField>
            <FormField label="カテゴリ">
              <TextInput value={a.category} onChange={e => updateArticle(i, { category: e.target.value })} />
            </FormField>
            <FormField label="日付">
              <TextInput value={a.date} onChange={e => updateArticle(i, { date: e.target.value })} placeholder="2024.11.15" />
            </FormField>
            <FormField label="画像URL（任意）">
              <TextInput value={a.imageUrl} onChange={e => updateArticle(i, { imageUrl: e.target.value })} />
            </FormField>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => update({ relatedArticles: c.relatedArticles.filter((_, idx) => idx !== i) })}
              className="text-xs font-semibold text-[#DC2626] hover:underline"
            >
              削除
            </button>
          </div>
        </div>
      ))}

      <SectionHeader title="タグ" description="プレビュー画面のタグバッジと、サイドバーのタグ一覧に反映。" />
      <FormField label="記事のタグ（カンマ区切り）">
        <TextInput
          value={c.articleTags.join(', ')}
          onChange={e => update({ articleTags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
        />
      </FormField>

      <SectionHeader title="監修者ブロック" description="本文冒頭に監修者ブロックを表示します（プレビュー・WP投稿両方）。" />
      <FormField label="">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={c.supervisor.enabled}
            onChange={e => update({ supervisor: { ...c.supervisor, enabled: e.target.checked } })}
          />
          監修者ブロックを表示する
        </label>
      </FormField>
      {c.supervisor.enabled && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <FormField label="監修者氏名"><TextInput value={c.supervisor.name} onChange={e => update({ supervisor: { ...c.supervisor, name: e.target.value } })} /></FormField>
          <FormField label="肩書き"><TextInput value={c.supervisor.title} onChange={e => update({ supervisor: { ...c.supervisor, title: e.target.value } })} /></FormField>
          <FormField label="画像URL"><TextInput value={c.supervisor.imageUrl} onChange={e => update({ supervisor: { ...c.supervisor, imageUrl: e.target.value } })} /></FormField>
          <FormField label="紹介文">
            <TextArea rows={3} value={c.supervisor.description} onChange={e => update({ supervisor: { ...c.supervisor, description: e.target.value } })} />
          </FormField>
        </div>
      )}
    </div>
  )

  function updateArticle(i: number, patch: Partial<RelatedArticle>) {
    const next = [...c.relatedArticles]
    next[i] = { ...next[i], ...patch }
    update({ relatedArticles: next })
  }
}
