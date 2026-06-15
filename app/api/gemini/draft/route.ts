import { randomInt } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { generateFirstDraftFromPrompt } from '@/lib/api/gemini'
import { findFileById, getFilePath } from '@/lib/dataStorage'
import { getS3ObjectAsText, listS3Objects } from '@/lib/s3Reference'
import { embedText, loadEmbeddingIndex, topKByCosine } from '@/lib/embeddings'

/** 意味検索で本文に注入する関連チャンク数 */
function getEmbedTopK(): number {
  const raw = process.env.EMBED_TOPK?.trim()
  if (raw) {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 1 && n <= 30) return n
  }
  return 8
}

/** 一次執筆で参照する S3 のプレフィックス（md / csv / txt のみ突合）。末尾スラッシュなしでも可 */
const DRAFT_MATERIAL_EXTS = new Set(['.md', '.csv', '.txt'])

function getDraftMaterialsPrefix(): string {
  const raw = process.env.S3_DRAFT_MATERIALS_PREFIX?.trim()
  const p = raw && raw.length > 0 ? raw : 'materials_for_articles/'
  return p.endsWith('/') ? p : `${p}/`
}

function isDraftMaterialKey(key: string, prefix: string): boolean {
  if (!key.startsWith(prefix) || key.length <= prefix.length) return false
  if (key.endsWith('/')) return false
  const ext = key.includes('.') ? key.slice(key.lastIndexOf('.')).toLowerCase() : ''
  return DRAFT_MATERIAL_EXTS.has(ext)
}

/** 429 時の待機＋再生成を含められるよう長めに（プランにより上限は異なります） */
export const maxDuration = 120

const TEXT_MIMES = new Set([
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'application/json',
])

/**
 * 一次執筆用【参照資料】の最大文字数。
 * システムプロンプトが長いため、S3 全件などをそのまま送ると無料枠の「入力トークン/分」（25万）を超えやすい。
 * 必要なら環境変数 GEMINI_DRAFT_MAX_CONTEXT_CHARS で調整（例: 180000）。
 */
function getDraftContextCharLimit(): number {
  const raw = process.env.GEMINI_DRAFT_MAX_CONTEXT_CHARS?.trim()
  if (raw) {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 10_000) return n
  }
  return 100_000
}

/** pos 以降で始まる行の先頭インデックス（改行の直後、または 0） */
function lineStartIndex(s: string, pos: number): number {
  if (pos <= 0) return 0
  const i = s.lastIndexOf('\n', pos - 1)
  return i === -1 ? 0 : i + 1
}

/**
 * 参照資料が長いとき、先頭固定ではなくランダムな連続範囲を取り込む（改行付近に開始位置をスナップ）。
 * 毎回似た断片だけが効くのを避けるため。
 */
function truncateDataContextToRandomWindow(
  full: string,
  contextLimit: number
): { window: string; originalLen: number; start: number } {
  const len = full.length
  if (len <= contextLimit) {
    return { window: full, originalLen: len, start: 0 }
  }

  const maxStart = len - contextLimit
  let start = randomInt(0, maxStart + 1)
  start = lineStartIndex(full, start)
  if (start > maxStart) start = maxStart

  if (start + contextLimit > len) {
    start = len - contextLimit
    const snapped = lineStartIndex(full, start)
    start = snapped <= len - contextLimit ? snapped : len - contextLimit
  }

  return {
    window: full.slice(start, start + contextLimit),
    originalLen: len,
    start,
  }
}

