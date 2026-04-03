import { NextRequest, NextResponse } from 'next/server'
import { parseAhrefsCsv } from '@/lib/ahrefsCsvParser'
import { putS3Object, getS3ObjectAsText, deleteS3Object, listS3Objects } from '@/lib/s3Reference'

export const dynamic = 'force-dynamic'

const PREFIX = 'kw-analysis/'
const LATEST_KEY = `${PREFIX}latest.json`
const META_KEY = `${PREFIX}meta.json`

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'CSVファイルを選択してください' }, { status: 400 })
    }

    const text = await file.text()
    if (!text.trim()) {
      return NextResponse.json({ error: 'ファイルの中身が空です' }, { status: 400 })
    }

    const dataset = parseAhrefsCsv(text, file.name)

    if (dataset.keywords.length === 0) {
      return NextResponse.json({ error: 'パース結果が0行です。CSVの形式を確認してください。' }, { status: 400 })
    }

    const dataJson = JSON.stringify(dataset)
    const saved = await putS3Object(LATEST_KEY, dataJson)
    if (!saved) {
      return NextResponse.json({ error: 'S3への保存に失敗しました。AWS設定を確認してください。' }, { status: 500 })
    }

    const meta = {
      uploadedAt: dataset.uploadedAt,
      fileName: dataset.fileName,
      rowCount: dataset.rowCount,
      type: dataset.type,
    }
    await putS3Object(META_KEY, JSON.stringify(meta))

    return NextResponse.json({
      success: true,
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
    const dataObj = await getS3ObjectAsText(LATEST_KEY)
    if (!dataObj) {
      return NextResponse.json({ data: null, meta: null })
    }

    const dataset = JSON.parse(dataObj.content)

    let meta = null
    const metaObj = await getS3ObjectAsText(META_KEY)
    if (metaObj) {
      meta = JSON.parse(metaObj.content)
    }

    return NextResponse.json({ data: dataset, meta })
  } catch (e) {
    console.error('Ahrefs data fetch error:', e)
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
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
