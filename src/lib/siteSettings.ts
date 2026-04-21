/**
 * サイト設定（ブランド・CTA・コンテンツ・スタイル）の型定義と
 * デフォルト値、サーバーサイド取得ヘルパー。
 *
 * S3 の `site-settings/config.json` に保存される。
 * 設定は：
 *  - プレビュー画面（app/preview/page.tsx）
 *  - WordPress 投稿HTML（src/lib/wordpress.ts）
 * の両方から参照される。
 */

// ========== 型定義 ==========

export interface RelatedArticle {
  title: string
  href: string
  category: string
  imageUrl: string
  date: string
}

export interface HeaderNavItem {
  label: string
  url?: string
}

export interface FooterNavItem {
  label: string
  subs: string[]
}

export interface ExtraCtaBlock {
  id: string
  label: string
  html: string
  insertBefore: 'h2-matome' | 'last-h2' | 'none'
}

export interface SiteSettings {
  version: number
  updatedAt: string

  brand: {
    companyName: string
    productName: string
    phone: string
    logoUrl: string
    siteUrl: string
    primaryColor: string
    accentColor: string
    address: string
    headerBgColor: string
    footerBgColor: string
    inquiryButtonColor: string
  }

  cta: {
    inquiryUrl: string
    caseStudyUrl: string
    inquiryLabel: string
    caseStudyLabel: string
    bannerHeadline: string
    bannerImageUrl: string
    advancedHtml: string
  }

  content: {
    relatedArticles: RelatedArticle[]
    headerNav: HeaderNavItem[]
    footerNav: string[]
    breadcrumbs: { home: string; category: string; section: string }
    footerCopyright: string
    columnLabel: string
    columnSubLabel: string
    tagList: Array<{ name: string; count: number }>
    articleTags: string[]
    supervisor: {
      enabled: boolean
      name: string
      title: string
      imageUrl: string
      description: string
    }
  }

  styles: {
    h2Css: string
    h3Css: string
    h4Css: string
    bodyCss: string
  }

  extraCtaBlocks: ExtraCtaBlock[]
}

// ========== デフォルト値 ==========
// 現状ハードコードされている値をそのまま移行

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  version: 1,
  updatedAt: new Date(0).toISOString(),

  brand: {
    companyName: '株式会社RICE CLOUD',
    productName: 'RICE CLOUD',
    phone: '',
    logoUrl: '/logo-w.webp',
    siteUrl: 'https://www.rice-cloud.info',
    primaryColor: '#009AE0',
    accentColor: '#3EA8D8',
    address: '〒336-0017\n埼玉県さいたま市南区南浦和2丁目40-1 第２愛興ビル 3階',
    headerBgColor: '#1a2744',
    footerBgColor: '#222222',
    inquiryButtonColor: '#2ecc71',
  },

  cta: {
    inquiryUrl: 'https://www.rice-cloud.info/contact/',
    caseStudyUrl: 'https://www.rice-cloud.info/casestudy/',
    inquiryLabel: 'お問い合わせはこちら',
    caseStudyLabel: '導入事例はこちらから',
    bannerHeadline: 'ERP導入・業務改善のご相談はお気軽に',
    bannerImageUrl: '',
    advancedHtml: '',
  },

  content: {
    relatedArticles: [
      {
        title: 'ERP導入で失敗しないために！ERPシステムを比較する5つのポイント',
        href: '#',
        category: 'ERPの基礎',
        imageUrl: '',
        date: '2024.11.15',
      },
      {
        title: 'ズバリ解説！ERPとは何か、今多くの企業が注目するワケ',
        href: '#',
        category: 'ERPの基礎',
        imageUrl: '',
        date: '2024.06.28',
      },
    ],
    headerNav: [
      { label: 'TOP' },
      { label: '会社案内' },
      { label: '導入事例' },
      { label: 'サービス' },
      { label: 'お役立ち情報' },
      { label: 'NEWS' },
      { label: '採用情報' },
    ],
    footerNav: ['TOP', '会社案内', '導入事例', 'サービス', 'お役立ち情報', 'NEWS', '採用情報', 'お問い合わせ'],
    breadcrumbs: { home: 'トップ', category: 'お役立ち情報', section: 'ERPの基礎' },
    footerCopyright: '© RICE CLOUD JAPAN All Rights Reserved.',
    columnLabel: 'COLUMN',
    columnSubLabel: 'お役立ち情報詳細',
    tagList: [
      { name: 'ERP', count: 3 },
      { name: '業務改善', count: 3 },
      { name: 'データ分析', count: 3 },
      { name: 'SaaS', count: 3 },
      { name: '基礎知識', count: 3 },
    ],
    articleTags: ['ERP', '業務改善', 'データ分析', 'SaaS', '基礎知識'],
    supervisor: {
      enabled: false,
      name: '',
      title: '',
      imageUrl: '',
      description: '',
    },
  },

  styles: {
    h2Css: "font-size:22px;font-weight:900;margin:48px 0 16px;padding-bottom:8px;border-bottom:3px solid #009AE0;font-family:'Noto Sans JP',sans-serif;",
    h3Css: 'font-size:18px;font-weight:400;margin:32px 0 12px;color:#111;',
    h4Css: 'font-size:16px;font-weight:700;margin:24px 0 10px;color:#333;',
    bodyCss: 'margin-bottom:1.6em;',
  },

  extraCtaBlocks: [],
}