async function readFileContentAsText(fileId: string): Promise<{ name: string; content: string } | null> {
  const meta = await findFileById(fileId)
  if (!meta) return null
  const isText = TEXT_MIMES.has(meta.mimeType) || meta.mimeType.startsWith('text/')
  if (!isText) return null
  const filePath = getFilePath(meta.storedName)
  const content = await readFile(filePath, 'utf-8')
  return { name: meta.originalName, content }
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, targetKeyword, fileIds, s3Keys } = await request.json()
    const promptStr = typeof prompt === 'string' ? prompt.trim() : ''
    const targetKeywordStr = typeof targetKeyword === 'string' ? targetKeyword.trim() || undefined : undefined
    const ids = Array.isArray(fileIds) ? fileIds.filter((id): id is string => typeof id === 'string') : []
    const explicitS3Keys = Array.isArray(s3Keys) ? s3Keys.filter((k): k is string => typeof k === 'string') : []
    const materialsPrefix = getDraftMaterialsPrefix()
    // s3Keys 未指定時: materials_for_articles/ 配下の .md / .csv / .txt のみ（他プレフィックスは参照しない）
    const allKeys =
      explicitS3Keys.length > 0
        ? explicitS3Keys.filter(k => isDraftMaterialKey(k, materialsPrefix))
        : (await listS3Objects(materialsPrefix)).map(o => o.key).filter(k => isDraftMaterialKey(k, materialsPrefix))

    if (!promptStr) {
      return NextResponse.json(
        { error: 'プロンプトを入力してください' },
        { status: 400 }
      )
    }

    if (!targetKeywordStr) {
      return NextResponse.json(
        { error: 'ターゲットキーワードは必須です。必ず設定してください。' },
        { status: 400 }
      )
    }

    const parts: string[] = []

    // アップロード資料は常に全文を使う
    if (ids.length > 0) {
      for (const id of ids) {
        const result = await readFileContentAsText(id)
        if (result) {
          parts.push(`--- 資料（アップロード）：${result.name} ---\n${result.content}`)
        }
      }
    }

    // 意味検索: S3資料・導入事例から関連チャンクを取得し、類似する過去記事のトーンは回避対象として渡す
    let avoidToneSample: string | undefined
    let usedSemantic = false
    try {
      const index = await loadEmbeddingIndex()
      if (index && index.chunks.length > 0) {
        const queryVec = await embedText(`${promptStr}\n${targetKeywordStr ?? ''}`)
        const refChunks = topKByCosine(queryVec, index.chunks, getEmbedTopK(), ['materials', 'case-studies'])
        for (const c of refChunks) {
          parts.push(`--- 関連資料（意味検索）：${c.title} ---\n${c.text}`)
        }
        // 最も意味が近い過去記事 → トーン・構成の重複を避けるためのサンプル
        const similarArticles = topKByCosine(queryVec, index.chunks, 1, ['articles'])
        if (similarArticles.length > 0 && similarArticles[0]!.score > 0.5) {
          avoidToneSample = similarArticles[0]!.text.slice(0, 1500)
        }
        usedSemantic = refChunks.length > 0
      }
    } catch (e) {
      console.warn('[gemini/draft] 意味検索に失敗、従来方式にフォールバック:', (e as Error)?.message)
    }

    // フォールバック: 意味検索が使えない場合は従来どおりS3資料を全文連結
    if (!usedSemantic && allKeys.length > 0) {
      for (const key of allKeys) {
        const result = await getS3ObjectAsText(key)
        if (result) {
          const name = key.split('/').pop() ?? key
          parts.push(`--- 資料（S3）：${name} ---\n${result.content}`)
        }
      }
    }

    let dataContext = parts.join('\n\n')
    const contextLimit = getDraftContextCharLimit()
    if (dataContext.length > contextLimit) {
      const { window, originalLen, start } = truncateDataContextToRandomWindow(dataContext, contextLimit)
      dataContext =
        window +
        `\n\n【システム注記】参照資料が長いため、約${contextLimit.toLocaleString()}文字分をランダムな連続範囲から取り込みました（元の合計: 約${originalLen.toLocaleString()}文字）。` +
        '必要な論点が欠ける場合は S3 の対象を絞るか、アップロード資料のみにするか、Google AI Studio で課金を有効にしてください。'
      console.warn(
        `[gemini/draft] 参照資料 ランダム窓: offset=${start}, length=${contextLimit}, 元の長さ=${originalLen}。GEMINI_DRAFT_MAX_CONTEXT_CHARS で上限変更可。`
      )
    }

    const { title, content } = await generateFirstDraftFromPrompt(
      promptStr,
      targetKeywordStr,
      dataContext || undefined,
      avoidToneSample
    )
    return NextResponse.json({ title, content })
  } catch (error) {
    console.error('Gemini draft API error:', error)
    const message =
      error instanceof Error ? error.message : '一次執筆の生成に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
