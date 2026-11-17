import React, { useState, useEffect, useMemo } from 'react';
import { MENU_CATEGORIES, getMenuProducts, getMenuCategories } from '../data/menuData.js';
import { playHapticSound } from '../utils/audio.js';
import { showConfirm } from '../utils/notify.js';
import { getCategories, getProducts } from '../api/catalog.js';
import { centsToNumber } from '../utils/money.js';

export default function OrderingWorkspace({
  orderType,
  setOrderType,
  tableOrCustomer,
  setTableOrCustomer,
  ticketCounter,
  cart,
  setCart,
  onOpenCheckout,
  onOpenScanQr,
  onHoldOrder,
  heldOrders,
  onRestoreHeldOrder,
  audioEnabled
}) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [productsList, setProductsList] = useState(getMenuProducts);
  const [categoriesList, setCategoriesList] = useState(getMenuCategories);

  useEffect(() => {
    let isMounted = true;
    async function fetchCatalog() {
      try {
        const [apiCats, apiProds] = await Promise.all([
          getCategories().catch(() => []),
          getProducts().catch(() => []),
        ]);
        if (!isMounted) return;

        if (apiCats && apiCats.length > 0) {
          const cats = [
            { id: 'all', name: 'Todos' },
            ...apiCats.map((c) => ({ id: String(c.id), name: c.name }))
          ];
          setCategoriesList(cats);
        } else {
          setCategoriesList(getMenuCategories());
        }

        if (apiProds && apiProds.length > 0) {
          const validProds = apiProds.map((p) => ({
            id: String(p.id),
            name: p.name,
            price: centsToNumber(p.basePriceCents),
            basePriceCents: p.basePriceCents,
            categoryId: String(p.categoryId),
            desc: p.description || '',
            sku: `PRD-${p.id}`,
            isAvailable: p.isAvailable,
          }));
          setProductsList(validProds);
        } else {
          setProductsList(getMenuProducts());
        }
      } catch {
        // Fallback local
      }
    }

    fetchCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handleMenuUpdate() {
      setProductsList(getMenuProducts());
      setCategoriesList(getMenuCategories());
    }
    window.addEventListener('coffees:menu_updated', handleMenuUpdate);
    window.addEventListener('taffy:menu_updated', handleMenuUpdate);
    window.addEventListener('coffees:categories_updated', handleMenuUpdate);
    return () => {
      window.removeEventListener('coffees:menu_updated', handleMenuUpdate);
      window.removeEventListener('taffy:menu_updated', handleMenuUpdate);
      window.removeEventListener('coffees:categories_updated', handleMenuUpdate);
    };
  }, []);

  // Filter products
  const filteredProducts = useMemo(() => {
    return productsList.filter((prod) => {
      const matchCat =
        selectedCategory === 'all' ||
        String(prod.categoryId) === String(selectedCategory) ||
        String(prod.category) === String(selectedCategory);
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
    const taxAmount = rawSubtotal * 0.16;
    const finalTotal = rawSubtotal + taxAmount;

    return {
      rawSubtotal,
      taxAmount,
      finalTotal
    };
  }, [cart]);

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
              placeholder="Buscar producto por nombre o código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar productos"
              style={{ paddingLeft: '2.8rem' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {onOpenScanQr && (
              <button
                type="button"
                onClick={onOpenScanQr}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '10px',
                  border: '1px solid #10b981',
                  background: '#ecfdf5',
                  color: '#047857',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                <span>📱</span>
                <span>Cobrar QR Móvil</span>
              </button>
            )}
            <span className="search-count-badge">
              {filteredProducts.length} productos
            </span>
          </div>
        </header>

        <nav className="pos-categories-bar" aria-label="Categorías de menú">
          {categoriesList.map((cat) => (
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
        {/* Selector Comer Aquí / Para Llevar + Campo Cliente/Identificador */}
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
                  ? 'Cliente / Identificador (ej. Juan, Ficha 4)...'
                  : 'Cliente (ej. Juan Pérez, Teléfono)...'
              }
              value={tableOrCustomer}
              onChange={(e) => setTableOrCustomer(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Header del Ticket */}
        <header className="ticket-header">
          <div className="ticket-title-row">
            <span className="ticket-title">Orden Actual</span>
            <span className="ticket-num">Ticket #{ticketCounter}</span>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              className="btn-ticket-clear"
              onClick={clearCart}
              title="Vaciar productos del ticket"
            >
              Vaciar
            </button>
          )}
        </header>

        {/* Bandeja de Órdenes en Espera */}
        {heldOrders.length > 0 && (
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
                  #{h.ticketNumber} ({h.tableOrCustomer || (h.orderType === 'dine-in' ? 'Comer Aquí' : 'Llevar')})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scroll de Items del Ticket */}
        <div className="ticket-items-scroll">
          {cart.length === 0 ? (
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
        <footer className="ticket-summary-footer">
            <div className="summary-calc-row">
              <span>Subtotal:</span>
              <span>${totals.rawSubtotal.toFixed(2)}</span>
            </div>

            <div className="summary-calc-row">
              <span>IVA (16%):</span>
              <span>${totals.taxAmount.toFixed(2)}</span>
            </div>

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
      </aside>
    </div>
  );
}
