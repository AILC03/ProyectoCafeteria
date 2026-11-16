import React, { useState, useEffect, useCallback } from 'react';
import { getPreparationOrders, getOrderDetails, markOrderReady } from '../api/kitchen.js';
import { playHapticSound } from '../utils/audio.js';
import { showToast } from '../utils/notify.js';

export default function KitchenWorkspace({ audioEnabled = true }) {
  const [orders, setOrders] = useState([]);
  const [orderDetailsMap, setOrderDetailsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);
  const [error, setError] = useState(null);

  const fetchOrders = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const list = await getPreparationOrders();
      setOrders(list);
      setError(null);

      // Cargar detalles de cada orden (items) en paralelo para que el barista vea qué preparar
      const detailsPromises = list.map(async (ord) => {
        try {
          const detail = await getOrderDetails(ord.id);
          return { id: ord.id, detail };
        } catch {
          return null;
        }
      });

      const detailsResults = await Promise.all(detailsPromises);
      const newMap = {};
      detailsResults.forEach((res) => {
        if (res && res.detail) {
          newMap[res.id] = res.detail;
        }
      });
      setOrderDetailsMap(newMap);
    } catch (err) {
      console.warn('Error fetching preparation orders:', err);
      if (!isSilent) {
        setError(err.message || 'Error al conectar con la cola de preparación');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  // Carga inicial y sondeo periódico cada 8 segundos para nuevas órdenes
  useEffect(() => {
    fetchOrders(false);
    const interval = setInterval(() => {
      fetchOrders(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  async function handleMarkReady(order) {
    if (markingId) return;
    setMarkingId(order.id);
    if (audioEnabled) {
      playHapticSound('click');
    }

    try {
      await markOrderReady(order.id);
      showToast(`¡Orden ${order.folio} lista para entregar!`, 'success');
      if (audioEnabled) {
        playHapticSound('success');
      }
      // Actualizar vista localmente
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      setOrderDetailsMap((prev) => {
        const copy = { ...prev };
        delete copy[order.id];
        return copy;
      });
    } catch (err) {
      showToast(err.message || 'Error al marcar orden como lista', 'error');
    } finally {
      setMarkingId(null);
    }
  }

  function formatTime(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  return (
    <div
      className="pos-workspace-view active"
      style={{
        padding: '1.5rem',
        overflowY: 'auto',
        background: '#f8fafc',
        minHeight: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Barra superior de Cocina */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Pantalla de Cocina / Barista (KDS)
            </h2>
            <span
              style={{
                background: '#ea580c',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 700,
                padding: '0.2rem 0.65rem',
                borderRadius: '9999px'
              }}
            >
              {orders.length} en preparación
            </span>
          </div>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Órdenes pagadas en espera de preparación &bull; Actualización automática
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchOrders(false)}
          disabled={loading}
          style={{
            padding: '0.6rem 1.25rem',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '9999px',
            fontWeight: 700,
            fontSize: '0.88rem',
            color: '#334155',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span>↻ Actualizar</span>
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: '12px',
            marginBottom: '1.5rem',
            fontSize: '0.9rem'
          }}
        >
          {error}
        </div>
      )}

      {loading && orders.length === 0 ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
          <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Cargando órdenes de cocina...</p>
        </div>
      ) : orders.length === 0 ? (
        <div
          style={{
            padding: '4rem 2rem',
            textAlign: 'center',
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px dashed #cbd5e1'
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>☕</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem' }}>
            ¡Todo al día en la barra!
          </h3>
          <p style={{ color: '#64748b', margin: 0, fontSize: '0.95rem' }}>
            No hay órdenes pendientes en este momento. Las nuevas órdenes pagadas aparecerán aquí automáticamente.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.25rem'
          }}
        >
          {orders.map((ord) => {
            const detail = orderDetailsMap[ord.id];
            const items = detail?.items || [];
            const isMarking = markingId === ord.id;

            return (
              <div
                key={ord.id}
                style={{
                  background: '#ffffff',
                  border: '2px solid #e2e8f0',
                  borderRadius: '16px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
              >
                {/* Header de la comanda */}
                <div
                  style={{
                    padding: '0.85rem 1.15rem',
                    background: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 900,
                        color: '#0f172a',
                        display: 'block'
                      }}
                    >
                      Folio {ord.folio}
                    </span>
                    <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
                      Cliente: {ord.guestName || 'Móvil'}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: '#ea580c',
                      background: '#fff7ed',
                      border: '1px solid #ffedd5',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px'
                    }}
                  >
                    {formatTime(ord.createdAt)}
                  </span>
                </div>

                {/* Lista de productos e ingredientes */}
                <div style={{ padding: '1.15rem', flex: 1 }}>
                  {items.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.88rem', fontStyle: 'italic' }}>
                      Cargando ingredientes y preparación...
                    </div>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {items.map((it, idx) => (
                        <li
                          key={it.id || idx}
                          style={{
                            paddingBottom: '0.75rem',
                            marginBottom: '0.75rem',
                            borderBottom: idx === items.length - 1 ? 'none' : '1px dashed #f1f5f9'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <span
                              style={{
                                background: '#0f172a',
                                color: '#ffffff',
                                borderRadius: '6px',
                                padding: '0.1rem 0.45rem',
                                fontSize: '0.82rem',
                                fontWeight: 800
                              }}
                            >
                              {it.quantity}x
                            </span>
                            <span style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0f172a' }}>
                              {it.productName}
                            </span>
                          </div>

                          {/* Opciones / Personalizaciones */}
                          {it.options && it.options.length > 0 && (
                            <div style={{ marginTop: '0.35rem', paddingLeft: '1.8rem' }}>
                              {it.options.map((opt, oIdx) => (
                                <div
                                  key={oIdx}
                                  style={{
                                    fontSize: '0.82rem',
                                    color: '#475569',
                                    fontWeight: 600
                                  }}
                                >
                                  &bull; {opt.groupName}:{' '}
                                  <span style={{ color: '#0f172a' }}>{opt.optionName}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Botón de acción */}
                <div style={{ padding: '1rem', borderTop: '1px solid #f1f5f9', background: '#fafafa' }}>
                  <button
                    type="button"
                    onClick={() => handleMarkReady(ord)}
                    disabled={isMarking}
                    style={{
                      width: '100%',
                      padding: '0.85rem',
                      background: isMarking ? '#94a3b8' : '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 800,
                      fontSize: '0.95rem',
                      cursor: isMarking ? 'not-allowed' : 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    {isMarking ? 'Marcando...' : '✓ Marcar como LISTO'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
