import { NextResponse } from 'next/server'
import { listS3Objects, getS3ObjectAsText } from '@/lib/s3Reference'
import {
  embedText,
  chunkText,
  saveEmbeddingIndex,
  loadEmbeddingIndex,
  type EmbeddingChunk,
  type EmbeddingSource,
} from '@/lib/embeddings'
import type { SavedArticle } from '@/lib/types'

export const dynamic = 'force-dynamic'
/** 大量チャンクの埋め込みは時間がかかるため長めに */
export const maxDuration = 300

const MATERIAL_EXTS = new Set(['.md', '.csv', '.txt'])

function getDraftMaterialsPrefix(): string {
  const raw = process.env.S3_DRAFT_MATERIALS_PREFIX?.trim()
  const p = raw && raw.length > 0 ? raw : 'materials_for_articles/'
  return p.endsWith('/') ? p : `${p}/`
}

function isMaterialKey(key: string, prefix: string): boolean {
  if (!key.startsWith(prefix) || key.length <= prefix.length) return false
  if (key.endsWith('/')) return false
  const ext = key.includes('.') ? key.slice(key.lastIndexOf('.')).toLowerCase() : ''
  return MATERIAL_EXTS.has(ext)
}

/** 1ソースぶんの本文をチャンク化して埋め込み、EmbeddingChunk[] を返す */
async function buildChunksForDoc(
  source: EmbeddingSource,
  key: string,
  title: string,
  content: string
): Promise<EmbeddingChunk[]> {
  const pieces = chunkText(content)
  const out: EmbeddingChunk[] = []
  for (let i = 0; i < pieces.length; i++) {
    const text = pieces[i]!
    try {
      const vector = await embedText(text)
      out.push({ source, key, chunkId: `${key}#${i}`, title, text, vector })
    } catch (e) {
      console.warn(`[reindex] 埋め込み失敗 key=${key} chunk=${i}:`, (e as Error)?.message)
    }
  }
  return out
}

export async function GET() {
  const index = await loadEmbeddingIndex(true)
  if (!index) {
    return NextResponse.json({ exists: false, count: 0, updatedAt: null, model: null })
  }
  const bySource: Record<string, number> = {}
  for (const c of index.chunks) {
    bySource[c.source] = (bySource[c.source] ?? 0) + 1
  }
  return NextResponse.json({
    exists: true,
    count: index.chunks.length,
    updatedAt: index.updatedAt,
    model: index.model,
    bySource,
  })
}

export async function POST() {
  try {
    const allChunks: EmbeddingChunk[] = []
    const materialsPrefix = getDraftMaterialsPrefix()

    // 1. 参照資料（materials_for_articles/ 配下の .md/.csv/.txt）
    const materialObjs = (await listS3Objects(materialsPrefix)).filter(o =>
      isMaterialKey(o.key, materialsPrefix)
    )
    for (const obj of materialObjs) {
      const result = await getS3ObjectAsText(obj.key)
      if (result?.content) {
        const name = obj.key.split('/').pop() ?? obj.key
        allChunks.push(...(await buildChunksForDoc('materials', obj.key, name, result.content)))
      }
    }

    // 2. 匿名導入事例（case-studies/）
    const caseObjs = (await listS3Objects('case-studies/')).filter(o => o.key.endsWith('.md'))
    for (const obj of caseObjs) {
      const result = await getS3ObjectAsText(obj.key)
      if (result?.content) {
        const name = obj.key.split('/').pop() ?? obj.key
        allChunks.push(...(await buildChunksForDoc('case-studies', obj.key, name, result.content)))
      }
    }

    // 3. 過去記事（articles/ 配下の本文）
    const articleObjs = (await listS3Objects('articles/')).filter(o => o.key.endsWith('.json'))
    for (const obj of articleObjs) {
      const result = await getS3ObjectAsText(obj.key)
      if (!result?.content) continue
      try {
        const article = JSON.parse(result.content) as SavedArticle
        const body = article.refinedContent || article.originalContent || ''
        const title = article.refinedTitle || article.title || ''
        if (body.trim()) {
          allChunks.push(...(await buildChunksForDoc('articles', obj.key, title, body)))
        }
      } catch { /* skip malformed */ }
    }

    const index = await saveEmbeddingIndex(allChunks)
    const bySource: Record<string, number> = {}
    for (const c of allChunks) {
      bySource[c.source] = (bySource[c.source] ?? 0) + 1
    }

    return NextResponse.json({
      success: true,
      count: allChunks.length,
      updatedAt: index.updatedAt,
      model: index.model,
      bySource,
    })
  } catch (e) {
    console.error('[reindex] error:', e)
    const message = e instanceof Error ? e.message : 'インデックス再構築に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
