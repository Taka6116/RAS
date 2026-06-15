import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { putS3Object, putS3ObjectBuffer } from '@/lib/s3Reference'

export const dynamic = 'force-dynamic'

const PREFIX = 'images/imported/'

export interface ImportedImageMeta {
  id: string
  key: string
  source: 'imported'
  filename: string
  title: string
  createdAt: string
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const title = (formData.get('title') as string | null)?.trim() || ''

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'ファイルが必要です' }, { status: 400 })
    }

    const blob = file as File
    const mimeType = blob.type || 'image/jpeg'
    const ext = blob.name?.split('.').pop()?.toLowerCase() || 'jpg'
    const allowedExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
    if (!allowedExts.has(ext)) {
      return NextResponse.json(
        { error: '対応していないファイル形式です（jpg / png / gif / webp）' },
        { status: 400 }
      )
    }

    const id = randomUUID()
    const imageKey = `${PREFIX}${id}.${ext}`
    const arrayBuffer = await blob.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const ok = await putS3ObjectBuffer(imageKey, buffer, mimeType)
    if (!ok) {
      return NextResponse.json(
        { error: 'S3への保存に失敗しました。AWS環境変数を確認してください。' },
        { status: 500 }
      )
    }

    const meta: ImportedImageMeta = {
      id,
      key: imageKey,
      source: 'imported',
      filename: blob.name || `${id}.${ext}`,
      title: title || blob.name?.replace(/\.[^.]+$/, '') || '',
      createdAt: new Date().toISOString(),
    }
    await putS3Object(`${PREFIX}${id}.json`, JSON.stringify(meta), 'application/json')

    return NextResponse.json({
      success: true,
      id,
      imageUrl: `/api/images/file/${id}?source=imported`,
      meta,
    })
  } catch (e) {
    console.error('Images import error:', e)
    return NextResponse.json({ error: '画像のインポートに失敗しました' }, { status: 500 })
  }
}
