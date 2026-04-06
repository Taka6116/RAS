'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useCallback, useMemo, useState, useEffect, Suspense } from 'react'
import StepIndicator from '@/components/editor/StepIndicator'
import type { Step } from '@/lib/types'
import { getSupervisorBlockHtml } from '@/lib/supervisorBlock'

const DUMMY_ARTICLES = [
  {
    date: '2024.11.15',
    category: 'ERPの基礎',
    title: 'ERP導入で失敗しないために！ERPシステムを比較する5つのポイント',
  },
  {
    date: '2024.06.28',
    category: 'ERPの基礎',
    title: 'ズバリ解説！ERPとは何か、今多くの企業が注目するワケ',
  },
]

const SUPERVISOR_FACE_IMAGE_URL = ''

function getPreviewCtaBannerHtml(): string {
  return `<div style="text-align:center;margin:40px 0;padding:20px;background:#E6F5FC;border-radius:12px;">
  <p style="font-size:18px;font-weight:700;color:#0A2540;margin:0 0 12px;">ERP導入・業務改善のご相談はお気軽に</p>
  <a href="https://www.rice-cloud.info/contact/" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 32px;background:#3EA8D8;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">お問い合わせはこちら</a>
</div>`
}

function insertCtaBannersForPreview(html: string): string {
  const cta = getPreviewCtaBannerHtml()

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

function formatContent(content: string): string {
  const supervisorBlock = getSupervisorBlockHtml(SUPERVISOR_FACE_IMAGE_URL)

  const H2_STYLE = "font-size:20px;font-weight:700;margin:48px 0 16px;padding:14px 20px;background:#1a2744;color:#fff;border-radius:4px;font-family:'Noto Sans JP',sans-serif;"
  const H3_STYLE = 'font-size:18px;font-weight:400;margin:32px 0 12px;color:#111;'
  const P_STYLE = 'margin-bottom:1.6em;'

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

    if (/^\d+[．.]\s/.test(trimmed) && currentParagraph.length === 0) {
      const text = trimmed.replace(/^\d+[．.]\s*/, '')
      htmlLines.push(`<h2 style="${H2_STYLE}">${applyInlineFormatting(text)}</h2>`)
      continue
    }

    if (/^\d+-\d+[．.]\s/.test(trimmed) && currentParagraph.length === 0) {
      const text = trimmed.replace(/^\d+-\d+[．.]\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1')
      htmlLines.push(`<h3 style="${H3_STYLE}">${text}</h3>`)
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

  bodyHtml = bodyHtml
    .replace(
      /導入事例はこちらから\s+https?:\/\/www\.rice-cloud\.info\/casestudy\/?/g,
      '<a href="https://www.rice-cloud.info/casestudy/" target="_blank" rel="noopener noreferrer" style="color:#3EA8D8;text-decoration:underline;">導入事例はこちらから</a>'
    )
    .replace(
      /お問い合わせはこちら\s+https?:\/\/www\.rice-cloud\.info\/contact\/?/g,
      '<a href="https://www.rice-cloud.info/contact/" target="_blank" rel="noopener noreferrer" style="color:#3EA8D8;text-decoration:underline;">お問い合わせはこちら</a>'
    )

  bodyHtml = insertCtaBannersForPreview(bodyHtml)

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

  const isPublishedPreview = searchParams.get('source') === 'published'

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
    () => formatContent(content),
    [content]
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

      {/* ヘッダー（RICE CLOUDサイト再現 — ダークネイビー背景） */}
      <header
        style={{
          backgroundColor: '#1a2744',
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
            src="/logo-w.webp"
            alt="株式会社ライスクラウド"
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
          {[
            'TOP',
            '会社案内',
            '導入事例',
            'サービス',
            'お役立ち情報',
            'NEWS',
            '採用情報',
          ].map(item => (
            <span key={item} style={{ cursor: 'pointer' }}>
              {item}
            </span>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button
            type="button"
            style={{
              backgroundColor: '#2ecc71',
              color: 'white',
              padding: '10px 20px',
              borderRadius: 6,
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            お問い合わせ
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
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
              お役立ち情報詳細
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
              COLUMN
            </span>
          </h1>
          <nav
            style={{ marginTop: 16, fontSize: 13, color: '#666', fontFamily: '"Noto Sans JP", sans-serif' }}
            aria-label="パンくず"
          >
            <span style={{ color: '#3EA8D8', cursor: 'pointer' }}>トップ</span>
            {' > '}
            <span style={{ color: '#3EA8D8', cursor: 'pointer' }}>お役立ち情報</span>
            {' > '}
            <span style={{ color: '#3EA8D8', cursor: 'pointer' }}>ERPの基礎</span>
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
                {['ERP', '業務改善', 'データ分析', 'SaaS', '基礎知識'].map(tag => (
                  <span
                    key={tag}
                    style={{
                      display: 'inline-block',
                      padding: '4px 14px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'white',
                      backgroundColor: '#1a2744',
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
              {['ERP', '業務改善', 'データ分析', 'SaaS', '基礎知識'].map(tag => (
                <span
                  key={tag}
                  style={{
                    display: 'inline-block',
                    padding: '5px 14px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'white',
                    backgroundColor: '#1a2744',
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
                {DUMMY_ARTICLES.map((article, i) => (
                  <div
                    key={i}
                    style={{
                      backgroundColor: 'white',
                      borderRadius: 4,
                      overflow: 'hidden',
                      border: '1px solid #e5e5e5',
                      cursor: 'pointer',
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
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/logo-w.webp"
                        alt="RICE CLOUD"
                        style={{ height: 28, width: 'auto', display: 'block', marginBottom: 4 }}
                      />
                      <span style={{ fontSize: 9, fontWeight: 600, color: '#3EA8D8', letterSpacing: '0.08em' }}>
                        RICE CLOUD JAPAN
                      </span>
                    </div>
                    <div style={{ padding: 16 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.6, color: '#111' }}>
                        {article.title}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* === 右：サイドバー === */}
          <div style={{ width: 260, flexShrink: 0, position: 'sticky', top: 130, fontFamily: '"Noto Sans JP", sans-serif' }}>
            {/* 絞り込み検索 */}
            <div style={{ marginBottom: 32, border: '1px solid #e0e0e0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#1a2744', color: 'white', padding: '12px 16px', fontSize: 14, fontWeight: 700, textAlign: 'center' }}>
                絞り込み検索
              </div>
              <div style={{ padding: 16 }}>
                <select
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ccc', borderRadius: 4, marginBottom: 16, color: '#333', background: 'white' }}
                  defaultValue="column01"
                >
                  <option value="">カテゴリー</option>
                  <option value="column01">ERPの基礎</option>
                </select>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 8 }}>タグ検索</div>
                {['ERP', '業務改善', 'データ分析', 'SaaS', '基礎知識'].map(tag => (
                  <label key={tag} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#333', marginBottom: 6, cursor: 'pointer' }}>
                    <input type="checkbox" style={{ accentColor: '#1a2744' }} readOnly />
                    {tag}
                  </label>
                ))}
                <button
                  type="button"
                  style={{
                    width: '100%',
                    marginTop: 12,
                    padding: '10px 0',
                    backgroundColor: '#1a2744',
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
                {[
                  { name: 'ERP', count: 3 },
                  { name: '業務改善', count: 3 },
                  { name: 'データ分析', count: 3 },
                  { name: 'SaaS', count: 3 },
                  { name: '基礎知識', count: 3 },
                ].map(tag => (
                  <span
                    key={tag.name}
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'white',
                      backgroundColor: '#1a2744',
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
          backgroundColor: '#222',
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
              src="/logo-w.webp"
              alt="株式会社ライスクラウド"
              style={{ height: 36, width: 'auto', display: 'block', marginBottom: 16, filter: 'brightness(10)' }}
            />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              株式会社 RICE CLOUD（ライスクラウド）
            </div>
            <p style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.8 }}>
              〒336-0017
              <br />
              埼玉県さいたま市南区南浦和2丁目40-1 第２愛興ビル 3階
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
            {['TOP', '会社案内', '導入事例', 'サービス', 'お役立ち情報', 'NEWS', '採用情報', 'お問い合わせ'].map(item => (
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
          &copy; RICE CLOUD JAPAN All Rights Reserved.
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
