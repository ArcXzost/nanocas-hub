import { x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

const KEY_SIZE = 32
const NONCE_SIZE = 12
const ECIES_PREFIX = 32
const ECIES_MIN = ECIES_PREFIX + NONCE_SIZE + 16

const INFO = new TextEncoder().encode('nanocas-ecies-v1')

function toBufferSource(buf: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buf)
}

function deriveKey(sharedSecret: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedSecret, undefined, INFO, KEY_SIZE)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, b) => s + b.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

export async function eciesEncrypt(
  peerPublicKeyHex: string,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  const peerPubKey = hexToBytes(peerPublicKeyHex)

  const ephemeralPriv = x25519.utils.randomSecretKey()
  const ephemeralPub = x25519.getPublicKey(ephemeralPriv)

  const sharedSecret = x25519.getSharedSecret(ephemeralPriv, peerPubKey)
  const aesKey = deriveKey(sharedSecret)

  const nonce = new Uint8Array(NONCE_SIZE)
  crypto.getRandomValues(nonce)

  const aesCryptoKey = await crypto.subtle.importKey(
    'raw', toBufferSource(aesKey), { name: 'AES-GCM' }, false, ['encrypt']
  )
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toBufferSource(nonce) }, aesCryptoKey, toBufferSource(plaintext)
    )
  )

  return concat([ephemeralPub, nonce, ciphertext])
}

export async function eciesDecrypt(
  privateKeyHex: string,
  payload: Uint8Array
): Promise<Uint8Array> {
  if (payload.length < ECIES_MIN) {
    throw new Error('ECIES payload too short')
  }

  const privKey = hexToBytes(privateKeyHex)

  const ephemeralPub = payload.subarray(0, ECIES_PREFIX)
  const nonce = payload.subarray(ECIES_PREFIX, ECIES_PREFIX + NONCE_SIZE)
  const ciphertext = payload.subarray(ECIES_PREFIX + NONCE_SIZE)

  const sharedSecret = x25519.getSharedSecret(privKey, ephemeralPub)
  const aesKey = deriveKey(sharedSecret)

  const aesCryptoKey = await crypto.subtle.importKey(
    'raw', toBufferSource(aesKey), { name: 'AES-GCM' }, false, ['decrypt']
  )
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBufferSource(nonce) }, aesCryptoKey, toBufferSource(ciphertext)
    )
  )

  return plaintext
}

export function toHex(buf: Uint8Array): string {
  return bytesToHex(buf)
}

export function fromHex(s: string): Uint8Array {
  return hexToBytes(s)
}
