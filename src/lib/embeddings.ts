/**
 * 意味検索（セマンティック検索）基盤。
 *
 * - 埋め込み: AWS Bedrock Titan Text Embeddings V2（amazon.titan-embed-text-v2:0）
 * - ベクトルストア: S3 の `embeddings/index.json`
 * - 類似検索: メモリ内 cosine 類似度（top-k）
 *
 * 外部ベクトルDBやインフラを追加せず、既存の Bedrock + S3 構成だけで完結させる。
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { getS3ObjectAsText, putS3Object } from '@/lib/s3Reference'

/** Titan 埋め込みは us-east-1 で利用（Claude と同じ既定。任意で上書き可） */
const BEDROCK_EMBED_REGION = (process.env.BEDROCK_EMBED_REGION || process.env.BEDROCK_REGION || 'us-east-1').trim()
const EMBED_MODEL_ID = (process.env.BEDROCK_EMBED_MODEL || 'amazon.titan-embed-text-v2:0').trim()

export const EMBEDDINGS_S3_KEY = 'embeddings/index.json'

export type EmbeddingSource = 'materials' | 'case-studies' | 'articles'

export interface EmbeddingChunk {
  source: EmbeddingSource
  key: string
  chunkId: string
  title: string
  text: string
  vector: number[]
}

export interface EmbeddingIndex {
  version: number
  updatedAt: string
  model: string
  chunks: EmbeddingChunk[]
}

// ========== Bedrock Titan 埋め込み ==========

function getBedrockClient(): BedrockRuntimeClient {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('[Embeddings] AWS認証情報が未設定です（AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY）')
  }
  return new BedrockRuntimeClient({
    region: BEDROCK_EMBED_REGION,
    credentials: { accessKeyId, secretAccessKey },
  })
}

/** 単一テキストを埋め込みベクトルに変換する */
export async function embedText(text: string): Promise<number[]> {
  const client = getBedrockClient()
  const body = JSON.stringify({ inputText: text.slice(0, 50_000) })
  const command = new InvokeModelCommand({
    modelId: EMBED_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: Buffer.from(body),
  })
  const response = await client.send(command)
  const decoded = JSON.parse(Buffer.from(response.body).toString('utf-8')) as { embedding?: number[] }
  if (!decoded.embedding || !Array.isArray(decoded.embedding)) {
    throw new Error('[Embeddings] 埋め込みベクトルが返ってきませんでした')
  }
  return decoded.embedding
}

// ========== チャンク分割 ==========

/**
 * テキストをチャンクに分割する。段落（空行）を尊重しつつ、最大サイズで区切る。
 * @param size 1チャンクの最大文字数
 * @param overlap チャンク間のオーバーラップ文字数
 */
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  if (normalized.length <= size) return [normalized]

  const chunks: string[] = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + size, normalized.length)
    // 文末・改行の近くで切る（後方へ最大200文字探索）
    if (end < normalized.length) {
      const slice = normalized.slice(start, end)
      const lastBreak = Math.max(
        slice.lastIndexOf('\n'),
        slice.lastIndexOf('。'),
        slice.lastIndexOf('. ')
      )
      if (lastBreak > size * 0.5) {
        end = start + lastBreak + 1
      }
    }
    const chunk = normalized.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    if (end >= normalized.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks
}

// ========== 類似度計算 ==========

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export interface ScoredChunk extends EmbeddingChunk {
  score: number
}

/** クエリベクトルに対して類似度上位 k 件を返す（任意で source フィルタ） */
export function topKByCosine(
  queryVec: number[],
  chunks: EmbeddingChunk[],
  k: number,
  sourceFilter?: EmbeddingSource[]
): ScoredChunk[] {
  const target = sourceFilter && sourceFilter.length > 0
    ? chunks.filter(c => sourceFilter.includes(c.source))
    : chunks
  return target
    .map(c => ({ ...c, score: cosineSimilarity(queryVec, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

// ========== ベクトルストア（S3）==========

let cachedIndex: EmbeddingIndex | null = null
let cachedAt = 0
const CACHE_TTL_MS = 60_000

/** S3 からベクトルインデックスを読み込む（60秒キャッシュ）。未保存なら null */
export async function loadEmbeddingIndex(forceRefresh = false): Promise<EmbeddingIndex | null> {
  const now = Date.now()
  if (!forceRefresh && cachedIndex && now - cachedAt < CACHE_TTL_MS) {
    return cachedIndex
  }
  try {
    const result = await getS3ObjectAsText(EMBEDDINGS_S3_KEY)
    if (!result) return null
    const parsed = JSON.parse(result.content) as EmbeddingIndex
    cachedIndex = parsed
    cachedAt = now
    return parsed
  } catch (e) {
    console.warn('[Embeddings] インデックス読み込み失敗:', (e as Error)?.message)
    return null
  }
}

/** ベクトルインデックスを S3 に保存し、キャッシュを更新する */
export async function saveEmbeddingIndex(chunks: EmbeddingChunk[]): Promise<EmbeddingIndex> {
  const index: EmbeddingIndex = {
    version: 1,
    updatedAt: new Date().toISOString(),
    model: EMBED_MODEL_ID,
    chunks,
  }
  await putS3Object(EMBEDDINGS_S3_KEY, JSON.stringify(index), 'application/json')
  cachedIndex = index
  cachedAt = Date.now()
  return index
}

export function invalidateEmbeddingCache(): void {
  cachedIndex = null
  cachedAt = 0
}
