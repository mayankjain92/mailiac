'use client';

import React from 'react';
import type { ForensicHop } from '@mailiac/shared-types';
import { Server, ShieldCheck, ShieldAlert, Globe, MapPin, Cpu } from 'lucide-react';

interface ForensicPathProps {
  forensicPath: ForensicHop[];
}

export default function ForensicPath({ forensicPath }: ForensicPathProps) {
  if (!forensicPath || forensicPath.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
        No reverse-hop headers extracted.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {forensicPath.map((hop, index) => {
          const isOrigin = index === forensicPath.length - 1;
          const isIngress = index === 0;

          return (
            <div
              key={index}
              style={{
                display: 'flex',
                gap: '16px',
                alignItems: 'flex-start',
                position: 'relative'
              }}
            >
              {/* Connector line between hops */}
              {index < forensicPath.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    left: '19px',
                    top: '40px',
                    bottom: '-20px',
                    width: '2px',
                    background: hop.trusted ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)',
                    zIndex: 1
                  }}
                />
              )}

              {/* Hop Node Icon */}
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: hop.trusted ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                  border: `1px solid ${hop.trusted ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: hop.trusted ? '#34d399' : '#fb7185',
                  zIndex: 2,
                  flexShrink: 0
                }}
              >
                <Server style={{ width: '20px', height: '20px' }} />
              </div>

              {/* Hop Details Box */}
              <div
                style={{
                  flex: 1,
                  background: 'rgba(15, 23, 42, 0.5)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-glass)',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="font-mono" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {hop.ip}
                    </span>

                    {hop.isPrivate ? (
                      <span className="font-mono" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' }}>
                        RFC1918 Private
                      </span>
                    ) : hop.ptrValid ? (
                      <span className="font-mono badge-low" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <ShieldCheck style={{ width: '12px', height: '12px' }} /> PTR Valid
                      </span>
                    ) : (
                      <span className="font-mono badge-high" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <ShieldAlert style={{ width: '12px', height: '12px' }} /> PTR Unverified/Forged
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isOrigin && (
                      <span className="font-mono badge-medium" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>
                        Origination Hop
                      </span>
                    )}
                    {isIngress && (
                      <span className="font-mono badge-low" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>
                        Ingress Gateway
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: hop.trusted ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                        color: hop.trusted ? '#10b981' : '#f43f5e',
                        border: `1px solid ${hop.trusted ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}`
                      }}
                    >
                      {hop.trusted ? 'Trusted Boundary' : 'Untrusted Remote'}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Globe style={{ width: '14px', height: '14px', color: 'var(--accent-cyan)' }} />
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{hop.hostnameClaimed || 'Unknown'}</span>
                  </div>

                  {(hop.city || hop.country) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin style={{ width: '14px', height: '14px', color: '#f59e0b' }} />
                      <span>{[hop.city, hop.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}

                  {hop.asn && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', gridColumn: 'span 2' }}>
                      <Cpu style={{ width: '14px', height: '14px', color: '#8b5cf6' }} />
                      <span className="font-mono" style={{ fontSize: '12px' }}>{hop.asn}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
