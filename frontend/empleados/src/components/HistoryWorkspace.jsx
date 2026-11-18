import React, { useState, useEffect, useMemo } from 'react';
import * as db from '../data/db.js';
import { getSales } from '../api/sales.js';

export default function HistoryWorkspace({ onReprintOrder }) {
  const [orders, setOrders] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);
    try {
      const salesRes = await getSales({ limit: 50 }).catch(() => null);
      if (salesRes && salesRes.data && salesRes.data.length > 0) {
        const mapped = salesRes.data.map((s) => ({
          id: s.id,
          ticketNumber: s.saleNumber || s.folio || s.id,
          folio: s.saleNumber || s.folio,
          total: parseInt(s.totalCents || '0', 10) / 100,
          paymentMethod: (s.method || s.paymentMethod || 'CASH').toLowerCase(),
          orderType: 'takeout',
          tableOrCustomer: s.customerName || `Venta #${s.saleNumber || s.id}`,
          cashierName: 'Personal en Turno',
          timestamp: s.soldAt || s.paidAt || s.createdAt || new Date().toISOString(),
          items: s.items || [],
        }));
        setOrders(mapped);
        return;
      }
    } catch {
      // Fallback a almacenamiento local
    }

    try {
      const data = await db.getAllOrders();
      data.sort((a, b) => {
        const dateA = new Date(a.timestamp || a.createdAt || a.date || 0);
        const dateB = new Date(b.timestamp || b.createdAt || b.date || 0);
        return dateB - dateA;
      });
      setOrders(data);
    } catch (err) {
      console.error('Error cargando pedidos:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchFilter =
        filterType === 'all' ||
        (filterType === 'dine-in' && o.orderType === 'dine-in') ||
        (filterType === 'takeout' && o.orderType === 'takeout') ||
        (filterType === 'cash' && o.paymentMethod === 'cash') ||
        (filterType === 'card' && o.paymentMethod === 'card');

      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        String(o.ticketNumber).includes(q) ||
        (o.tableOrCustomer && o.tableOrCustomer.toLowerCase().includes(q)) ||
        (o.cashierName && o.cashierName.toLowerCase().includes(q));

      return matchFilter && matchSearch;
    });
  }, [orders, filterType, search]);

  return (
    <div className="pos-workspace-view active" style={{ padding: '1.5rem', overflowY: 'auto' }}>
      {/* Barra superior de encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Historial de Pedidos Registrados
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            {orders.length} pedidos guardados
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Buscar por ticket o mesa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '0.6rem 1rem',
              border: '1px solid #cbd5e1',
              borderRadius: '9999px',
              fontSize: '0.9rem',
              outline: 'none',
              minWidth: '220px'
            }}
          />
          <button
            type="button"
            onClick={loadOrders}
            style={{
              padding: '0.6rem 1.25rem',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '9999px',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer'
            }}
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Chips de filtro sin emojis */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'Todos' },
          { id: 'dine-in', label: 'Comer Aquí' },
          { id: 'takeout', label: 'Para Llevar' },
          { id: 'cash', label: 'Efectivo' },
          { id: 'card', label: 'Tarjeta' }
        ].map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilterType(chip.id)}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '9999px',
              fontSize: '0.85rem',
              fontWeight: 600,
              border: filterType === chip.id ? '1px solid #0f172a' : '1px solid #e2e8f0',
              background: filterType === chip.id ? '#0f172a' : '#ffffff',
              color: filterType === chip.id ? '#ffffff' : '#475569',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Tabla de órdenes */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          Cargando pedidos...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1.1rem' }}>No hay pedidos registrados con este filtro</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
            Las órdenes cobradas aparecerán automáticamente en esta lista.
          </div>
        </div>
      ) : (
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                <th style={{ padding: '0.9rem 1.25rem' }}>Ticket</th>
                <th style={{ padding: '0.9rem 1.25rem' }}>Tipo &bull; Ubicación</th>
                <th style={{ padding: '0.9rem 1.25rem' }}>Fecha y Hora</th>
                <th style={{ padding: '0.9rem 1.25rem' }}>Cajero</th>
                <th style={{ padding: '0.9rem 1.25rem' }}>Pago</th>
                <th style={{ padding: '0.9rem 1.25rem' }}>Total</th>
                <th style={{ padding: '0.9rem 1.25rem', textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => {
                const rawDate = order.timestamp || order.createdAt || order.date;
                let formattedDate = 'Reciente';
                let formattedTime = '';

                if (rawDate) {
                  const dateObj = new Date(rawDate);
                  if (!isNaN(dateObj.getTime())) {
                    formattedTime = dateObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                    formattedDate = dateObj.toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: 'numeric' });
                  }
                }

                const paymentLabel =
                  order.paymentMethod === 'cash'
                    ? 'Efectivo'
                    : order.paymentMethod === 'card'
                    ? 'Tarjeta'
                    : 'Transferencia';

                return (
                  <tr key={order.id || order.ticketNumber} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.9rem 1.25rem', fontWeight: 700, color: '#0f172a' }}>
                      #{order.ticketNumber}
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        background: order.orderType === 'dine-in' ? '#dbeafe' : '#fef3c7',
                        color: order.orderType === 'dine-in' ? '#1e40af' : '#92400e',
                        marginRight: '0.5rem'
                      }}>
                        {order.orderType === 'dine-in' ? 'Comer Aquí' : 'Para Llevar'}
                      </span>
                      <span style={{ color: '#64748b' }}>{order.tableOrCustomer || '-'}</span>
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem', color: '#64748b' }}>
                      {formattedTime ? `${formattedDate}, ${formattedTime}` : formattedDate}
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem', color: '#334155' }}>
                      {order.cashierName || 'Cajero'}
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        background: '#f1f5f9',
                        fontWeight: 600,
                        color: '#334155'
                      }}>
                        {paymentLabel}
                      </span>
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem', fontWeight: 800, color: '#0f172a' }}>
                      ${Number(order.total || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => onReprintOrder && onReprintOrder(order)}
                        style={{
                          padding: '0.4rem 0.85rem',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: '#0f172a'
                        }}
                      >
                        Reimprimir Ticket
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
