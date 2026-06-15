'use client'

import { useEffect, useRef, useState, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArticleData, ProcessingState, Step } from '@/lib/types'
import StepIndicator from './StepIndicator'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ArrowLeft, ArrowRight, Clock, Download, RefreshCw, Upload, Images as ImagesIcon, X } from 'lucide-react'
import { setSessionPreviewImage } from '@/lib/sessionPreviewImage'

interface GeneratedImageMeta {
  id: string
  key: string
  title: string
  targetKeyword: string
  prompt: string
  createdAt: string
}

interface ImageResultProps {
  article: ArticleData
  fireflyStatus: ProcessingState
  /** 画像生成失敗時に表示するAPIエラーメッセージ */
  fireflyError?: string | null
  onBack: () => void
  onSaveDraft: (options?: { silent?: boolean }) => Promise<string | undefined> | string | void
  onNext: () => void
  onRegenerate: () => void
  /** 初回の画像生成を開始する（クリックで呼ぶ） */
  onGenerate?: () => void
  /** クライアント画像を選択したときに呼ばれる（imageUrl を上書き） */
  onImageUpload?: (imageUrl: string) => void
  onStepClick?: (step: Step) => void
  /** プレビュー遷移時に「このまま投稿する」でSTEP4へ戻るために使用 */
  articleId?: string | null
}

