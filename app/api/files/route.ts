import { NextRequest, NextResponse } from 'next/server'
import { listFiles, upsertFile, deleteFile } from '@/lib/kv'
import { withAuth } from '@/lib/routes'

export const POST = withAuth(async (req: NextRequest, peer, ctx) => {
  try {
    const body = await req.json()
    const { key } = body
    if (!key) {
      return NextResponse.json({ error: 'missing file key' }, { status: 400 })
    }
    await upsertFile({ ...body, responsible_peer: peer.id })
    return NextResponse.json({ status: 'ok', key })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
})

export async function GET() {
  const files = await listFiles()
  return NextResponse.json(files)
}
