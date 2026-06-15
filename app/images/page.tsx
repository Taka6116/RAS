'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { ImageIcon, Trash2, Calendar, Search, Download } from 'lucide-react'

interface GeneratedImageMeta {
  id: string
  key: string
  title: string
  targetKeyword: string
  prompt: string
  createdAt: string
}

const PAGE_SIZE = 24

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
  } catch {
    return ''
  }
}

export default function ImagesPage() {
  const [images, setImages] = useState<GeneratedImageMeta[]>([])
  const [mounted, setMounted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const reload = async () => {
    try {
      const res = await fetch('/api/images', { cache: 'no-store' })
      const data = await res.json()
      if (Array.isArray(data?.images)) setImages(data.images)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    reload().then(() => setMounted(true))
  }, [])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [searchQuery])

  const handleDeleteConfirmed = async () => {
    if (!deleteTargetId) return
    try {
      await fetch('/api/images', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTargetId }),
      })
    } catch {
      /* ignore */
    }
    setDeleteTargetId(null)
    await reload()
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return images
    return images.filter(img => {
      const title = (img.title || '').toLowerCase()
      const kw = (img.targetKeyword || '').toLowerCase()
      return title.includes(q) || kw.includes(q)
    })
  }, [images, searchQuery])

  const visible = filtered.slice(0, visibleCount)

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #0056A0 0%, #009AE0 60%, #33C0F0 100%)',
              boxShadow: '0 2px 10px rgba(0,154,224,0.30)',
            }}
          >
            <ImageIcon size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1A1A2E]">画像ライブラリ</h1>
            <p className="text-sm text-[#64748B]">RAS で生成した画像の一覧（クリックでダウンロード）</p>
          </div>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="タイトル・キーワードで検索"
            className="pl-9 pr-4 py-2 rounded-lg text-sm border border-[#D0E3F0] bg-white text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#009AE0]/30 w-64"
          />
        </div>
      </div>

      {!mounted ? (
        <div className="text-center py-20 text-[#94A3B8] text-sm">読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <ImageIcon size={40} className="mx-auto text-[#CBD5E1] mb-3" />
          <p className="text-[#64748B] text-sm">
            まだ生成画像がありません。記事作成の画像生成フェーズで画像を生成すると、ここに保存されます。
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {visible.map(img => (
              <div
                key={img.id}
                className="rounded-xl overflow-hidden bg-white border border-[#E2E8F0] hover:shadow-lg transition-shadow group"
              >
                <a
                  href={`/api/images/file/${img.id}`}
                  download={`${img.id}.jpg`}
                  className="block relative aspect-video bg-[#F1F5F9]"
                >
                  <Image
                    src={`/api/images/file/${img.id}`}
                    alt={img.title || 'generated image'}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Download size={24} className="text-white drop-shadow" />
                  </div>
                </a>
                <div className="p-3">
                  <p className="text-xs font-semibold text-[#1A1A2E] line-clamp-2 leading-snug mb-1.5">
                    {img.title || '（無題）'}
                  </p>
                  {img.targetKeyword && (
                    <p className="text-[11px] text-[#0080C0] truncate mb-1.5">{img.targetKeyword}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[11px] text-[#94A3B8]">
                      <Calendar size={11} />
                      {formatDate(img.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(img.id)}
                      className="text-[#CBD5E1] hover:text-red-500 transition-colors"
                      aria-label="削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
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

      {/* 削除確認ダイアログ */}
      {deleteTargetId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
          onClick={() => setDeleteTargetId(null)}
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
                onClick={() => setDeleteTargetId(null)}
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
