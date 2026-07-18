# NanoCAS Hub

A thin coordination plane for **NanoCAS** — a private P2P content-addressable object store.

The hub handles **peer registration, room admission, ECIES-encrypted key delivery, ICE candidate exchange, WebSocket relay authentication, and HTTP relay fallback for P2P messages**. It never stores file bytes — only metadata, public keys, transient relay messages (end-to-end encrypted), and ICE candidates.

## Architecture

```
           ┌───────────────┐
           │  Vercel       │
           │  KV / Memory  │
           └───────┬───────┘
                   │
         ┌─────────┴─────────┐
         │   NanoCAS Hub     │
         │  (Next.js, free)  │
         │                   │
         │  HTTP relay inbox │
         │  ICE candidate KV │
         │  WS auth gateway  │
         └─┬───────┬───────┬─┘
      ┌────┘       │       └──────┐
      │  ┌─────────┴──────────┐   │
      │  │ relay-server.js    │   │
      │  │ (WS relay, port    │   │
      │  │  3001, Docker)     │   │
      │  └─────────┬──────────┘   │
      │            │              │
      │  ICE cand. │ WS relay msgs│ HTTP relay (poll)
      │  exchange  │ (persistent) │
      │            │              │
  ┌───▼───┐  ┌────▼────┐  ┌─────▼───┐
  │Node A │  │ Node B  │  │ Node C  │
  │       │  │         │  │         │
  │QUIC→  │  │ QUIC→   │  │ QUIC→   │
  │TCP→   │  │ TCP→    │  │ TCP→    │
  │TURN   │  │ TURN    │  │ TURN    │
  └───────┘  └─────────┘  └─────────┘
       ▲                       ▲
       └─── Direct P2P ────────┘
       (QUIC → TCP → TURN relay)
```

## Quick Start

### Deploy to Vercel (Free)

