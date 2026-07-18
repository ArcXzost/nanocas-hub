import { NextRequest, NextResponse } from 'next/server'
import { getRoom, getRoomMembers, updateRoomTurnConfig } from '@/lib/kv'
import { withAuth } from '@/lib/routes'

export const GET = withAuth(async (req: NextRequest, peer, ctx) => {
  const room = await getRoom(ctx.params.id)
  if (!room) {
    return NextResponse.json({ error: 'room not found' }, { status: 404 })
  }

  const members = await getRoomMembers(ctx.params.id)
  const admitted = members.filter(m => m.admitted).map(m => ({
    peer_id: m.peer_id,
    admitted_at: m.admitted_at,
  }))
  const pending = members.filter(m => !m.admitted).map(m => ({
    peer_id: m.peer_id,
    public_key: m.public_key,
  }))

  return NextResponse.json({
    id: room.id,
    name: room.name,
    owner: room.owner,
    created_at: room.created_at,
    members: admitted,
    pending_joiners: pending,
  })
})

export const PATCH = withAuth(async (req: NextRequest, peer, ctx) => {
  const room = await getRoom(ctx.params.id)
  if (!room) {
    return NextResponse.json({ error: 'room not found' }, { status: 404 })
  }
  if (room.owner !== peer.id) {
    return NextResponse.json({ error: 'only room owner can update settings' }, { status: 403 })
  }

  const body = await req.json()
  const { turn_addr, turn_username, turn_password, turn_realm } = body
  if (turn_addr !== undefined) {
    await updateRoomTurnConfig(ctx.params.id, turn_addr || '', turn_username || '', turn_password || '', turn_realm || '')
  }

  return NextResponse.json({ status: 'ok' })
})
