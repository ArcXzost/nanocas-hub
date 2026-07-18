import { NextRequest, NextResponse } from 'next/server'
import { getPeerByBearerToken } from '@/lib/kv'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '')
  const peer = await getPeerByBearerToken(token)
  if (!peer) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    id: peer.id,
    listen_addr: peer.listen_addr,
    ext_addr: peer.ext_addr,
    relay_addr: peer.relay_addr,
    nat_type: peer.nat_type,
  })
}
