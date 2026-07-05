import { NextRequest, NextResponse } from 'next/server'
import { getRoom, getMyMembership, getPeerByBearerToken, getRoomMembers, listPeers } from '@/lib/kv'
import { eciesEncrypt, toHex, fromHex } from '@/lib/ecies'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Verify peer is admitted
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '')
  const peer = await getPeerByBearerToken(token)
  if (!peer) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const membership = await getMyMembership(params.id, peer.id)
  if (!membership || !membership.admitted) {
    return NextResponse.json({ error: 'not admitted to this room' }, { status: 403 })
  }

  const room = await getRoom(params.id)
  if (!room) {
    return NextResponse.json({ error: 'room not found' }, { status: 404 })
  }

  // Encrypt room key with peer's public key
  const pubKey = membership.public_key
  if (!pubKey) {
    return NextResponse.json({ error: 'no public key on record' }, { status: 400 })
  }

  const encrypted = await eciesEncrypt(pubKey, fromHex(room.room_key_hex))

  // Get list of admitted peers with addresses for direct P2P
  const allMembers = await getRoomMembers(params.id)
  const allPeers = await listPeers()
  const peerMap = new Map(allPeers.map(p => [p.id, p]))
  const admittedPeers = allMembers
    .filter(m => m.admitted && m.peer_id !== peer.id)
    .map(m => {
      const p = peerMap.get(m.peer_id)
      return {
        peer_id: m.peer_id,
        listen_addr: p?.listen_addr || '',
        ext_addr: p?.ext_addr || '',
        relay_addr: p?.relay_addr || '',
      }
    })

  return NextResponse.json({
    room_key_hex: toHex(encrypted),
    room_name: room.name,
    turn_addr: room.turn_addr || '',
    turn_username: room.turn_username || '',
    turn_password: room.turn_password || '',
    turn_realm: room.turn_realm || '',
    peers: admittedPeers,
  })
}
