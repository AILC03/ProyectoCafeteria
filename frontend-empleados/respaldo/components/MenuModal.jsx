import React from 'react';
import { playHapticSound } from '../utils/audio.js';

export default function MenuModal({
  isOpen,
  onClose,
  theme,
  setTheme,
  audioEnabled,
  setAudioEnabled,
  businessMode = 'restaurant',
  setBusinessMode
}) {
  if (!isOpen) return null;

  const themes = [
    { id: 'theme-nordic', name: 'Nordic Mint', color: '#c7edd9' },
    { id: 'theme-dark', name: 'Dark Graphite', color: '#1e293b' },
    { id: 'theme-latte', name: 'Warm Latte', color: '#fed7aa' },
    { id: 'theme-mint', name: 'Fresh Sage', color: '#dcfce7' }
  ];

  return (
    <div className="modal-overlay open" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-window" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Ajustes de Terminal</h2>
          <button type="button" className="btn-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Selector de Modo de Operación */}
          <div>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: '0.4rem' }}>
              Modo de Operación del Negocio:
            </span>
            <p style={{ margin: '0 0 0.6rem', color: '#64748b', fontSize: '0.8rem' }}>
              Adapta el punto de venta a tu tipo de establecimiento.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => {
                  playHapticSound('click', audioEnabled);
                  setBusinessMode('quick');
                }}
                style={{
                  padding: '0.85rem 0.75rem',
                  borderRadius: '12px',
                  border: businessMode === 'quick' ? '2px solid #0f172a' : '1px solid #cbd5e1',
                  background: businessMode === 'quick' ? '#0f172a' : '#ffffff',
                  color: businessMode === 'quick' ? '#ffffff' : '#1e293b',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Venta Rápida</div>
                <div style={{ fontSize: '0.74rem', color: businessMode === 'quick' ? '#94a3b8' : '#64748b', marginTop: '0.2rem' }}>
                  Cafeterías, panaderías y mostrador directo sin mesas
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  playHapticSound('click', audioEnabled);
                  setBusinessMode('restaurant');
                }}
                style={{
                  padding: '0.85rem 0.75rem',
                  borderRadius: '12px',
                  border: businessMode === 'restaurant' ? '2px solid #0f172a' : '1px solid #cbd5e1',
                  background: businessMode === 'restaurant' ? '#0f172a' : '#ffffff',
                  color: businessMode === 'restaurant' ? '#ffffff' : '#1e293b',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Restaurante</div>
                <div style={{ fontSize: '0.74rem', color: businessMode === 'restaurant' ? '#94a3b8' : '#64748b', marginTop: '0.2rem' }}>
                  Control de mesas, comandas y flujo de meseros
                </div>
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.6rem' }}>
              Color del Panel de Reloj:
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
              {themes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    playHapticSound('click', audioEnabled);
                    setTheme(t.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '12px',
                    border: theme === t.id ? '2px solid #0f172a' : '1px solid #cbd5e1',
                    background: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#0f172a'
                  }}
                >
                  <span
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: t.color,
                      border: '1px solid rgba(0,0,0,0.1)'
                    }}
                  />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.6rem' }}>
              Respuesta Sonora:
            </span>
            <button
              type="button"
              onClick={() => {
                const nextState = !audioEnabled;
                setAudioEnabled(nextState);
                playHapticSound('click', nextState);
              }}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                background: audioEnabled ? '#f0fdf4' : '#f8fafc',
                color: audioEnabled ? '#166534' : '#64748b',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span>Efectos de sonido</span>
              <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                {audioEnabled ? 'Activado' : 'Silenciado'}
              </span>
            </button>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
            Coffee´s Pos &bull; Terminal de Punto de Venta
          </div>
        </div>
      </div>
    </div>
  );
}
