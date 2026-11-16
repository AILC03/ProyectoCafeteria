import React from 'react';

export default function ReceiptModal({ isOpen, onClose, order, onStartNewOrder }) {
  if (!isOpen || !order) return null;

  const savedAccount = (() => {
    try {
      return JSON.parse(
        localStorage.getItem('coffees_pos_account') ||
        localStorage.getItem('taffy_account') ||
        localStorage.getItem('taffy_business_account') ||
        '{}'
      );
    } catch {
      return {};
    }
  })();
  const businessName = savedAccount.businessName || 'Coffee´s Pos';
  const customFooter = localStorage.getItem('coffees_pos_ticket_footer') || localStorage.getItem('taffy_ticket_footer') || '¡GRACIAS POR SU COMPRA!\nFavor de conservar este ticket';
  const is58mm = (localStorage.getItem('coffees_pos_ticket_width') || localStorage.getItem('taffy_ticket_width')) === '58mm';

  const dateObj = new Date(order.timestamp || Date.now());
  const dateFormatted = dateObj.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const timeFormatted = dateObj.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <div className="modal-overlay open" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-window"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: is58mm ? '360px' : '440px', padding: '1.5rem', transition: 'max-width 0.2s' }}
      >
        <div className="modal-header" style={{ marginBottom: '1rem' }}>
          <h2 className="modal-title">Ticket de Venta</h2>
          <button type="button" className="btn-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Chasis de ticket térmico */}
        <div className="thermal-receipt" style={{
          background: '#ffffff',
          border: '1px dashed #cbd5e1',
          padding: '1.25rem',
          fontFamily: 'monospace, courier',
          fontSize: is58mm ? '0.78rem' : '0.85rem',
          color: '#1e293b',
          borderRadius: '8px'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 900, margin: '0 0 0.2rem', fontFamily: 'var(--font-outfit, sans-serif)' }}>
              {businessName.toUpperCase()}
            </h3>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Coffee´s Pos &bull; Terminal de Venta</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>RFC: CFP-260927-POS</div>
          </div>

          <div style={{ borderTop: '1px dashed #94a3b8', borderBottom: '1px dashed #94a3b8', padding: '0.5rem 0', margin: '0.5rem 0', fontSize: '0.78rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Ticket: #{order.ticketNumber}</span>
              <span>{order.orderType === 'dine-in' ? 'COMER AQUÍ' : 'PARA LLEVAR'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Fecha: {dateFormatted}</span>
              <span>Hora: {timeFormatted}</span>
            </div>
            {order.tableOrCustomer && (
              <div>Mesa/Cliente: <strong>{order.tableOrCustomer}</strong></div>
            )}
            <div>Cajero: {order.cashierName || 'Cajero'}</div>
          </div>

          {/* Lista de productos */}
          <div style={{ margin: '0.75rem 0' }}>
            {order.items?.map((item, idx) => (
              <div key={idx} style={{ marginBottom: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{item.qty}x {item.name}</span>
                  <strong>${(item.price * item.qty).toFixed(2)}</strong>
                </div>
                {item.note && (
                  <div style={{ fontSize: '0.75rem', color: '#64748b', paddingLeft: '1rem' }}>
                    * {item.note}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Totales */}
          <div style={{ borderTop: '1px dashed #94a3b8', paddingTop: '0.5rem', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal:</span>
              <span>${(order.subtotal || 0).toFixed(2)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Descuento ({order.discountPercent}%):</span>
                <span>-${order.discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>IVA (16%):</span>
              <span>${(order.tax || 0).toFixed(2)}</span>
            </div>
            {order.tipAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Propina ({order.tipPercent}%):</span>
                <span>+${order.tipAmount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: 900, marginTop: '0.35rem', borderTop: '1px solid #000', paddingTop: '0.35rem' }}>
              <span>TOTAL:</span>
              <span>${(order.total || 0).toFixed(2)}</span>
            </div>

            <div style={{ borderTop: '1px dashed #cbd5e1', marginTop: '0.5rem', paddingTop: '0.5rem', fontSize: '0.78rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Método de Pago:</span>
                <span>{order.paymentMethod === 'cash' ? 'EFECTIVO' : order.paymentMethod === 'card' ? 'TARJETA' : 'TRANSFERENCIA'}</span>
              </div>
              {order.paymentMethod === 'cash' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Efectivo Entregado:</span>
                    <span>${(order.cashReceived || order.total || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Cambio:</span>
                    <span>${(order.changeDue || 0).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {order.registrationToken && (
            <div style={{
              margin: '0.85rem 0',
              padding: '0.65rem',
              background: '#f1f5f9',
              border: '1px dashed #64748b',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a', letterSpacing: '0.05em' }}>
                REGISTRO DE CLIENTE FRECUENTE
              </div>
              <div style={{ fontSize: '0.68rem', color: '#475569', margin: '0.25rem 0' }}>
                Ingresa este código en la app de clientes para activar tu cuenta:
              </div>
              <div style={{
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#0284c7',
                wordBreak: 'break-all',
                background: '#ffffff',
                padding: '0.35rem',
                borderRadius: '4px',
                border: '1px solid #e2e8f0'
              }}>
                {order.registrationToken}
              </div>
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748b', whiteSpace: 'pre-line' }}>
            {customFooter}
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '0.75rem',
              borderRadius: '9999px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
            onClick={() => window.print()}
          >
            Imprimir Recibo
          </button>
          {onStartNewOrder ? (
            <button
              type="button"
              style={{
                flex: 1.2,
                padding: '0.75rem',
                borderRadius: '9999px',
                border: 'none',
                background: '#0f172a',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
              onClick={onStartNewOrder}
            >
              Nueva Orden &rarr;
            </button>
          ) : (
            <button
              type="button"
              style={{
                flex: 1.2,
                padding: '0.75rem',
                borderRadius: '9999px',
                border: 'none',
                background: '#0f172a',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
              onClick={onClose}
            >
              Listo / Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
