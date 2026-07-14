import { NextRequest, NextResponse } from 'next/server'
import { getS3ObjectAsText } from '@/lib/s3Reference'
import type { SavedArticle } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * 記事JSON内の base64 画像をバイナリとして配信する。
 * 一覧APIから base64 を除外しても <img> 表示を維持するためのプロキシ。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await getS3ObjectAsText(`articles/${params.id}.json`)
    if (!result) {
      return new NextResponse(null, { status: 404 })
    }
    let article: SavedArticle
    try {
      article = JSON.parse(result.content) as SavedArticle
    } catch {
      return new NextResponse(null, { status: 404 })
    }

    const url = article.imageUrl || ''
    if (!url) {
      return new NextResponse(null, { status: 404 })
    }

    // base64 データURL → デコードして配信
    const dataUrlMatch = url.match(/^data:([^;,]+);base64,(.+)$/)
    if (dataUrlMatch) {
      const [, mimeType, base64] = dataUrlMatch
      const buffer = Buffer.from(base64!, 'base64')
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': mimeType || 'image/jpeg',
          'Cache-Control': 'public, max-age=300',
        },
      })
    }

    // 通常URL（S3配信URL等）→ リダイレクト
    return NextResponse.redirect(new URL(url, _request.url), 302)
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
