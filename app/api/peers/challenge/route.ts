import { NextRequest, NextResponse } from 'next/server'
import { setPeerChallenge } from '@/lib/kv'
import { eciesEncrypt, toHex } from '@/lib/ecies'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, public_key } = body
    if (!id || !public_key) {
      return NextResponse.json({ error: 'missing id or public_key' }, { status: 400 })
    }

    // Generate random 32-byte challenge
    const challengeBytes = crypto.getRandomValues(new Uint8Array(32))
    const challengeHex = Array.from(challengeBytes).map(b => b.toString(16).padStart(2, '0')).join('')

    // Store the challenge with TTL
    await setPeerChallenge(id, challengeHex)

    // Encrypt the challenge using the peer's public key (via ECIES)
    const encrypted = await eciesEncrypt(public_key, new TextEncoder().encode(challengeHex))
    const encryptedHex = toHex(encrypted)

    return NextResponse.json({ challenge_encrypted_hex: encryptedHex })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
