import { NextRequest, NextResponse } from 'next/server'
import { admitPeer, getRoom } from '@/lib/kv'
import { withAuth } from '@/lib/routes'

export const POST = withAuth(async (req: NextRequest, peer, ctx) => {
  const roomId = ctx.params.id
  const room = await getRoom(roomId)
  if (!room) {
    return NextResponse.json({ error: 'room not found' }, { status: 404 })
  }
  if (room.owner !== peer.id) {
    return NextResponse.json({ error: 'only room owner can admit peers' }, { status: 403 })
  }

  const body = await req.json()
  const { peer_id } = body
  if (!peer_id) {
    return NextResponse.json({ error: 'missing peer_id' }, { status: 400 })
  }

  const ok = await admitPeer(roomId, peer_id)
  if (!ok) {
    return NextResponse.json({ error: 'no pending join request from this peer' }, { status: 404 })
  }

  return NextResponse.json({ status: 'admitted', peer_id })
})
