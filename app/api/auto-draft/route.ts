import { NextRequest, NextResponse } from 'next/server'
import {
  loadAutoDraftConfig,
  runAutoDraft,
  saveAutoDraftConfig,
  type AutoDraftConfig,
} from '@/lib/autoDraft'

export const dynamic = 'force-dynamic'
/** run-now は生成〜WP投稿まで数分かかるため延長（Proプラン上限） */
export const maxDuration = 300

/** 現在の自動下書き設定と実行履歴を返す */
export async function GET() {
  try {
    const config = await loadAutoDraftConfig()
    return NextResponse.json({ config })
  } catch (error) {
    console.error('[auto-draft] GET error:', error)
    return NextResponse.json({ error: '設定の取得に失敗しました' }, { status: 500 })
  }
}

/**
 * action:
 * - save-config: 有効/停止・曜日・時刻・追加指示を保存
 * - run-now:     手動でパイプラインを1回実行（テスト用）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as {
      action?: string
      config?: Partial<AutoDraftConfig>
    }

    if (body.action === 'save-config') {
      const input = body.config
      if (!input) {
        return NextResponse.json({ error: 'config が必要です' }, { status: 400 })
      }
      const current = await loadAutoDraftConfig()
      const daysOfWeek = Array.isArray(input.daysOfWeek)
        ? input.daysOfWeek.filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
        : current.daysOfWeek
      if (daysOfWeek.length === 0) {
        return NextResponse.json({ error: '実行曜日を1つ以上選択してください' }, { status: 400 })
      }
      const hourJst = Number.isInteger(input.hourJst) && (input.hourJst as number) >= 0 && (input.hourJst as number) <= 23
        ? (input.hourJst as number)
        : current.hourJst
      const next: AutoDraftConfig = {
        ...current,
        enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
        daysOfWeek,
        hourJst,
        extraInstruction: typeof input.extraInstruction === 'string'
          ? input.extraInstruction.slice(0, 2_000)
          : current.extraInstruction,
      }
      await saveAutoDraftConfig(next)
      return NextResponse.json({ config: next })
    }

    if (body.action === 'run-now') {
      const run = await runAutoDraft('manual')
      const config = await loadAutoDraftConfig()
      if (run.status === 'error') {
        return NextResponse.json({ run, config, error: run.error }, { status: 500 })
      }
      return NextResponse.json({ run, config })
    }

    return NextResponse.json({ error: '未知の action です' }, { status: 400 })
  } catch (error) {
    console.error('[auto-draft] POST error:', error)
    const message = error instanceof Error ? error.message : '処理に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
