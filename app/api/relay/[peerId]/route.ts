import { NextRequest, NextResponse } from 'next/server'
import { getPeerByBearerToken, enqueueMessage, dequeueMessages } from '@/lib/kv'

export async function GET(req: NextRequest, { params }: { params: { peerId: string } }) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '')
  const peer = await getPeerByBearerToken(token)
  if (!peer) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (peer.id !== params.peerId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const messages = await dequeueMessages(params.peerId)
  return NextResponse.json({ messages })
}

export async function POST(req: NextRequest, { params }: { params: { peerId: string } }) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '')
  const peer = await getPeerByBearerToken(token)
  if (!peer) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const message = body.message
  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message must be a base64 string' }, { status: 400 })
  }

  await enqueueMessage(params.peerId, message)
  return NextResponse.json({ status: 'ok' })
}
