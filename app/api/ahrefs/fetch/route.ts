import { NextRequest, NextResponse } from 'next/server'
import { fetchApiUsage, fetchKeywordMetrics, fetchOrganicKeywords } from '@/lib/ahrefsApi'
import type { AhrefsDataset, AhrefsDatasetType } from '@/lib/ahrefsCsvParser'
import { deleteS3Object, getS3ObjectAsText, getS3ObjectsAsTextBatch, putS3Object } from '@/lib/s3Reference'

export const maxDuration = 120

const PREFIX = 'kw-analysis/'
const INDEX_KEY = `${PREFIX}index.json`
const DEFAULT_MAX_ROWS = 25
const KEYWORD_REFRESH_LIMIT = 100

interface DatasetMeta {
  id: string
  fileName: string
  type: AhrefsDatasetType
  rowCount: number
  uploadedAt: string
}

/**
 * RICE CLOUDのサービス領域と、導入検討者の検索意図に合わせた初期KWセット。
 * CSVを先に用意しなくても、Ahrefs Keywords Explorerから狙い目KWを取得できる。
 */
const RICE_CLOUD_SEED_KEYWORDS = [
  'ERP',
  'ERP 導入',
  'ERP 比較',
  'ERP 選び方',
  'ERP 導入 費用',
  'ERP 導入 失敗',
  'ERP 導入 手順',
  'ERP 導入 期間',
  'ERP 導入 コンサル',
  'クラウド ERP',
  'クラウド ERP 比較',
  '基幹システム',
  '基幹システム 刷新',
  '基幹システム 導入',
  '基幹システム リプレイス',
  '基幹システム クラウド化',
  '業務システム 導入',
  '販売管理 システム',
  '在庫管理 システム',
  '会計システム クラウド',
  '管理会計 システム',
  'NetSuite',
  'NetSuite 導入',
  'NetSuite 費用',
  'NetSuite 比較',
  'NetSuite 導入支援',
  'Dynamics 365',
  'Dynamics 365 導入',
  'Dynamics 365 比較',
  'Dynamics 365 Finance',
  'Dynamics 365 Business Central',
  'Power Platform',
  'Power Apps 導入',
  'Power Automate 導入',
  'Power BI 導入',
  'SaaS 導入',
  'SaaS 導入 支援',
  'DX 推進',
  'DX 推進 支援',
  '業務改善',
  '業務効率化',
  '業務 自動化',
  '業務改革',
  'プロジェクト リカバリー',
  'システム開発 失敗',
  'システム導入 失敗',
  'アジャイル 開発',
  'アジャイル 導入',
  'IT コンサルティング',
  'ERP 中堅企業',
]

function datasetKey(id: string): string {
  return `${PREFIX}datasets/${id}.json`
}

function apiMaxRows(): number {
  const value = Number(process.env.AHREFS_API_MAX_ROWS)
  return Number.isInteger(value) && value > 0 ? Math.min(value, 1000) : DEFAULT_MAX_ROWS
}

async function loadIndex(): Promise<DatasetMeta[]> {
  const object = await getS3ObjectAsText(INDEX_KEY)
  if (!object) return []
  try {
    return JSON.parse(object.content) as DatasetMeta[]
  } catch {
    return []
  }
}

async function saveIndex(index: DatasetMeta[]): Promise<void> {
  await putS3Object(INDEX_KEY, JSON.stringify(index))
}

async function collectExistingKeywords(index: DatasetMeta[]): Promise<string[]> {
  const metas = index.filter(meta => meta.type === 'keywords')
  const objects = await getS3ObjectsAsTextBatch(metas.map(meta => datasetKey(meta.id)), 6)
  const keywords = new Set<string>()

  for (const object of objects) {
    try {
      const dataset = JSON.parse(object.content) as AhrefsDataset
      for (const row of dataset.keywords) {
        if (row.keyword?.trim()) keywords.add(row.keyword.trim())
      }
    } catch {
      // 壊れたデータセットは無視して、取得可能なKWだけを更新する
    }
  }

  return Array.from(keywords)
}

