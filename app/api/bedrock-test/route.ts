import { NextResponse } from 'next/server'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Bedrock Claude 接続診断API
 *  ブラウザで /api/bedrock-test を開くだけで全モデルの接続確認ができる
 */
export async function GET() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  const bedrockRegion = (process.env.BEDROCK_REGION || 'us-east-1').trim()

  const results: Array<{ modelId: string; status: 'ok' | 'ng'; detail: string; latencyMs?: number }> = []
  const env = {
    AWS_ACCESS_KEY_ID: accessKeyId ? `${accessKeyId.slice(0, 4)}...${accessKeyId.slice(-4)}` : '(未設定)',
    AWS_SECRET_ACCESS_KEY: secretAccessKey ? '(設定済み)' : '(未設定)',
    BEDROCK_REGION: bedrockRegion,
  }

  if (!accessKeyId || !secretAccessKey) {
    return NextResponse.json({
      success: false,
      env,
      error: 'AWS認証情報が未設定です',
      results,
    }, { status: 500 })
  }

  const client = new BedrockRuntimeClient({
    region: bedrockRegion,
    credentials: { accessKeyId, secretAccessKey },
  })

  const testPrompt = 'こんにちは。「OK」と一言だけ返してください。'

  const candidateModels = [
    'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    'us.anthropic.claude-3-5-sonnet-20240620-v1:0',
    'us.anthropic.claude-3-5-haiku-20241022-v1:0',
    'anthropic.claude-3-5-sonnet-20240620-v1:0',
    'anthropic.claude-3-5-haiku-20241022-v1:0',
  ]

  for (const modelId of candidateModels) {
    const startedAt = Date.now()
    try {
      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 50,
        messages: [{ role: 'user', content: testPrompt }],
      })
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: Buffer.from(body),
      })
      const response = await client.send(command)
      const decoded = JSON.parse(Buffer.from(response.body).toString('utf-8'))
      const text: string = decoded?.content?.[0]?.text ?? ''
      results.push({
        modelId,
        status: 'ok',
        detail: text.slice(0, 60),
        latencyMs: Date.now() - startedAt,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results.push({
        modelId,
        status: 'ng',
        detail: msg.slice(0, 240),
        latencyMs: Date.now() - startedAt,
      })
    }
  }

  const anyOk = results.some(r => r.status === 'ok')

  return NextResponse.json({
    success: anyOk,
    env,
    summary: anyOk
      ? '✅ Bedrockフォールバックは動作可能です'
      : '❌ すべてのClaudeモデルに接続できません。IAMポリシーとモデルアクセスを確認してください',
    results,
  })
}
