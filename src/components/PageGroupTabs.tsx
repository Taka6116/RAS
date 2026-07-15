'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Group = 'articles' | 'library' | 'analysis'

const GROUPS: Record<Group, Array<{ href: string; label: string }>> = {
  articles: [
    { href: '/articles', label: '保存済み' },
    { href: '/published', label: '投稿済み' },
  ],
  library: [
    { href: '/images', label: '画像' },
    { href: '/prompts', label: 'プロンプト' },
    { href: '/keywords', label: 'キーワード' },
  ],
  analysis: [
    { href: '/ahrefs', label: 'KW分析' },
    { href: '/article-analytics', label: '記事分析' },
    { href: '/competitive-analysis', label: '競合分析' },
    { href: '/personas', label: '仮説ペルソナ' },
    { href: '/performance', label: '成果測定' },
  ],
}

/**
 * サイドバーを簡素化しつつ既存URLを維持するグループタブ。
 * 各ページの既存コンテンツには一切手を加えず、上部にだけ追加する。
 */
export default function PageGroupTabs({ group }: { group: Group }) {
  const pathname = usePathname()
  const tabs = GROUPS[group]

  return (
    <nav
      aria-label={`${group} ページ切り替え`}
      className="mb-5 flex flex-wrap gap-x-5 gap-y-1 border-b"
      style={{ borderColor: '#D0E3F0' }}
    >
      {tabs.map(tab => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="border-b-2 -mb-px pb-2.5 text-sm font-semibold transition-colors"
            style={{
              color: active ? '#0A2540' : '#64748B',
              borderColor: active ? '#0A2540' : 'transparent',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
