'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useCallback, useMemo, useState, useEffect, Suspense } from 'react'
import StepIndicator from '@/components/editor/StepIndicator'
import type { Step } from '@/lib/types'
import { DEFAULT_SITE_SETTINGS, type SiteSettings, type ExtraCtaBlock } from '@/lib/siteSettings'

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildPreviewCtaBannerHtml(settings: SiteSettings): string {
  if (settings.cta.advancedHtml?.trim()) return settings.cta.advancedHtml
  const cta = settings.cta
  const imageUrl = cta.bannerImageUrl
  if (imageUrl) {
    return `<div style="text-align:center;margin:40px 0;padding:0;">
  <a href="${escapeAttr(cta.inquiryUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none;">
    <img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(cta.bannerHeadline)}" style="max-width:100%;width:700px;height:auto;border:none;border-radius:8px;" loading="lazy" />
  </a>
</div>`
  }
  return `<div style="text-align:center;margin:40px 0;padding:20px;background:#E6F5FC;border-radius:12px;">
  <p style="font-size:18px;font-weight:700;color:#0A2540;margin:0 0 12px;">${escapeAttr(cta.bannerHeadline)}</p>
  <a href="${escapeAttr(cta.inquiryUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 32px;background:${escapeAttr(settings.brand.accentColor)};color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">${escapeAttr(cta.inquiryLabel)}</a>
</div>`
}

function insertCtaBannersForPreview(html: string, settings: SiteSettings): string {
  const cta = buildPreviewCtaBannerHtml(settings)

  const matomeRegex = /<h2[^>]*>[^<]*まとめ[^<]*<\/h2>/gi
  const matomeMatch = matomeRegex.exec(html)
  if (matomeMatch) {
    return html.slice(0, matomeMatch.index) + cta + '\n' + html.slice(matomeMatch.index)
  }

  const matomeBlockRegex = /<(h2|h3|p)[^>]*>\s*(?:<strong>)?\s*まとめ[\s\S]*?<\/\1>/i
  const matomeBlockMatch = matomeBlockRegex.exec(html)
  if (matomeBlockMatch && matomeBlockMatch.index !== undefined) {
    return html.slice(0, matomeBlockMatch.index) + cta + '\n' + html.slice(matomeBlockMatch.index)
  }

  const h2Regex = /<h2[\s>]/gi
  let match: RegExpExecArray | null
  const positions: number[] = []
  while ((match = h2Regex.exec(html)) !== null) {
    positions.push(match.index)
  }
  if (positions.length >= 2) {
    const lastPos = positions[positions.length - 1]!
    return html.slice(0, lastPos) + cta + '\n' + html.slice(lastPos)
  }

  return html + '\n' + cta
}

function insertExtraCtaBlocksPreview(html: string, blocks: ExtraCtaBlock[]): string {
  if (!blocks || blocks.length === 0) return html
  let out = html
  for (const block of blocks) {
    if (!block.html?.trim()) continue
    const insertable = `\n${block.html}\n`
    if (block.insertBefore === 'h2-matome') {
      const r = /<h2[^>]*>[^<]*まとめ[^<]*<\/h2>/i
      const m = r.exec(out)
      if (m) {
        out = out.slice(0, m.index) + insertable + out.slice(m.index)
        continue
      }
    }
    if (block.insertBefore === 'last-h2') {
      const r = /<h2[\s>]/gi
      const positions: number[] = []
      let mm: RegExpExecArray | null
      while ((mm = r.exec(out)) !== null) positions.push(mm.index)
      if (positions.length > 0) {
        const pos = positions[positions.length - 1]!
        out = out.slice(0, pos) + insertable + out.slice(pos)
        continue
      }
    }
    out = out + insertable
  }
  return out
}

