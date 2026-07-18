import { NextRequest, NextResponse } from 'next/server'
import {
  getPeer, getMemberByPeerId, markPeerOffline,
} from '@/lib/kv'
import { withAuth } from '@/lib/routes'

export const DELETE = withAuth(async (req: NextRequest, peer, ctx) => {
  const targetId = ctx.params.id
  if (peer.id !== targetId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const existing = await getPeer(targetId)
  if (!existing) {
    return NextResponse.json({ error: 'peer not found' }, { status: 404 })
  }
  await markPeerOffline(targetId)
  return NextResponse.json({ status: 'deregistered', id: targetId })
})
