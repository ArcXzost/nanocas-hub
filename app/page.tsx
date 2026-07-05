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

type Tab = 'files' | 'peers' | 'rooms'

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
  const [hubConnected, setHubConnected] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [pres, fres, rres] = await Promise.all([
        fetch('/api/peers'),
        fetch('/api/files'),
        fetch('/api/rooms'),
      ])
      if (pres.ok) setPeers(await pres.json())
      if (fres.ok) setFiles(await fres.json())
      if (rres.ok) setRooms(await rres.json())
      setHubConnected(true)
    } catch {
      setHubConnected(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 10000)
    return () => clearInterval(iv)
  }, [fetchAll])

  const onlineCount = peers.filter(p => p.online).length
  const filteredFiles = files.filter(f =>
    f.key.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 16px' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>NanoCAS Global Hub</h1>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: hubConnected ? 'var(--green)' : 'var(--red)', color: '#fff' }}>
          {hubConnected ? 'hub.online' : 'hub.offline'}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {onlineCount}/{peers.length} peers
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {rooms.length} rooms
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {files.length} files
        </span>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
          Read-only monitor (Manage via local node UI)
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <TabButton 
          label="Global Files" 
          active={tab === 'files'} 
          onClick={() => setTab('files')} 
          icon={<svg viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>}
        />
        <TabButton 
          label="Mesh Peers" 
          active={tab === 'peers'} 
          onClick={() => setTab('peers')} 
          icon={<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>}
        />
        <TabButton 
          label="Active Rooms" 
          active={tab === 'rooms'} 
          onClick={() => setTab('rooms')} 
          icon={<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>}
        />
      </div>

      {/* Files Tab */}
      {tab === 'files' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <input type="text" placeholder="Search global files..." value={search} onChange={e => setSearch(e.target.value)} className="input" />
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
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>No files found in registry</td></tr>
                )}
                {filteredFiles.map(f => (
                  <tr key={f.key}>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{f.key}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatBytes(f.size)}</td>
                    <td style={{ textAlign: 'center' }}>{f.versions}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{short(f.responsible_peer)}</td>
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
                  <th>Peer ID</th>
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
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Room Name</th>
                  <th>Room ID</th>
                  <th>Owner ID</th>
                  <th style={{ width: 100 }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {rooms.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>No rooms created</td></tr>
                )}
                {rooms.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.id}</td>
                    <td style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{short(r.owner)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ago(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style jsx>{`
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
      `}</style>
    </div>
  )
}

function TabButton({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 20px',
        border: 'none',
        background: 'none',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        transition: 'all 0.15s',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}
    >
      {icon && (
        <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
      )}
      {label}
    </button>
  )
}
