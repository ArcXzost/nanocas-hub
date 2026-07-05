import { NextRequest, NextResponse } from 'next/server'
import { registerPeer, reRegisterPeer, listPeers, getPeer } from '@/lib/kv'

export async function GET() {
  const peers = await listPeers()
  const safe = peers.map(({ bearer_token, ...rest }) => rest)
  return NextResponse.json(safe)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, addr, listen_addr, ext_addr, relay_addr, version, nat_type, public_key } = body
    if (!id) {
      return NextResponse.json({ error: 'missing peer id' }, { status: 400 })
    }
    const existing = await getPeer(id)
    if (!existing) {
      const token = await registerPeer(id, { addr, listen_addr, ext_addr, relay_addr, version, nat_type, public_key })
      return NextResponse.json({ status: 'registered', id, bearer_token: token })
    }
    // Re-registration: refresh bearer token and peer metadata
    const newToken = await reRegisterPeer(id, { addr, listen_addr, ext_addr, relay_addr, version, nat_type, public_key })
    return NextResponse.json({ status: 'registered', id, bearer_token: newToken })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
