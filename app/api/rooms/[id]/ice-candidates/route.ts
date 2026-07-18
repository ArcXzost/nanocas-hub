import { NextRequest, NextResponse } from 'next/server'
import { getMyMembership, storeIceCandidates, getRoomIceCandidates } from '@/lib/kv'
import { withAuth } from '@/lib/routes'

export const POST = withAuth(async (req: NextRequest, peer, ctx) => {
  const membership = await getMyMembership(ctx.params.id, peer.id)
  if (!membership || !membership.admitted) {
    return NextResponse.json({ error: 'not admitted to this room' }, { status: 403 })
  }

  const body = await req.json()
  const { candidates } = body
  if (!Array.isArray(candidates)) {
    return NextResponse.json({ error: 'candidates must be an array' }, { status: 400 })
  }

  await storeIceCandidates(ctx.params.id, peer.id, candidates)
  return NextResponse.json({ status: 'ok' })
})

export const GET = withAuth(async (req: NextRequest, peer, ctx) => {
  const membership = await getMyMembership(ctx.params.id, peer.id)
  if (!membership || !membership.admitted) {
    return NextResponse.json({ error: 'not admitted to this room' }, { status: 403 })
  }

  const candidates = await getRoomIceCandidates(ctx.params.id, peer.id)
  return NextResponse.json({ candidates })
})
