import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import confetti from 'canvas-confetti';

interface CartDrawerProps {
  onOrderSuccess: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onOrderSuccess }) => {
  const {
    cart,
    isCartOpen,
    setIsCartOpen,
    totalItemsCount,
    subtotal,
    discount,
    grandTotal,
    removeFromCart,
    updateQuantity,
    clearCart,
    submitOrder,
  } = useCart();

  const { showToast } = useToast();

  const [pickupType, setPickupType] = useState<'aqui' | 'llevar'>('aqui');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'STRIPE'>('CASH');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cartSummaryString = cart
    .map((item) => item.name)
    .slice(0, 2)
    .join(', ') + (cart.length > 2 ? '...' : '');

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    setIsSubmitting(true);
    try {
      await submitOrder(paymentMethod, pickupType);

      // Animación de celebración
      try {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#fc9761', '#974818', '#2d1a12', '#ffb692'],
        });
      } catch (err) {
        console.error(err);
      }

      onOrderSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el pedido';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Sticky Mobile/Desktop Cart Checkout Footer */}
      {totalItemsCount > 0 && !isCartOpen && (
        <aside
          aria-label="Carrito de compras"
          className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-surface/90 backdrop-blur-xl border-t border-surface-container transition-all duration-300"
        >
          <div className="max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="w-full h-14 rounded-2xl bg-primary-container text-on-primary shadow-xl flex items-center justify-between px-4 active:scale-[0.98] transition-all hover:bg-primary"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-[13px] shadow-xs">
                  {totalItemsCount}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[13px] font-bold text-on-primary leading-tight">
                    Ver mi pedido
                  </span>
                  <span className="text-[11px] text-on-secondary-container leading-tight truncate max-w-[190px]">
                    {cartSummaryString || 'Productos seleccionados'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-secondary-container">
                  ${grandTotal.toFixed(2)}
                </span>
                <span className="material-symbols-outlined text-lg">shopping_bag</span>
              </div>
            </button>
          </div>
        </aside>
      )}

      {/* Cart Drawer Modal */}
      {isCartOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-all duration-300 animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md bg-surface-container-lowest h-full shadow-2xl flex flex-col justify-between animate-slide-left border-l border-surface-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-surface-container flex items-center justify-between bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary-container text-on-primary flex items-center justify-center font-bold text-sm">
                  {totalItemsCount}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-primary">Tu Pedido</h3>
                  <p className="text-[11px] text-on-surface-variant">Revisa tus productos y personalización</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="p-1.5 rounded-lg text-outline hover:text-error text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">delete_sweep</span>
                    <span className="hidden sm:inline">Vaciar</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCartOpen(false)}
                  className="w-8 h-8 rounded-full bg-surface-container text-primary hover:bg-surface-container-high flex items-center justify-center"
                  aria-label="Cerrar carrito"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 no-scrollbar">
              {/* Pickup Mode Switcher */}
              <div className="grid grid-cols-2 p-1 rounded-2xl bg-surface-container border border-surface-container-high">
                <button
                  type="button"
                  onClick={() => setPickupType('aqui')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    pickupType === 'aqui'
                      ? 'bg-primary-container text-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">local_cafe</span>
                  <span>Tomar aquí en salón</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPickupType('llevar')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    pickupType === 'llevar'
                      ? 'bg-primary-container text-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">takeout_dining</span>
                  <span>Para llevar</span>
                </button>
              </div>

              {/* Items List */}
              {cart.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center gap-2 text-on-surface-variant">
                  <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline">
                    <span className="material-symbols-outlined text-3xl">shopping_basket</span>
                  </div>
                  <p className="font-bold text-primary">Tu carrito está vacío</p>
                  <p className="text-xs text-outline">Explora nuestras especialidades y agrega tus favoritos.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {cart.map((item) => (
                    <div
                      key={item.cartItemId}
                      className="p-3 rounded-2xl border border-surface-container bg-surface-container-lowest shadow-xs flex items-center justify-between gap-3"
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-14 h-14 rounded-xl object-cover border border-surface-container shrink-0"
                      />

                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-bold text-primary truncate">{item.name}</h4>
                          <span className="text-xs font-bold text-secondary shrink-0">
                            ${(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>

                        {item.customizationsSummary && (
                          <p className="text-[11px] text-on-surface-variant truncate">
                            {item.customizationsSummary}
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-outline">
                            Vaso: <strong>{item.cupName}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.cartItemId)}
                            className="text-[10px] text-outline hover:text-error transition-colors flex items-center gap-0.5"
                          >
                            <span className="material-symbols-outlined text-[13px]">delete</span>
                            <span>Quitar</span>
                          </button>
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center bg-surface-container-low rounded-xl p-0.5 border border-surface-container shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                          className="w-7 h-7 rounded-lg bg-surface-container-lowest text-primary flex items-center justify-center active:scale-90"
                        >
                          <span className="material-symbols-outlined text-[14px]">remove</span>
                        </button>
                        <span className="w-7 text-center text-xs font-bold text-primary">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                          className="w-7 h-7 rounded-lg bg-surface-container-lowest text-primary flex items-center justify-center active:scale-90"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Payment Method Selector */}
              {cart.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Método de Pago
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CASH')}
                      className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 text-center transition-all ${
                        paymentMethod === 'CASH'
                          ? 'bg-primary-container text-on-primary border-primary shadow-xs'
                          : 'bg-surface-container-low border-surface-container text-on-surface'
                      }`}
                    >
                      <span className="material-symbols-outlined text-lg">payments</span>
                      <span className="text-[11px] font-bold">Caja / Efectivo (QR)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('STRIPE')}
                      className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 text-center transition-all ${
                        paymentMethod === 'STRIPE'
                          ? 'bg-primary-container text-on-primary border-primary shadow-xs'
                          : 'bg-surface-container-low border-surface-container text-on-surface'
                      }`}
                    >
                      <span className="material-symbols-outlined text-lg">credit_card</span>
                      <span className="text-[11px] font-bold">Tarjeta (Stripe)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Summary Calculations */}
              {cart.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-surface-container-low border border-surface-container flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-secondary font-semibold">
                      <span>Descuento aplicado</span>
                      <span>-${discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-primary text-sm pt-1.5 border-t border-surface-container">
                    <span>Total a Pagar</span>
                    <span>${grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Checkout Action */}
            {cart.length > 0 && (
              <div className="p-4 border-t border-surface-container bg-surface-container-lowest shrink-0">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleCheckout}
                  className="w-full h-13 py-3.5 rounded-xl bg-primary-container text-on-primary hover:bg-primary font-bold text-xs tracking-wider flex items-center justify-between px-5 shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-secondary-container">
                      check_circle
                    </span>
                    <span>{isSubmitting ? 'PROCESANDO PEDIDO...' : 'CONFIRMAR Y ORDENAR'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-secondary-container">
                      ${grandTotal.toFixed(2)}
                    </span>
                    <span className="material-symbols-outlined text-base">arrow_forward</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
