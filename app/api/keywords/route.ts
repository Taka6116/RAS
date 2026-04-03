import { NextRequest, NextResponse } from 'next/server'
import { listS3Objects, getS3ObjectAsText, putS3Object, deleteS3Object } from '@/lib/s3Reference'

export const dynamic = 'force-dynamic'

const PREFIX = 'keywords/'

interface SavedKeyword {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

function keywordKey(id: string): string {
  return `${PREFIX}${id}.json`
}

export async function GET() {
  try {
    const objects = await listS3Objects(PREFIX)
    const jsonFiles = objects.filter(o => o.key.endsWith('.json'))

    const keywords: SavedKeyword[] = []
    for (const obj of jsonFiles) {
      const result = await getS3ObjectAsText(obj.key)
      if (result) {
        try {
          keywords.push(JSON.parse(result.content) as SavedKeyword)
        } catch { /* skip malformed */ }
      }
    }

    keywords.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return NextResponse.json({ keywords })
  } catch (e) {
    console.error('Keywords GET error:', e)
    return NextResponse.json({ error: 'キーワード一覧の取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: string; title: string; content: string }
    if (!body.title?.trim() || !body.content?.trim()) {
      return NextResponse.json({ error: 'セット名とキーワードは必須です' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const id = body.id || String(Date.now())

    const keyword: SavedKeyword = {
      id,
      title: body.title.trim(),
      content: body.content.trim(),
      createdAt: now,
      updatedAt: now,
    }

    if (body.id) {
      const existing = await getS3ObjectAsText(keywordKey(body.id))
      if (existing) {
        try {
          const parsed = JSON.parse(existing.content) as SavedKeyword
          keyword.createdAt = parsed.createdAt
        } catch { /* use current time */ }
      }
    }

    const ok = await putS3Object(keywordKey(id), JSON.stringify(keyword))
    if (!ok) {
      return NextResponse.json({ error: 'S3への保存に失敗しました。AWS環境変数を確認してください。' }, { status: 500 })
    }
    return NextResponse.json({ success: true, keyword })
  } catch (e) {
    console.error('Keywords POST error:', e)
    return NextResponse.json({ error: 'キーワードの保存に失敗しました' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = (await request.json()) as { id: string }
    if (!id) {
      return NextResponse.json({ error: 'キーワードIDが必要です' }, { status: 400 })
    }

    const ok = await deleteS3Object(keywordKey(id))
    if (!ok) {
      return NextResponse.json({ error: 'S3からの削除に失敗しました' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Keywords DELETE error:', e)
    return NextResponse.json({ error: 'キーワードの削除に失敗しました' }, { status: 500 })
  }
}
