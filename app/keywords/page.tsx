'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react'
import { SavedKeyword, getAllKeywords, saveKeyword, deleteKeyword } from '@/lib/keywordStorage'
import Button from '@/components/ui/Button'

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<SavedKeyword[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SavedKeyword | null>(null)

  const loadKeywords = useCallback(async () => {
    setLoading(true)
    const data = await getAllKeywords()
    setKeywords(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadKeywords()
  }, [loadKeywords])

  const handleCreateNew = () => {
    setIsCreating(true)
    setEditingId(null)
    setEditTitle('')
    setEditContent('')
  }

  const handleEdit = (k: SavedKeyword) => {
    setIsCreating(false)
    setEditingId(k.id)
    setEditTitle(k.title)
    setEditContent(k.content)
  }

  const handleCancel = () => {
    setIsCreating(false)
    setEditingId(null)
  }

  const handleSave = async () => {
    if (!editTitle.trim() || !editContent.trim()) return
    setSaving(true)
    await saveKeyword({
      id: editingId || undefined,
      title: editTitle.trim(),
      content: editContent.trim(),
    })
    await loadKeywords()
    setIsCreating(false)
    setEditingId(null)
    setSaving(false)
  }

  const handleRequestDelete = (k: SavedKeyword) => {
    setDeleteTarget(k)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    await deleteKeyword(deleteTarget.id)
    await loadKeywords()
    if (editingId === deleteTarget.id) {
      setEditingId(null)
      setIsCreating(false)
    }
    setDeleteTarget(null)
    setSaving(false)
  }

  const handleCloseDeleteModal = () => {
    setDeleteTarget(null)
  }

  const isEditorOpen = isCreating || editingId !== null

  if (loading) {
    return (
      <div className="w-full py-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-20 text-[#64748B]">
          <Loader2 size={24} className="animate-spin mr-3" />
          キーワードを読み込み中...
        </div>
      </div>
    )
  }

  return (
    <div className="w-full py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">キーワードライブラリ</h1>
          <p className="text-sm text-[#64748B]">
            よく使うキーワードを保存して、一次執筆でいつでも呼び出せるように管理します。
          </p>
        </div>
        {!isEditorOpen && (
          <Button variant="primary" onClick={handleCreateNew}>
            <Plus size={18} className="mr-2" />
            キーワードを追加
          </Button>
        )}
      </div>

      {isEditorOpen && (
        <div className="bg-white border border-[#D0E3F0] rounded-xl p-6 mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#1A1A2E]">
              {isCreating ? '新しいキーワードセット' : 'キーワードセットを編集'}
            </h2>
            <button type="button" onClick={handleCancel} className="text-[#64748B] hover:text-[#1A1A2E]">
              <X size={20} />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">
                セット名（用途など）
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="例：ERP導入コラム用"
                className="w-full px-4 py-2.5 rounded-lg border border-[#D0E3F0] focus:ring-2 focus:ring-[#0A2540]/30 focus:border-[#0A2540] outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">
                ターゲットキーワード（カンマ区切り）
              </label>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                placeholder="例：クラウドERP 導入, NetSuite 導入支援, Dynamics 365 比較, ERP 業務効率化, SaaS 導入 中小企業, アジャイル ERP"
                className="w-full px-4 py-3 rounded-lg border border-[#D0E3F0] focus:ring-2 focus:ring-[#0A2540]/30 focus:border-[#0A2540] outline-none transition-all text-sm resize-y min-h-[120px]"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={handleCancel}>
                キャンセル
              </Button>
              <Button variant="primary" disabled={!editTitle.trim() || !editContent.trim() || saving} onClick={handleSave}>
                {saving ? (
                  <Loader2 size={18} className="mr-2 animate-spin" />
                ) : (
                  <Check size={18} className="mr-2" />
                )}
                {saving ? '保存中...' : '保存する'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {keywords.length === 0 && !isEditorOpen ? (
          <div className="bg-white border border-[#D0E3F0] rounded-xl p-12 text-center text-[#64748B]">
            保存されているキーワードセットはありません。
          </div>
        ) : (
          keywords.map(k => (
            <div
              key={k.id}
              className="bg-white border border-[#D0E3F0] rounded-xl p-5 hover:border-[#CBD5E1] transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-4">
                  <h3 className="font-bold text-[#1A1A2E] text-base mb-2">{k.title}</h3>
                  <p className="text-sm text-[#64748B] whitespace-pre-wrap line-clamp-3">{k.content}</p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => handleEdit(k)}
                    className="p-2 text-[#64748B] hover:text-[#0A2540] hover:bg-[#F1F5F9] rounded-lg transition-colors"
                    title="編集"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRequestDelete(k)}
                    className="p-2 text-[#64748B] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="削除"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border border-[#D0E3F0] shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-[#1A1A2E] mb-1">このキーワードセットを削除しますか？</h2>
                <p className="text-xs text-[#64748B]">
                  {`「${deleteTarget.title.slice(0, 30)}${deleteTarget.title.length > 30 ? '…' : ''}」を削除します。よろしいですか？`}
                </p>
              </div>
              <button type="button" onClick={handleCloseDeleteModal} className="text-[#94A3B8] hover:text-[#1A1A2E]">
                <X size={18} />
              </button>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={handleCloseDeleteModal}>
                キャンセル
              </Button>
              <Button variant="primary" disabled={saving} onClick={handleConfirmDelete}>
                {saving ? '削除中...' : '削除する'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
