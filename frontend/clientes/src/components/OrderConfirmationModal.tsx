import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatCents } from '../utils/money';

interface OrderConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OrderConfirmationModal: React.FC<OrderConfirmationModalProps> = ({ isOpen, onClose }) => {
  const { lastCompletedOrder } = useCart();
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [receiptEmail, setReceiptEmail] = useState(
    lastCompletedOrder?.userEmail || currentUser?.email || ''
  );
  const [emailSent, setEmailSent] = useState(false);

  if (!isOpen || !lastCompletedOrder) return null;

  const handleSendReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptEmail || !receiptEmail.includes('@')) {
      showToast('Por favor introduce un correo válido', 'warning');
      return;
    }
    setEmailSent(true);
    showToast(`Recibo enviado a ${receiptEmail}`, 'success');
  };

  const isCash = lastCompletedOrder.paymentMethod === 'CASH';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-surface-container-lowest rounded-3xl shadow-2xl overflow-hidden border border-surface-container flex flex-col max-h-[90vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ticket Header */}
        <div className="bg-primary p-6 text-on-primary text-center relative flex flex-col items-center">
          <div className="w-14 h-14 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center mb-3 shadow-md">
            <span className="material-symbols-outlined text-3xl">check</span>
          </div>

          <span className="text-secondary-fixed text-xs font-bold uppercase tracking-widest">
            ¡Pedido enviado con éxito!
          </span>
          <h2 className="text-3xl font-extrabold text-white mt-1">
            {lastCompletedOrder.folio || lastCompletedOrder.orderNumber}
          </h2>
          <p className="text-xs text-tertiary-fixed mt-1">
            Vaso a nombre de: <span className="font-bold text-white">{lastCompletedOrder.cupName}</span>
          </p>

          <span className="mt-2 inline-block px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold">
            {lastCompletedOrder.pickupType === 'aqui' ? '☕ Consumir en cafetería' : '🥤 Para llevar'}
          </span>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto no-scrollbar">
          {/* Código de pago en efectivo si aplica */}
          {isCash && lastCompletedOrder.cashQr && (
            <div className="p-4 rounded-2xl bg-secondary-fixed/20 border border-secondary-container/60 flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <span className="material-symbols-outlined text-secondary text-lg">qr_code_2</span>
                <span>Pagar en Efectivo en Caja</span>
              </div>
              <div className="p-3 bg-white rounded-xl shadow-xs border border-surface-container w-full flex flex-col items-center">
                <span className="text-[10px] text-outline uppercase font-semibold mb-1">
                  Código de cobro:
                </span>
                <span className="text-xs font-mono font-bold tracking-wider text-primary select-all break-all px-2 text-center">
                  {lastCompletedOrder.cashQr.token}
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Presenta este código en barra o caja para que el barista cobre tu orden.
              </p>
            </div>
          )}

          {/* Barista Progress tracker */}
          <div className="p-3.5 rounded-2xl bg-surface-container-low border border-surface-container flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-primary">
              <span>Estado del Pedido</span>
              <span className="text-secondary">
                {isCash ? 'Esperando cobro' : 'En preparación'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 flex flex-col items-center gap-1 text-center">
                <div className="w-7 h-7 rounded-full bg-secondary text-on-secondary flex items-center justify-center text-xs font-bold">
                  ✓
                </div>
                <span className="text-[10px] font-semibold text-primary">Recibido</span>
              </div>
              <div className="w-6 h-0.5 bg-secondary"></div>
              <div className="flex-1 flex flex-col items-center gap-1 text-center">
                <div className="w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center text-xs font-bold animate-pulse">
                  ☕
                </div>
                <span className="text-[10px] font-bold text-secondary">Barra</span>
              </div>
              <div className="w-6 h-0.5 bg-surface-container-high"></div>
              <div className="flex-1 flex flex-col items-center gap-1 text-center opacity-40">
                <div className="w-7 h-7 rounded-full bg-surface-container-high text-outline flex items-center justify-center text-xs font-bold">
                  3
                </div>
                <span className="text-[10px] font-semibold text-outline">Listo</span>
              </div>
            </div>
          </div>

          {/* Items breakdown */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Detalle del ticket
            </span>
            <div className="flex flex-col gap-2">
              {lastCompletedOrder.items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-surface-container last:border-none"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-secondary">{item.quantity}x</span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-primary truncate">{item.name}</span>
                      {item.customizationsSummary && (
                        <span className="text-[10px] text-outline truncate">
                          {item.customizationsSummary}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="font-bold text-primary shrink-0">
                    ${(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-surface-container font-bold text-sm text-primary">
              <span>Total del pedido</span>
              <span className="text-secondary">{formatCents(lastCompletedOrder.totalCents)}</span>
            </div>
          </div>

          {/* Email Receipt form */}
          <div className="p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <span className="material-symbols-outlined text-secondary text-base">mark_email_read</span>
              <span>Enviar comprobante a tu correo</span>
            </div>

            {emailSent ? (
              <p className="text-xs text-secondary font-semibold">
                ✓ ¡Comprobante enviado a {receiptEmail}! Revisa tu buzón.
              </p>
            ) : (
              <form onSubmit={handleSendReceipt} className="flex gap-2">
                <input
                  type="email"
                  value={receiptEmail}
                  onChange={(e) => setReceiptEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="flex-1 h-9 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs font-medium text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  className="h-9 px-3 rounded-xl bg-primary-container text-on-primary hover:bg-primary text-xs font-bold active:scale-95 transition-all"
                >
                  Enviar
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer Button */}
        <div className="p-4 border-t border-surface-container bg-surface-container-lowest shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 rounded-xl bg-primary-container text-on-primary hover:bg-primary font-bold text-xs tracking-wider flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
          >
            <span>HACER OTRO PEDIDO</span>
            <span className="material-symbols-outlined text-base">storefront</span>
          </button>
        </div>
      </div>
    </div>
  );
};
