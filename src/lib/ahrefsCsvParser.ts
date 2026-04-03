import Papa from 'papaparse'

export type AhrefsDatasetType = 'keywords' | 'organic'

export interface AhrefsKeywordRow {
  keyword: string
  volume: number
  kd: number
  cpc: number
  cps: number
  parentTopic: string
  svTrend: number[]
  svForecast: number[]
  category: string
  trafficPotential: number
  globalVolume: number
  intents: string
  position: number | null
  positionChange: number | null
  url: string
  currentTraffic: number | null
  previousTraffic: number | null
  trafficChange: number | null
  branded: boolean
  serpFeatures: string
}

export interface AhrefsDataset {
  id: string
  uploadedAt: string
  fileName: string
  rowCount: number
  type: AhrefsDatasetType
  keywords: AhrefsKeywordRow[]
}

const HEADER_ALIASES: Record<string, string[]> = {
  keyword:          ['keyword', 'keywords'],
  volume:           ['volume', 'search volume', 'sv'],
  kd:               ['kd', 'keyword difficulty', 'difficulty'],
  cpc:              ['cpc', 'cost per click'],
  cps:              ['cps', 'clicks per search'],
  parentTopic:      ['parent keyword', 'parent topic', 'parent_topic'],
  svTrend:          ['sv trend'],
  svForecast:       ['sv forecasting trend'],
  category:         ['category'],
  trafficPotential: ['traffic potential'],
  globalVolume:     ['global volume'],
  intents:          ['intents'],
  serpFeatures:     ['serp features'],
  position:         ['current position', 'position'],
  positionChange:   ['position change'],
  url:              ['current url', 'url'],
  currentTraffic:   ['current organic traffic'],
  previousTraffic:  ['previous organic traffic'],
  trafficChange:    ['organic traffic change', 'traffic change'],
  branded:          ['branded'],
}

function normalizeHeader(raw: string): string {
  return raw
    .replace(/[\uFEFF\uFFFE]/g, '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
}

function resolveField(header: string): string | null {
  const h = normalizeHeader(header)
  if (h === '#') return null
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      if (h === alias || h.startsWith(alias)) return field
    }
  }
  return null
}

function buildHeaderMap(rawHeaders: string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const raw of rawHeaders) {
    const field = resolveField(raw)
    if (field && !map.has(field)) {
      map.set(field, raw)
    }
  }
  return map
}

function detectType(headerMap: Map<string, string>): AhrefsDatasetType {
  if (headerMap.has('position') || headerMap.has('url') || headerMap.has('currentTraffic')) {
    return 'organic'
  }
  return 'keywords'
}

function toNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const s = String(val).replace(/["',\s]/g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function toNumOrNull(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const s = String(val).replace(/["',\s]/g, '')
  if (s.toLowerCase() === 'lost') return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function parseTrendString(val: unknown): number[] {
  if (!val || typeof val !== 'string') return []
  const cleaned = val.replace(/^["']+|["']+$/g, '').trim()
  if (!cleaned) return []
  return cleaned
    .split(',')
    .map(s => {
      const n = parseInt(s.trim(), 10)
      return Number.isFinite(n) ? n : 0
    })
    .filter(n => n > 0)
}

function getVal(row: Record<string, unknown>, headerMap: Map<string, string>, field: string): unknown {
  const rawHeader = headerMap.get(field)
  if (!rawHeader) return undefined
  return row[rawHeader]
}

export function parseAhrefsCsv(csvText: string, fileName: string): AhrefsDataset {
  const result = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter: '',
    quoteChar: '"',
  })

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(`CSVパースエラー: ${result.errors[0]?.message ?? '不明なエラー'}`)
  }

  const rawHeaders = result.meta.fields ?? []
  if (rawHeaders.length === 0) {
    throw new Error('CSVにヘッダー行が見つかりません。')
  }

  const headerMap = buildHeaderMap(rawHeaders)

  if (!headerMap.has('keyword')) {
    throw new Error(
      'キーワード列が見つかりません。CSVのヘッダーを確認してください。\n' +
      `検出されたヘッダー: ${rawHeaders.slice(0, 10).join(', ')}...`
    )
  }

  const datasetType = detectType(headerMap)

  const keywords: AhrefsKeywordRow[] = []
  for (const row of result.data) {
    const kw = String(getVal(row, headerMap, 'keyword') ?? '').replace(/^["']+|["']+$/g, '').trim()
    if (!kw) continue

    keywords.push({
      keyword: kw,
      volume: toNum(getVal(row, headerMap, 'volume')),
      kd: toNum(getVal(row, headerMap, 'kd')),
      cpc: toNum(getVal(row, headerMap, 'cpc')),
      cps: toNum(getVal(row, headerMap, 'cps')),
      parentTopic: String(getVal(row, headerMap, 'parentTopic') ?? '').replace(/^["']+|["']+$/g, '').trim(),
      svTrend: parseTrendString(getVal(row, headerMap, 'svTrend')),
      svForecast: parseTrendString(getVal(row, headerMap, 'svForecast')),
      category: String(getVal(row, headerMap, 'category') ?? '').replace(/^["']+|["']+$/g, '').trim(),
      trafficPotential: toNum(getVal(row, headerMap, 'trafficPotential')),
      globalVolume: toNum(getVal(row, headerMap, 'globalVolume')),
      intents: String(getVal(row, headerMap, 'intents') ?? '').replace(/^["']+|["']+$/g, '').trim(),
      serpFeatures: String(getVal(row, headerMap, 'serpFeatures') ?? '').replace(/^["']+|["']+$/g, '').trim(),
      position: toNumOrNull(getVal(row, headerMap, 'position')),
      positionChange: toNumOrNull(getVal(row, headerMap, 'positionChange')),
      url: String(getVal(row, headerMap, 'url') ?? '').replace(/^["']+|["']+$/g, '').trim(),
      currentTraffic: toNumOrNull(getVal(row, headerMap, 'currentTraffic')),
      previousTraffic: toNumOrNull(getVal(row, headerMap, 'previousTraffic')),
      trafficChange: toNumOrNull(getVal(row, headerMap, 'trafficChange')),
      branded: String(getVal(row, headerMap, 'branded') ?? '').replace(/^["']+|["']+$/g, '').toLowerCase() === 'true',
    })
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    uploadedAt: new Date().toISOString(),
    fileName,
    rowCount: keywords.length,
    type: datasetType,
    keywords,
  }
}
