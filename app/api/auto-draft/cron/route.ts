import { NextRequest, NextResponse } from 'next/server'
import { jstNowParts, loadAutoDraftConfig, runAutoDraft } from '@/lib/autoDraft'

export const dynamic = 'force-dynamic'
/** KW選定＋一次執筆＋推敲＋WP投稿で数分かかるため延長（Proプラン上限） */
export const maxDuration = 300

/**
 * Vercel Cron から毎時起動されるエンドポイント。
 * vercel.json は毎時実行（0 * * * *）とし、ここでJSTの曜日・時刻を判定することで
 * UIから曜日・時刻を変更してもデプロイ不要にしている。
 */
export async function GET(request: NextRequest) {
  // Vercel Cron は Authorization: Bearer ${CRON_SECRET} を自動付与する
  const secret = process.env.CRON_SECRET?.trim()
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: secret ? '認証に失敗しました' : 'CRON_SECRET が未設定です（Vercelの環境変数に追加してください）' },
      { status: 401 }
    )
  }

  try {
    const config = await loadAutoDraftConfig()
    const { date, day, hour } = jstNowParts()

    if (!config.enabled) {
      return NextResponse.json({ skipped: true, reason: '自動下書き投稿が停止中です' })
    }
    if (!config.daysOfWeek.includes(day)) {
      return NextResponse.json({ skipped: true, reason: `実行曜日ではありません（JST曜日=${day}）` })
    }
    if (hour !== config.hourJst) {
      return NextResponse.json({ skipped: true, reason: `実行時刻ではありません（JST ${hour}時 / 設定 ${config.hourJst}時）` })
    }
    if (config.lastRunDate === date) {
      return NextResponse.json({ skipped: true, reason: `本日（${date}）は実行済みです` })
    }

    const run = await runAutoDraft('cron')
    return NextResponse.json({ run })
  } catch (error) {
    console.error('[auto-draft/cron] error:', error)
    const message = error instanceof Error ? error.message : '自動下書き投稿の実行に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
