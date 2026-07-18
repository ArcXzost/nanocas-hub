import { NextRequest, NextResponse } from 'next/server'
import { createRoom, listRooms, getPeerByBearerToken, getPeerRooms } from '@/lib/kv'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '')

  if (!token) {
    const rooms = await listRooms()
    const safe = rooms.map(r => ({ id: r.id, name: r.name, owner: r.owner, created_at: r.created_at }))
    return NextResponse.json(safe)
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
    const { name, encrypted_key, turn_addr, turn_username, turn_password, turn_realm } = body
    if (!name) {
      return NextResponse.json({ error: 'missing room name' }, { status: 400 })
    }
    if (!encrypted_key) {
      return NextResponse.json({ error: 'missing encrypted key' }, { status: 400 })
    }

    const room = await createRoom(name, peer.id, encrypted_key, { turn_addr, turn_username, turn_password, turn_realm })
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
