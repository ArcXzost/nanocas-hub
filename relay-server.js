const { createServer } = require('http')
const { WebSocketServer } = require('ws')

const PORT = parseInt(process.env.WS_RELAY_PORT || '3001', 10)
const HUB_URL = process.env.HUB_URL || 'http://127.0.0.1:3000'

// peerId -> { ws: WebSocket, rooms: Set<string> }
const peers = new Map()
const reverse = new WeakMap()

function broadcast() {
  const msg = JSON.stringify({ type: 'peer_list', peers: Array.from(peers.keys()) })
  for (const entry of peers.values()) {
    entry.ws.send(msg)
  }
}

function checkRoomOverlap(senderId, targetId) {
  const sender = peers.get(senderId)
  const target = peers.get(targetId)
  if (!sender || !target) return false
  for (const room of sender.rooms) {
    if (target.rooms.has(room)) return true
  }
  return false
}

const server = createServer()
const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x')
  const token = url.searchParams.get('token')
  if (!token) {
    ws.close(4001, 'missing token')
    return
  }

  fetch(HUB_URL + '/api/peers/me', { headers: { Authorization: 'Bearer ' + token } })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(peer => {
      const peerId = peer.id
      if (peers.has(peerId)) {
        peers.get(peerId).ws.close(4002, 'replaced')
      }

      // Fetch peer's room memberships
      return fetch(HUB_URL + '/api/me/rooms', { headers: { Authorization: 'Bearer ' + token } })
        .then(r => r.ok ? r.json() : { room_ids: [] })
        .then(data => {
          const rooms = new Set(data.room_ids || [])
          peers.set(peerId, { ws, rooms })
          reverse.set(ws, peerId)
          ws.send(JSON.stringify({ type: 'relay_ready', peer_id: peerId }))
          broadcast()

          ws.on('message', raw => {
            try {
              const msg = JSON.parse(raw.toString())
              if (msg.type === 'relay' && msg.to) {
                const targetEntry = peers.get(msg.to)
                if (targetEntry && checkRoomOverlap(peerId, msg.to)) {
                  targetEntry.ws.send(JSON.stringify({
                    type: 'relay',
                    from: peerId,
                    data: msg.data,
                  }))
                } else {
                  ws.send(JSON.stringify({ type: 'error', message: 'peer offline or no shared room: ' + msg.to }))
                }
              }
            } catch (e) {
              ws.send(JSON.stringify({ type: 'error', message: 'invalid message' }))
            }
          })

          ws.on('close', () => {
            peers.delete(peerId)
            reverse.delete(ws)
            broadcast()
          })

          ws.on('error', () => {
            peers.delete(peerId)
            reverse.delete(ws)
          })
        })
    })
    .catch(() => ws.close(4001, 'auth failed'))
})

server.listen(PORT, () => {
  console.log('[relay] WebSocket relay listening on port ' + PORT)
})
