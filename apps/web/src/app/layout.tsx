import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mailiac | Async Email Forensics Testing Console',
  description: 'High-speed 11-stage asynchronous email forensics & multi-pillar threat analysis pipeline',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <header style={{
          borderBottom: '1px solid var(--border-glass)',
          background: 'rgba(9, 13, 22, 0.8)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '16px 32px'
        }}>
          <div style={{
            maxWidth: '1400px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: '#fff',
                fontSize: '16px'
              }}>
                M
              </div>
              <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.5px' }}>
                Mailiac <span style={{ color: 'var(--accent-cyan)', fontWeight: 500, fontSize: '14px' }}>Forensic Suite</span>
              </span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} className="animate-pulse-slow"></span>
                API Connected (:4000)
              </span>
              <span style={{ color: 'var(--border-glass)' }}>|</span>
              <span className="font-mono badge-low" style={{ padding: '4px 10px', borderRadius: '6px' }}>
                v0.0.1 (Parallelized)
              </span>
            </div>
          </div>
        </header>

        <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 16px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
