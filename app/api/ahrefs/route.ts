import { NextRequest, NextResponse } from 'next/server'
import { parseAhrefsCsv } from '@/lib/ahrefsCsvParser'
import type { AhrefsDataset } from '@/lib/ahrefsCsvParser'
import { putS3Object, getS3ObjectAsText, deleteS3Object, listS3Objects } from '@/lib/s3Reference'

export const dynamic = 'force-dynamic'

const PREFIX = 'kw-analysis/'
const INDEX_KEY = `${PREFIX}index.json`

function datasetKey(id: string): string {
  return `${PREFIX}datasets/${id}.json`
}

function decodeCSVBuffer(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes)
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes)
  }
  const text = new TextDecoder('utf-8').decode(bytes)
  return text.replace(/^\uFEFF/, '')
}

interface DatasetMeta {
  id: string
  fileName: string
  type: 'keywords' | 'organic'
  rowCount: number
  uploadedAt: string
}

async function loadIndex(): Promise<DatasetMeta[]> {
  const obj = await getS3ObjectAsText(INDEX_KEY)
  if (!obj) return []
  try { return JSON.parse(obj.content) } catch { return [] }
}

async function saveIndex(index: DatasetMeta[]): Promise<void> {
  await putS3Object(INDEX_KEY, JSON.stringify(index))
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'CSVファイルを選択してください' }, { status: 400 })
    }

    const buf = await file.arrayBuffer()
    const text = decodeCSVBuffer(new Uint8Array(buf))
    if (!text.trim()) {
      return NextResponse.json({ error: 'ファイルの中身が空です' }, { status: 400 })
    }

    const dataset = parseAhrefsCsv(text, file.name)

    if (dataset.keywords.length === 0) {
      return NextResponse.json({ error: 'パース結果が0行です。CSVの形式を確認してください。' }, { status: 400 })
    }

    const saved = await putS3Object(datasetKey(dataset.id), JSON.stringify(dataset))
    if (!saved) {
      return NextResponse.json({ error: 'S3への保存に失敗しました。AWS設定を確認してください。' }, { status: 500 })
    }

    const index = await loadIndex()
    index.push({
      id: dataset.id,
      fileName: dataset.fileName,
      type: dataset.type,
      rowCount: dataset.rowCount,
      uploadedAt: dataset.uploadedAt,
    })
    await saveIndex(index)

    return NextResponse.json({
      success: true,
      id: dataset.id,
      count: dataset.rowCount,
      type: dataset.type,
      uploadedAt: dataset.uploadedAt,
    })
  } catch (e) {
    console.error('Ahrefs CSV upload error:', e)
    const message = e instanceof Error ? e.message : 'CSVのアップロードに失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const index = await loadIndex()
    if (index.length === 0) {
      return NextResponse.json({ datasets: [], index: [] })
    }

    const datasets: AhrefsDataset[] = []
    for (const meta of index) {
      const obj = await getS3ObjectAsText(datasetKey(meta.id))
      if (obj) {
        try { datasets.push(JSON.parse(obj.content)) } catch { /* skip corrupt */ }
      }
    }

    return NextResponse.json({ datasets, index })
  } catch (e) {
    console.error('Ahrefs data fetch error:', e)
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      await deleteS3Object(datasetKey(id))
      const index = await loadIndex()
      const updated = index.filter(m => m.id !== id)
      await saveIndex(updated)
      return NextResponse.json({ success: true })
    }

    const objects = await listS3Objects(PREFIX)
    for (const obj of objects) {
      await deleteS3Object(obj.key)
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Ahrefs data delete error:', e)
    return NextResponse.json({ error: 'データの削除に失敗しました' }, { status: 500 })
  }
}
