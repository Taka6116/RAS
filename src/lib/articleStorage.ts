import { SavedArticle, ArticleSummary } from './types'

const API_BASE = '/api/articles'

export async function getAllArticles(): Promise<SavedArticle[]> {
  try {
    const res = await fetch(API_BASE)
    if (!res.ok) throw new Error(`GET ${res.status}`)
    const data = await res.json()
    return data.articles ?? []
  } catch (e) {
    console.error('getAllArticles error:', e)
    return []
  }
}

/** 一覧表示用の軽量サマリーを取得（本文・base64画像を含まない） */
export async function getArticleSummaries(): Promise<ArticleSummary[]> {
  try {
    const res = await fetch(`${API_BASE}?mode=summary`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`GET ${res.status}`)
    const data = await res.json()
    return data.articles ?? []
  } catch (e) {
    console.error('getArticleSummaries error:', e)
    return []
  }
}

/** null を指定したフィールドはサーバー側で削除される */
export type ArticlePatch = { [K in keyof SavedArticle]?: SavedArticle[K] | null }

/** 記事の一部フィールドだけをサーバー側でマージ更新する（全文の往復なし） */
export async function patchArticle(id: string, updates: ArticlePatch): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '記事の更新に失敗しました')
  }
}

export async function saveArticle(article: SavedArticle): Promise<void> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(article),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '記事の保存に失敗しました')
  }
}

export async function deleteArticle(id: string): Promise<void> {
  const res = await fetch(API_BASE, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '記事の削除に失敗しました')
  }
}

export async function getArticleById(id: string): Promise<SavedArticle | null> {
  try {
    const res = await fetch(`${API_BASE}/${id}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return data.article ?? null
  } catch (e) {
    console.error('getArticleById error:', e)
    return null
  }
}

export async function updateArticleStatus(
  id: string,
  status: SavedArticle['status'],
  wordpressUrl?: string,
  wordpressPostStatus?: string
): Promise<void> {
  const updates: Partial<SavedArticle> = { status }
  if (wordpressUrl) updates.wordpressUrl = wordpressUrl
  if (wordpressPostStatus !== undefined) updates.wordpressPostStatus = wordpressPostStatus
  await patchArticle(id, updates)
}
