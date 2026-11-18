import React, { useState } from 'react';
import { scanCashPaymentQr, chargeCashOrder } from '../api/cash.js';
import { formatCents, numberToCents } from '../utils/money.js';
import { playHapticSound } from '../utils/audio.js';
import { showToast } from '../utils/notify.js';

export default function ScanQrModal({ isOpen, onClose, onOrderPaid, audioEnabled }) {
  const [tokenInput, setTokenInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resolvedOrder, setResolvedOrder] = useState(null);
  const [cashReceived, setCashReceived] = useState('');
  const [isCharging, setIsCharging] = useState(false);

  if (!isOpen) return null;

  async function handleResolveQr(e) {
    if (e) e.preventDefault();
    const clean = tokenInput.trim();
    if (!clean) {
      showToast('Ingresa el código o token del cliente', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      const order = await scanCashPaymentQr(clean);
      setResolvedOrder(order);
      const totalNum = parseInt(order.totalCents || '0', 10) / 100;
      setCashReceived(Math.ceil(totalNum).toString());
      playHapticSound('success', audioEnabled);
    } catch (err) {
      playHapticSound('error', audioEnabled);
      showToast(err.message || 'Código QR no válido o ya expirado/cobrado', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCharge() {
    if (!resolvedOrder) return;
    const totalNum = parseInt(resolvedOrder.totalCents || '0', 10) / 100;
    const receivedNum = parseFloat(cashReceived) || 0;

    if (receivedNum < totalNum) {
      playHapticSound('error', audioEnabled);
      showToast('El monto en efectivo recibido es insuficiente.', 'error');
      return;
    }

    setIsCharging(true);
    try {
      const paymentRes = await chargeCashOrder(
        resolvedOrder.orderId || resolvedOrder.id,
        numberToCents(receivedNum)
      );

      playHapticSound('success', audioEnabled);
      showToast(`¡Orden ${resolvedOrder.folio || ''} cobrada con éxito!`, 'success');

      if (onOrderPaid) {
        onOrderPaid({
          ticketNumber: resolvedOrder.folio,
          folio: resolvedOrder.folio,
          tableOrCustomer: resolvedOrder.customerName || 'Cliente Móvil',
          total: totalNum,
          totalCents: resolvedOrder.totalCents,
          cashReceived: receivedNum,
          changeDue: (receivedNum * 100 - parseInt(resolvedOrder.totalCents, 10)) / 100,
          paymentMethod: 'cash',
          items: resolvedOrder.items || [],
          timestamp: new Date().toISOString(),
          saleId: paymentRes.saleId,
        });
      }

      handleClose();
    } catch (err) {
      playHapticSound('error', audioEnabled);
      showToast(err.message || 'Error al registrar el cobro en caja', 'error');
    } finally {
      setIsCharging(false);
    }
  }

  function handleClose() {
    setTokenInput('');
    setResolvedOrder(null);
    setCashReceived('');
    onClose();
  }

  return (
    <div className="modal-overlay open" onClick={handleClose} role="dialog" aria-modal="true">
      <div className="modal-window" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Cobrar Pedido QR de Cliente</h2>
          <button type="button" className="btn-modal-close" onClick={handleClose}>
            &times;
          </button>
        </div>

        {!resolvedOrder ? (
          <form onSubmit={handleResolveQr} style={{ padding: '0.5rem 0' }}>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Ingresa el código o token de efectivo que el cliente muestra en la pantalla de su teléfono.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>
                TOKEN O CÓDIGO QR
              </label>
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Pega el token (ej. cafeteria:cash:... o token)"
                autoFocus
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.95rem',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !tokenInput.trim()}
              className="btn-confirm-action"
              style={{ width: '100%', height: '48px', fontSize: '0.95rem' }}
            >
              {isLoading ? 'VERIFICANDO EN BACKEND...' : 'BUSCAR Y VALIDAR PEDIDO'}
            </button>
          </form>
        ) : (
          <div style={{ padding: '0.5rem 0' }}>
            {/* Resumen de orden validada */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '14px', marginBottom: '1.25rem', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>FOLIO DE ORDEN</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>
                  {resolvedOrder.folio}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>CLIENTE</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                  {resolvedOrder.customerName || 'Cliente Móvil'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #cbd5e1', paddingTop: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>TOTAL A COBRAR</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#059669' }}>
                  {formatCents(resolvedOrder.totalCents)}
                </span>
              </div>
            </div>

            {/* Monto recibido */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>
                MONTO EN EFECTIVO RECIBIDO ($)
              </label>
              <input
                type="number"
                step="0.5"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  fontSize: '1.3rem',
                  fontWeight: 800,
                  color: '#0f172a',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Cambio a devolver */}
            {parseFloat(cashReceived) >= parseInt(resolvedOrder.totalCents, 10) / 100 && (
              <div style={{ padding: '0.75rem', background: '#ecfdf5', borderRadius: '10px', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#047857' }}>CAMBIO A ENTREGAR:</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#047857' }}>
                  ${(parseFloat(cashReceived) - parseInt(resolvedOrder.totalCents, 10) / 100).toFixed(2)} MXN
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setResolvedOrder(null)}
                style={{
                  flex: 1,
                  height: '46px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#f1f5f9',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Volver
              </button>

              <button
                type="button"
                disabled={isCharging || parseFloat(cashReceived) < parseInt(resolvedOrder.totalCents, 10) / 100}
                onClick={handleCharge}
                className="btn-confirm-action"
                style={{ flex: 2, height: '46px', fontSize: '0.95rem' }}
              >
                {isCharging ? 'REGISTRANDO COBRO...' : 'CONFIRMAR Y EMITIR TICKET'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
