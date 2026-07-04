import { NextRequest, NextResponse } from 'next/server'
import { getPeerByBearerToken } from './kv'

type RouteContext = { params: Record<string, string> }
type Handler = (req: NextRequest, peer: { id: string }, context: RouteContext) => Promise<NextResponse>

export function withAuth(handler: Handler) {
  return async (req: NextRequest, context?: RouteContext) => {
    const auth = req.headers.get('authorization') || ''
    const token = auth.replace('Bearer ', '')
    const peer = await getPeerByBearerToken(token)
    if (!peer) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    return handler(req, { id: peer.id }, context || { params: {} })
  }
}