function buildSupervisorBlockPreview(settings: SiteSettings): string {
  const sv = settings.content.supervisor
  if (!sv.enabled) return ''
  const name = escapeAttr(sv.name || '')
  const title = escapeAttr(sv.title || '')
  const imageUrl = escapeAttr(sv.imageUrl || '')
  const description = (sv.description || '').replace(/\n/g, '<br>')
  const img = imageUrl
    ? `<img src="${imageUrl}" alt="${name}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`
    : ''
  return `
<div style="display:flex;gap:16px;align-items:flex-start;margin:24px 0 32px;padding:16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;">
${img}
  <div style="flex:1;min-width:0;">
    <div style="font-size:12px;color:#64748B;margin-bottom:4px;">監修者</div>
    <div style="font-size:16px;font-weight:700;color:#0A2540;">${name}</div>
    ${title ? `<div style="font-size:13px;color:#475569;margin-top:2px;">${title}</div>` : ''}
    ${description ? `<p style="font-size:13px;color:#334155;line-height:1.7;margin:8px 0 0;">${description}</p>` : ''}
  </div>
</div>`.trim()
}

type ParsedNumberedHeading = {
  level: 2 | 3 | 4 | 5
  text: string
}

function parseNumberedHeading(trimmed: string): ParsedNumberedHeading | null {
  const m = trimmed.match(/^(\d+(?:-\d+)*)[．.]\s+(.+)$/)
  if (!m) return null
  const numbering = m[1]!
  const text = m[2]!
  const depth = numbering.split('-').length
  const level = Math.min(depth + 1, 5) as 2 | 3 | 4 | 5
  return { level, text }
}

function formatContent(content: string, settings: SiteSettings): string {
  const supervisorBlock = buildSupervisorBlockPreview(settings)

  const H2_STYLE = settings.styles.h2Css || DEFAULT_SITE_SETTINGS.styles.h2Css
  const H3_STYLE = settings.styles.h3Css || DEFAULT_SITE_SETTINGS.styles.h3Css
  const H4_STYLE = settings.styles.h4Css || settings.styles.h3Css || DEFAULT_SITE_SETTINGS.styles.h4Css
  const H5_STYLE = settings.styles.h4Css || settings.styles.h3Css || DEFAULT_SITE_SETTINGS.styles.h4Css
  const P_STYLE = settings.styles.bodyCss || DEFAULT_SITE_SETTINGS.styles.bodyCss

  const applyInlineFormatting = (text: string): string =>
    text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+?)__/g, '$1')
      .replace(/(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      .replace(/\*\*/g, '')

  const lines = content.split('\n')
  const htmlLines: string[] = []
  let currentParagraph: string[] = []

  const flushParagraph = () => {
    if (currentParagraph.length === 0) return
    const raw = currentParagraph.join('<br>').trim()
    if (raw) {
      htmlLines.push(`<p style="${P_STYLE}">${applyInlineFormatting(raw)}</p>`)
    }
    currentParagraph = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      continue
    }

    const numbered = parseNumberedHeading(trimmed)
    if (numbered && currentParagraph.length === 0) {
      const text = numbered.text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*\*/g, '')
      if (numbered.level === 2) {
        htmlLines.push(`<h2 style="${H2_STYLE}">${applyInlineFormatting(text)}</h2>`)
      } else if (numbered.level === 3) {
        htmlLines.push(`<h3 style="${H3_STYLE}">${text}</h3>`)
      } else if (numbered.level === 4) {
        htmlLines.push(`<h4 style="${H4_STYLE}">${text}</h4>`)
      } else {
        htmlLines.push(`<h5 style="${H5_STYLE}">${text}</h5>`)
      }
      continue
    }

    if (/^[■▶◆●▼]\s/.test(trimmed)) {
      flushParagraph()
      const text = trimmed.replace(/^[■▶◆●▼]\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1')
      htmlLines.push(`<h3 style="${H3_STYLE}">${text}</h3>`)
      continue
    }

    currentParagraph.push(trimmed)
  }

  flushParagraph()
  let bodyHtml = htmlLines.join('\n')

  const accent = settings.brand.accentColor
  bodyHtml = bodyHtml
    .replace(
      /導入事例はこちらから\s+https?:\/\/[^\s<]+/g,
      `<a href="${escapeAttr(settings.cta.caseStudyUrl)}" target="_blank" rel="noopener noreferrer" style="color:${escapeAttr(accent)};text-decoration:underline;">${escapeAttr(settings.cta.caseStudyLabel)}</a>`
    )
    .replace(
      /お問い合わせはこちら\s+https?:\/\/[^\s<]+/g,
      `<a href="${escapeAttr(settings.cta.inquiryUrl)}" target="_blank" rel="noopener noreferrer" style="color:${escapeAttr(accent)};text-decoration:underline;">${escapeAttr(settings.cta.inquiryLabel)}</a>`
    )

  bodyHtml = insertCtaBannersForPreview(bodyHtml, settings)
  bodyHtml = insertExtraCtaBlocksPreview(bodyHtml, settings.extraCtaBlocks)

  return supervisorBlock + bodyHtml
}

