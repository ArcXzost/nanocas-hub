import { NextRequest, NextResponse } from 'next/server'
import { requestJoinRoom, getRoom } from '@/lib/kv'
import { withAuth } from '@/lib/routes'

export const POST = withAuth(async (req: NextRequest, peer, ctx) => {
  const body = await req.json()
  const publicKey = body.public_key
  if (!publicKey) {
    return NextResponse.json({ error: 'missing public_key' }, { status: 400 })
  }

  const roomId = ctx.params.id
  const room = await getRoom(roomId)
  if (!room) {
    return NextResponse.json({ error: 'room not found' }, { status: 404 })
  }

  const ok = await requestJoinRoom(roomId, peer.id, publicKey)
  if (!ok) {
    return NextResponse.json({ error: 'failed to join room' }, { status: 500 })
  }

  return NextResponse.json({ status: 'join_requested', room_id: roomId })
})
