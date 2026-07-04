export interface PeerRecord {
  id: string
  addr: string
  listen_addr: string
  version: string
  last_seen: number
  online: boolean
  nat_type: string
  public_key?: string    // X25519 public key hex
  bearer_token?: string  // assigned on registration
}

export interface FileRecord {
  key: string
  size: number
  hash: string
  versions: number
  responsible_peer: string
  replica_peers: string[]
  last_modified: number
}

export interface RoomRecord {
  id: string
  name: string
  owner: string           // peer_id who created the room
  room_key_hex: string    // 32-byte AES key, hex-encoded — never exposed via list
  created_at: number
}

export interface RoomMembership {
  room_id: string
  peer_id: string
  public_key: string      // peer's X25519 public key hex
  admitted: boolean       // false = pending, true = admitted by owner
  admitted_at?: number
}
