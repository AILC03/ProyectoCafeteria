import React, { useState, useEffect } from 'react';
import { playHapticSound } from '../utils/audio.js';
import { getAllOrders } from '../data/db.js';

export default function MenuModal({
  isOpen,
  onClose,
  theme,
  setTheme,
  audioEnabled,
  setAudioEnabled,
  account,
  onUnlinkAccount,
  currentEmployee,
  onReprintOrder,
  onReprintLastTicket
}) {
  const [activeTab, setActiveTab] = useState('tickets'); // 'tickets' | 'preferences' | 'terminal'
  const [recentOrders, setRecentOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  
  // Preferencias de impresión persistidas
  const [ticketWidth, setTicketWidth] = useState(() => localStorage.getItem('coffees_ticket_width') || localStorage.getItem('taffy_ticket_width') || '80mm');
  const [autoPrint, setAutoPrint] = useState(() => (localStorage.getItem('coffees_auto_print') || localStorage.getItem('taffy_auto_print')) === 'true');
  const [ticketFooter, setTicketFooter] = useState(() => localStorage.getItem('coffees_ticket_footer') || localStorage.getItem('taffy_ticket_footer') || '¡Gracias por su compra! Vuelva pronto.');

  // Guardar configuración de ticket
  function handleTicketWidthChange(width) {
    setTicketWidth(width);
    localStorage.setItem('coffees_ticket_width', width);
    localStorage.setItem('taffy_ticket_width', width);
  }

  function handleAutoPrintToggle() {
    const nextVal = !autoPrint;
    setAutoPrint(nextVal);
    localStorage.setItem('coffees_auto_print', String(nextVal));
    localStorage.setItem('taffy_auto_print', String(nextVal));
  }

  function handleTicketFooterChange(e) {
    const val = e.target.value;
    setTicketFooter(val);
    localStorage.setItem('coffees_ticket_footer', val);
    localStorage.setItem('taffy_ticket_footer', val);
  }

  // Cargar tickets recientes al abrir el modal
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingOrders(true);

    getAllOrders()
      .then((orders) => {
        if (!isMounted) return;
        const sorted = (orders || []).sort(
          (a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0)
        );
        setRecentOrders(sorted.slice(0, 6)); // Últimos 6 tickets
      })
      .catch((err) => {
        console.warn('Error cargando pedidos para ajustes:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingOrders(false);
      });

    const handleFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      isMounted = false;
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const themes = [
    { id: 'theme-nordic', name: 'Nordic Mint', color: '#c7edd9' },
    { id: 'theme-dark', name: 'Dark Graphite', color: '#1e293b' },
    { id: 'theme-latte', name: 'Warm Latte', color: '#fed7aa' },
    { id: 'theme-mint', name: 'Fresh Sage', color: '#dcfce7' }
  ];

  function toggleFullscreen() {
    playHapticSound('click', audioEnabled);
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-window"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '560px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.5rem',
          borderRadius: '20px'
        }}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <h2 className="modal-title" style={{ fontSize: '1.25rem', fontWeight: 800 }}>Ajustes del Sistema</h2>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Terminal {account?.terminalName || 'Caja Principal'} &bull; {account?.businessName || 'Coffee´s Pos'}
            </div>
          </div>
          <button type="button" className="btn-modal-close" onClick={onClose} aria-label="Cerrar modal">
            &times;
          </button>
        </div>

        {/* Pestañas de Navegación de Ajustes */}
        <div
          style={{
            display: 'flex',
            gap: '0.4rem',
            background: '#f1f5f9',
            padding: '0.35rem',
            borderRadius: '12px',
            marginBottom: '1.25rem'
          }}
        >
          <button
            type="button"
            onClick={() => {
              playHapticSound('click', audioEnabled);
              setActiveTab('tickets');
            }}
            style={{
              flex: 1,
              padding: '0.55rem 0.5rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === 'tickets' ? '#ffffff' : 'transparent',
              color: activeTab === 'tickets' ? '#0f172a' : '#64748b',
              fontWeight: activeTab === 'tickets' ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'tickets' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Tickets e Impresión
          </button>

          <button
            type="button"
            onClick={() => {
              playHapticSound('click', audioEnabled);
              setActiveTab('preferences');
            }}
            style={{
              flex: 1,
              padding: '0.55rem 0.5rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === 'preferences' ? '#ffffff' : 'transparent',
              color: activeTab === 'preferences' ? '#0f172a' : '#64748b',
              fontWeight: activeTab === 'preferences' ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'preferences' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Preferencias
          </button>

          <button
            type="button"
            onClick={() => {
              playHapticSound('click', audioEnabled);
              setActiveTab('terminal');
            }}
            style={{
              flex: 1,
              padding: '0.55rem 0.5rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === 'terminal' ? '#ffffff' : 'transparent',
              color: activeTab === 'terminal' ? '#0f172a' : '#64748b',
              fontWeight: activeTab === 'terminal' ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'terminal' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Terminal
          </button>
        </div>

        {/* Contenido scrolleable de Ajustes */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
          {/* TAB 1: TICKETS & IMPRESIÓN */}
          {activeTab === 'tickets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Botón Acción Rápida: Reimprimir Último Ticket */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                  color: '#ffffff',
                  padding: '1.1rem',
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>Reimpresión Rápida</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                    Abre el último ticket emitido para enviarlo a la impresora
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playHapticSound('click', audioEnabled);
                    onClose();
                    onReprintLastTicket?.();
                  }}
                  style={{
                    background: '#38bdf8',
                    color: '#0f172a',
                    border: 'none',
                    padding: '0.55rem 1.1rem',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span>Reimprimir</span>
                </button>
              </div>

              {/* Lista de Tickets Recientes */}
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#334155', marginBottom: '0.6rem' }}>
                  Tickets Recientes del Turno:
                </div>
                {isLoadingOrders ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                    Cargando tickets recientes...
                  </div>
                ) : recentOrders.length === 0 ? (
                  <div
                    style={{
                      padding: '1.25rem',
                      textAlign: 'center',
                      background: '#f8fafc',
                      borderRadius: '12px',
                      border: '1px dashed #cbd5e1',
                      color: '#64748b',
                      fontSize: '0.85rem'
                    }}
                  >
                    No hay ventas registradas aún en esta sesión.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {recentOrders.map((ord) => {
                      const orderDate = new Date(ord.timestamp || ord.createdAt || Date.now());
                      const timeStr = orderDate.toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                      return (
                        <div
                          key={ord.id || ord.ticketNumber}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.65rem 0.85rem',
                            background: '#f8fafc',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                              Ticket #{ord.ticketNumber}{' '}
                              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b', marginLeft: '0.3rem' }}>
                                &bull; {timeStr}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                              Total: <strong>${Number(ord.total || 0).toFixed(2)}</strong> &bull;{' '}
                              {ord.orderType === 'dine-in' ? 'Comer Aquí' : 'Para Llevar'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              playHapticSound('click', audioEnabled);
                              onClose();
                              onReprintOrder?.(ord);
                            }}
                            style={{
                              padding: '0.45rem 0.8rem',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              color: '#0f172a',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Reimprimir
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Opciones de la Impresora de Tickets */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#334155', marginBottom: '0.75rem' }}>
                  Formato de Impresión Térmica:
                </div>
                
                {/* Ancho del papel */}
                <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.85rem' }}>
                  <button
                    type="button"
                    onClick={() => handleTicketWidthChange('80mm')}
                    style={{
                      flex: 1,
                      padding: '0.65rem',
                      borderRadius: '10px',
                      border: ticketWidth === '80mm' ? '2px solid #0f172a' : '1px solid #cbd5e1',
                      background: ticketWidth === '80mm' ? '#f8fafc' : '#ffffff',
                      color: '#0f172a',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    80 mm (Estándar POS)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTicketWidthChange('58mm')}
                    style={{
                      flex: 1,
                      padding: '0.65rem',
                      borderRadius: '10px',
                      border: ticketWidth === '58mm' ? '2px solid #0f172a' : '1px solid #cbd5e1',
                      background: ticketWidth === '58mm' ? '#f8fafc' : '#ffffff',
                      color: '#0f172a',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    58 mm (Impresora compacta)
                  </button>
                </div>

                {/* Pie de Ticket Personalizado */}
                <div>
                  <label
                    htmlFor="ticket-footer-input"
                    style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.3rem' }}
                  >
                    Mensaje de agradecimiento en el pie del ticket:
                  </label>
                  <input
                    id="ticket-footer-input"
                    type="text"
                    value={ticketFooter}
                    onChange={handleTicketFooterChange}
                    placeholder="Ej. ¡Gracias por visitarnos! Síguenos en Instagram"
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      color: '#0f172a'
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PREFERENCIAS (Pantalla & Audio) */}
          {activeTab === 'preferences' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Modo Pantalla Completa / Kiosco */}
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '14px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
                    Modo Pantalla Completa (Kiosco)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Oculta las barras del navegador para trabajar en pantalla limpia
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  style={{
                    padding: '0.55rem 0.9rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: isFullscreen ? '#0f172a' : '#ffffff',
                    color: isFullscreen ? '#ffffff' : '#0f172a',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  {isFullscreen ? 'Salir' : 'Activar'}
                </button>
              </div>

              {/* Color del Panel de Reloj */}
              <div>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.6rem' }}>
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

              {/* Respuesta Sonora */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.6rem' }}>
                  Sonido del Sistema:
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
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    <span>Efectos de sonido (clic al agregar productos)</span>
                  </span>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.2rem 0.6rem',
                      background: '#ffffff',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1'
                    }}
                  >
                    {audioEnabled ? 'Activado' : 'Silenciado'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: TERMINAL & NEGOCIO */}
          {activeTab === 'terminal' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Información de la Terminal */}
              <div style={{ padding: '1rem', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Terminal Vinculada
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#16a34a',
                      background: '#dcfce7',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} />
                    Operativa
                  </span>
                </div>

                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>
                  {account?.businessName || 'Cafetería'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.2rem' }}>
                  Terminal: <strong>{account?.terminalName || 'Caja Principal'}</strong>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.15rem' }}>
                  Cuenta: {account?.email || 'local'}
                </div>

                {currentEmployee && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.84rem', color: '#334155' }}>
                    Personal en turno: <strong>{currentEmployee.name}</strong> (ID: #{currentEmployee.id})
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid #f1f5f9',
            fontSize: '0.78rem',
            color: '#94a3b8',
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <span>Coffee´s Pos v2.0</span>
        </div>
      </div>
    </div>
  );
}
