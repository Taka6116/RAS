import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'RClogo.svg')
    let svg = await readFile(filePath, 'utf-8')
    // 文字化けしたidを除去してSVGを有効にする
    svg = svg.replace(/id="[^"]*"/g, '').replace(/<\?xml[^?]*\?>\s*/i, '')
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse('Not Found', { status: 404 })
  }
}
