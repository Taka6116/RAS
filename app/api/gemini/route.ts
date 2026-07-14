import { NextRequest, NextResponse } from 'next/server'
import { refineArticleWithGemini, generateSlugFromGemini } from '@/lib/api/gemini'

/** 推敲＋スラッグ生成はリトライ込みで長時間かかることがあるため延長（Proプラン上限） */
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const { title, content, targetKeyword } = await request.json()
  const titleStr = typeof title === 'string' ? title : ''
  const targetKeywordStr = typeof targetKeyword === 'string' ? targetKeyword : undefined

  if (!content || typeof content !== 'string') {
    return NextResponse.json(
      { error: '記事本文が必要です' },
      { status: 400 }
    )
  }

  // NDJSONストリーミングで返す。
  // 推敲テキストを逐次配信してUIに見せつつ、無応答による504を防ぐ。
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`))
      }
      try {
        const { refinedTitle, refinedContent } = await refineArticleWithGemini(
          titleStr,
          content,
          targetKeywordStr,
          {
            onChunk: text => send({ type: 'chunk', text }),
            onReset: () => send({ type: 'reset' }),
          }
        )
        // スラッグ生成中であることをUIに知らせる
        send({ type: 'status', stage: 'slug' })
        const slug = await generateSlugFromGemini(
          refinedTitle || titleStr,
          targetKeywordStr,
          refinedContent
        )
        send({ type: 'done', refinedTitle, refinedContent, slug })
      } catch (error) {
        console.error('Gemini API error:', error)
        const message =
          error instanceof Error ? error.message : 'Gemini APIの呼び出しに失敗しました'
        send({ type: 'error', error: message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
