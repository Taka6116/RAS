import { NextRequest, NextResponse } from 'next/server'
import { listS3Objects, getS3ObjectAsText, deleteS3Object } from '@/lib/s3Reference'

export const dynamic = 'force-dynamic'

const PREFIX = 'images/generated/'

export interface GeneratedImageMeta {
  id: string
  key: string
  title: string
  targetKeyword: string
  prompt: string
  createdAt: string
}

export async function GET() {
  try {
    const objects = await listS3Objects(PREFIX)
    const jsonFiles = objects.filter(o => o.key.endsWith('.json'))

    const images: GeneratedImageMeta[] = []
    for (const obj of jsonFiles) {
      const result = await getS3ObjectAsText(obj.key)
      if (result) {
        try {
          images.push(JSON.parse(result.content) as GeneratedImageMeta)
        } catch { /* skip malformed */ }
      }
    }

    images.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return NextResponse.json({ images })
  } catch (e) {
    console.error('Images GET error:', e)
    return NextResponse.json({ error: '画像一覧の取得に失敗しました' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = (await request.json()) as { id: string }
    if (!id) {
      return NextResponse.json({ error: '画像IDが必要です' }, { status: 400 })
    }
    // jpg本体とメタjsonの両方を削除
    await deleteS3Object(`${PREFIX}${id}.jpg`)
    await deleteS3Object(`${PREFIX}${id}.json`)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Images DELETE error:', e)
    return NextResponse.json({ error: '画像の削除に失敗しました' }, { status: 500 })
  }
}
