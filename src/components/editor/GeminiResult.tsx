'use client'

import { useState, useEffect, useRef } from 'react'
import { ArticleData, ProcessingState, Step } from '@/lib/types'
import StepIndicator from './StepIndicator'
import Button from '@/components/ui/Button'
import GeminiLoadingCard from './GeminiLoadingCard'
import { ArrowLeft, ArrowRight, ClipboardCopy, Check, CheckCircle } from 'lucide-react'

interface GeminiResultProps {
  article: ArticleData
  geminiStatus: ProcessingState
  geminiError?: string | null
  /** 推敲中にストリーミングで届く生成テキスト */
  streamText?: string
  showCompletionToast?: boolean
  onCompletionToastShown?: () => void
  onRefinedTitleChange?: (title: string) => void
  onRefinedContentChange: (content: string) => void
  onBack: () => void
  onNext: () => void
  onRetry?: () => void
  onStepClick?: (step: Step) => void
}

export default function GeminiResult({
  article,
  geminiStatus,
  geminiError,
  streamText = '',
  showCompletionToast,
  onCompletionToastShown,
  onRefinedTitleChange,
  onRefinedContentChange,
  onBack,
  onNext,
  onRetry,
  onStepClick,
}: GeminiResultProps) {
  const [copied, setCopied] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const refinedContent = typeof article.refinedContent === 'string' ? article.refinedContent : ''
  const streamScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (geminiStatus === 'success' && showCompletionToast) {
      setShowToast(true)
      onCompletionToastShown?.()
      const t = setTimeout(() => setShowToast(false), 2500)
      return () => clearTimeout(t)
    }
  }, [geminiStatus, showCompletionToast, onCompletionToastShown])

  // ストリーミングテキストを常に最下部へスクロール
  useEffect(() => {
    const el = streamScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [streamText])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(refinedContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="w-full pt-6 pb-12">
      <div className="flex gap-8 items-start">
        {/* 左：メインコンテンツ（可変幅） */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* ローディング（ストリーミングが始まったら生成中の本文をフル幅で表示） */}
          {geminiStatus === 'loading' && (
            streamText ? (
              <div className="w-full rounded-xl border border-[#D0E3F0] bg-white overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#D0E3F0] bg-[#F0F7FC]">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#009AE0] opacity-60" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#009AE0]" />
                    </span>
                    <span className="text-sm font-bold text-[#1A1A2E]">AIが記事を推敲中です</span>
                  </div>
                  <span className="text-xs font-semibold text-[#0A2540] tabular-nums">
                    {streamText.length.toLocaleString()}文字
                  </span>
                </div>
                <div
                  ref={streamScrollRef}
                  className="px-6 py-5 overflow-y-auto text-sm leading-relaxed text-[#334155] whitespace-pre-wrap min-h-[55vh] max-h-[72vh]"
                >
                  {streamText}
                  <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-[#009AE0] animate-pulse" aria-hidden />
                </div>
                <div className="px-5 py-2.5 border-t border-[#F1F5F9] text-xs text-[#94A3B8]">
                  推敲中です。キャンセルする場合は下の「記事を修正する」で戻れます。
                </div>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center">
                <div className="w-full max-w-4xl space-y-3">
                  <GeminiLoadingCard />
                  <p className="text-xs text-[#64748B]">
                    推敲中です。キャンセルする場合は下の「記事を修正する」で戻れます。
                  </p>
                </div>
              </div>
            )
          )}

          {/* エラー */}
          {geminiStatus === 'error' && geminiError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-5 py-4 space-y-3">
              <p className="text-sm font-medium text-red-800">推敲できませんでした</p>
              <p className="text-sm text-red-700">{geminiError}</p>
              {onRetry && (
                <Button variant="primary" size="md" onClick={onRetry}>
                  再度推敲する
                </Button>
              )}
            </div>
          )}

          {/* 推敲サマリー */}
          {geminiStatus === 'success' && (() => {
            const origLen = article.originalContent.length
            const refLen = refinedContent.length
            const diff = refLen - origLen
            const titleChanged = Boolean(article.refinedTitle) && article.refinedTitle !== article.title
            return (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span className="font-semibold text-blue-800">推敲サマリー</span>
                <span className="text-blue-700">タイトル: {titleChanged ? '変更あり' : '変更なし'}</span>
                <span className="text-blue-700">
                  文字数: {origLen.toLocaleString()} → {refLen.toLocaleString()} ({diff >= 0 ? '+' : ''}{diff.toLocaleString()})
                </span>
              </div>
            )
          })()}

          {/* 推敲後（フル幅・編集可） */}
          {geminiStatus === 'success' && (
            <div className="flex flex-col bg-white rounded-xl border border-[#D0E3F0] overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#D0E3F0]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#16A34A] uppercase tracking-wider">
                    推敲後
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                    AI推敲済み・編集できます
                  </span>
                </div>
                <button
                  onClick={handleCopy}
                  className="
                    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                    border border-[#D0E3F0] text-[#0A2540]
                    hover:bg-[#0A2540] hover:text-white hover:border-[#0A2540]
                    transition-colors
                  "
                >
                  {copied ? (
                    <>
                      <Check size={13} className="text-green-500" />
                      コピー済み
                    </>
                  ) : (
                    <>
                      <ClipboardCopy size={13} />
                      全文コピー
                    </>
                  )}
                </button>
              </div>
              <div className="px-5 py-3 border-b border-[#D0E3F0]">
                <label className="block text-xs font-semibold text-[#16A34A] uppercase tracking-wider mb-1.5">
                  記事タイトル
                </label>
                <input
                  type="text"
                  value={article.refinedTitle || article.title}
                  onChange={e => onRefinedTitleChange?.(e.target.value)}
                  placeholder="推敲後のタイトル"
                  className="
                    w-full px-4 py-2 rounded-lg border border-[#D0E3F0]
                    text-[#1A1A2E] placeholder-[#CBD5E1] text-sm
                    focus:outline-none focus:ring-2 focus:ring-[#0A2540]/30 focus:border-[#0A2540]
                    transition-all
                  "
                />
              </div>
              <textarea
                value={refinedContent}
                onChange={e => onRefinedContentChange(e.target.value)}
                className="
                  flex-1 px-6 py-5
                  bg-white text-[#1A1A2E] text-sm leading-relaxed resize-y
                  min-h-[65vh]
                  focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#0A2540]/20
                  transition-all
                "
              />
            </div>
          )}
        </div>

        {/* 右：StepIndicator（固定幅） */}
        <div className="flex-shrink-0 w-[140px] pt-2">
          <StepIndicator currentStep={2} onStepClick={onStepClick} />
        </div>
      </div>

      {/* 下：ナビゲーションボタン */}
      <div className="flex justify-between mt-8">
        <Button variant="ghost" size="md" onClick={onBack}>
          <ArrowLeft size={16} />
          記事を修正する
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={onNext}
          disabled={geminiStatus !== 'success' || !refinedContent.trim()}
        >
          ③ 画像を生成する
          <ArrowRight size={18} />
        </Button>
      </div>

      {/* トースト通知 */}
      <div
        className={`
          fixed bottom-6 right-6 z-50
          flex items-center gap-2 px-4 py-3
          bg-[#16A34A] text-white text-sm font-medium rounded-xl shadow-lg
          transition-all duration-300
          ${showToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}
        `}
      >
        <CheckCircle size={16} />
        推敲が完了しました
      </div>
    </div>
  )
}
