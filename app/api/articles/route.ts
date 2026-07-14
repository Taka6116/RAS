import { NextRequest, NextResponse } from 'next/server'
import { listS3Objects, getS3ObjectsAsTextBatch, putS3Object, deleteS3Object } from '@/lib/s3Reference'
import type { SavedArticle, ArticleSummary } from '@/lib/types'

export const dynamic = 'force-dynamic'

const PREFIX = 'articles/'
const EXCERPT_MAX = 140

function articleKey(id: string): string {
  return `${PREFIX}${id}.json`
}

function buildExcerpt(article: SavedArticle): string {
  const raw = (article.refinedContent || article.originalContent || '').replace(/\s+/g, ' ').trim()
  if (raw.length <= EXCERPT_MAX) return raw
  return raw.slice(0, EXCERPT_MAX).trim() + '…'
}

/** 本文・base64画像を除いた一覧用サマリーに変換する */
function toSummary(article: SavedArticle): ArticleSummary {
  const isDataUrl = article.imageUrl?.startsWith('data:')
  return {
    id: article.id,
    title: article.title,
    refinedTitle: article.refinedTitle,
    targetKeyword: article.targetKeyword,
    status: article.status,
    createdAt: article.createdAt,
    scheduledDate: article.scheduledDate,
    scheduledTime: article.scheduledTime,
    wordpressPostStatus: article.wordpressPostStatus,
    wordpressUrl: article.wordpressUrl,
    slug: article.slug,
    wordpressTags: article.wordpressTags,
    wordCount: article.wordCount,
    imageUrl: isDataUrl ? `/api/articles/${article.id}/image` : (article.imageUrl || ''),
    excerpt: buildExcerpt(article),
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const summaryMode = searchParams.get('mode') === 'summary'

    const objects = await listS3Objects(PREFIX)
    const jsonKeys = objects.filter(o => o.key.endsWith('.json')).map(o => o.key)

    const results = await getS3ObjectsAsTextBatch(jsonKeys)
    const articles: SavedArticle[] = []
    for (const result of results) {
      try {
        articles.push(JSON.parse(result.content) as SavedArticle)
      } catch { /* skip malformed */ }
    }

    articles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    if (summaryMode) {
      return NextResponse.json({ articles: articles.map(toSummary) })
    }
    return NextResponse.json({ articles })
  } catch (e) {
    console.error('Articles GET error:', e)
    return NextResponse.json({ error: '記事一覧の取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const article = (await request.json()) as SavedArticle
    if (!article.id) {
      return NextResponse.json({ error: '記事IDが必要です' }, { status: 400 })
    }

    const ok = await putS3Object(articleKey(article.id), JSON.stringify(article))
    if (!ok) {
      return NextResponse.json({ error: 'S3への保存に失敗しました。AWS環境変数を確認してください。' }, { status: 500 })
    }
    return NextResponse.json({ success: true, id: article.id })
  } catch (e) {
    console.error('Articles POST error:', e)
    return NextResponse.json({ error: '記事の保存に失敗しました' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = (await request.json()) as { id: string }
    if (!id) {
      return NextResponse.json({ error: '記事IDが必要です' }, { status: 400 })
    }

    const ok = await deleteS3Object(articleKey(id))
    if (!ok) {
      return NextResponse.json({ error: 'S3からの削除に失敗しました' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Articles DELETE error:', e)
    return NextResponse.json({ error: '記事の削除に失敗しました' }, { status: 500 })
  }
}
