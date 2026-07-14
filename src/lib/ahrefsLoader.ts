/**
 * Ahrefs データセット検索ユーティリティ
 *
 * S3 の kw-analysis/ に保存されている最新のデータセットから
 * 指定キーワードを検索し、分析コンテキストの構築に使用する。
 */

import { getS3ObjectAsText, listS3Objects } from '@/lib/s3Reference'
import type { AhrefsDataset, AhrefsKeywordRow } from '@/lib/ahrefsCsvParser'

const PREFIX    = 'kw-analysis/'
const INDEX_KEY = `${PREFIX}index.json`

interface DatasetMeta {
  id: string
  fileName: string
  type: 'keywords' | 'organic'
  rowCount: number
  uploadedAt: string
}

/** インデックスを読み込む */
async function loadDatasetIndex(): Promise<DatasetMeta[]> {
  const obj = await getS3ObjectAsText(INDEX_KEY)
  if (!obj) return []
  try {
    return JSON.parse(obj.content) as DatasetMeta[]
  } catch {
    return []
  }
}

/** データセット JSON を読み込む */
async function loadDataset(id: string): Promise<AhrefsDataset | null> {
  const key = `${PREFIX}datasets/${id}.json`
  const obj = await getS3ObjectAsText(key)
  if (!obj) return null
  try {
    return JSON.parse(obj.content) as AhrefsDataset
  } catch {
    return null
  }
}

/** キーワードを正規化（小文字化・全角英数を半角に・前後空白削除） */
function normalizeKw(kw: string): string {
  return kw
    .toLowerCase()
    .trim()
    .replace(/[Ａ-Ｚａ-ｚ０-９＆]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
}

/**
 * 最新のデータセットを uploadedAt 降順で最大 maxDatasets 件ロードする。
 * ペルソナ生成などで全タイプのデータセットを横断分析するために使用。
 */
export async function loadRecentDatasets(maxDatasets = 6): Promise<AhrefsDataset[]> {
  let index = await loadDatasetIndex()

  if (index.length === 0) {
    const objects = await listS3Objects(`${PREFIX}datasets/`)
    const datasetKeys = objects
      .map(o => o.key)
      .filter(k => k.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, maxDatasets)
    const results = await Promise.all(
      datasetKeys.map(async key => {
        const obj = await getS3ObjectAsText(key)
        if (!obj) return null
        try {
          return JSON.parse(obj.content) as AhrefsDataset
        } catch {
          return null
        }
      })
    )
    return results.filter((d): d is AhrefsDataset => d !== null)
  }

  index = [...index].sort((a, b) =>
    new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  )
  const results = await Promise.all(
    index.slice(0, maxDatasets).map(meta => loadDataset(meta.id))
  )
  return results.filter((d): d is AhrefsDataset => d !== null)
}

/**
 * 最新データセットから、クエリを部分一致で含むキーワードを検索して返す。
 * 記事分析ページの「手薄カテゴリー → KW候補」提示に使用。
 * ボリューム降順で最大 limit 件。
 */
export async function findRelatedKeywords(
  query: string,
  limit = 5,
): Promise<AhrefsKeywordRow[]> {
  const normalized = normalizeKw(query)
  if (!normalized) return []

  let index = await loadDatasetIndex()
  let rows: AhrefsKeywordRow[] = []

  if (index.length === 0) {
    const objects = await listS3Objects(`${PREFIX}datasets/`)
    const datasetKeys = objects
      .map(o => o.key)
      .filter(k => k.endsWith('.json'))
      .sort()
      .reverse()
    if (datasetKeys.length === 0) return []
    const obj = await getS3ObjectAsText(datasetKeys[0]!)
    if (!obj) return []
    try {
      rows = (JSON.parse(obj.content) as AhrefsDataset).keywords
    } catch {
      return []
    }
  } else {
    index = [...index].sort((a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )
    // 最新から最大3データセットを統合して検索母数を確保（並列取得）
    const datasets = await Promise.all(index.slice(0, 3).map(meta => loadDataset(meta.id)))
    for (const dataset of datasets) {
      if (dataset) rows.push(...dataset.keywords)
    }
  }

  // 部分一致で抽出し、キーワード重複を除去してボリューム降順
  const seen = new Set<string>()
  return rows
    .filter(r => normalizeKw(r.keyword).includes(normalized))
    .filter(r => {
      const key = normalizeKw(r.keyword)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, limit)
}
