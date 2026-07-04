import type { PeerRecord, FileRecord, RoomRecord, RoomMembership } from './types'

const hasKV = !!(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
)

type Store = {
  peers: Map<string, PeerRecord>
  files: Map<string, FileRecord>
  rooms: Map<string, RoomRecord>
  memberships: Map<string, RoomMembership>   // key: `${room_id}:${peer_id}`
}

let mem: Store | null = null
function memoryStore(): Store {
  if (!mem) mem = { peers: new Map(), files: new Map(), rooms: new Map(), memberships: new Map() }
  return mem
}

async function kvCall<T>(fn: (kv: any) => Promise<T>, fallback: T): Promise<T> {
  if (hasKV) {
    const { kv } = await import('@vercel/kv')
    try { return await fn(kv) } catch (e) { console.error('[kv]', e); return fallback }
  }
  return fallback
}

export async function getPeer(id: string): Promise<PeerRecord | null> {
  const p = await kvCall(kv => kv.hgetall(`peer:${id}`), memoryStore().peers.get(id) || null)
  return p as PeerRecord | null
}

export async function registerPeer(id: string, data: { addr?: string; listen_addr?: string; version?: string; nat_type?: string; public_key?: string }): Promise<string> {
  const token = crypto.randomUUID()
  const entry: PeerRecord = {
    id,
    addr: data.addr || '',
    listen_addr: data.listen_addr || '',
    version: data.version || '',
    nat_type: data.nat_type || '',
    public_key: data.public_key,
    last_seen: Date.now(),
    online: true,
    bearer_token: token,
  }
  await kvCall(kv => kv.hset(`peer:${id}`, entry as any), undefined)
  await kvCall(kv => kv.sadd('peers:list', id), undefined)
  await kvCall(kv => kv.set(`bearer:${token}`, id), undefined)
  memoryStore().peers.set(id, entry)
  return token
}

export async function getPeerByBearerToken(token: string): Promise<PeerRecord | null> {
  if (hasKV) {
    const peerId = await kvCall(kv => kv.get(`bearer:${token}`), null) as string | null
    if (peerId) {
      const p = await kvCall(kv => kv.hgetall(`peer:${peerId}`), null) as PeerRecord | null
      if (p) return p
    }
    const peers = await listPeers()
    return peers.find(p => p.bearer_token === token) || null
  }
  for (const p of memoryStore().peers.values()) {
    if (p.bearer_token === token) return p
  }
  return null
}

export async function peerHeartbeat(id: string): Promise<boolean> {
  const exists = await kvCall(kv => kv.exists(`peer:${id}`), memoryStore().peers.has(id) ? 1 : 0)
  if (!exists) return false
  await kvCall(kv => kv.hset(`peer:${id}`, { last_seen: Date.now(), online: true }), undefined)
  const p = memoryStore().peers.get(id)
  if (p) { p.last_seen = Date.now(); p.online = true }
  return true
}

export async function listPeers(): Promise<PeerRecord[]> {
  if (hasKV) {
    const ids = await kvCall(kv => kv.smembers('peers:list'), [])
    const peers: PeerRecord[] = []
    for (const id of ids) {
      const p = await kvCall(kv => kv.hgetall(`peer:${id}`), null) as PeerRecord | null
      if (p) peers.push(p)
    }
    return peers
  }
  return Array.from(memoryStore().peers.values()).sort((a, b) => b.last_seen - a.last_seen)
}

export async function markPeerOffline(id: string): Promise<void> {
  await kvCall(kv => kv.hset(`peer:${id}`, { online: false }), undefined)
  const p = memoryStore().peers.get(id)
  if (p) p.online = false
}

export async function upsertFile(data: Record<string, unknown>): Promise<void> {
  const key = data.key as string
  const entry = { ...data, last_modified: Date.now() } as unknown as FileRecord
  await kvCall(kv => kv.hset(`file:${key}`, entry), undefined)
  await kvCall(kv => kv.sadd('files:list', key), undefined)
  memoryStore().files.set(key, entry)
}

export async function listFiles(): Promise<FileRecord[]> {
  if (hasKV) {
    const keys = await kvCall(kv => kv.smembers('files:list'), [])
    const files: FileRecord[] = []
    for (const key of keys) {
      const f = await kvCall(kv => kv.hgetall(`file:${key}`), null) as FileRecord | null
      if (f) files.push(f)
    }
    return files
  }
  return Array.from(memoryStore().files.values())
}

export async function deleteFile(key: string): Promise<void> {
  await kvCall(kv => kv.del(`file:${key}`), undefined)
  await kvCall(kv => kv.srem('files:list', key), undefined)
  memoryStore().files.delete(key)
}

// ─── Room functions ───────────────────────────────────────────────

function nextRoomID(): string {
  return `room_${crypto.randomUUID().slice(0, 8)}`
}

