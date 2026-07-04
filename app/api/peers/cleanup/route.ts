import { NextResponse } from 'next/server'
import { cleanupStalePeers } from '@/lib/kv'
import { withAuth } from '@/lib/routes'

export const POST = withAuth(async () => {
  const cleaned = await cleanupStalePeers()
  return NextResponse.json({ cleaned })
})
