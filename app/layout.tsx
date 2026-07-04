import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NanoCAS Hub',
  description: 'Peer-to-peer content-addressable storage dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