function createDataset(
  id: string,
  fileName: string,
  type: AhrefsDatasetType,
  keywords: AhrefsDataset['keywords'],
  uploadedAt: string,
): AhrefsDataset {
  return { id, fileName, type, keywords, uploadedAt, rowCount: keywords.length }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as {
      target?: string
      country?: string
      limit?: number
    }

    const domain = body.target?.trim() || process.env.AHREFS_TARGET_DOMAIN?.trim()
    const country = body.country?.trim() || process.env.AHREFS_COUNTRY?.trim() || 'jp'
    if (!domain) {
      return NextResponse.json({ error: 'AHREFS_TARGET_DOMAIN を設定してください' }, { status: 400 })
    }

    const maxRows = Math.min(
      Math.max(1, Math.floor(body.limit ?? apiMaxRows())),
      apiMaxRows(),
    )
    const now = new Date().toISOString()
    const date = now.slice(0, 10)

    // 1. 自社が既に表示されているKWを取得
    const organicRows = await fetchOrganicKeywords({ target: domain, country, limit: maxRows })
    let index = await loadIndex()
    // APIの更新ごとに同じKWが重複集計されないよう、旧APIデータだけを置き換える。
    // ユーザーが手動でインポートしたCSVデータセットは保持する。
    const previousApiDatasets = index.filter(meta => meta.fileName.startsWith('Ahrefs API（'))
    await Promise.all(previousApiDatasets.map(meta => deleteS3Object(datasetKey(meta.id))))
    index = index.filter(meta => !meta.fileName.startsWith('Ahrefs API（'))
    const results: {
      organic: { id: string; rowCount: number }
      opportunity?: { id: string; rowCount: number }
      usage: Awaited<ReturnType<typeof fetchApiUsage>>
    } = {
      organic: { id: '', rowCount: organicRows.length },
      usage: null,
    }

    if (organicRows.length > 0) {
      const id = `api_organic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const dataset = createDataset(
        id,
        `Ahrefs API（自社流入KW）- ${domain} (${country}) ${date}`,
        'organic',
        organicRows,
        now,
      )
      if (!await putS3Object(datasetKey(id), JSON.stringify(dataset))) {
        return NextResponse.json({ error: '自社流入KWのS3保存に失敗しました' }, { status: 500 })
      }
      index.push({ id, fileName: dataset.fileName, type: dataset.type, rowCount: dataset.rowCount, uploadedAt: now })
      results.organic = { id, rowCount: dataset.rowCount }
    }

    // 2. RICE CLOUDの重点領域 + 過去CSVのKWをAhrefsの最新指標で評価
    const existingKeywords = await collectExistingKeywords(index)
    const opportunityKeywords = Array.from(new Set([
      ...RICE_CLOUD_SEED_KEYWORDS,
      ...existingKeywords,
    ])).slice(0, KEYWORD_REFRESH_LIMIT)

    if (opportunityKeywords.length > 0) {
      const metrics = await fetchKeywordMetrics(opportunityKeywords, { country })
      if (metrics.length > 0) {
        const id = `api_opportunity_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        const dataset = createDataset(
          id,
          `Ahrefs API（RICE CLOUD重点KW）- ${country} ${date}`,
          'keywords',
          metrics,
          now,
        )
        if (!await putS3Object(datasetKey(id), JSON.stringify(dataset))) {
          return NextResponse.json({ error: '重点KWのS3保存に失敗しました' }, { status: 500 })
        }
        index.push({ id, fileName: dataset.fileName, type: dataset.type, rowCount: dataset.rowCount, uploadedAt: now })
        results.opportunity = { id, rowCount: dataset.rowCount }
      }
    }

    await saveIndex(index)
    results.usage = await fetchApiUsage()

    return NextResponse.json({
      ...results,
      domain,
      country,
      maxRows,
      message: `自社流入KW ${results.organic.rowCount}件、RICE CLOUD重点KW ${results.opportunity?.rowCount ?? 0}件を更新しました`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ahrefs APIからのデータ取得に失敗しました'
    console.error('Ahrefs API fetch error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  const domain = process.env.AHREFS_TARGET_DOMAIN?.trim()
  const hasApiKey = Boolean(process.env.AHREFS_API_KEY?.trim())

  return NextResponse.json({
    configured: hasApiKey && Boolean(domain),
    domain: domain ?? null,
    country: process.env.AHREFS_COUNTRY?.trim() ?? 'jp',
    maxRows: apiMaxRows(),
  })
}
