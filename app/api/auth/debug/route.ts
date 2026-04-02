import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

export async function GET(request: NextRequest) {
  const secret = process.env.AUTH_SECRET ?? ''
  const hash = secret
    ? createHmac('sha256', 'probe').update(secret).digest('hex').slice(0, 8)
    : 'NOT_SET'

  const cookieName = 'nas_auth'
  const cookie = request.cookies.get(cookieName)?.value

  return NextResponse.json({
    AUTH_SECRET_length: secret.length,
    AUTH_SECRET_hash_prefix: hash,
    AUTH_SECRET_first3: secret.slice(0, 3),
    AUTH_SECRET_last3: secret.slice(-3),
    AUTH_EMAIL_set: !!process.env.AUTH_EMAIL,
    AUTH_PASSWORD_set: !!process.env.AUTH_PASSWORD,
    NODE_ENV: process.env.NODE_ENV,
    cookie_present: !!cookie,
    cookie_length: cookie?.length ?? 0,
  })
}
