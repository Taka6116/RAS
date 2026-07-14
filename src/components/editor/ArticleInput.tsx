'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArticleData, Step } from '@/lib/types'
import { SavedPrompt, getAllPrompts } from '@/lib/promptStorage'
import { SavedKeyword, getAllKeywords } from '@/lib/keywordStorage'
import StepIndicator from './StepIndicator'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ArrowRight, Trash2, ChevronDown, Check } from 'lucide-react'

interface ArticleInputProps {
  article: ArticleData
  onTitleChange: (title: string) => void
  onTargetKeywordChange: (kw: string) => void
  onContentChange: (content: string) => void
  onNext: () => void
  onClear?: () => void
  onStepClick?: (step: Step) => void
}

export default function ArticleInput({
  article,
  onTitleChange,
  onTargetKeywordChange,
  onContentChange,
  onNext,
  onClear,
  onStepClick,
}: ArticleInputProps) {
  const searchParams = useSearchParams()
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatingStep, setGeneratingStep] = useState<string>('loading')
  const [streamPreview, setStreamPreview] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([])
  const [savedKeywords, setSavedKeywords] = useState<SavedKeyword[]>([])
  const [showPromptDropdown, setShowPromptDropdown] = useState(false)
  const [showKeywordDropdown, setShowKeywordDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const keywordDropdownRef = useRef<HTMLDivElement>(null)
  const kwParamsApplied = useRef(false)

  useEffect(() => {
    if (kwParamsApplied.current) return
    const kwPrompt = searchParams.get('kwPrompt')
    const kwTarget = searchParams.get('kwTarget')
    if (kwPrompt || kwTarget) {
      kwParamsApplied.current = true
      if (kwPrompt && !prompt) setPrompt(kwPrompt)
      if (kwTarget && !(article.targetKeyword ?? '').trim()) onTargetKeywordChange(kwTarget)
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadLibraries = useCallback(async () => {
    const [p, k] = await Promise.all([getAllPrompts(), getAllKeywords()])
    setSavedPrompts(p)
    setSavedKeywords(k)
  }, [])

  useEffect(() => {
    reloadLibraries()
  }, [reloadLibraries])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reloadLibraries()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reloadLibraries])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node
      if (dropdownRef.current?.contains(t)) return
      if (keywordDropdownRef.current?.contains(t)) return
      setShowPromptDropdown(false)
      setShowKeywordDropdown(false)
    }
    if (showPromptDropdown || showKeywordDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showPromptDropdown, showKeywordDropdown])

  const handleSelectPrompt = (p: SavedPrompt) => {
    setPrompt(p.content)
    setShowPromptDropdown(false)
  }

  const handleSelectKeyword = (k: SavedKeyword) => {
    onTargetKeywordChange(k.content)
    setShowKeywordDropdown(false)
  }

  const hasDraft = Boolean(article.title.trim() || article.originalContent.trim())
  const isDisabled = !article.title.trim() || !article.originalContent.trim()
  const charCount = article.originalContent.length

  const charBadge = () => {
    if (charCount === 0) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F1F5F9] text-[#94A3B8]">
          0文字
        </span>
      )
    }
    if (charCount < 100) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200">
          {charCount.toLocaleString()}文字 · もう少し入力してください
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        {charCount.toLocaleString()}文字
      </span>
    )
  }

  const handleGenerate = async () => {
    const trimmed = prompt.trim()
    const kw = (article.targetKeyword ?? '').trim()
    if (!trimmed || !kw || generating) return
    setDraftError(null)
    setGenerating(true)
    setGeneratingStep('loading')
    setStreamPreview('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      // 資料読み込み（今回は即時切り替えでもよいが少し見せるため待機）
      await new Promise(resolve => setTimeout(resolve, 800))

      setGeneratingStep('writing')
      const res = await fetch('/api/gemini/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          targetKeyword: article.targetKeyword ?? '',
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        // エラーはJSONとは限らない（ゲートウェイの504はHTML/テキストを返す）
        let message = `一次執筆の生成に失敗しました（HTTP ${res.status}）`
        try {
          const data = await res.json()
          if (data?.error) message = data.error
        } catch {
          if (res.status === 504) {
            message = '生成がタイムアウトしました。時間をおいて再度お試しください。'
          }
        }
        throw new Error(message)
      }

      const contentType = res.headers.get('content-type') ?? ''
      let title = ''
      let content = ''

      if (contentType.includes('ndjson') && res.body) {
        // NDJSONストリーミング: 生成テキストを逐次表示しながら完了イベントを待つ
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let accumulated = ''
        let finished = false
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            let event: { type?: string; text?: string; title?: string; content?: string; error?: string }
            try {
              event = JSON.parse(line)
            } catch {
              continue
            }
            if (event.type === 'chunk' && typeof event.text === 'string') {
              accumulated += event.text
              setStreamPreview(accumulated)
            } else if (event.type === 'reset') {
              accumulated = ''
              setStreamPreview('')
            } else if (event.type === 'done') {
              title = typeof event.title === 'string' ? event.title.trim() : ''
              content = typeof event.content === 'string' ? event.content : ''
              finished = true
            } else if (event.type === 'error') {
              throw new Error(event.error || '一次執筆の生成に失敗しました')
            }
          }
        }
        if (!finished) throw new Error('生成が中断されました。再度お試しください。')
      } else {
        // 旧形式（JSON一括）へのフォールバック
        const data = await res.json()
        title = typeof data.title === 'string' ? data.title.trim() : ''
        content = typeof data.content === 'string' ? data.content : ''
      }

      setGeneratingStep('done')
      await new Promise(resolve => setTimeout(resolve, 600))

      if (title) onTitleChange(title)
      if (content) onContentChange(content)
      setGenerating(false)
    } catch (e) {
      if (controller.signal.aborted) {
        // ユーザーによるキャンセル: エラー表示なしで閉じる
        setGenerating(false)
      } else {
        setDraftError(e instanceof Error ? e.message : '一次執筆の生成に失敗しました')
        setGenerating(false)
      }
    } finally {
      abortRef.current = null
      setStreamPreview('')
    }
  }

  const handleCancelGenerate = () => {
    abortRef.current?.abort()
  }

  const handleClear = () => {
    setPrompt('')
    setDraftError(null)
    onTitleChange('')
    onContentChange('')
    onClear?.()
  }

  return (
    <div className="w-full pt-6 pb-12">
      <div className="flex gap-8 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          <Card className="relative overflow-hidden">
            {/* 生成中のローディングオーバーレイ */}
            {generating && (
              <GeneratingLoader
                step={generatingStep}
                previewText={streamPreview}
                onCancel={handleCancelGenerate}
              />
            )}

            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-[#1A1A2E] mb-0.5">一次執筆</h2>
                <p className="text-sm text-[#64748B]">
                  プロンプトで指示を出し、Geminiが記事のタイトル・本文を生成します。
                </p>
              </div>
              {hasDraft && onClear && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#DC2626] hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                >
                  <Trash2 size={13} />
                  入力をクリア
                </button>
              )}
            </div>

            {/* プロンプト */}
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1.5 relative">
                  <label className="block text-sm font-semibold text-[#1A1A2E]">
                    プロンプト（指示）
                  </label>
                  {savedPrompts.length > 0 && (
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowPromptDropdown(!showPromptDropdown)}
                        className="text-xs text-[#009AE0] font-medium hover:underline flex items-center gap-1"
                      >
                        保存済みプロンプトから入力 <ChevronDown size={14} />
                      </button>
                      {showPromptDropdown && (
                        <div className="absolute right-0 top-full mt-2 w-[320px] bg-white border border-[#D0E3F0] shadow-lg rounded-lg z-10 max-h-[300px] overflow-y-auto">
                          {savedPrompts.map(p => (
                            <button
                              key={p.id}
                              onClick={() => handleSelectPrompt(p)}
                              className="w-full text-left px-4 py-3 border-b border-[#D0E3F0] last:border-0 hover:bg-[#F8FAFC] transition-colors"
                            >
                              <div className="font-bold text-sm text-[#1A1A2E] mb-1">{p.title}</div>
                              <div className="text-xs text-[#64748B] line-clamp-2">{p.content}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="例：クラウドERP導入の進め方について、製品選定・導入ステップ・注意点を分かりやすく2000字程度で記事を書いてください"
                  className="
                    w-full px-4 py-3 rounded-lg border border-[#D0E3F0]
                    text-[#1A1A2E] placeholder-[#CBD5E1]
                    focus:outline-none focus:ring-2 focus:ring-[#0A2540]/30 focus:border-[#0A2540]
                    transition-all text-sm resize-y
                    min-h-[140px]
                  "
                  disabled={generating}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <label className="block text-sm font-semibold text-[#1A1A2E] min-w-0">
                    ターゲットキーワード
                    <span className="block mt-0.5 text-xs font-semibold text-red-600">
                      ※　必須　必ず設定してください！
                    </span>
                  </label>
                  <div className="relative shrink-0" ref={keywordDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowKeywordDropdown(!showKeywordDropdown)}
                      className="text-xs text-[#009AE0] font-medium hover:underline flex items-center gap-1 whitespace-nowrap"
                    >
                      保存済みキーワードから入力 <ChevronDown size={14} />
                    </button>
                    {showKeywordDropdown && (
                      <div className="absolute right-0 top-full mt-2 w-[320px] bg-white border border-[#D0E3F0] shadow-lg rounded-lg z-10 max-h-[300px] overflow-y-auto">
                        {savedKeywords.length === 0 ? (
                          <div className="px-4 py-4 text-sm text-[#64748B] leading-relaxed">
                            <p className="mb-3">キーワードライブラリに保存されたセットはまだありません。</p>
                            <Link
                              href="/keywords"
                              className="font-medium text-[#009AE0] hover:underline"
                              onClick={() => setShowKeywordDropdown(false)}
                            >
                              キーワードページで追加する
                            </Link>
                          </div>
                        ) : (
                          savedKeywords.map(k => (
                            <button
                              key={k.id}
                              type="button"
                              onClick={() => handleSelectKeyword(k)}
                              className="w-full text-left px-4 py-3 border-b border-[#D0E3F0] last:border-0 hover:bg-[#F8FAFC] transition-colors"
                            >
                              <div className="font-bold text-sm text-[#1A1A2E] mb-1">{k.title}</div>
                              <div className="text-xs text-[#64748B] line-clamp-2">{k.content}</div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  value={article.targetKeyword ?? ''}
                  onChange={e => onTargetKeywordChange(e.target.value)}
                  placeholder="例：クラウドERP 導入, NetSuite 導入支援, Dynamics 365 比較, ERP 業務効率化, SaaS 導入 中小企業, アジャイル ERP"
                  className="w-full px-4 py-3 rounded-lg text-sm border border-[#D0E3F0] text-[#1A1A2E] bg-[#FAFBFC] focus:outline-none focus:ring-2 focus:ring-[#0A2540]/30"
                />
              </div>

              <div className="flex justify-start">
                <Button
                  variant="primary"
                  disabled={!prompt.trim() || !(article.targetKeyword ?? '').trim() || generating}
                  onClick={handleGenerate}
                  className="py-3 px-6 h-auto"
                >
                  {generating ? (
                    <span className="font-bold text-base">記事を作成中...</span>
                  ) : (
                    <span className="font-bold text-base">記事作成</span>
                  )}
                </Button>
              </div>

              {draftError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                  {draftError}
                </div>
              )}
            </div>

            {/* 生成後のタイトル・本文（編集可） */}
            {hasDraft && (
              <>
                <hr className="my-6 border-[#D0E3F0]" />
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">
                      記事タイトル
                    </label>
                    <input
                      type="text"
                      value={article.title}
                      onChange={e => onTitleChange(e.target.value)}
                      placeholder="記事のタイトル"
                      className="
                        w-full px-4 py-2.5 rounded-lg border border-[#D0E3F0]
                        text-[#1A1A2E] placeholder-[#CBD5E1]
                        focus:outline-none focus:ring-2 focus:ring-[#0A2540]/30 focus:border-[#0A2540]
                        transition-all text-sm
                      "
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">
                      記事本文
                    </label>
                    <textarea
                      value={article.originalContent}
                      onChange={e => onContentChange(e.target.value)}
                      placeholder="記事本文"
                      className="
                        w-full px-4 py-3 rounded-lg border border-[#D0E3F0]
                        text-[#1A1A2E] placeholder-[#CBD5E1]
                        focus:outline-none focus:ring-2 focus:ring-[#0A2540]/30 focus:border-[#0A2540]
                        transition-all text-sm resize-y
                        min-h-[320px]
                      "
                    />
                    <div className="flex justify-end mt-1.5">{charBadge()}</div>
                  </div>
                </div>
                <div className="flex justify-end mt-6 pt-5 border-t border-[#D0E3F0]">
                  <Button
                    variant="primary"
                    disabled={isDisabled}
                    onClick={onNext}
                    className="py-4 px-8 h-auto"
                  >
                    <span className="font-bold text-base">Geminiで推敲する</span>
                    <ArrowRight size={18} className="ml-2" />
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
        <div className="flex-shrink-0 w-[140px] pt-2">
          <StepIndicator currentStep={1} onStepClick={onStepClick} />
        </div>
      </div>
    </div>
  )
}

const GENERATING_CHECKLIST: { id: string; label: string }[] = [
  { id: 'research', label: '参照・リサーチ準備' },
  { id: 'outline', label: '構成・論点の整理' },
  { id: 'draft', label: '本文ドラフト生成' },
  { id: 'finish', label: '反映・仕上げ' },
]

/**
 * チェックリスト各行の状態を progress % に応じて均等に遷移させる。
 * 4ステップを 0→30→55→78→100 で区切り、各ステップに体感上の時間を持たせる。
 */
function checklistRowState(
  step: string,
  index: number,
  loadingPhase: number,
  progress: number
): 'done' | 'active' | 'pending' {
  if (step === 'done') return 'done'
  if (step === 'loading') {
    if (index < loadingPhase) return 'done'
    if (index === loadingPhase) return 'active'
    return 'pending'
  }
  if (step === 'writing') {
    const thresholds = [30, 55, 78]
    let activeIdx = 0
    for (const t of thresholds) {
      if (progress >= t) activeIdx++
    }
    if (index < activeIdx) return 'done'
    if (index === activeIdx) return 'active'
    return 'pending'
  }
  return 'pending'
}

function checklistActiveHint(
  step: string,
  index: number,
  loadingPhase: number,
  progress: number
): string | null {
  const state = checklistRowState(step, index, loadingPhase, progress)
  if (state !== 'active') return null
  if (step === 'loading' && loadingPhase === 0) return '参照資料を読み込んでいます…'
  if (step === 'loading' && loadingPhase === 1) return '論点を整理しています…'
  if (step === 'writing' && index === 0) return '参照資料を確認しています…'
  if (step === 'writing' && index === 1) return '構成・論点を整理しています…'
  if (step === 'writing' && index === 2) return '本文ドラフトを生成しています…'
  if (step === 'writing' && index === 3) return '形式を整え、仕上げています…'
  return '処理しています…'
}

/** 一次執筆の想定文字数（進捗計算の分母。本文2500〜3500字＋FAQを想定） */
const EXPECTED_DRAFT_CHARS = 3800

function GeneratingLoader({
  step,
  previewText,
  onCancel,
}: {
  step: string
  previewText: string
  onCancel?: () => void
}) {
  const [progress, setProgress] = useState(0)
  const [loadingPhase, setLoadingPhase] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)
  const previewLenRef = useRef(0)
  previewLenRef.current = previewText.length
  const previewScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (step !== 'loading') {
      setLoadingPhase(0)
      return
    }
    setLoadingPhase(0)
    const t = window.setTimeout(() => setLoadingPhase(1), 420)
    return () => window.clearTimeout(t)
  }, [step])

  useEffect(() => {
    if (step !== 'loading') return
    setProgress(3 + loadingPhase * 4)
  }, [step, loadingPhase])

  useEffect(() => {
    if (step !== 'writing') return
    // 実際に生成された文字数ベースの進捗を主軸にし、
    // チャンクが届かない間だけ時間ベースでゆっくり補間する（96%で頭打ち）
    let simulated = 8
    setProgress(simulated)
    const timer = setInterval(() => {
      simulated += (60 - simulated) * 0.02
      const charBased = previewLenRef.current > 0
        ? 12 + Math.min(84, (previewLenRef.current / EXPECTED_DRAFT_CHARS) * 84)
        : 0
      setProgress(prev => {
        const next = Math.min(96, Math.floor(Math.max(simulated, charBased)))
        return Math.max(prev, next)
      })
    }, 400)
    return () => clearInterval(timer)
  }, [step])

  useEffect(() => {
    if (step === 'done') setProgress(100)
  }, [step])

  // 生成テキストのプレビューを常に最下部へスクロール
  useEffect(() => {
    const el = previewScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [previewText])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generating-loader-title"
      aria-busy="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 max-w-md w-full p-6 sm:p-8 text-left">
        <div className="flex items-start gap-4 mb-6">
          <div
            className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #0056A0 0%, #009AE0 60%, #33C0F0 100%)',
              boxShadow: '0 2px 10px rgba(0,154,224,0.35)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
              <path d="M12 2 C12 2 16 8 16 12 C16 16 12 22 12 22 C12 22 8 16 8 12 C8 8 12 2 12 2Z" fill="white" opacity="0.9"/>
              <path d="M2 12 C2 12 8 8 12 8 C16 8 22 12 22 12 C22 12 16 16 12 16 C8 16 2 12 2 12Z" fill="white" opacity="0.6"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 id="generating-loader-title" className="text-base font-bold text-[#1A1A2E] leading-snug">
              AIが執筆しています
            </h2>
            <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">
              編集方針に沿って下書きを生成しています
            </p>
          </div>
          <div
            className="flex-shrink-0 text-2xl font-bold tabular-nums leading-none pt-0.5"
            style={{ color: '#0A2540' }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`生成進捗 ${progress} パーセント`}
          >
            {progress}%
          </div>
        </div>

        <div className="mb-6">
          <div className="h-2 rounded-full overflow-hidden bg-[#D0E3F0]">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${progress}%`,
                backgroundColor: '#0A2540',
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] tracking-[0.08em] font-semibold uppercase text-[#94A3B8]">
            <span>準備</span>
            <span>仕上げ</span>
          </div>
        </div>

        {/* 生成中の本文プレビュー（ストリーミング） */}
        {previewText && (
          <div className="mb-6">
            <p className="text-[10px] tracking-[0.08em] font-semibold uppercase text-[#94A3B8] mb-1.5">
              生成中の本文（{previewText.length.toLocaleString()}文字）
            </p>
            <div
              ref={previewScrollRef}
              className="max-h-40 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3 text-xs leading-relaxed text-[#475569] whitespace-pre-wrap"
            >
              {previewText}
              <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-[#009AE0] animate-pulse" aria-hidden />
            </div>
          </div>
        )}

        <ul className="space-y-2 mb-6 list-none p-0 m-0">
          {GENERATING_CHECKLIST.map((item, i) => {
            const state = checklistRowState(step, i, loadingPhase, progress)
            const hint = checklistActiveHint(step, i, loadingPhase, progress)
            return (
              <li
                key={item.id}
                className={`flex items-start gap-3 rounded-xl transition-all duration-300 ${
                  state === 'active'
                    ? 'bg-[#F8FAFC] shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)] -mx-1 px-3 py-2.5'
                    : 'py-1 px-1'
                }`}
              >
                {state === 'done' && (
                  <span
                    className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: '#DBEAFE' }}
                  >
                    <Check className="w-3 h-3 text-blue-700" strokeWidth={2.5} aria-hidden />
                  </span>
                )}
                {state === 'active' && (
                  <span
                    className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center bg-white ${
                      reduceMotion ? '' : 'animate-loader-ring'
                    }`}
                    style={{ borderColor: '#0A2540' }}
                    aria-current="step"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${reduceMotion ? '' : 'animate-loader-dot-soft'}`}
                      style={{ backgroundColor: '#0A2540' }}
                    />
                  </span>
                )}
                {state === 'pending' && (
                  <span
                    className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 border-[#D0E3F0] bg-white"
                    aria-hidden
                  />
                )}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0">
                    <span
                      className={`text-xs sm:text-sm leading-snug ${
                        state === 'pending' ? 'text-[#94A3B8]' : 'text-[#334155]'
                      } ${state === 'active' ? 'font-semibold text-[#1A1A2E]' : ''}`}
                    >
                      {item.label}
                    </span>
                    {state === 'active' && !reduceMotion && (
                      <span className="inline-flex gap-1 items-center" aria-hidden>
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#0A2540] animate-loader-dot-soft" />
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-[#0A2540] animate-loader-dot-soft"
                          style={{ animationDelay: '120ms' }}
                        />
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-[#0A2540] animate-loader-dot-soft"
                          style={{ animationDelay: '240ms' }}
                        />
                      </span>
                    )}
                    {state === 'active' && reduceMotion && (
                      <span className="text-xs font-semibold text-[#0A2540]" aria-hidden>
                        …
                      </span>
                    )}
                  </div>
                  {hint && (
                    <p className="text-[10px] sm:text-[11px] text-[#64748B] mt-1.5 leading-relaxed motion-safe:transition-opacity">
                      {hint}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center justify-between pt-5 border-t border-[#F1F5F9]">
          <div className="flex items-center -space-x-2" aria-hidden>
            <div
              className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-[#64748B]"
              style={{ background: '#F1F5F9' }}
            >
              You
            </div>
            <div
              className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-[#0A2540]"
              style={{ background: '#EEF2FF' }}
            >
              AI
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={!onCancel || step === 'done'}
            className="text-[11px] font-semibold tracking-wide text-[#64748B] hover:text-[#DC2626] transition-colors disabled:text-[#CBD5E1] disabled:cursor-not-allowed"
          >
            生成をキャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

