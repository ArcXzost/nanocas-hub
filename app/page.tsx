'use client'

import { useEffect, useState, useCallback } from 'react'

type Peer = {
  id: string
  addr: string
  listen_addr: string
  version: string
  last_seen: number
  online: boolean
  nat_type: string
}

type FileMeta = {
  key: string
  size: number
  hash: string
  versions: number
  responsible_peer: string
  replica_peers: string[]
  last_modified: number
}

type RoomSummary = {
  id: string
  name: string
  owner: string
  created_at: number
}

type RoomMember = {
  peer_id: string
  admitted_at?: number
}

type PendingJoiner = {
  peer_id: string
  public_key: string
}

type RoomDetail = RoomSummary & {
  members: RoomMember[]
  pending_joiners: PendingJoiner[]
}

type PeersInRoom = {
  peer_id: string
  addr: string
  listen_addr: string
  online: boolean
  last_seen: number
}

type Tab = 'files' | 'peers' | 'rooms'
type RoomView = 'list' | 'detail'

function genId(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function ago(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  return `${hr}h ago`
}

function short(s: string, n = 12): string {
  return s.length <= n ? s : s.substring(0, n) + '…'
}

export default function Dashboard() {
  const [peers, setPeers] = useState<Peer[]>([])
  const [files, setFiles] = useState<FileMeta[]>([])
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [tab, setTab] = useState<Tab>('files')
  const [search, setSearch] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [uploadKey, setUploadKey] = useState('')
  const [uploadData, setUploadData] = useState('')
  const [toast, setToast] = useState('')
  const [hubConnected, setHubConnected] = useState(false)

  const [myPeerId, setMyPeerId] = useState<string>('')
  const [myToken, setMyToken] = useState<string>('')
  const [showIdentity, setShowIdentity] = useState(false)
  const [identityInput, setIdentityInput] = useState('')

  const [roomView, setRoomView] = useState<RoomView>('list')
  const [selectedRoom, setSelectedRoom] = useState<RoomDetail | null>(null)
  const [roomPeers, setRoomPeers] = useState<PeersInRoom[]>([])
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [createRoomName, setCreateRoomName] = useState('')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  // Restore identity from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem('nanocas_identity')
    if (saved) {
      try {
        const { peerId, token } = JSON.parse(saved)
        setMyPeerId(peerId || '')
        setMyToken(token || '')
      } catch { /* ignore */ }
    }
  }, [])

  const saveIdentity = useCallback((peerId: string, token: string) => {
    setMyPeerId(peerId)
    setMyToken(token)
    sessionStorage.setItem('nanocas_identity', JSON.stringify({ peerId, token }))
  }, [])

  const clearIdentity = useCallback(() => {
    setMyPeerId('')
    setMyToken('')
    sessionStorage.removeItem('nanocas_identity')
  }, [])

  const authHeaders = useCallback((): Record<string, string> => {
    if (!myToken) return {}
    return { Authorization: `Bearer ${myToken}` }
  }, [myToken])

  const fetchAll = useCallback(async () => {
    try {
      const [pres, fres] = await Promise.all([
        fetch('/api/peers'),
        fetch('/api/files'),
      ])
      if (pres.ok) setPeers(await pres.json())
      if (fres.ok) setFiles(await fres.json())
      setHubConnected(true)
    } catch {
      setHubConnected(false)
    }
  }, [])

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/rooms', { headers: authHeaders() })
      if (res.ok) setRooms(await res.json())
    } catch { /* ignore */ }
  }, [authHeaders])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 10000)
    return () => clearInterval(iv)
  }, [fetchAll])

  useEffect(() => {
    if (tab === 'rooms' && myToken) {
      fetchRooms()
      const iv = setInterval(fetchRooms, 10000)
      return () => clearInterval(iv)
    }
  }, [tab, myToken, fetchRooms])

  const handleRegister = async () => {
    const id = genId()
    try {
      const res = await fetch('/api/peers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, addr: 'dashboard', listen_addr: 'dashboard', version: '0.1.0', nat_type: 'hub-ui' }),
      })
      if (!res.ok) throw new Error('registration failed')
      const data = await res.json()
      saveIdentity(id, data.bearer_token)
      showToast(`Registered as ${short(id)}`)
      setShowIdentity(false)
      fetchRooms()
    } catch (e: any) {
      showToast(e.message)
    }
  }

  const handleSetIdentity = () => {
    if (!identityInput.trim()) return
    // Format: peer_id:token
    const parts = identityInput.split(':')
    if (parts.length < 2) {
      showToast('Format: peer_id:token')
      return
    }
    saveIdentity(parts[0], parts.slice(1).join(':'))
    setShowIdentity(false)
    setIdentityInput('')
    fetchRooms()
  }

  const handleCreateRoom = async () => {
    if (!createRoomName.trim()) return
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: createRoomName.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'create failed')
      showToast(`Room "${createRoomName}" created`)
      setCreateRoomName('')
      setShowCreateRoom(false)
      fetchRooms()
    } catch (e: any) {
      showToast(e.message)
    }
  }

  const handleOpenRoom = async (roomId: string) => {
    try {
      const [detailRes, peersRes] = await Promise.all([
        fetch(`/api/rooms/${roomId}`, { headers: authHeaders() }),
        fetch(`/api/rooms/${roomId}/peers`),
      ])
      if (detailRes.ok) setSelectedRoom(await detailRes.json())
      if (peersRes.ok) setRoomPeers(await peersRes.json())
      setRoomView('detail')
    } catch (e: any) {
      showToast(e.message)
    }
  }

  const handleAdmit = async (peerId: string) => {
    if (!selectedRoom) return
    try {
      const res = await fetch(`/api/rooms/${selectedRoom.id}/admit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ peer_id: peerId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'admit failed')
      showToast(`Admitted ${short(peerId)}`)
      handleOpenRoom(selectedRoom.id)
    } catch (e: any) {
      showToast(e.message)
    }
  }

  const handleUpload = async () => {
    if (!uploadKey || !uploadData) return
    const body = { key: uploadKey, data: uploadData }
    try {
      const res = await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json()).error || 'upload failed')
      showToast(`Stored "${uploadKey}"`)
      setUploadKey('')
      setUploadData('')
      setShowUpload(false)
      fetchAll()
    } catch (e: any) {
      showToast(e.message)
    }
  }

  const onlineCount = peers.filter(p => p.online).length
  const filteredFiles = files.filter(f =>
    f.key.toLowerCase().includes(search.toLowerCase())
  )
  const isRegistered = !!myPeerId && !!myToken

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 16px' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>NanoCAS</h1>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: hubConnected ? 'var(--green)' : 'var(--red)', color: '#fff' }}>
          {hubConnected ? 'hub.online' : 'hub.offline'}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {onlineCount}/{peers.length} peers online
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {files.length} files
        </span>
        {isRegistered && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {short(myPeerId)}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {!isRegistered && (
            <button className="btn" onClick={() => setShowIdentity(true)}>Sign In</button>
          )}
          {isRegistered && (
            <button className="btn" onClick={clearIdentity} style={{ color: 'var(--red)' }}>Sign Out</button>
          )}
          <button className="btn" onClick={() => setShowUpload(true)}>+ Upload</button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <TabButton label="Files" active={tab === 'files'} onClick={() => setTab('files')} />
        <TabButton label="Peers" active={tab === 'peers'} onClick={() => setTab('peers')} />
        <TabButton label="Rooms" active={tab === 'rooms'} onClick={() => setTab('rooms')} />
      </div>

      {/* Files Tab */}
      {tab === 'files' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <input type="text" placeholder="Search files..." value={search} onChange={e => setSearch(e.target.value)} className="input" />
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Size</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Versions</th>
                  <th style={{ width: 120 }}>Location</th>
                  <th style={{ width: 100 }}>Modified</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>No files found</td></tr>
                )}
                {filteredFiles.map(f => (
                  <tr key={f.key}>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{f.key}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatBytes(f.size)}</td>
                    <td style={{ textAlign: 'center' }}>{f.versions}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{f.responsible_peer}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ago(f.last_modified)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Peers Tab */}
      {tab === 'peers' && (
        <div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Status</th>
                  <th>ID</th>
                  <th>Address</th>
                  <th>Network</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {peers.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>No peers registered</td></tr>
                )}
                {peers.map(p => (
                  <tr key={p.id}>
                    <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: p.online ? 'var(--green)' : 'var(--red)' }} /></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{short(p.id, 16)}</td>
                    <td style={{ fontSize: 13 }}>{p.addr}</td>
                    <td style={{ fontSize: 12 }}>
                      <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 11, background: 'var(--bg-tertiary)' }}>{p.nat_type}</span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ago(p.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rooms Tab */}
      {tab === 'rooms' && (
        <div>
          {!isRegistered ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
              <p style={{ marginBottom: 16 }}>Sign in to manage rooms</p>
              <button className="btn btn-primary" onClick={() => setShowIdentity(true)}>Sign In</button>
            </div>
          ) : roomView === 'list' ? (
            <div>
              <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Rooms</span>
                <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setShowCreateRoom(true)}>+ Create Room</button>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th style={{ width: 180 }}>Owner</th>
                      <th style={{ width: 100 }}>Created</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>No rooms yet</td></tr>
                    )}
                    {rooms.map(r => (
                      <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => handleOpenRoom(r.id)}>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{short(r.owner)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ago(r.created_at)}</td>
                        <td><button className="btn" style={{ fontSize: 12 }} onClick={e => { e.stopPropagation(); handleOpenRoom(r.id) }}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : selectedRoom && (
            <div>
              <button className="btn" style={{ marginBottom: 12 }} onClick={() => { setRoomView('list'); setSelectedRoom(null) }}>← Back to Rooms</button>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>{selectedRoom.name}</h2>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {selectedRoom.id} — owner: {short(selectedRoom.owner)} — created {ago(selectedRoom.created_at)}
                </span>
              </div>

              {/* Members */}
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Members ({selectedRoom.members.length})</h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Peer ID</th>
                        <th style={{ width: 120 }}>Admitted</th>
                        <th style={{ width: 120 }}>Address</th>
                        <th style={{ width: 60 }}>Online</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRoom.members.length === 0 && (
                        <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No members yet</td></tr>
                      )}
                      {selectedRoom.members.map(m => {
                        const pr = roomPeers.find(rp => rp.peer_id === m.peer_id)
                        return (
                          <tr key={m.peer_id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{short(m.peer_id, 24)}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.admitted_at ? ago(m.admitted_at) : '-'}</td>
                            <td style={{ fontSize: 12 }}>{pr?.addr || '-'}</td>
                            <td><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: pr?.online ? 'var(--green)' : 'var(--red)' }} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pending Joiners */}
              {selectedRoom.pending_joiners.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Pending Joiners ({selectedRoom.pending_joiners.length})</h3>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Peer ID</th>
                          <th>Public Key</th>
                          {selectedRoom.owner === myPeerId && <th style={{ width: 80 }}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRoom.pending_joiners.map(j => (
                          <tr key={j.peer_id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{short(j.peer_id, 24)}</td>
                            <td style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{short(j.public_key, 20)}</td>
                            {selectedRoom.owner === myPeerId && (
                              <td>
                                <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => handleAdmit(j.peer_id)}>Admit</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Identity Modal */}
      {showIdentity && (
        <div className="overlay" onClick={() => setShowIdentity(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Sign In</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              Register a new identity on this hub, or paste an existing peer ID + token.
            </p>
            <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={handleRegister}>
              Register New Identity
            </button>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 8 }}>
              <input className="input" placeholder="peer_id:bearer_token" value={identityInput} onChange={e => setIdentityInput(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowIdentity(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSetIdentity}>Use Token</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {showCreateRoom && (
        <div className="overlay" onClick={() => setShowCreateRoom(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Create Room</h2>
            <input className="input" placeholder="Room name" value={createRoomName} onChange={e => setCreateRoomName(e.target.value)} style={{ marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowCreateRoom(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateRoom}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="overlay" onClick={() => setShowUpload(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Store Data</h2>
            <input className="input" placeholder="Key" value={uploadKey} onChange={e => setUploadKey(e.target.value)} style={{ marginBottom: 8 }} />
            <textarea className="input" placeholder="Data (text)" value={uploadData} onChange={e => setUploadData(e.target.value)} rows={5} style={{ marginBottom: 12, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowUpload(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload}>Store</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        .btn {
          padding: 6px 14px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          color: var(--text-primary);
          cursor: pointer;
          font-size: 13px;
          transition: background 0.15s;
        }
        .btn:hover { background: var(--bg-tertiary); }
        .btn-primary { background: var(--accent); border-color: var(--accent); }
        .btn-primary:hover { background: var(--accent-hover); }
        .input {
          width: 100%;
          padding: 8px 10px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
        }
        .input:focus { border-color: var(--accent); }
        .table-wrap {
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .table th {
          text-align: left;
          padding: 8px 12px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          font-weight: 600;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.5px;
          border-bottom: 1px solid var(--border);
        }
        .table td {
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
        }
        .table tr:last-child td { border-bottom: none; }
        .table tr:hover td { background: rgba(255,255,255,0.02); }
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 16px;
        }
        .modal {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          width: 100%;
          max-width: 460px;
        }
        .toast {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--accent);
          color: #fff;
          padding: 8px 20px;
          border-radius: 8px;
          font-size: 13px;
          z-index: 200;
          animation: fadeIn 0.2s;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        border: 'none',
        background: 'none',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        transition: 'color 0.15s',
      }}
    >
      {label}
    </button>
  )
}
