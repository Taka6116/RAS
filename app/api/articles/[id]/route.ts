import { NextRequest, NextResponse } from 'next/server'
import { getS3ObjectAsText, putS3Object } from '@/lib/s3Reference'
import type { SavedArticle } from '@/lib/types'

export const dynamic = 'force-dynamic'

function articleKey(id: string): string {
  return `articles/${id}.json`
}

async function loadArticle(id: string): Promise<SavedArticle | null> {
  const result = await getS3ObjectAsText(articleKey(id))
  if (!result) return null
  try {
    return JSON.parse(result.content) as SavedArticle
  } catch {
    return null
  }
}

/** 単一記事をフル取得（全記事一覧を取らずに済む） */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const article = await loadArticle(params.id)
    if (!article) {
      return NextResponse.json({ error: '記事が見つかりません' }, { status: 404 })
    }
    return NextResponse.json({ article })
  } catch (e) {
    console.error('Article GET error:', e)
    return NextResponse.json({ error: '記事の取得に失敗しました' }, { status: 500 })
  }
}

/**
 * 部分更新。サーバー側で既存JSONにマージして保存するため、
 * クライアントが全文＋base64画像を往復させる必要がない。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const updates = (await request.json()) as Partial<SavedArticle>
    const article = await loadArticle(params.id)
    if (!article) {
      return NextResponse.json({ error: '記事が見つかりません' }, { status: 404 })
    }

    // id と createdAt は上書き不可
    const { id: _id, createdAt: _createdAt, ...rest } = updates
    const merged: SavedArticle = { ...article, ...rest }
    // null 指定のフィールドは削除扱い（予約日時のクリア等）
    for (const [key, value] of Object.entries(rest)) {
      if (value === null) {
        delete (merged as unknown as Record<string, unknown>)[key]
      }
    }

    const ok = await putS3Object(articleKey(params.id), JSON.stringify(merged))
    if (!ok) {
      return NextResponse.json({ error: 'S3への保存に失敗しました' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Article PATCH error:', e)
    return NextResponse.json({ error: '記事の更新に失敗しました' }, { status: 500 })
  }
}
