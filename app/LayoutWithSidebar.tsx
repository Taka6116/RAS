'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import MainContentWidth from './MainContentWidth'

export default function LayoutWithSidebar({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isLogin = pathname === '/login'

  if (isLogin) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen px-4"
        style={{ background: 'linear-gradient(135deg, #0A2540 0%, #0056A0 50%, #009AE0 100%)' }}
      >
        {children}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className="fixed top-0 left-0 h-screen w-[220px] flex-shrink-0 z-40 flex flex-col"
        style={{
          background: 'linear-gradient(180deg, #0088CC 0%, #009AE0 35%, #00AEEE 65%, #0080C0 100%)',
          borderRight: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '4px 0 24px rgba(0,154,224,0.30)',
        }}
      >
        {/* ロゴ */}
        <div
          className="px-5 py-4"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="text-[23px] font-bold tracking-wide text-white">RAS</div>
          <div className="text-[13px] text-white/60 font-mono mt-0.5">
            Rice Cloud Article System
          </div>
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 px-3 py-4 text-sm space-y-1 overflow-y-auto">
          {[
            { href: '/editor',    label: '記事を作成' },
            { href: '/articles',  label: '保存済み記事一覧' },
            { href: '/published', label: '過去投稿済み記事一覧' },
            { href: '/images',    label: '画像' },
            { href: '/schedule',  label: '投稿スケジュール' },
            { href: '/prompts',   label: 'プロンプト' },
            { href: '/keywords',  label: 'キーワード' },
            { href: '/ahrefs',    label: 'KW分析' },
            { href: '/settings',  label: 'サイト設定' },
            { href: '/notice',    label: '注意書き' },
          ].map(({ href, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-all duration-200"
                style={{
                  color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.72)',
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.10) 100%)'
                    : 'transparent',
                  backdropFilter: isActive ? 'blur(8px)' : 'none',
                  border: isActive ? '1px solid rgba(255,255,255,0.30)' : '1px solid transparent',
                  boxShadow: isActive ? '0 2px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.30)' : 'none',
                  textShadow: isActive ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                }}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* フッターロゴ */}
        <div
          className="px-4 py-4 flex items-center justify-center"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="rounded-lg px-3 py-2"
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.18)',
              backdropFilter: 'blur(12px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
            }}
          >
            <img src="/rice-cloud-logo.png" alt="RICE CLOUD JAPAN" className="w-[140px] h-auto" />
          </div>
        </div>
      </aside>

      <div className="ml-[220px] flex-1 flex flex-col min-h-screen bg-[#F0F7FC]">
        <main className="flex-1 flex items-center justify-center px-6 py-8">
          <MainContentWidth>{children}</MainContentWidth>
        </main>
      </div>
    </div>
  )
}