1. Fork/push this repo to GitHub
2. Create a KV store: [vercel.com/marketplace](https://vercel.com/marketplace) → Upstash Redis, add to your Vercel project
3. Import the repo into Vercel — it auto-detects Next.js
4. No further config needed — KV env vars are injected automatically

### Local Development

```bash
npm install
# Without KV env vars, uses in-memory store (resets on restart):
npm run dev
# With Vercel KV:
vercel env pull
npm run dev
```

Memory mode is fine for testing — peers and files disappear on restart but recreating them is cheap.

## API

### Registration & Heartbeats

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/peers` | No | Register peer, receive bearer token |
| POST | `/api/peers/:id/heartbeat` | Bearer | Keep-alive ping (30s interval) |
| GET | `/api/peers` | No | List all registered peers |
| GET | `/api/peers/me` | Bearer | Current peer's own info (id, listen/ext/relay addr, nat type) |
| POST | `/api/peers/cleanup` | No | Mark stale peers offline (90s timeout) |

Registration returns a bearer token that the daemon stores and uses for all subsequent authenticated requests.

### Rooms (Authenticated)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/rooms` | Bearer | Create a room (auto-generates 32-byte AES key) |
| GET | `/api/rooms` | Bearer | List rooms (keys stripped from response) |
| GET | `/api/rooms/:id` | Bearer | Room details, members, pending joiners |
| POST | `/api/rooms/:id/join` | Bearer | Request to join (body: `{"public_key":"<x25519-hex>"}`) |
| POST | `/api/rooms/:id/admit` | Bearer | Admit a pending peer (owner only; body: `{"peer_id":"..."}`) |
| GET | `/api/rooms/:id/key` | Bearer | ECIES-encrypted room key + admitted peer list + TURN creds |
| GET | `/api/rooms/:id/peers` | No | List admitted peers with addresses + online status |
| POST | `/api/rooms/:id/ice-candidates` | Bearer | Push ICE candidates for NAT traversal |
| GET | `/api/rooms/:id/ice-candidates` | Bearer | Fetch ICE candidates for room peers |
| GET | `/api/me/rooms` | Bearer | List room IDs the authenticated peer has joined |

### Relay (Authenticated)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/relay/:peerId` | Bearer | Enqueue a base64-encoded message for a peer |
| GET | `/api/relay/:peerId` | Bearer | Dequeue all pending messages (self only) |

Peers relay encrypted P2P messages through the hub when direct dial fails. Messages are transient (stored in Redis list, returned on next poll). The hub never sees plaintext — contents are AES-256-GCM encrypted with the room key.

### WebSocket Relay (Authenticated)

The hub provides a WebSocket relay server (`relay-server.js`) for lower-latency persistent messaging:

| Feature | Description |
|---------|-------------|
| Port | 3001 (configurable via `WS_RELAY_PORT`) |
| Auth | Bearer token in `?token=` query param |
| Protocol | JSON messages over WebSocket |
| Message types | `relay` (forward to peer), `relay_ready` (connection ack), `peer_list` (online peers), `error` |
| Routing | Room-scoped — only peers sharing a room receive each other's messages |
| Deploy | Standalone Node.js container (`Dockerfile.relay`) — cannot run on Vercel |

The daemon prefers WebSocket relay over HTTP relay for lower latency. If WS relay is unavailable, it falls back to HTTP polling.

### ICE Candidate Exchange (Authenticated)

Peers exchange ICE candidates through the hub for NAT traversal:

1. After joining a room, each peer gathers host, server-reflexive (STUN), and relay (TURN) candidates
2. Pushes them via `POST /api/rooms/:id/ice-candidates`
3. Fetches remote candidates via `GET /api/rooms/:id/ice-candidates`
4. Uses the best candidate to establish a direct QUIC connection

The hub stores candidates per-room in KV. Candidates are cleared when a peer disconnects.

### Files (Unauthenticated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files` | List all file metadata |
| POST | `/api/files` | Report file metadata (daemon sync) |
| POST | `/api/data` | Store text data `{"key":"...","data":"..."}` |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check + stale peer cleanup |

## Room Admission Flow (Detailed)

```
Node A                         Hub                         Node B (owner)
  │                              │                              │
  │  POST /api/peers             │                              │
  │  {public_key: "A_pub"}       │                              │
  │  ← {bearer_token: "tok_A"}   │                              │
  │                              │                              │
  │  POST /api/rooms/join        │                              │
  │  Authorization: Bearer tok_A │                              │
  │  {public_key: "A_pub"}       │                              │
  │  → pending=true              │                              │
  │                              │                              │
  │                              │  POST /api/rooms/:id/admit   │
  │                              │  {peer_id: "A"}              │
  │                              │  ← {status: "admitted"}      │
  │                              │                              │
  │  GET /api/rooms/:id/key      │                              │
  │  Authorization: Bearer tok_A │                              │
  │  ← {encrypted_key: "..."}   │                              │
  │     {peers: [{id,addr}]}    │                              │
  │                              │                              │
  │  ─ decrypts room key via ──  │                              │
  │  ECIESDecrypt(privKey, ...)  │                              │
  │                              │                              │
  │  ─ dials peers ─┬────────────┼──────────────────────────────┤
  │                 │            │                              │
  │  Direct P2P TCP │            │                              │
  │  (AES-encrypted)│            │                              │
  │                 │            │                              │
  │  ─ relay ───────┤            │                              │
  │  fallback via   │            │                              │
  │  POST/GET relay │            │                              │
  │  (Hub, HTTPS)   │            │                              │
```

### Key Delivery

The hub ECDH-encrypts the room key specifically for the requesting peer:

```
ephemeral_private ── X25519 ──> peer_public
                          │
                    HKDF-SHA256("nanocas-ecies-v1")
                          │
                    AES-256-GCM encrypt(room_key)
                          │
           payload: [ephemeral_pub 32][nonce 12][tag+ct 16+16]
```

The peer decrypts with its X25519 private key. Only the intended peer can decrypt. The hub never stores the room key in plaintext in any API response.

## Storage

- **Peers**: Hash map per peer ID (`peer:<id>`) + set index (`peers:list`)
- **Files**: Hash map per file key (`file:<key>`) + set index (`files:list`)
- **Rooms**: Hash map per room ID (`room:<id>`) + set index (`rooms:list`)
- **Memberships**: Hash map per `room_member:<room_id>:<peer_id>`

Vercel KV (Upstash Redis) in production; in-memory `Map` fallback in local dev. No schema enforcement — types are enforced in TypeScript.

## Connecting Daemons

On each NanoCAS node:

```bash
# Same machine, local hub
./dfs --hub http://localhost:3000 --room my-room --web

# Cross-network with deployed hub
./dfs --hub https://my-hub.vercel.app --room my-room

# With Tailscale
./dfs --hub https://my-hub.vercel.app --room my-room \
      --listen :3000 --adv 100.x.y.z:3000
```

The daemon:
1. Registers with the hub, stores the bearer token
2. Requests room membership with its X25519 public key
3. Polls `/api/rooms/:id/key` every 2s (up to 2min) until admitted
4. Decrypts the room key via ECIES
5. Gathers ICE candidates (host, STUN srflx, TURN relay) and pushes via `/api/rooms/:id/ice-candidates`
6. Fetches remote ICE candidates for all room peers
7. Dials all admitted peers via dial cascade: **QUIC → TCP → TURN relay**
8. Falls back to **WebSocket relay** (`relay-server.js:3001`, persistent connection), then **HTTP relay** (`/api/relay/:peerId`, polling)
9. Polls its own relay inbox every 5s for incoming P2P messages
10. Sends heartbeats every 30s with Bearer auth

## Development

```bash
npm run dev          # Local dev server
npm run build        # Production build
npm run test         # Run tests (vitest)
npx vitest run       # Run ECIES cross-language tests
npx next lint        # TypeScript + ESLint
```

### ECIES Cross-Language Tests

The `lib/ecies.test.ts` shares deterministic test vectors with `crypto/ecies_cross_test.go` in the daemon. Both use the same known X25519 keypairs, nonce, and plaintext — Go encrypt → TypeScript decrypt is verified.

## Project Structure

```
nanocas-hub/
├── app/
│   ├── globals.css                # Tailwind base styles
│   ├── layout.tsx                 # Root layout
│   ├── page.tsx                   # Dashboard UI (peers + files tabs)
│   └── api/
│       ├── health/route.ts
│       ├── peers/
│       │   ├── route.ts           # Register + list
│       │   ├── me/route.ts        # Current peer info (authenticated)
│       │   ├── cleanup/route.ts
│       │   └── [id]/heartbeat/route.ts
│       ├── me/
│       │   └── rooms/route.ts     # Current peer's rooms (authenticated)
│       ├── files/route.ts
│       ├── data/route.ts
│       ├── relay/
│       │   └── [peerId]/route.ts  # HTTP relay inbox
│       └── rooms/
│           ├── route.ts           # Create + list rooms
│           ├── [id]/route.ts      # Room details
│           ├── [id]/join/route.ts # Join request
│           ├── [id]/admit/route.ts# Owner admission
│           ├── [id]/key/route.ts  # ECIES key delivery + TURN creds
│           ├── [id]/peers/route.ts# Peer list
│           └── [id]/ice-candidates/route.ts  # ICE candidate push/fetch
├── lib/
│   ├── types.ts                  # PeerRecord, RoomRecord, FileRecord, RoomMembership
│   ├── kv.ts                     # KV + in-memory dual-mode storage
│   ├── ecies.ts                  # X25519 + HKDF + AES-GCM (cross-compatible)
│   ├── ecies.test.ts             # Cross-language test vectors
│   └── routes.ts                 # Bearer token auth middleware
├── relay-server.js               # WebSocket relay server (Node.js, port 3001)
├── Dockerfile.relay              # Docker image for WS relay server
├── vercel.json
├── next.config.js
├── package.json
└── tsconfig.json
```

## License

MIT
