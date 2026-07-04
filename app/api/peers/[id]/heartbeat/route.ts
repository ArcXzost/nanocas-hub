import { NextRequest, NextResponse } from 'next/server'
import { peerHeartbeat } from '@/lib/kv'
import { withAuth } from '@/lib/routes'

export const POST = withAuth(async (req: NextRequest, peer, ctx) => {
  const peerId = ctx.params.id
  if (peer.id !== peerId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const ok = await peerHeartbeat(peerId)
  if (!ok) {
    return NextResponse.json({ error: 'unknown peer' }, { status: 404 })
  }
  return NextResponse.json({ status: 'ok', id: peerId })
})
