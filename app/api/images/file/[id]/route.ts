import { NextRequest, NextResponse } from 'next/server'
import { getS3ObjectAsBuffer } from '@/lib/s3Reference'

export const dynamic = 'force-dynamic'

const PREFIX = 'images/generated/'

/** 生成画像（S3バイナリ）をサーバー経由で配信する。バケット非公開でも認証付きGetObjectで取得 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id?.replace(/[^a-zA-Z0-9-]/g, '')
  if (!id) {
    return new NextResponse(null, { status: 400 })
  }
  try {
    const result = await getS3ObjectAsBuffer(`${PREFIX}${id}.jpg`)
    if (!result) {
      return new NextResponse(null, { status: 404 })
    }
    return new NextResponse(Buffer.from(result.body), {
      headers: {
        'Content-Type': result.contentType ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
