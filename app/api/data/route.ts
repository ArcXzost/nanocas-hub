import { NextRequest, NextResponse } from 'next/server'
import { upsertFile } from '@/lib/kv'
import { withAuth } from '@/lib/routes'

export const POST = withAuth(async (req: NextRequest, peer, ctx) => {
  try {
    const body = await req.json()
    const { key, data } = body
    if (!key) {
      return NextResponse.json({ error: 'missing key' }, { status: 400 })
    }
    const record = {
      key,
      size: data ? new TextEncoder().encode(data).length : 0,
      hash: '',
      versions: 1,
      responsible_peer: peer.id,
      replica_peers: [],
      last_modified: Date.now(),
    }
    await upsertFile(record)
    return NextResponse.json({ status: 'ok', key })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
})
