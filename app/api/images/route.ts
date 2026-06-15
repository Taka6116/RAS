import { NextRequest, NextResponse } from 'next/server'
import { listS3Objects, getS3ObjectAsText, deleteS3Object } from '@/lib/s3Reference'

export const dynamic = 'force-dynamic'

const GENERATED_PREFIX = 'images/generated/'
const IMPORTED_PREFIX = 'images/imported/'

export type ImageSource = 'generated' | 'imported'

export interface GeneratedImageMeta {
  id: string
  key: string
  source: ImageSource
  title: string
  targetKeyword: string
  prompt: string
  filename?: string
  createdAt: string
}

async function fetchImagesByPrefix(prefix: string, defaultSource: ImageSource): Promise<GeneratedImageMeta[]> {
  const objects = await listS3Objects(prefix)
  const jsonFiles = objects.filter(o => o.key.endsWith('.json'))
  const images: GeneratedImageMeta[] = []
  for (const obj of jsonFiles) {
    const result = await getS3ObjectAsText(obj.key)
    if (result) {
      try {
        const parsed = JSON.parse(result.content) as GeneratedImageMeta
        // source フィールドがない古いデータにデフォルト値を補う
        if (!parsed.source) parsed.source = defaultSource
        images.push(parsed)
      } catch { /* skip malformed */ }
    }
  }
  return images
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sourceFilter = searchParams.get('source') as ImageSource | 'all' | null

    let images: GeneratedImageMeta[] = []

    if (!sourceFilter || sourceFilter === 'all' || sourceFilter === 'generated') {
      const generated = await fetchImagesByPrefix(GENERATED_PREFIX, 'generated')
      images.push(...generated)
    }
    if (!sourceFilter || sourceFilter === 'all' || sourceFilter === 'imported') {
      const imported = await fetchImagesByPrefix(IMPORTED_PREFIX, 'imported')
      images.push(...imported)
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
    const { id, source } = (await request.json()) as { id: string; source?: ImageSource }
    if (!id) {
      return NextResponse.json({ error: '画像IDが必要です' }, { status: 400 })
    }

    const prefix = source === 'imported' ? IMPORTED_PREFIX : GENERATED_PREFIX

    // 拡張子が異なる可能性があるため（インポートは png/webp も）、JSONで本来のkeyを取得して削除
    const metaResult = await getS3ObjectAsText(`${prefix}${id}.json`)
    if (metaResult) {
      try {
        const meta = JSON.parse(metaResult.content) as GeneratedImageMeta
        if (meta.key) await deleteS3Object(meta.key)
      } catch { /* fallback below */ }
    }
    // メタjson削除（どちらのprefixでも試みる）
    await deleteS3Object(`${prefix}${id}.json`)
    // generated は常に jpg なのでフォールバックでも削除
    if (!source || source === 'generated') {
      await deleteS3Object(`${GENERATED_PREFIX}${id}.jpg`)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Images DELETE error:', e)
    return NextResponse.json({ error: '画像の削除に失敗しました' }, { status: 500 })
  }
}