export async function createRoom(name: string, owner: string, roomKeyHex: string): Promise<RoomRecord> {
  const room: RoomRecord = {
    id: nextRoomID(),
    name,
    owner,
    room_key_hex: roomKeyHex,
    created_at: Date.now(),
  }
  await kvCall(kv => kv.hset(`room:${room.id}`, room as any), undefined)
  await kvCall(kv => kv.sadd('rooms:list', room.id), undefined)
  // Owner is automatically an admitted member
  const ownerPeer = await kvCall(kv => kv.hgetall(`peer:${owner}`), memoryStore().peers.get(owner) || null) as PeerRecord | null
  const ownerPubKey = ownerPeer?.public_key || ''
  const membership: RoomMembership = {
    room_id: room.id,
    peer_id: owner,
    public_key: ownerPubKey,
    admitted: true,
    admitted_at: Date.now(),
  }
  await kvCall(kv => kv.hset(`room_member:${room.id}:${owner}`, membership as any), undefined)
  await kvCall(kv => kv.sadd(`room:${room.id}:members`, owner), undefined)
  memoryStore().rooms.set(room.id, room)
  memoryStore().memberships.set(`${room.id}:${owner}`, membership)
  return room
}

export async function getRoom(roomId: string): Promise<RoomRecord | null> {
  const room = await kvCall(kv => kv.hgetall(`room:${roomId}`), memoryStore().rooms.get(roomId) || null)
  return room as RoomRecord | null
}

export async function listRooms(): Promise<RoomRecord[]> {
  if (hasKV) {
    const ids = await kvCall(kv => kv.smembers('rooms:list'), [])
    const rooms: RoomRecord[] = []
    for (const id of ids) {
      const r = await kvCall(kv => kv.hgetall(`room:${id}`), null)
      if (r) rooms.push(r as RoomRecord)
    }
    return rooms
  }
  return Array.from(memoryStore().rooms.values())
}

export async function requestJoinRoom(roomId: string, peerId: string, publicKey: string): Promise<boolean> {
  const room = await getRoom(roomId)
  if (!room) return false

  const membership: RoomMembership = {
    room_id: roomId,
    peer_id: peerId,
    public_key: publicKey,
    admitted: false,
  }
  const key = `${roomId}:${peerId}`
  await kvCall(kv => kv.hset(`room_member:${key}`, membership as any), undefined)
  await kvCall(kv => kv.sadd(`room:${roomId}:joiners`, peerId), undefined)
  memoryStore().memberships.set(key, membership)
  return true
}

export async function admitPeer(roomId: string, peerId: string): Promise<boolean> {
  const room = await getRoom(roomId)
  if (!room) return false

  const key = `${roomId}:${peerId}`
  const membership = await kvCall(kv => kv.hgetall(`room_member:${key}`), memoryStore().memberships.get(key) || null) as RoomMembership | null
  if (!membership) return false

  membership.admitted = true
  membership.admitted_at = Date.now()
  await kvCall(kv => kv.hset(`room_member:${key}`, membership as any), undefined)
  await kvCall(kv => kv.sadd(`room:${roomId}:members`, peerId), undefined)
  await kvCall(kv => kv.srem(`room:${roomId}:joiners`, peerId), undefined)
  memoryStore().memberships.set(key, membership)
  return true
}

export async function getRoomMembers(roomId: string): Promise<RoomMembership[]> {
  if (hasKV) {
    const ids = await kvCall(kv => kv.smembers(`room:${roomId}:members`), [])
    const joiners = await kvCall(kv => kv.smembers(`room:${roomId}:joiners`), [])
    const all = [...ids, ...joiners]
    const members: RoomMembership[] = []
    for (const pid of all) {
      const m = await kvCall(kv => kv.hgetall(`room_member:${roomId}:${pid}`), null)
      if (m) members.push(m as RoomMembership)
    }
    return members
  }
  const ms: RoomMembership[] = []
  for (const [k, v] of memoryStore().memberships) {
    if (k.startsWith(`${roomId}:`)) ms.push(v)
  }
  return ms
}

export async function getMyMembership(roomId: string, peerId: string): Promise<RoomMembership | null> {
  const key = `${roomId}:${peerId}`
  const m = await kvCall(kv => kv.hgetall(`room_member:${key}`), memoryStore().memberships.get(key) || null)
  return m as RoomMembership | null
}

export async function getMemberByPeerId(peerId: string): Promise<RoomMembership[]> {
  if (hasKV) {
    // KV doesn't support pattern scan efficiently; iterate rooms
    const rooms = await listRooms()
    const result: RoomMembership[] = []
    for (const r of rooms) {
      const m = await kvCall(kv => kv.hgetall(`room_member:${r.id}:${peerId}`), null)
      if (m) result.push(m as RoomMembership)
    }
    return result
  }
  const result: RoomMembership[] = []
  for (const [k, v] of memoryStore().memberships) {
    if (k.endsWith(`:${peerId}`)) result.push(v)
  }
  return result
}

export async function getPeerRooms(peerId: string): Promise<RoomRecord[]> {
  const memberships = await getMemberByPeerId(peerId)
  const rooms: RoomRecord[] = []
  for (const m of memberships) {
    const r = await getRoom(m.room_id)
    if (r) rooms.push(r)
  }
  return rooms
}

export async function cleanupStalePeers(timeoutMs = 90000): Promise<number> {
  const peers = await listPeers()
  const now = Date.now()
  let cleaned = 0
  for (const p of peers) {
    if (now - p.last_seen > timeoutMs && p.online) {
      await markPeerOffline(p.id)
      cleaned++
    }
  }
  return cleaned
}
