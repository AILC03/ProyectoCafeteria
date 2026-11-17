import React, { useState, useEffect, useMemo } from 'react';
import { MENU_CATEGORIES, getMenuProducts } from '../data/menuData.js';
import { playHapticSound } from '../utils/audio.js';
import { showConfirm } from '../utils/notify.js';

export default function OrderingWorkspace({
  orderType,
  setOrderType,
  tableOrCustomer,
  setTableOrCustomer,
  ticketCounter,
  cart,
  setCart,
  discountPercent,
  setDiscountPercent,
  tipPercent,
  setTipPercent,
  onOpenCheckout,
  onHoldOrder,
  heldOrders,
  onRestoreHeldOrder,
  onEditItemNote,
  audioEnabled,
  activeTable = null,
  onSaveTableOrder = null,
  onRequestTableBill = null,
  onBackToTables = null
}) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [productsList, setProductsList] = useState(getMenuProducts);

  useEffect(() => {
    function handleMenuUpdate() {
      setProductsList(getMenuProducts());
    }
    window.addEventListener('taffy:menu_updated', handleMenuUpdate);
    return () => window.removeEventListener('taffy:menu_updated', handleMenuUpdate);
  }, []);

  // Filter products
  const filteredProducts = useMemo(() => {
    return productsList.filter((prod) => {
      const matchCat =
        selectedCategory === 'all' ||
        prod.categoryId === selectedCategory ||
        prod.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        prod.name.toLowerCase().includes(q) ||
        (prod.desc && prod.desc.toLowerCase().includes(q)) ||
        (prod.sku && prod.sku.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }, [productsList, selectedCategory, searchQuery]);

  // Cart operations
  function addToCart(product) {
    playHapticSound('click', audioEnabled);
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === product.id && !item.note);
      if (existing) {
        return prevCart.map((item) =>
          item === existing ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [
        ...prevCart,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          categoryId: product.categoryId,
          sku: product.sku,
          qty: 1,
          note: ''
        }
      ];
    });
  }

  function changeQty(index, delta) {
    playHapticSound('click', audioEnabled);
    setCart((prevCart) => {
      const target = prevCart[index];
      if (!target) return prevCart;
      const newQty = target.qty + delta;
      if (newQty <= 0) {
        return prevCart.filter((_, i) => i !== index);
      }
      return prevCart.map((item, i) =>
        i === index ? { ...item, qty: newQty } : item
      );
    });
  }

  function clearCart() {
    if (cart.length === 0) return;
    showConfirm({
      title: 'Vaciar Ticket',
      message: '¿Está seguro de vaciar todos los productos del ticket actual?',
      confirmText: 'Vaciar',
      cancelText: 'Cancelar',
      isDestructive: true,
      onConfirm: () => {
        playHapticSound('click', audioEnabled);
        setCart([]);
      }
    });
  }

  // Calculate totals
  const totals = useMemo(() => {
    const rawSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const discountAmount = rawSubtotal * (discountPercent / 100);
    const subtotalAfterDiscount = Math.max(0, rawSubtotal - discountAmount);
    const taxAmount = subtotalAfterDiscount * 0.16;
    const tipAmount = subtotalAfterDiscount * (tipPercent / 100);
    const finalTotal = subtotalAfterDiscount + taxAmount + tipAmount;

    return {
      rawSubtotal,
      discountAmount,
      taxAmount,
      tipAmount,
      finalTotal
    };
  }, [cart, discountPercent, tipPercent]);

  return (
    <div className="pos-workspace-grid">
      {/* ================================================================
          COLUMNA IZQUIERDA: CATÁLOGO, BUSCADOR Y CATEGORÍAS
          ================================================================ */}
      <section className="pos-catalog-panel">
        <header className="catalog-search-header">
          <div className="catalog-search-wrap">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ position: 'absolute', left: '1rem', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              className="catalog-search-input"
              placeholder="Buscar producto por nombre o código (ej. Chilaquiles, CAF-01)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar productos"
              style={{ paddingLeft: '2.8rem' }}
            />
          </div>
          <span className="search-count-badge">
            {filteredProducts.length} productos
          </span>
        </header>

        <nav className="pos-categories-bar" aria-label="Categorías de menú">
          {MENU_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`pos-category-tab ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => {
                playHapticSound('click', audioEnabled);
                setSelectedCategory(cat.id);
              }}
            >
              <span>{cat.name}</span>
            </button>
          ))}
        </nav>

        <main className="pos-products-scroll">
          {filteredProducts.length === 0 ? (
            <div className="catalog-empty-search" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.1rem' }}>No se encontraron productos</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
                Pruebe buscando con otra palabra o seleccione otra categoría.
              </div>
            </div>
          ) : (
            <div className="pos-products-grid">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="pos-product-card"
                  onClick={() => addToCart(product)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && addToCart(product)}
                >
                  <div>
                    <div className="product-sku-tag">
                      {product.sku} {product.favorite ? '• Destacado' : ''}
                    </div>
                    <div className="product-title">{product.name}</div>
                    <div className="product-desc">{product.desc}</div>
                  </div>
                  <div className="product-price-row">
                    <span className="product-price-val">${product.price.toFixed(2)}</span>
                    <span className="product-add-badge">+</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </section>

      {/* ================================================================
          COLUMNA DERECHA: SIDEBAR DEL TICKET DE ORDEN Y COBRO
          ================================================================ */}
      <aside className="pos-ticket-sidebar" aria-label="Ticket de la Orden">
        {activeTable ? (
          /* Encabezado especial para Mesero en Mesa */
          <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
            <div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>
                Mesa {activeTable.number}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Servicio en comedor &bull; {activeTable.capacity || 4} comensales
              </div>
            </div>

            {onBackToTables && (
              <button
                type="button"
                onClick={onBackToTables}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '9999px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  cursor: 'pointer'
                }}
              >
                &larr; Mesas
              </button>
            )}
          </div>
        ) : (
          /* Selector Comer Aquí / Para Llevar + Campo Mesa/Cliente (Modo Mostrador) */
          <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div className="order-mode-pill-selector">
              <button
                type="button"
                className={`btn-order-mode ${orderType === 'dine-in' ? 'active' : ''}`}
                onClick={() => {
                  playHapticSound('click', audioEnabled);
                  setOrderType('dine-in');
                }}
              >
                <span>Comer Aquí</span>
              </button>
              <button
                type="button"
                className={`btn-order-mode ${orderType === 'takeout' ? 'active' : ''}`}
                onClick={() => {
                  playHapticSound('click', audioEnabled);
                  setOrderType('takeout');
                }}
              >
                <span>Para Llevar</span>
              </button>
            </div>

            <div className="order-meta-input-row">
              <input
                type="text"
                placeholder={
                  orderType === 'dine-in'
                    ? 'Mesa (ej. Mesa 4, Barra)...'
                    : 'Cliente (ej. Juan Pérez, Teléfono)...'
                }
                value={tableOrCustomer}
                onChange={(e) => setTableOrCustomer(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        )}

        {/* Header del Ticket */}
        <header className="ticket-header">
          <div className="ticket-title-row">
            <span className="ticket-title">
              {activeTable ? 'Comanda de Mesa' : 'Orden Actual'}
            </span>
            <span className="ticket-num">
              {activeTable
                ? (activeTable.status === 'occupied' ? 'Mesa Ocupada' : 'Mesa Abierta')
                : `Ticket #${ticketCounter}`}
            </span>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              className="btn-ticket-clear"
              onClick={clearCart}
              title="Vaciar nuevos productos del ticket"
            >
              {activeTable ? 'Vaciar nuevos' : 'Vaciar'}
            </button>
          )}
        </header>

        {/* Bandeja de Órdenes en Espera (si existen en modo mostrador) */}
        {!activeTable && heldOrders.length > 0 && (
          <div style={{ padding: '0.4rem 1rem', background: '#fef3c7', borderBottom: '1px solid #fde68a', fontSize: '0.8rem' }}>
            <span style={{ fontWeight: 700, color: '#92400e' }}>En Espera ({heldOrders.length}): </span>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
              {heldOrders.map((h, i) => (
                <button
                  key={h.ticketNumber || i}
                  type="button"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #d97706',
                    borderRadius: '6px',
                    padding: '0.15rem 0.45rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    color: '#92400e',
                    fontWeight: 700
                  }}
                  onClick={() => onRestoreHeldOrder(i)}
                >
                  #{h.ticketNumber} ({h.tableOrCustomer || (h.orderType === 'dine-in' ? 'Mesa' : 'Llevar')})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scroll de Items del Ticket */}
        <div className="ticket-items-scroll">
          {/* Si estamos en mesa y ya tiene productos enviados previamente a cocina */}
          {activeTable && activeTable.currentOrder?.items?.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ padding: '0.45rem 1rem', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                Enviados a Cocina ({activeTable.currentOrder.items.length}):
              </div>
              {activeTable.currentOrder.items.map((item, idx) => (
                <div key={`existing-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 1rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{item.qty}x </span>
                    <span style={{ color: '#334155' }}>{item.name}</span>
                    {item.note && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Nota: {item.note}</div>}
                  </div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>
                    ${(Number(item.price || 0) * Number(item.qty || 1)).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTable && activeTable.currentOrder?.items?.length > 0 && cart.length > 0 && (
            <div style={{ padding: '0.45rem 1rem', background: '#ecfdf5', borderBottom: '1px solid #a7f3d0', fontSize: '0.78rem', fontWeight: 700, color: '#065f46' }}>
              Nuevos para Enviar a Cocina ({cart.length}):
            </div>
          )}

          {cart.length === 0 && (!activeTable || !activeTable.currentOrder?.items?.length) ? (
            <div className="ticket-empty-state">
              <div style={{ fontWeight: 700, color: '#1e293b' }}>Orden Vacía</div>
              <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Toque los productos del catálogo para agregarlos a la comanda.
              </div>
            </div>
          ) : (
            cart.map((item, index) => (
              <div key={`${item.id}-${index}`} className="ticket-item-row">
                <div className="item-main-details">
                  <div className="item-name">{item.name}</div>
                  <div className="item-single-price">${item.price.toFixed(2)} c/u</div>
                  {item.note && <div className="item-note-tag">Nota: {item.note}</div>}
                  <div>
                    <button
                      type="button"
                      className="btn-item-note"
                      onClick={() => onEditItemNote(index)}
                    >
                      {item.note ? 'Editar nota' : '+ Nota cocina'}
                    </button>
                  </div>
                </div>

                <div className="item-qty-stepper">
                  <button
                    type="button"
                    className="btn-stepper"
                    onClick={() => changeQty(index, -1)}
                    aria-label="Restar uno"
                  >
                    -
                  </button>
                  <span className="stepper-val">{item.qty}</span>
                  <button
                    type="button"
                    className="btn-stepper"
                    onClick={() => changeQty(index, 1)}
                    aria-label="Sumar uno"
                  >
                    +
                  </button>
                </div>

                <div className="item-total-col">
                  ${(item.price * item.qty).toFixed(2)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer del Ticket */}
        {activeTable ? (
          /* Footer en Modo Restaurante / Mesero (Solo comandas, no pago) */
          <footer className="ticket-summary-footer">
            {activeTable.currentOrder?.items?.length > 0 && (
              <div className="summary-calc-row">
                <span>Ya enviado a cocina:</span>
                <span>${Number(activeTable.currentOrder.total || 0).toFixed(2)}</span>
              </div>
            )}

            {cart.length > 0 && (
              <div className="summary-calc-row" style={{ color: '#059669', fontWeight: 600 }}>
                <span>Nuevos para enviar:</span>
                <span>+${totals.rawSubtotal.toFixed(2)}</span>
              </div>
            )}

            <div className="summary-calc-row total-row">
              <span>TOTAL COMANDA:</span>
              <span>
                ${(Number(activeTable.currentOrder?.total || 0) + totals.rawSubtotal).toFixed(2)}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                type="button"
                className="btn-charge-order"
                onClick={() => onSaveTableOrder && onSaveTableOrder(cart)}
                disabled={cart.length === 0}
                style={{
                  background: cart.length > 0 ? '#0f172a' : '#94a3b8',
                  padding: '0.85rem',
                  borderRadius: '12px',
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  width: '100%',
                  cursor: cart.length > 0 ? 'pointer' : 'not-allowed'
                }}
              >
                ENVIAR A COCINA &rarr;
              </button>

              {(activeTable.currentOrder?.items?.length > 0 || activeTable.status === 'occupied') && (
                <button
                  type="button"
                  onClick={onRequestTableBill}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    padding: '0.65rem',
                    borderRadius: '12px',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    cursor: 'pointer'
                  }}
                >
                  Solicitar Cuenta / Cerrar Mesa
                </button>
              )}
            </div>
          </footer>
        ) : (
          /* Footer Estándar Modo Mostrador / Cobro en Caja */
          <footer className="ticket-summary-footer">
            <div className="ticket-modifiers-row">
              <div className="modifier-selector-box">
                <label htmlFor="select-discount">Desc:</label>
                <select
                  id="select-discount"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                >
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="10">10%</option>
                  <option value="15">15%</option>
                  <option value="20">20%</option>
                </select>
              </div>

              <div className="modifier-selector-box">
                <label htmlFor="select-tip">Propina:</label>
                <select
                  id="select-tip"
                  value={tipPercent}
                  onChange={(e) => setTipPercent(Number(e.target.value))}
                >
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="10">10%</option>
                  <option value="15">15%</option>
                  <option value="20">20%</option>
                </select>
              </div>
            </div>

            <div className="summary-calc-row">
              <span>Subtotal:</span>
              <span>${totals.rawSubtotal.toFixed(2)}</span>
            </div>

            {totals.discountAmount > 0 && (
              <div className="summary-calc-row" style={{ color: '#ef4444' }}>
                <span>Descuento ({discountPercent}%):</span>
                <span>-${totals.discountAmount.toFixed(2)}</span>
              </div>
            )}

            <div className="summary-calc-row">
              <span>IVA (16%):</span>
              <span>${totals.taxAmount.toFixed(2)}</span>
            </div>

            {totals.tipAmount > 0 && (
              <div className="summary-calc-row" style={{ color: '#059669' }}>
                <span>Propina ({tipPercent}%):</span>
                <span>+${totals.tipAmount.toFixed(2)}</span>
              </div>
            )}

            <div className="summary-calc-row total-row">
              <span>TOTAL:</span>
              <span>${totals.finalTotal.toFixed(2)}</span>
            </div>

            <div className="ticket-actions-dual">
              <button
                type="button"
                className="btn-hold-order"
                onClick={onHoldOrder}
                disabled={cart.length === 0}
              >
                <span>En Espera</span>
              </button>

              <button
                type="button"
                className="btn-charge-order"
                onClick={onOpenCheckout}
                disabled={cart.length === 0}
              >
                <span>COBRAR ORDEN &rarr;</span>
              </button>
            </div>
          </footer>
        )}
      </aside>
    </div>
  );
}
