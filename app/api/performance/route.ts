import { NextResponse } from 'next/server'
import { listS3Objects, getS3ObjectsAsTextBatch, getS3ObjectAsText } from '@/lib/s3Reference'
import type { SavedArticle } from '@/lib/types'
import type { AhrefsDataset } from '@/lib/ahrefsCsvParser'

export const dynamic = 'force-dynamic'

const ARTICLES_PREFIX = 'articles/'
const KW_PREFIX = 'kw-analysis/'
const HISTORY_PREFIX = `${KW_PREFIX}history/`
const INDEX_KEY = `${KW_PREFIX}index.json`
/** 読み込む履歴スナップショットの上限（直近から） */
const MAX_SNAPSHOTS = 120

interface SnapshotKeyword {
  keyword: string
  position: number | null
  volume: number
  traffic: number | null
  url: string
}

interface HistorySnapshot {
  date: string
  fetchedAt: string
  domain?: string
  country?: string
  keywords: SnapshotKeyword[]
}

export interface PerformancePoint {
  date: string
  /** 公開日からの経過日数 */
  day: number
  position: number | null
  traffic: number | null
}

export interface PerformanceArticle {
  id: string
  title: string
  targetKeyword: string
  publishedDate: string
  wordpressUrl?: string
  status: string
  volume: number
  series: PerformancePoint[]
  firstPosition: number | null
  latestPosition: number | null
  bestPosition: number | null
  /** 正=改善（順位が上がった）、負=悪化 */
  positionChange: number | null
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** 公開日として使う日付（予約日 > 作成日） */
function publishedDate(article: SavedArticle): string {
  return (article.scheduledDate || article.createdAt || '').slice(0, 10)
}

function isTrackable(article: SavedArticle): boolean {
  if (!article.targetKeyword?.trim()) return false
  return (
    article.status === 'published' ||
    Boolean(article.wordpressUrl) ||
    article.wordpressPostStatus === 'publish' ||
    article.wordpressPostStatus === 'future'
  )
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime()
  const to = new Date(`${toDate}T00:00:00Z`).getTime()
  return Math.round((to - from) / 86_400_000)
}

async function loadSnapshots(): Promise<HistorySnapshot[]> {
  const objects = await listS3Objects(HISTORY_PREFIX)
  const keys = objects
    .filter(o => o.key.endsWith('.json'))
    .map(o => o.key)
    .sort()
    .slice(-MAX_SNAPSHOTS)
  const results = await getS3ObjectsAsTextBatch(keys)
  const snapshots: HistorySnapshot[] = []
  for (const result of results) {
    try {
      const parsed = JSON.parse(result.content) as HistorySnapshot
      if (parsed?.date && Array.isArray(parsed.keywords)) snapshots.push(parsed)
    } catch { /* 壊れたスナップショットは無視 */ }
  }
  snapshots.sort((a, b) => a.date.localeCompare(b.date))
  return snapshots
}

/**
 * 履歴がまだ蓄積されていない期間の救済:
 * 既存の最新organicデータセット（KW分析の「APIから今すぐ更新」の結果）を
 * 取得日ベースの疑似スナップショットとして補完する。
 */
async function loadFallbackSnapshot(existingDates: Set<string>): Promise<HistorySnapshot | null> {
  const indexObject = await getS3ObjectAsText(INDEX_KEY)
  if (!indexObject) return null
  let index: Array<{ id: string; type: string; uploadedAt: string }>
  try {
    index = JSON.parse(indexObject.content)
  } catch {
    return null
  }
  const organicMetas = index
    .filter(meta => meta.type === 'organic')
    .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''))
  const latest = organicMetas[0]
  if (!latest) return null

  const date = (latest.uploadedAt || '').slice(0, 10)
  if (!date || existingDates.has(date)) return null

  const datasetObject = await getS3ObjectAsText(`${KW_PREFIX}datasets/${latest.id}.json`)
  if (!datasetObject) return null
  try {
    const dataset = JSON.parse(datasetObject.content) as AhrefsDataset
    return {
      date,
      fetchedAt: latest.uploadedAt,
      keywords: dataset.keywords.map(row => ({
        keyword: row.keyword,
        position: row.position,
        volume: row.volume,
        traffic: row.currentTraffic,
        url: row.url,
      })),
    }
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const [articleObjects, snapshots] = await Promise.all([
      listS3Objects(ARTICLES_PREFIX).then(objects =>
        getS3ObjectsAsTextBatch(objects.filter(o => o.key.endsWith('.json')).map(o => o.key))
      ),
      loadSnapshots(),
    ])

    // 履歴未蓄積の場合は最新organicデータセットで1点だけ補完
    const fallback = await loadFallbackSnapshot(new Set(snapshots.map(s => s.date)))
    if (fallback) {
      snapshots.push(fallback)
      snapshots.sort((a, b) => a.date.localeCompare(b.date))
    }

    const articles: SavedArticle[] = []
    for (const object of articleObjects) {
      try {
        articles.push(JSON.parse(object.content) as SavedArticle)
      } catch { /* skip malformed */ }
    }

    // スナップショットごとにKW→行のマップを事前構築
    const snapshotMaps = snapshots.map(snapshot => {
      const map = new Map<string, SnapshotKeyword>()
      for (const row of snapshot.keywords) {
        const key = normalizeKeyword(row.keyword)
        if (key && !map.has(key)) map.set(key, row)
      }
      return { date: snapshot.date, map }
    })

    const trackable = articles.filter(isTrackable)
    const matchedKeywords = new Set<string>()

    const performanceArticles: PerformanceArticle[] = trackable.map(article => {
      const keyword = normalizeKeyword(article.targetKeyword)
      const published = publishedDate(article)

      const series: PerformancePoint[] = []
      let volume = 0
      for (const { date, map } of snapshotMaps) {
        const day = published ? daysBetween(published, date) : 0
        if (published && day < 0) continue // 公開前のスナップショットは対象外
        const row = map.get(keyword) ?? null
        if (row) {
          matchedKeywords.add(keyword)
          if (row.volume > volume) volume = row.volume
        }
        series.push({
          date,
          day,
          position: row?.position ?? null,
          traffic: row?.traffic ?? null,
        })
      }

      const measured = series.filter(p => p.position != null)
      const firstPosition = measured[0]?.position ?? null
      const latestPosition = measured.length ? measured[measured.length - 1]!.position : null
      const bestPosition = measured.length
        ? Math.min(...measured.map(p => p.position!))
        : null
      const positionChange =
        firstPosition != null && latestPosition != null ? firstPosition - latestPosition : null

      return {
        id: article.id,
        title: article.refinedTitle || article.title,
        targetKeyword: article.targetKeyword,
        publishedDate: published,
        wordpressUrl: article.wordpressUrl,
        status: article.status,
        volume,
        series,
        firstPosition,
        latestPosition,
        bestPosition,
        positionChange,
      }
    })

    // 計測できている記事 → 順位の良い順、未計測はその後ろ（公開日の新しい順）
    performanceArticles.sort((a, b) => {
      if (a.latestPosition != null && b.latestPosition != null) return a.latestPosition - b.latestPosition
      if (a.latestPosition != null) return -1
      if (b.latestPosition != null) return 1
      return b.publishedDate.localeCompare(a.publishedDate)
    })

    // 記事と紐付いていない自社流入KW（最新スナップショットから）
    const latestSnapshot = snapshots[snapshots.length - 1]
    const unmatchedKeywords = (latestSnapshot?.keywords ?? [])
      .filter(row => !matchedKeywords.has(normalizeKeyword(row.keyword)))
      .sort((a, b) => (b.traffic ?? 0) - (a.traffic ?? 0))
      .slice(0, 15)

    return NextResponse.json({
      snapshots: snapshots.map(s => ({ date: s.date, keywordCount: s.keywords.length })),
      articles: performanceArticles,
      unmatchedKeywords,
    })
  } catch (e) {
    console.error('Performance GET error:', e)
    return NextResponse.json({ error: '成果データの取得に失敗しました' }, { status: 500 })
  }
}