function PreviewLoading({ title }: { title: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff',
      }}
    >
      <style>{`
        @keyframes rc-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes rc-progress {
          0% { width: 0; }
          60% { width: 70%; }
          100% { width: 100%; }
        }
        @keyframes rc-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #1a2744, #3EA8D8)',
          animation: 'rc-pulse 1.4s ease-in-out infinite',
          marginBottom: 28,
        }}
      />

      <p
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: '#1a2744',
          fontFamily: '"Noto Sans JP", sans-serif',
          marginBottom: 20,
          animation: 'rc-fade-in 0.5s ease-out',
        }}
      >
        記事プレビューを準備しています
      </p>

      <div
        style={{
          width: 220,
          height: 3,
          borderRadius: 2,
          background: '#E8ECF0',
          overflow: 'hidden',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: 2,
            background: 'linear-gradient(90deg, #3EA8D8, #1a2744)',
            animation: 'rc-progress 1.8s ease-out forwards',
          }}
        />
      </div>

      {title && title !== '（タイトルなし）' && (
        <p
          style={{
            fontSize: 13,
            color: '#94A3B8',
            fontFamily: '"Noto Sans JP", sans-serif',
            maxWidth: 400,
            textAlign: 'center',
            lineHeight: 1.6,
            animation: 'rc-fade-in 0.7s ease-out 0.2s both',
          }}
        >
          {title}
        </p>
      )}
    </div>
  )
}

function PreviewContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const title = searchParams.get('title') || '（タイトルなし）'
  const contentFromUrl = searchParams.get('content') || ''
  const [storageContent, setStorageContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [wordpressUrl, setWordpressUrl] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS)

  const isPublishedPreview = searchParams.get('source') === 'published'

  useEffect(() => {
    let cancelled = false
    fetch('/api/site-settings', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data?.settings) setSettings(data.settings)
      })
      .catch(() => { /* デフォルト値のまま */ })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    setStorageContent(sessionStorage.getItem('preview_content') || '')
    const id = searchParams.get('articleId')
    let storedImage = ''
    let wp: string | null = null

    if (id) {
      try {
        const raw = localStorage.getItem('nas_articles')
        if (raw) {
          const articles = JSON.parse(raw)
          const match = articles.find((a: { id?: string }) => a.id === id)
          if (match) {
            if (typeof match.wordpressUrl === 'string' && match.wordpressUrl.trim()) {
              wp = match.wordpressUrl.trim()
            }
            if (match.imageUrl) storedImage = match.imageUrl
          }
        }
      } catch {
        /* ignore */
      }
    }

    setWordpressUrl(wp)
    if (storedImage) {
      setImageUrl(storedImage)
    } else {
      const sessionImage = sessionStorage.getItem('preview_image')
      setImageUrl(sessionImage || searchParams.get('imageUrl') || '')
    }

    requestAnimationFrame(() => setReady(true))
  }, [searchParams])

  const content = contentFromUrl || storageContent
  const category = searchParams.get('category') || 'お役立ち情報'
  const date = searchParams.get('date') || new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' }).replace(/\//g, '.')
  const articleId = searchParams.get('articleId') || ''

  const formattedContent = useMemo(
    () => formatContent(content, settings),
    [content, settings]
  )

  const handlePublish = useCallback(() => {
    if (articleId) {
      router.push(`/editor?articleId=${articleId}&step=5`)
    } else {
      router.push('/editor?step=5')
    }
  }, [articleId, router])

  const handleStepClick = useCallback(
    (step: Step) => {
      const base = articleId ? `/editor?articleId=${articleId}&step=` : '/editor?step='
      if (step === 1) {
        router.push(`${base}1`)
      } else if (step === 2) {
        router.push(`${base}2`)
      } else if (step === 3) {
        router.push(`${base}3`)
      } else if (step === 4) {
        // current
      } else if (step === 5) {
        handlePublish()
      }
    },
    [articleId, router, handlePublish]
  )

  if (!ready) return <PreviewLoading title={title} />

  return (
    <div style={{ minHeight: '100vh', background: '#fff', animation: 'rc-fade-in 0.4s ease-out' }}>
      <style>{`
        @keyframes rc-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      {/* 固定バナー（プレビューモード） */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 220,
          right: 0,
          zIndex: 1000,
          backgroundColor: '#1e3a5f',
          color: 'white',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>👁️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>プレビューモード</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {isPublishedPreview
                ? '投稿済み記事の表示確認（編集はできません）'
                : '実際のサイトでの表示イメージを確認しています'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
          {isPublishedPreview ? (
            <>
              <button
                type="button"
                onClick={() => router.push('/published')}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.5)',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                ← 一覧に戻る
              </button>
              {wordpressUrl && (
                <a
                  href={wordpressUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    backgroundColor: '#3EA8D8',
                    border: 'none',
                    color: 'white',
                    padding: '10px 24px',
                    borderRadius: 6,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: 14,
                    textDecoration: 'none',
                    display: 'inline-block',
                  }}
                >
                  WordPressで開く
                </a>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => (articleId ? router.push(`/editor?articleId=${articleId}&step=3`) : router.push('/editor?step=3'))}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.5)',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                ← 戻る
              </button>
              <button
                type="button"
                onClick={handlePublish}
                style={{
                  backgroundColor: '#e63946',
                  border: 'none',
                  color: 'white',
                  padding: '10px 24px',
                  borderRadius: 6,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                投稿画面へ
              </button>
            </>
          )}
        </div>
      </div>

      {/* メインコンテンツ + ステップインジケーター */}
      <div style={{ paddingTop: 56, display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>

      {/* ヘッダー */}
      <header
        style={{
          backgroundColor: settings.brand.headerBgColor,
          padding: '0 24px',
          minHeight: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 56,
          zIndex: 998,
          flexWrap: 'nowrap',
          gap: 16,
        }}
      >
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={settings.brand.logoUrl}
            alt={settings.brand.companyName}
            style={{ height: 40, width: 'auto', display: 'block', filter: 'brightness(10)' }}
          />
        </div>

        <nav
          style={{
            display: 'flex',
            gap: 24,
            fontSize: 13,
            color: 'rgba(255,255,255,0.9)',
            fontWeight: 600,
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontFamily: '"Noto Sans JP", sans-serif',
          }}
        >
          {settings.content.headerNav.map(item => (
            <span key={item.label} style={{ cursor: 'pointer' }}>
              {item.label}
            </span>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <a
            href={settings.cta.inquiryUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              backgroundColor: settings.brand.inquiryButtonColor,
              color: 'white',
              padding: '10px 20px',
              borderRadius: 6,
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              textDecoration: 'none',
            }}
          >
            お問い合わせ
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </header>

      {/* ファーストビュー（COLUMN / お役立ち情報詳細） */}
      <section style={{ backgroundColor: '#f5f5f5', padding: '48px 0' }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '0 40px',
          }}
        >
          <h1 style={{ position: 'relative' }}>
            <span
              style={{
                display: 'block',
                fontSize: 14,
                color: '#666',
                fontWeight: 500,
                fontFamily: '"Noto Sans JP", sans-serif',
              }}
            >
              {settings.content.columnSubLabel}
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 40,
                fontWeight: 700,
                color: '#333',
                fontFamily: 'Roboto, Arial, sans-serif',
                letterSpacing: '0.05em',
                marginTop: 4,
              }}
            >
              {settings.content.columnLabel}
            </span>
          </h1>
          <nav
            style={{ marginTop: 16, fontSize: 13, color: '#666', fontFamily: '"Noto Sans JP", sans-serif' }}
            aria-label="パンくず"
          >
            <span style={{ color: settings.brand.accentColor, cursor: 'pointer' }}>{settings.content.breadcrumbs.home}</span>
            {' > '}
            <span style={{ color: settings.brand.accentColor, cursor: 'pointer' }}>{settings.content.breadcrumbs.category}</span>
            {' > '}
            <span style={{ color: settings.brand.accentColor, cursor: 'pointer' }}>{settings.content.breadcrumbs.section}</span>
            {' > '}
            <span>
              {title.length > 40 ? `${title.slice(0, 40)}...` : title}
            </span>
          </nav>
        </div>
      </section>

      {/* 記事メインコンテンツ（2カラム：メイン + サイドバー） */}
      <section style={{ padding: '0 0 80px' }}>
        <div
          style={{
            maxWidth: 1100,
            margin: '48px auto',
            padding: '0 24px',
            display: 'flex',
            gap: 40,
            alignItems: 'flex-start',
          }}
        >
          {/* === 左：メインカラム === */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <header style={{ marginBottom: 32 }}>
              {/* タグ → タイトル → 日付（実サイト順） */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {settings.content.articleTags.map(tag => (
                  <span
                    key={tag}
                    style={{
                      display: 'inline-block',
                      padding: '4px 14px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'white',
                      backgroundColor: settings.brand.headerBgColor,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <h1
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  lineHeight: 1.6,
                  color: '#111',
                  marginBottom: 12,
                  fontFamily: '"Noto Sans JP", sans-serif',
                }}
              >
                {title}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <time style={{ color: '#666', fontWeight: 500, fontSize: 14 }}>
                  {date}
                </time>
              </div>
            </header>

            {/* アイキャッチ画像（タイトル直下、本文の前） */}
            {imageUrl && (
              <div style={{ marginBottom: 32 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                    borderRadius: 4,
                  }}
                />
              </div>
            )}

            {/* 記事本文 */}
            <div
              style={{
                fontFamily: '"Noto Sans JP", sans-serif',
                fontSize: 16,
                lineHeight: 1.9,
                color: '#333',
              }}
              dangerouslySetInnerHTML={{ __html: formattedContent }}
            />

            {/* 記事末タグバッジ */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 48, paddingTop: 24, borderTop: '1px solid #e5e5e5' }}>
              {settings.content.articleTags.map(tag => (
                <span
                  key={tag}
                  style={{
                    display: 'inline-block',
                    padding: '5px 14px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'white',
                    backgroundColor: settings.brand.headerBgColor,
                    cursor: 'pointer',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* ページネーション */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 32,
                paddingTop: 20,
                paddingBottom: 20,
                borderTop: '1px solid #e5e5e5',
                borderBottom: '1px solid #e5e5e5',
                fontFamily: '"Noto Sans JP", sans-serif',
              }}
            >
              <span style={{ fontSize: 14, color: '#333', cursor: 'pointer' }}>
                &laquo; 前の記事
              </span>
              <span style={{ fontSize: 14, color: '#333', cursor: 'pointer' }}>
                次の記事 &raquo;
              </span>
            </div>

            {/* こんなお役立ち情報もあります（2カラム） */}
            <div style={{ marginTop: 48 }}>
              <h2 style={{ marginBottom: 24, textAlign: 'center', fontSize: 20, fontWeight: 700, color: '#222', fontFamily: '"Noto Sans JP", sans-serif' }}>
                こんなお役立ち情報もあります
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
                {settings.content.relatedArticles.map((article, i) => (
                  <a
                    key={i}
                    href={article.href || '#'}
                    style={{
                      backgroundColor: 'white',
                      borderRadius: 4,
                      overflow: 'hidden',
                      border: '1px solid #e5e5e5',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      color: 'inherit',
                      display: 'block',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '16/9',
                        backgroundColor: '#f0f4f8',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24,
                        borderBottom: '1px solid #e5e5e5',
                        backgroundImage: article.imageUrl ? `url(${article.imageUrl})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      {!article.imageUrl && (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={settings.brand.logoUrl}
                            alt={settings.brand.productName}
                            style={{ height: 28, width: 'auto', display: 'block', marginBottom: 4 }}
                          />
                          <span style={{ fontSize: 9, fontWeight: 600, color: settings.brand.accentColor, letterSpacing: '0.08em' }}>
                            {settings.brand.productName}
                          </span>
                        </>
                      )}
                    </div>
                    <div style={{ padding: 16 }}>
                      {article.date && (
                        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>
                          {article.date}{article.category ? ` / ${article.category}` : ''}
                        </div>
                      )}
                      <p style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.6, color: '#111', margin: 0 }}>
                        {article.title}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* === 右：サイドバー === */}
          <div style={{ width: 260, flexShrink: 0, position: 'sticky', top: 130, fontFamily: '"Noto Sans JP", sans-serif' }}>
            {/* 絞り込み検索 */}
            <div style={{ marginBottom: 32, border: '1px solid #e0e0e0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ backgroundColor: settings.brand.headerBgColor, color: 'white', padding: '12px 16px', fontSize: 14, fontWeight: 700, textAlign: 'center' }}>
                絞り込み検索
              </div>
              <div style={{ padding: 16 }}>
                <select
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ccc', borderRadius: 4, marginBottom: 16, color: '#333', background: 'white' }}
                  defaultValue=""
                >
                  <option value="">カテゴリー</option>
                  <option value="section">{settings.content.breadcrumbs.section}</option>
                </select>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 8 }}>タグ検索</div>
                {settings.content.articleTags.map(tag => (
                  <label key={tag} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#333', marginBottom: 6, cursor: 'pointer' }}>
                    <input type="checkbox" style={{ accentColor: settings.brand.headerBgColor }} readOnly />
                    {tag}
                  </label>
                ))}
                <button
                  type="button"
                  style={{
                    width: '100%',
                    marginTop: 12,
                    padding: '10px 0',
                    backgroundColor: settings.brand.headerBgColor,
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  検索
                </button>
              </div>
            </div>
            {/* タグ一覧 */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 12 }}>タグ一覧</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {settings.content.tagList.map(tag => (
                  <span
                    key={tag.name}
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'white',
                      backgroundColor: settings.brand.headerBgColor,
                      cursor: 'pointer',
                    }}
                  >
                    {tag.name} ({tag.count})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer
        style={{
          backgroundColor: settings.brand.footerBgColor,
          color: 'white',
          padding: '48px 40px 24px',
          fontFamily: '"Noto Sans JP", sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 32,
            flexWrap: 'wrap',
            gap: 32,
          }}
        >
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={settings.brand.logoUrl}
              alt={settings.brand.companyName}
              style={{ height: 36, width: 'auto', display: 'block', marginBottom: 16, filter: 'brightness(10)' }}
            />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              {settings.brand.companyName}
            </div>
            <p style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
              {settings.brand.address}
            </p>
          </div>
          <nav
            style={{
              display: 'flex',
              gap: 24,
              fontSize: 13,
              opacity: 0.8,
              flexWrap: 'wrap',
              alignItems: 'flex-start',
            }}
          >
            {settings.content.footerNav.map(item => (
              <span key={item} style={{ cursor: 'pointer' }}>{item}</span>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 12, opacity: 0.7, marginBottom: 16 }}>
          <span style={{ cursor: 'pointer' }}>プライバシーポリシー</span>
          <span style={{ cursor: 'pointer' }}>情報セキュリティ基本方針</span>
        </div>
        <hr
          style={{
            border: 'none',
            borderTop: '1px solid rgba(255,255,255,0.15)',
            marginBottom: 16,
          }}
        />
        <p
          style={{
            textAlign: 'center',
            fontSize: 12,
            opacity: 0.5,
          }}
        >
          {settings.content.footerCopyright}
        </p>
      </footer>
        </div>
        {!isPublishedPreview && (
          <div style={{ flexShrink: 0, width: 140, position: 'sticky', top: 72, paddingTop: 8 }}>
            <StepIndicator currentStep={4} onStepClick={handleStepClick} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function PreviewPage() {
  return (
    <Suspense fallback={<PreviewLoading title="" />}>
      <PreviewContent />
    </Suspense>
  )
}
