import React, { useState, useEffect } from 'react';
import { playHapticSound } from '../utils/audio.js';
import { showToast } from '../utils/notify.js';

export default function CheckoutModal({ isOpen, onClose, totalAmount, onConfirmPayment, audioEnabled }) {
  const [method, setMethod] = useState('cash');
  const [cashReceived, setCashReceived] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMethod('cash');
      setCashReceived(Math.ceil(totalAmount).toString());
    }
  }, [isOpen, totalAmount]);

  if (!isOpen) return null;

  const numCash = parseFloat(cashReceived) || 0;
  const changeDue = Math.max(0, numCash - totalAmount);
  const isInsufficient = method === 'cash' && numCash < totalAmount;

  function handleQuickBill(val) {
    playHapticSound('click', audioEnabled);
    if (val === 'exact') {
      setCashReceived(totalAmount.toFixed(2));
    } else {
      setCashReceived(val.toString());
    }
  }

  function handleConfirm() {
    if (isInsufficient) {
      playHapticSound('error', audioEnabled);
      showToast('El monto en efectivo recibido es menor al total a pagar.', 'error');
      return;
    }

    playHapticSound('success', audioEnabled);
    onConfirmPayment({
      method,
      cashReceived: method === 'cash' ? numCash : totalAmount,
      changeDue: method === 'cash' ? changeDue : 0
    });
  }

  return (
    <div className="modal-overlay open" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-window" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Cobro de Orden</h2>
          <button type="button" className="btn-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Gran total a pagar */}
        <div style={{ textAlign: 'center', background: '#f8fafc', padding: '1.25rem', borderRadius: '16px', marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>TOTAL A COBRAR</span>
          <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
            ${totalAmount.toFixed(2)}
          </div>
        </div>

        {/* Selector de método de pago */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {[
            { id: 'cash', label: 'Efectivo' },
            { id: 'card', label: 'Tarjeta' },
            { id: 'transfer', label: 'Transferencia' }
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                playHapticSound('click', audioEnabled);
                setMethod(m.id);
              }}
              style={{
                padding: '0.75rem 0.5rem',
                borderRadius: '12px',
                border: method === m.id ? '2px solid #0f172a' : '1px solid #cbd5e1',
                background: method === m.id ? '#0f172a' : '#ffffff',
                color: method === m.id ? '#ffffff' : '#334155',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer'
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Sección de efectivo con billetes rápidos */}
        {method === 'cash' && (
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>
              Efectivo Recibido:
            </label>
            <input
              type="number"
              step="any"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              placeholder="0.00"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                fontSize: '1.25rem',
                fontWeight: 700,
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                outline: 'none',
                marginBottom: '0.75rem'
              }}
            />

            {/* Billetes rápidos */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="demo-chip-btn"
                onClick={() => handleQuickBill('exact')}
              >
                Exacto (${totalAmount.toFixed(2)})
              </button>
              {[100, 200, 500, 1000].map((bill) => (
                <button
                  key={bill}
                  type="button"
                  className="demo-chip-btn"
                  onClick={() => handleQuickBill(bill)}
                >
                  ${bill}
                </button>
              ))}
            </div>

            {/* Cálculo de cambio */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              background: isInsufficient ? '#fef2f2' : '#f0fdf4',
              borderRadius: '12px',
              border: isInsufficient ? '1px solid #fecaca' : '1px solid #bbf7d0'
            }}>
              <span style={{ fontWeight: 600, color: isInsufficient ? '#b91c1c' : '#15803d' }}>
                {isInsufficient ? 'Faltante:' : 'Cambio a devolver:'}
              </span>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: isInsufficient ? '#b91c1c' : '#15803d' }}>
                ${isInsufficient ? (totalAmount - numCash).toFixed(2) : changeDue.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          className="btn-confirm-action"
          style={{ width: '100%', background: '#0f172a' }}
          onClick={handleConfirm}
        >
          <span>CONFIRMAR Y EMITIR TICKET</span>
        </button>
      </div>
    </div>
  );
}