export const SITE_SETTINGS_S3_KEY = 'site-settings/config.json'

// ========== マージヘルパー ==========
// S3から読み込んだ部分的な設定にデフォルトを補完する

export function mergeSiteSettings(partial: Partial<SiteSettings> | null | undefined): SiteSettings {
  const d = DEFAULT_SITE_SETTINGS
  if (!partial) return d

  return {
    version: partial.version ?? d.version,
    updatedAt: partial.updatedAt ?? d.updatedAt,
    brand: { ...d.brand, ...(partial.brand || {}) },
    cta: { ...d.cta, ...(partial.cta || {}) },
    content: {
      ...d.content,
      ...(partial.content || {}),
      breadcrumbs: { ...d.content.breadcrumbs, ...((partial.content?.breadcrumbs) || {}) },
      supervisor: { ...d.content.supervisor, ...((partial.content?.supervisor) || {}) },
      relatedArticles: partial.content?.relatedArticles ?? d.content.relatedArticles,
      headerNav: partial.content?.headerNav ?? d.content.headerNav,
      footerNav: partial.content?.footerNav ?? d.content.footerNav,
      tagList: partial.content?.tagList ?? d.content.tagList,
      articleTags: partial.content?.articleTags ?? d.content.articleTags,
    },
    styles: { ...d.styles, ...(partial.styles || {}) },
    extraCtaBlocks: partial.extraCtaBlocks ?? d.extraCtaBlocks,
  }
}

// ========== サーバーサイド読み込みヘルパー（キャッシュ付き） ==========

let cachedSettings: SiteSettings | null = null
let cachedAt = 0
const CACHE_TTL_MS = 60_000 // 60秒

/**
 * サーバーサイドで直接S3から設定を取得する（60秒キャッシュ）。
 * S3に未保存・読み取り失敗の場合はデフォルト値を返す。
 */
export async function getSiteSettings(forceRefresh = false): Promise<SiteSettings> {
  const now = Date.now()
  if (!forceRefresh && cachedSettings && now - cachedAt < CACHE_TTL_MS) {
    return cachedSettings
  }
  try {
    // 動的importでクライアントバンドルにs3を含めない
    const { getS3ObjectAsText } = await import('./s3Reference')
    const result = await getS3ObjectAsText(SITE_SETTINGS_S3_KEY)
    if (!result) {
      cachedSettings = DEFAULT_SITE_SETTINGS
      cachedAt = now
      return cachedSettings
    }
    const parsed = JSON.parse(result.content) as Partial<SiteSettings>
    cachedSettings = mergeSiteSettings(parsed)
    cachedAt = now
    return cachedSettings
  } catch (e) {
    console.warn('[siteSettings] S3読み込み失敗。デフォルト値を使用:', e)
    cachedSettings = DEFAULT_SITE_SETTINGS
    cachedAt = now
    return cachedSettings
  }
}

/** キャッシュをクリア（保存直後の即時反映用） */
export function invalidateSiteSettingsCache(): void {
  cachedSettings = null
  cachedAt = 0
}
