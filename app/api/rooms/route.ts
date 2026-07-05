import { NextRequest, NextResponse } from 'next/server'
import { createRoom, listRooms, getPeerByBearerToken, getPeerRooms } from '@/lib/kv'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json([])
  }

  const peer = await getPeerByBearerToken(token)
  if (!peer) {
    return NextResponse.json([])
  }

  const rooms = await getPeerRooms(peer.id)
  const safe = rooms.map(r => ({ id: r.id, name: r.name, owner: r.owner, created_at: r.created_at }))
  return NextResponse.json(safe)
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || ''
    const token = auth.replace('Bearer ', '')
    const peer = await getPeerByBearerToken(token)
    if (!peer) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { name, turn_addr, turn_username, turn_password, turn_realm } = body
    if (!name) {
      return NextResponse.json({ error: 'missing room name' }, { status: 400 })
    }

    // Hub generates the room key
    const keyBytes = crypto.getRandomValues(new Uint8Array(32))
    const roomKeyHex = Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('')

    const room = await createRoom(name, peer.id, roomKeyHex, { turn_addr, turn_username, turn_password, turn_realm })
    return NextResponse.json({
      id: room.id,
      name: room.name,
      owner: room.owner,
      created_at: room.created_at,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
