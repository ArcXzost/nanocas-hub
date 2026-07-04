import { NextRequest, NextResponse } from 'next/server'
import { getRoom, getRoomMembers, listPeers } from '@/lib/kv'
import { withAuth } from '@/lib/routes'

export const GET = withAuth(async (req: NextRequest, peer, ctx) => {
  const room = await getRoom(ctx.params.id)
  if (!room) {
    return NextResponse.json({ error: 'room not found' }, { status: 404 })
  }

  const members = await getRoomMembers(ctx.params.id)
  const admitted = members.filter(m => m.admitted)
  const allPeers = await listPeers()

  const peerMap = new Map(allPeers.map(p => [p.id, p]))
  const result = admitted.map(m => {
    const p = peerMap.get(m.peer_id)
    return {
      peer_id: m.peer_id,
      addr: p?.addr || '',
      listen_addr: p?.listen_addr || '',
      online: p?.online || false,
      last_seen: p?.last_seen || 0,
    }
  })

  return NextResponse.json(result)
})
