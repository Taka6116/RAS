import { NextRequest, NextResponse } from 'next/server'
import { getS3ObjectAsBuffer, getS3ObjectAsText } from '@/lib/s3Reference'

export const dynamic = 'force-dynamic'

const GENERATED_PREFIX = 'images/generated/'
const IMPORTED_PREFIX = 'images/imported/'

/** 生成・インポート画像をS3から認証付きで配信する */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id?.replace(/[^a-zA-Z0-9-]/g, '')
  if (!id) {
    return new NextResponse(null, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const sourceHint = searchParams.get('source') // 'generated' | 'imported' | null

  try {
    // 検索順: source ヒントがあればその prefix を優先、なければ両方試す
    const prefixesToTry: string[] = []
    if (sourceHint === 'imported') {
      prefixesToTry.push(IMPORTED_PREFIX, GENERATED_PREFIX)
    } else if (sourceHint === 'generated') {
      prefixesToTry.push(GENERATED_PREFIX, IMPORTED_PREFIX)
    } else {
      // ヒントなし: 生成済みを先に試す（既存の動作と互換）
      prefixesToTry.push(GENERATED_PREFIX, IMPORTED_PREFIX)
    }

    for (const prefix of prefixesToTry) {
      // まずメタjsonから本来のkeyを取得（インポート画像は拡張子が jpg 以外の場合がある）
      const metaResult = await getS3ObjectAsText(`${prefix}${id}.json`)
      let imageKey: string | null = null
      if (metaResult) {
        try {
          const meta = JSON.parse(metaResult.content) as { key?: string }
          if (meta.key) imageKey = meta.key
        } catch { /* ignore */ }
      }
      // メタが取れなければ generated の fallback（.jpg）
      if (!imageKey) {
        imageKey = `${prefix}${id}.jpg`
      }

      const result = await getS3ObjectAsBuffer(imageKey)
      if (result) {
        return new NextResponse(Buffer.from(result.body), {
          headers: {
            'Content-Type': result.contentType ?? 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }
    }

    return new NextResponse(null, { status: 404 })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
