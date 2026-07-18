import { NextRequest, NextResponse } from 'next/server'
import { getPeerByBearerToken, getPeerRooms } from '@/lib/kv'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '')
  const peer = await getPeerByBearerToken(token)
  if (!peer) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const rooms = await getPeerRooms(peer.id)
  return NextResponse.json({ room_ids: rooms.map(r => r.id) })
}
