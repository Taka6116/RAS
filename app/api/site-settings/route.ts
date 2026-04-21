import { NextRequest, NextResponse } from 'next/server'
import { getS3ObjectAsText, putS3Object } from '@/lib/s3Reference'
import {
  DEFAULT_SITE_SETTINGS,
  SITE_SETTINGS_S3_KEY,
  mergeSiteSettings,
  invalidateSiteSettingsCache,
  type SiteSettings,
} from '@/lib/siteSettings'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const result = await getS3ObjectAsText(SITE_SETTINGS_S3_KEY)
    if (!result) {
      return NextResponse.json({ settings: DEFAULT_SITE_SETTINGS, isDefault: true })
    }
    try {
      const parsed = JSON.parse(result.content) as Partial<SiteSettings>
      const merged = mergeSiteSettings(parsed)
      return NextResponse.json({ settings: merged, isDefault: false })
    } catch {
      return NextResponse.json({ settings: DEFAULT_SITE_SETTINGS, isDefault: true, warning: 'parse-error' })
    }
  } catch (e) {
    console.error('[site-settings GET]', e)
    return NextResponse.json({ error: 'サイト設定の取得に失敗しました' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { settings: Partial<SiteSettings> }
    if (!body?.settings) {
      return NextResponse.json({ error: 'settings が必要です' }, { status: 400 })
    }

    const merged = mergeSiteSettings(body.settings)
    merged.updatedAt = new Date().toISOString()

    const urlFields: Array<[string, string]> = [
      ['brand.logoUrl', merged.brand.logoUrl],
      ['brand.siteUrl', merged.brand.siteUrl],
      ['cta.inquiryUrl', merged.cta.inquiryUrl],
      ['cta.caseStudyUrl', merged.cta.caseStudyUrl],
      ['cta.bannerImageUrl', merged.cta.bannerImageUrl],
    ]
    for (const [name, value] of urlFields) {
      if (!value) continue
      if (!/^(https?:|\/)/.test(value)) {
        return NextResponse.json({ error: `${name} は http(s):// または / で始まる必要があります` }, { status: 400 })
      }
    }

    const colorFields: Array<[string, string]> = [
      ['brand.primaryColor', merged.brand.primaryColor],
      ['brand.accentColor', merged.brand.accentColor],
      ['brand.headerBgColor', merged.brand.headerBgColor],
      ['brand.footerBgColor', merged.brand.footerBgColor],
      ['brand.inquiryButtonColor', merged.brand.inquiryButtonColor],
    ]
    for (const [name, value] of colorFields) {
      if (!value) continue
      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
        return NextResponse.json({ error: `${name} は有効なHEXカラー（例 #009AE0）である必要があります` }, { status: 400 })
      }
    }

    const ok = await putS3Object(SITE_SETTINGS_S3_KEY, JSON.stringify(merged, null, 2))
    if (!ok) {
      return NextResponse.json({ error: 'S3への保存に失敗しました。AWS環境変数を確認してください。' }, { status: 500 })
    }
    invalidateSiteSettingsCache()
    return NextResponse.json({ success: true, settings: merged })
  } catch (e) {
    console.error('[site-settings PUT]', e)
    return NextResponse.json({ error: 'サイト設定の保存に失敗しました' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const ok = await putS3Object(SITE_SETTINGS_S3_KEY, JSON.stringify(DEFAULT_SITE_SETTINGS, null, 2))
    if (!ok) {
      return NextResponse.json({ error: 'S3への保存に失敗しました' }, { status: 500 })
    }
    invalidateSiteSettingsCache()
    return NextResponse.json({ success: true, settings: DEFAULT_SITE_SETTINGS })
  } catch (e) {
    console.error('[site-settings DELETE]', e)
    return NextResponse.json({ error: 'リセットに失敗しました' }, { status: 500 })
  }
}
