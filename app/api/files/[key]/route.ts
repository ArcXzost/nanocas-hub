import { NextRequest, NextResponse } from 'next/server'
import { deleteFile } from '@/lib/kv'
import { withAuth } from '@/lib/routes'

export const DELETE = withAuth(async (req: NextRequest, peer, ctx) => {
  const key = ctx.params.key
  if (!key) {
    return NextResponse.json({ error: 'missing file key' }, { status: 400 })
  }
  await deleteFile(key)
  return NextResponse.json({ status: 'deleted', key })
})