export default function ImageResult({
  article,
  fireflyStatus,
  fireflyError = null,
  onBack,
  onSaveDraft,
  onNext,
  onRegenerate,
  onGenerate,
  onImageUpload,
  onStepClick,
  articleId = null,
}: ImageResultProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [navigating, setNavigating] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pastImages, setPastImages] = useState<GeneratedImageMeta[]>([])
  const [loadingImages, setLoadingImages] = useState(false)

  useEffect(() => {
    if (!pickerOpen) return
    let cancelled = false
    setLoadingImages(true)
    fetch('/api/images', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (!cancelled && Array.isArray(data?.images)) setPastImages(data.images)
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoadingImages(false) })
    return () => { cancelled = true }
  }, [pickerOpen])

  const handleSelectPastImage = (img: GeneratedImageMeta) => {
    if (onImageUpload) onImageUpload(`/api/images/file/${img.id}`)
    setPickerOpen(false)
  }

  const handlePreview = async () => {
    setNavigating(true)
    try {
      const savedId = await onSaveDraft({ silent: true })
      const finalArticleId = savedId || articleId

      const content = article.refinedContent || article.originalContent || ''
      sessionStorage.setItem('preview_content', content)
      await setSessionPreviewImage(article.imageUrl || null)
      const params = new URLSearchParams({
        title: article.refinedTitle?.trim() || article.title || '',
        category: 'お役立ち情報',
        date: new Date().toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        }).replace(/\//g, '.'),
      })
      if (finalArticleId) params.set('articleId', finalArticleId)
      router.push(`/preview?${params.toString()}`)
    } catch {
      setNavigating(false)
    }
  }

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = article.imageUrl
    const ext = article.imageUrl.startsWith('data:image/png') ? 'png' : 'jpg'
    link.download = `${article.refinedTitle?.trim() || article.title || 'generated-image'}.${ext}`
    link.click()
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!onImageUpload) return
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      onImageUpload(base64)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="w-full pt-6 pb-12">
      {navigating && <PreviewNavigatingOverlay title={article.refinedTitle?.trim() || article.title || ''} />}
      {/* 2カラム：左＝メインコンテンツ、右＝StepIndicator */}
      <div className="flex gap-8 items-start">
        {/* 左：メインコンテンツ（可変幅） */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* エラー表示 */}
          {fireflyStatus === 'error' && fireflyError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-medium">画像生成できませんでした</p>
              <p className="mt-1 break-all">{fireflyError}</p>
            </div>
          )}

          {/* 画像カード：常に3ボタン（アップロード・保存・別の画像を生成）を表示 */}
          <Card>
            <div className="flex flex-col items-center gap-5">
              {/* 未生成：画像を生成するボタン */}
              {!article.imageUrl && (fireflyStatus === 'idle' || fireflyStatus === 'error') && onGenerate && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <p className="text-sm text-[#64748B]">
                    {fireflyStatus === 'error' ? 'もう一度お試しください。' : '記事用の画像を生成します（30秒～1分ほどかかります）'}
                  </p>
                  <Button variant="primary" size="lg" onClick={onGenerate} className="gap-2">
                    <RefreshCw size={18} />
                    画像を生成する
                  </Button>
                </div>
              )}
              {fireflyStatus === 'loading' && <ImageGenerationLoader />}
              {/* 画像があるとき：画像表示（生成中はローダーを優先） */}
              {article.imageUrl && fireflyStatus !== 'loading' && (
                <div className="w-full max-w-[640px] rounded-lg overflow-hidden border border-[#D0E3F0]">
                  <Image
                    src={article.imageUrl}
                    alt="生成された記事画像"
                    width={1000}
                    height={525}
                    className="w-full h-auto"
                    unoptimized
                  />
                </div>
              )}

              <div
                className={`flex items-center gap-3 flex-wrap justify-center ${fireflyStatus === 'loading' ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  variant="ghost"
                  size="md"
                  onClick={handleUploadClick}
                  disabled={fireflyStatus === 'loading'}
                >
                  <Upload size={15} />
                  画像をアップロード
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={handleDownload}
                  disabled={!article.imageUrl || fireflyStatus === 'loading'}
                >
                  <Download size={15} />
                  画像を保存する
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={onRegenerate}
                  disabled={fireflyStatus === 'loading'}
                >
                  <RefreshCw size={15} />
                  別の画像を生成する
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setPickerOpen(true)}
                  disabled={fireflyStatus === 'loading'}
                >
                  <ImagesIcon size={15} />
                  過去の画像から選ぶ
                </Button>
              </div>

              <div className="w-full max-w-[640px] flex items-center justify-between gap-4 pt-2 border-t border-[#D0E3F0]">
                <button
                  type="button"
                  onClick={() => onSaveDraft()}
                  className="flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-medium flex-shrink-0"
                  style={{ background: '#F0F4FF', border: '1.5px solid #C7D7FF', color: '#0A2540' }}
                >
                  💾 下書きに保存
                </button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handlePreview}
                  disabled={fireflyStatus !== 'success' || !article.imageUrl}
                  className="flex-shrink-0"
                >
                  プレビューへ
                  <ArrowRight size={18} />
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* 右：StepIndicator（固定幅） */}
        <div className="flex-shrink-0 w-[140px] pt-2">
          <StepIndicator currentStep={3} onStepClick={onStepClick} />
        </div>
      </div>

      {/* 下：戻るのみ（ナビはカード内に移動済み） */}
      <div className="flex items-center justify-between mt-8">
        <Button variant="ghost" size="md" onClick={onBack}>
          <ArrowLeft size={16} />
          Gemini推敲に戻る
        </Button>
      </div>

      {pickerOpen && (
        <PastImagePicker
          images={pastImages}
          loading={loadingImages}
          onSelect={handleSelectPastImage}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

function PastImagePicker({
  images,
  loading,
  onSelect,
  onClose,
}: {
  images: GeneratedImageMeta[]
  loading: boolean
  onSelect: (img: GeneratedImageMeta) => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="text-base font-bold text-[#1A1A2E]">過去に生成した画像から選ぶ</h2>
            <p className="text-xs text-[#64748B] mt-0.5">クリックすると、この記事の画像として再利用します</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#94A3B8] hover:text-[#1A1A2E] transition-colors"
            aria-label="閉じる"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-16 text-sm text-[#94A3B8]">読み込み中...</div>
          ) : images.length === 0 ? (
            <div className="text-center py-16 text-sm text-[#64748B]">
              まだ保存された画像がありません。画像を生成すると、ここから再利用できるようになります。
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {images.map(img => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => onSelect(img)}
                  className="rounded-lg overflow-hidden border border-[#E2E8F0] hover:border-[#009AE0] hover:shadow-md transition-all text-left group"
                >
                  <div className="relative aspect-video bg-[#F1F5F9]">
                    <Image
                      src={`/api/images/file/${img.id}`}
                      alt={img.title || 'generated image'}
                      fill
                      sizes="200px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] font-medium text-[#1A1A2E] line-clamp-2 leading-snug">
                      {img.title || '（無題）'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PreviewNavigatingOverlay({ title }: { title: string }) {
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
        @keyframes nav-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes nav-progress {
          0% { width: 0; }
          60% { width: 70%; }
          100% { width: 100%; }
        }
        @keyframes nav-fade-in {
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
          animation: 'nav-pulse 1.4s ease-in-out infinite',
          marginBottom: 28,
        }}
      />

      <p
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: '#1a2744',
          fontFamily: '"Noto Sans JP", sans-serif',
          marginBottom: 12,
          animation: 'nav-fade-in 0.5s ease-out',
        }}
      >
        プレビューを準備しています
      </p>

      <p
        style={{
          fontSize: 12,
          color: '#94A3B8',
          fontFamily: '"Noto Sans JP", sans-serif',
          marginBottom: 20,
          animation: 'nav-fade-in 0.6s ease-out 0.1s both',
        }}
      >
        下書きを保存中...
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
            animation: 'nav-progress 2.5s ease-out forwards',
          }}
        />
      </div>

      {title && (
        <p
          style={{
            fontSize: 13,
            color: '#CBD5E1',
            fontFamily: '"Noto Sans JP", sans-serif',
            maxWidth: 400,
            textAlign: 'center',
            lineHeight: 1.6,
            animation: 'nav-fade-in 0.7s ease-out 0.2s both',
          }}
        >
          {title}
        </p>
      )}
    </div>
  )
}

/** 画像生成 API 待ち：円形リング + Sparkle・コピー（モダンカード） */
function ImageGenerationLoader() {
  const ringR = 44
  const c = 2 * Math.PI * ringR
  const dash = Math.round(c * 0.28)

  return (
    <div className="w-full max-w-[640px] flex flex-col gap-4" role="status" aria-live="polite">
      <div
        className="w-full rounded-2xl border border-[#D0E3F0] bg-white px-8 py-10 flex flex-col items-center text-center"
        style={{ boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08), 0 2px 12px rgba(15, 23, 42, 0.04)' }}
      >
        <div className="relative w-[100px] h-[100px] mb-6 flex items-center justify-center">
          <svg
            className="absolute inset-0 w-[100px] h-[100px] text-[#0A2540] motion-reduce:animate-none animate-[spin_1.35s_linear_infinite]"
            viewBox="0 0 100 100"
            fill="none"
            aria-hidden
          >
            <circle
              cx="50"
              cy="50"
              r={ringR}
              stroke="#D0E3F0"
              strokeWidth="5"
              fill="none"
            />
            <circle
              cx="50"
              cy="50"
              r={ringR}
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${dash} ${Math.round(c)}`}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <svg className="relative w-9 h-9" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 2C12 2 16 8 16 12C16 16 12 22 12 22C12 22 8 16 8 12C8 8 12 2 12 2Z" fill="url(#imgGrad1)" opacity="0.95"/>
              <path d="M2 12C2 12 8 8 12 8C16 8 22 12 22 12C22 12 16 16 12 16C8 16 2 12 2 12Z" fill="url(#imgGrad1)" opacity="0.65"/>
              <defs>
                <linearGradient id="imgGrad1" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#0056A0"/>
                  <stop offset="100%" stopColor="#009AE0"/>
                </linearGradient>
              </defs>
            </svg>
        </div>

        <h2 className="text-lg sm:text-xl font-bold text-[#1A1A2E] leading-snug tracking-tight">
          記事に最適なイメージを構築中
        </h2>
        <p className="text-sm text-[#64748B] mt-2 max-w-md leading-relaxed">
          AIが文脈に合わせたビジュアルを生成しています
        </p>
        <p className="mt-5 flex items-center justify-center gap-2 text-xs sm:text-sm text-[#64748B]">
          <Clock className="w-4 h-4 flex-shrink-0 text-[#0A2540]/70" aria-hidden />
          <span>約30秒〜1分で完了することが多いです</span>
        </p>
      </div>

      <div
        className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3 flex gap-3 text-left"
        style={{ boxShadow: '0 1px 3px rgba(14, 116, 144, 0.06)' }}
      >
        <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
          <span className="font-semibold text-[#0C4A6E]">Tips: </span>
          高品質な画像は読了率の向上に効くことがあります。AIは記事本文の内容を踏まえて画像を生成しています。
        </p>
      </div>
    </div>
  )
}
