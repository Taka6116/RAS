'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { ImageIcon, Trash2, Calendar, Search, Download, Upload, X, Sparkles } from 'lucide-react'
import PageGroupTabs from '@/components/PageGroupTabs'

type ImageSource = 'generated' | 'imported'

interface ImageMeta {
  id: string
  key: string
  source: ImageSource
  title: string
  targetKeyword?: string
  filename?: string
  prompt?: string
  createdAt: string
}

const PAGE_SIZE = 24

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
  } catch { return '' }
}

function imageUrl(img: ImageMeta): string {
  return `/api/images/file/${img.id}?source=${img.source}`
}

export default function ImagesPage() {
  const [tab, setTab] = useState<'all' | ImageSource>('all')
  const [images, setImages] = useState<ImageMeta[]>([])
  const [mounted, setMounted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [deleteTarget, setDeleteTarget] = useState<ImageMeta | null>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importTitle, setImportTitle] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/images?source=all', { cache: 'no-store' })
      const data = await res.json()
      if (Array.isArray(data?.images)) setImages(data.images)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    reload().then(() => setMounted(true))
  }, [reload])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [searchQuery, tab])

  const handleImport = useCallback(async (fileList: FileList | Iterable<File> | null) => {
    if (!fileList) return
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return

    setImporting(true)
    setImportError(null)
    setImportProgress({ done: 0, total: files.length })
    const failedNames: string[] = []

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!
        try {
          const form = new FormData()
          form.append('file', file)
          // 複数枚まとめてドロップした場合は各ファイル名を使う（指定タイトルは1枚の時のみ適用）
          form.append('title', (files.length === 1 && importTitle) || file.name.replace(/\.[^.]+$/, ''))
          const res = await fetch('/api/images/import', { method: 'POST', body: form })
          const data = await res.json()
          if (!res.ok) throw new Error(data?.error || 'インポートに失敗しました')
        } catch {
          failedNames.push(file.name)
        } finally {
          setImportProgress({ done: i + 1, total: files.length })
        }
      }
      if (failedNames.length > 0) {
        setImportError(`一部の画像をインポートできませんでした: ${failedNames.join(', ')}`)
      }
      setImportTitle('')
      await reload()
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }, [importTitle, reload])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleImport(e.target.files)
    e.target.value = ''
  }, [handleImport])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current += 1
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragOver(false)
    handleImport(e.dataTransfer.files)
  }, [handleImport])

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return
    try {
      await fetch('/api/images', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id, source: deleteTarget.source }),
      })
    } catch { /* ignore */ }
    setDeleteTarget(null)
    await reload()
  }

  const filtered = useMemo(() => {
    let list = images
    if (tab !== 'all') list = list.filter(img => img.source === tab)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(img => {
        const t = (img.title || '').toLowerCase()
        const kw = (img.targetKeyword || '').toLowerCase()
        const fn = (img.filename || '').toLowerCase()
        return t.includes(q) || kw.includes(q) || fn.includes(q)
      })
    }
    return list
  }, [images, tab, searchQuery])

  const visible = filtered.slice(0, visibleCount)
  const generatedCount = images.filter(i => i.source === 'generated').length
  const importedCount = images.filter(i => i.source === 'imported').length

  const TABS = [
    { key: 'all' as const, label: 'すべて', count: images.length },
    { key: 'generated' as const, label: '生成済み', count: generatedCount },
    { key: 'imported' as const, label: 'インポート済み', count: importedCount },
  ]

  return (
    <div
      className="w-full max-w-6xl mx-auto"
      onDragEnter={handleDragEnter}
      onDragOver={e => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <PageGroupTabs group="library" />
      {dragOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#009AE0]/10 border-4 border-dashed border-[#009AE0] pointer-events-none">
          <p className="text-[#009AE0] text-xl font-bold drop-shadow">ここに画像をドロップしてインポート（複数可）</p>
        </div>
      )}

      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #0056A0 0%, #009AE0 60%, #33C0F0 100%)',
              boxShadow: '0 2px 10px rgba(0,154,224,0.30)',
            }}
          >
            <ImageIcon size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1A1A2E]">画像ライブラリ</h1>
            <p className="text-sm text-[#64748B]">生成・インポートした画像を保存。記事作成時に再利用できます。</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* タイトル入力（インポート前に任意で設定） */}
          <input
            type="text"
            value={importTitle}
            onChange={e => setImportTitle(e.target.value)}
            placeholder="画像タイトル（任意）"
            className="px-3 py-2 text-sm rounded-lg border border-[#D0E3F0] bg-white text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#009AE0]/30 w-44"
          />

          {/* インポートボタン（クリック選択・複数可） */}
          <div className="relative">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileChange}
              disabled={importing}
            />
            <button
              type="button"
              disabled={importing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 whitespace-nowrap"
              style={{
                background: 'linear-gradient(135deg, #0056A0 0%, #009AE0 60%, #33C0F0 100%)',
                boxShadow: '0 2px 8px rgba(0,154,224,0.30)',
              }}
            >
              <Upload size={15} />
              {importing && importProgress
                ? `インポート中... (${importProgress.done}/${importProgress.total})`
                : '画像をインポート'}
            </button>
          </div>

          {/* 検索 */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="検索..."
              className="pl-9 pr-4 py-2 rounded-lg text-sm border border-[#D0E3F0] bg-white text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#009AE0]/30 w-44"
            />
          </div>
        </div>
      </div>

      <p className="mb-4 text-xs text-[#94A3B8]">
        このページ上に画像ファイルをドラッグ＆ドロップしてもインポートできます（複数枚まとめて可）。
      </p>

      {importError && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
          <X size={15} />
          {importError}
          <button type="button" onClick={() => setImportError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* タブ */}
      <div className="flex gap-1 border-b border-[#D0E3F0] mb-5">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="px-4 py-2.5 text-sm font-semibold transition-colors relative"
            style={{ color: tab === t.key ? '#009AE0' : '#64748B' }}
          >
            {t.label}
            <span className="ml-1.5 text-[11px] font-normal opacity-70">({t.count})</span>
            {tab === t.key && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#009AE0] rounded-t" />
            )}
          </button>
        ))}
      </div>

      {!mounted ? (
        <div className="text-center py-20 text-[#94A3B8] text-sm">読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <ImageIcon size={40} className="mx-auto text-[#CBD5E1] mb-3" />
          <p className="text-[#64748B] text-sm">
            {tab === 'imported'
              ? '画像をアップロード、またはこのページにドラッグ＆ドロップ（複数可）してインポートできます。'
              : tab === 'generated'
              ? 'まだ生成画像がありません。記事作成の画像生成フェーズで生成してください。'
              : '画像がありません。記事作成で生成するか、右上からインポート・ドラッグ＆ドロップしてください。'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {visible.map(img => (
              <ImageCard
                key={img.id}
                img={img}
                onDelete={() => setDeleteTarget(img)}
              />
            ))}
          </div>

          {visibleCount < filtered.length && (
            <div className="text-center mt-8">
              <button
                type="button"
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold text-[#0A2540] border border-[#D0E3F0] bg-white hover:bg-[#F0F7FC] transition-colors"
              >
                さらに表示（残り {filtered.length - visibleCount} 件）
              </button>
            </div>
          )}
        </>
      )}

      {/* 削除確認 */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-[#1A1A2E] mb-2">この画像を削除しますか？</h2>
            <p className="text-sm text-[#64748B] mb-6">削除すると元に戻せません。</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-[#0A2540] border border-[#D0E3F0] hover:bg-[#F0F7FC]"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ImageCard({ img, onDelete }: { img: ImageMeta; onDelete: () => void }) {
  const url = imageUrl(img)
  return (
    <div className="rounded-xl overflow-hidden bg-white border border-[#E2E8F0] hover:shadow-lg transition-shadow group">
      <a
        href={url}
        download={img.filename || `${img.id}.jpg`}
        className="block relative aspect-video bg-[#F1F5F9]"
      >
        <Image
          src={url}
          alt={img.title || 'image'}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover"
          unoptimized
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Download size={22} className="text-white drop-shadow" />
        </div>
        {/* sourceバッジ */}
        <span
          className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${
            img.source === 'imported'
              ? 'bg-purple-600 text-white'
              : 'bg-[#009AE0] text-white'
          }`}
        >
          {img.source === 'imported' ? 'インポート' : 'AI生成'}
        </span>
      </a>
      <div className="p-2.5">
        <p className="text-[11px] font-semibold text-[#1A1A2E] line-clamp-2 leading-snug mb-1">
          {img.title || img.filename || '（無題）'}
        </p>
        {img.targetKeyword && (
          <p className="text-[10px] text-[#0080C0] truncate mb-1">{img.targetKeyword}</p>
        )}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[10px] text-[#94A3B8]">
            <Calendar size={10} />
            {formatDate(img.createdAt)}
          </span>
          <button
            type="button"
            onClick={onDelete}
            className="text-[#CBD5E1] hover:text-red-500 transition-colors"
            aria-label="削除"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
