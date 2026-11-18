
import { EMPLOYEES, findEmployee } from './employees.js';
import { MENU_CATEGORIES, MENU_PRODUCTS } from './menuData.js';
import * as db from './db.js';

// Estado Global de la Aplicación
const state = {
  activeScreen: 'screen-welcome',
  activePosWorkspace: 'pos-ordering-workspace',
  
  // Autenticación de empleado
  currentEmployeeId: '',
  currentEmployee: null,
  currentPin: '',
  audioFeedbackEnabled: true,
  
  // Orden actual
  orderType: 'dine-in', // 'dine-in' | 'takeout'
  tableOrCustomer: '',
  ticketCounter: 1001,
  cart: [], // Array de { id, name, price, qty, note }
  selectedCategory: 'all',
  searchQuery: '',
  discountPercent: 0,
  tipPercent: 0,
  
  // Estado de edición de notas
  activeEditingItemId: null,
  
  // Estado de cobro actual
  activePaymentMethod: 'cash', // 'cash' | 'card' | 'transfer'
  cashReceived: 0,
  lastCompletedOrder: null,
  
  // Filtro de historial
  historyFilter: 'all'
};


let audioCtx = null;

function playKeyHaptic(type = 'click') {
  if (!state.audioFeedbackEnabled) return;
  try {
    if (!audioCtx) {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (AudioClass) audioCtx = new AudioClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.035);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.035);
    } else if (type === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(180, now + 0.1);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch {}
}


function switchScreen(screenId) {
  document.querySelectorAll('.screen-view').forEach(screen => {
    if (screen.id === screenId) {
      screen.classList.add('active');
    } else {
      screen.classList.remove('active');
    }
  });
  state.activeScreen = screenId;
}

// Pestañas internas del POS (Tomar Orden, Historial, Corte)
function switchPosWorkspace(workspaceId) {
  document.querySelectorAll('.pos-workspace-view').forEach(view => {
    if (view.id === workspaceId) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });

  document.querySelectorAll('.pos-view-tab').forEach(tab => {
    if ((workspaceId === 'pos-ordering-workspace' && tab.id === 'tab-nav-order') ||
        (workspaceId === 'pos-history-workspace' && tab.id === 'tab-nav-history') ||
        (workspaceId === 'pos-shift-workspace' && tab.id === 'tab-nav-shift')) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  state.activePosWorkspace = workspaceId;

  if (workspaceId === 'pos-history-workspace') {
    renderHistoryOrders();
  } else if (workspaceId === 'pos-shift-workspace') {
    renderShiftSummary();
  }
}


function updateLiveClock() {
  const now = new Date();
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const formattedDate = `${days[now.getDay()]}, ${now.getDate()} de ${months[now.getMonth()]} ${now.getFullYear()}`;

  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hoursFormatted = String(hours).padStart(2, '0');

  const dateEl = document.getElementById('live-date');
  const timeEl = document.getElementById('live-time');
  const posClockEl = document.getElementById('pos-live-clock');

  if (dateEl) dateEl.textContent = formattedDate;
  if (timeEl) timeEl.textContent = `${hoursFormatted}:${minutes} ${ampm}`;
  if (posClockEl) posClockEl.textContent = `${hoursFormatted}:${minutes}:${seconds} ${ampm}`;
}


function updateEmployeeIdDisplay() {
  const textEl = document.getElementById('txt-employee-id');
  if (textEl) textEl.textContent = state.currentEmployeeId;
  hideError('id-error-msg');
}

function handleEmployeeIdInput(key) {
  playKeyHaptic('click');
  if (key >= '0' && key <= '9') {
    if (state.currentEmployeeId.length < 6) {
      state.currentEmployeeId += key;
      updateEmployeeIdDisplay();
    }
  } else if (key === 'Backspace') {
    state.currentEmployeeId = state.currentEmployeeId.slice(0, -1);
    updateEmployeeIdDisplay();
  } else if (key === 'Enter') {
    submitEmployeeId();
  }
}

function submitEmployeeId() {
  const cleanId = state.currentEmployeeId.trim();
  if (!cleanId) {
    showError('id-error-msg', 'Por favor ingrese su número de empleado');
    shakeElement('id-display-window');
    playKeyHaptic('error');
    return;
  }

  const employee = findEmployee(cleanId);
  if (!employee) {
    showError('id-error-msg', 'Empleado no encontrado. Pruebe 101, 102, 103.');
    shakeElement('id-display-window');
    playKeyHaptic('error');
    return;
  }

  state.currentEmployee = employee;
  playKeyHaptic('success');
  setupPinScreen(employee);
  switchScreen('screen-employee-pin');
}

// ==========================================================================
// Pantalla 3: PIN del Empleado
// ==========================================================================
function setupPinScreen(employee) {
  state.currentPin = '';
  updatePinDisplay();

  const avatarEl = document.getElementById('pin-employee-avatar');
  const nameEl = document.getElementById('pin-employee-name');
  const roleEl = document.getElementById('pin-employee-role');

  if (avatarEl) {
    avatarEl.textContent = employee.avatar || '👤';
    if (employee.color) avatarEl.style.backgroundColor = employee.color;
  }
  if (nameEl) nameEl.textContent = employee.name;
  if (roleEl) roleEl.textContent = `${employee.role} • ID #${employee.id}`;

  hideError('pin-error-msg');
}

function updatePinDisplay() {
  const slots = document.querySelectorAll('.pin-slot-circle');
  slots.forEach((slot, index) => {
    if (index < state.currentPin.length) slot.classList.add('filled');
    else slot.classList.remove('filled');
  });
  hideError('pin-error-msg');
}

function handlePinInput(key) {
  playKeyHaptic('click');
  if (key >= '0' && key <= '9') {
    if (state.currentPin.length < 4) {
      state.currentPin += key;
      updatePinDisplay();
      if (state.currentPin.length === 4) {
        setTimeout(submitPin, 150);
      }
    }
  } else if (key === 'Backspace') {
    state.currentPin = state.currentPin.slice(0, -1);
    updatePinDisplay();
  } else if (key === 'Enter') {
    submitPin();
  }
}

function submitPin() {
  if (!state.currentEmployee) return;

  if (state.currentPin.length === 0) {
    showError('pin-error-msg', 'Ingrese su PIN de seguridad');
    shakeElement('pin-display-window');
    playKeyHaptic('error');
    return;
  }

  if (state.currentPin === state.currentEmployee.pin) {
    playKeyHaptic('success');
    initPosSession(state.currentEmployee);
    switchScreen('screen-pos');
  } else {
    playKeyHaptic('error');
    showError('pin-error-msg', `PIN incorrecto (Prueba: ${state.currentEmployee.pin})`);
    shakeElement('pin-display-window');
    state.currentPin = '';
    updatePinDisplay();
  }
}

// ==========================================================================
// Teclado Físico
// ==========================================================================
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  let key = e.key;
  if (key.startsWith('Numpad')) key = key.replace('Numpad', '');

  if (key === 'Escape') {
    if (state.activeScreen === 'screen-employee-id') {
      switchScreen('screen-welcome');
      return;
    }
    if (state.activeScreen === 'screen-employee-pin') {
      switchScreen('screen-employee-id');
      return;
    }
    closeAllModals();
    return;
  }

  const isNumber = key >= '0' && key <= '9';
  const isBackspace = key === 'Backspace';
  const isEnter = key === 'Enter';

  if (!isNumber && !isBackspace && !isEnter) return;
  e.preventDefault();

  if (state.activeScreen === 'screen-employee-id') {
    highlightPhysicalKey('grid-employee-id', key);
    handleEmployeeIdInput(key);
  } else if (state.activeScreen === 'screen-employee-pin') {
    highlightPhysicalKey('grid-employee-pin', key);
    handlePinInput(key);
  }
});

function highlightPhysicalKey(gridId, key) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const btn = grid.querySelector(`[data-key="${key}"]`);
  if (btn) {
    btn.classList.add('key-active');
    setTimeout(() => btn.classList.remove('key-active'), 120);
  }
}

// ==========================================================================
// Sistema de Punto de Venta (POS) & Catálogo
// ==========================================================================
async function initPosSession(employee) {
  const cashierEl = document.getElementById('pos-cashier-name');
  if (cashierEl) cashierEl.textContent = `${employee.name} (${employee.role})`;

  // Obtener último número de ticket desde la base de datos
  const allOrders = await db.getAllOrders();
  if (allOrders.length > 0) {
    const maxTicket = Math.max(...allOrders.map(o => Number(o.ticketNumber) || 1000));
    state.ticketCounter = maxTicket + 1;
  } else {
    state.ticketCounter = 1001;
  }

  updateTicketNumberDisplay();
  renderCategories();
  renderProducts();
  renderCart();
  setOrderMode('dine-in');
}

function updateTicketNumberDisplay() {
  const ticketNumberEl = document.getElementById('pos-ticket-number');
  if (ticketNumberEl) ticketNumberEl.textContent = `Ticket #${state.ticketCounter}`;
}

// Manejador del Selector "Comer Aquí" vs "Para Llevar"
function setOrderMode(mode) {
  state.orderType = mode;
  playKeyHaptic('click');

  const btnDineIn = document.getElementById('btn-mode-dine-in');
  const btnTakeout = document.getElementById('btn-mode-takeout');
  const metaInput = document.getElementById('input-table-customer');
  const metaIcon = document.getElementById('order-meta-icon');

  if (mode === 'dine-in') {
    if (btnDineIn) btnDineIn.classList.add('active');
    if (btnTakeout) btnTakeout.classList.remove('active');
    if (metaIcon) metaIcon.textContent = '🪑';
    if (metaInput) metaInput.placeholder = 'Mesa (ej. Mesa 4, Barra)...';
  } else {
    if (btnTakeout) btnTakeout.classList.add('active');
    if (btnDineIn) btnDineIn.classList.remove('active');
    if (metaIcon) metaIcon.textContent = '🛍️';
    if (metaInput) metaInput.placeholder = 'Nombre del Cliente (ej. Carlos M.)...';
  }
}

function renderCategories() {
  const container = document.getElementById('pos-categories-container');
  if (!container) return;

  container.innerHTML = MENU_CATEGORIES.map(cat => `
    <button type="button" class="pos-category-tab ${state.selectedCategory === cat.id ? 'active' : ''}" data-cat-id="${cat.id}">
      <span>${cat.icon}</span>
      <span>${cat.name}</span>
    </button>
  `).join('');

  container.querySelectorAll('.pos-category-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      playKeyHaptic('click');
      state.selectedCategory = tab.dataset.catId;
      renderCategories();
      renderProducts();
    });
  });
}

function renderProducts() {
  const container = document.getElementById('pos-products-grid');
  const countBadge = document.getElementById('search-count-badge');
  if (!container) return;

  const query = (state.searchQuery || '').trim().toLowerCase();

  let filtered = MENU_PRODUCTS.filter(p => {
    const matchesCategory = state.selectedCategory === 'all' || p.categoryId === state.selectedCategory;
    const matchesSearch = !query || 
      p.name.toLowerCase().includes(query) || 
      p.sku.toLowerCase().includes(query) ||
      (p.desc && p.desc.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} producto${filtered.length === 1 ? '' : 's'}`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #64748b;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
        <div style="font-weight: 700; color: #0f172a;">No se encontraron productos</div>
        <div style="font-size: 0.85rem;">Pruebe buscando con otra palabra o categoría.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(product => `
    <div class="pos-product-card" data-product-id="${product.id}">
      <div>
        <div class="product-sku-tag">${product.sku} ${product.favorite ? '• ⭐ Favorito' : ''}</div>
        <div class="product-title">${product.name}</div>
        <div class="product-desc">${product.desc}</div>
      </div>
      <div class="product-price-row">
        <span class="product-price-val">$${product.price.toFixed(2)}</span>
        <span class="product-add-badge">+</span>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.pos-product-card').forEach(card => {
    card.addEventListener('click', () => {
      addToCart(card.dataset.productId);
    });
  });
}

function addToCart(productId) {
  playKeyHaptic('click');
  const product = MENU_PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  const existing = state.cart.find(item => item.id === productId && !item.note);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      qty: 1,
      note: ''
    });
  }

  renderCart();
}

function updateCartItemQty(index, delta) {
  playKeyHaptic('click');
  if (index < 0 || index >= state.cart.length) return;

  state.cart[index].qty += delta;
  if (state.cart[index].qty <= 0) {
    state.cart.splice(index, 1);
  }
  renderCart();
}

function removeCartItem(index) {
  playKeyHaptic('click');
  if (index >= 0 && index < state.cart.length) {
    state.cart.splice(index, 1);
    renderCart();
  }
}

function clearCart() {
  playKeyHaptic('click');
  state.cart = [];
  state.discountPercent = 0;
  state.tipPercent = 0;
  const selectDiscount = document.getElementById('select-discount');
  const selectTip = document.getElementById('select-tip');
  const metaInput = document.getElementById('input-table-customer');
  if (selectDiscount) selectDiscount.value = '0';
  if (selectTip) selectTip.value = '0';
  if (metaInput) metaInput.value = '';
  renderCart();
}

function calculateOrderTotals() {
  let subtotal = 0;
  state.cart.forEach(item => {
    subtotal += item.price * item.qty;
  });

  const discountAmount = subtotal * (state.discountPercent / 100);
  const taxableSubtotal = Math.max(0, subtotal - discountAmount);
  const tax = taxableSubtotal * 0.16;
  const tipAmount = taxableSubtotal * (state.tipPercent / 100);
  const total = taxableSubtotal + tax + tipAmount;

  return { subtotal, discountAmount, tax, tipAmount, total };
}

function renderCart() {
  const container = document.getElementById('ticket-items-container');
  const subtotalEl = document.getElementById('txt-subtotal');
  const discountRow = document.getElementById('row-discount');
  const discountEl = document.getElementById('txt-discount');
  const taxEl = document.getElementById('txt-tax');
  const tipRow = document.getElementById('row-tip');
  const tipEl = document.getElementById('txt-tip');
  const totalEl = document.getElementById('txt-total');
  const checkoutBtn = document.getElementById('btn-open-checkout');
  const holdBtn = document.getElementById('btn-hold-order');

  if (!container) return;

  if (state.cart.length === 0) {
    container.innerHTML = `
      <div class="ticket-empty-state">
        <div class="ticket-empty-icon">🧾</div>
        <div style="font-weight: 700; color: #1e293b;">Orden Vacía</div>
        <div style="font-size: 0.85rem;">Toque los productos del catálogo para agregarlos.</div>
      </div>
    `;
    if (subtotalEl) subtotalEl.textContent = '$0.00';
    if (discountRow) discountRow.style.display = 'none';
    if (taxEl) taxEl.textContent = '$0.00';
    if (tipRow) tipRow.style.display = 'none';
    if (totalEl) totalEl.textContent = '$0.00';
    if (checkoutBtn) checkoutBtn.disabled = true;
    if (holdBtn) holdBtn.disabled = true;
    return;
  }

  const totals = calculateOrderTotals();

  container.innerHTML = state.cart.map((item, index) => {
    const itemTotal = item.price * item.qty;
    return `
      <div class="ticket-item-row" data-index="${index}">
        <div class="item-main-details">
          <div class="item-name">${item.name}</div>
          <div class="item-single-price">$${item.price.toFixed(2)} c/u</div>
          ${item.note ? `<div class="item-note-tag">📝 ${item.note}</div>` : ''}
          <button type="button" class="btn-item-note" data-index="${index}">
            ${item.note ? 'Editar nota' : '+ Nota de cocina'}
          </button>
        </div>

        <div class="item-qty-stepper">
          <button type="button" class="btn-stepper" data-action="minus" data-index="${index}">&minus;</button>
          <span class="stepper-val">${item.qty}</span>
          <button type="button" class="btn-stepper" data-action="plus" data-index="${index}">+</button>
        </div>

        <div class="item-total-col">
          <div>$${itemTotal.toFixed(2)}</div>
          <button type="button" class="btn-ticket-delete-item" data-index="${index}" title="Eliminar artículo" style="font-size: 0.85rem; color: #94a3b8; cursor: pointer; padding: 2px;">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  // Eventos de stepper y notas
  container.querySelectorAll('.btn-stepper').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = Number(btn.dataset.index);
      const delta = btn.dataset.action === 'plus' ? 1 : -1;
      updateCartItemQty(index, delta);
    });
  });

  container.querySelectorAll('.btn-ticket-delete-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeCartItem(Number(btn.dataset.index));
    });
  });

  container.querySelectorAll('.btn-item-note').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openItemNoteModal(Number(btn.dataset.index));
    });
  });

  // Actualizar totales
  if (subtotalEl) subtotalEl.textContent = `$${totals.subtotal.toFixed(2)}`;

  if (discountRow) {
    if (totals.discountAmount > 0) {
      discountRow.style.display = 'flex';
      if (discountEl) discountEl.textContent = `-$${totals.discountAmount.toFixed(2)} (${state.discountPercent}%)`;
    } else {
      discountRow.style.display = 'none';
    }
  }

  if (taxEl) taxEl.textContent = `$${totals.tax.toFixed(2)}`;

  if (tipRow) {
    if (totals.tipAmount > 0) {
      tipRow.style.display = 'flex';
      if (tipEl) tipEl.textContent = `+$${totals.tipAmount.toFixed(2)} (${state.tipPercent}%)`;
    } else {
      tipRow.style.display = 'none';
    }
  }

  if (totalEl) totalEl.textContent = `$${totals.total.toFixed(2)}`;
  if (checkoutBtn) checkoutBtn.disabled = false;
  if (holdBtn) holdBtn.disabled = false;
}

// ==========================================================================
// Modal de Notas / Instrucciones de Cocina
// ==========================================================================
function openItemNoteModal(cartIndex) {
  state.activeEditingItemId = cartIndex;
  const item = state.cart[cartIndex];
  if (!item) return;

  const titleEl = document.getElementById('note-modal-title');
  const textarea = document.getElementById('textarea-item-note');

  if (titleEl) titleEl.textContent = `Instrucciones: ${item.name}`;
  if (textarea) textarea.value = item.note || '';

  openModal('modal-item-note');
}

// Guardar Pedido en Espera (Hold Order en IndexedDB)
async function holdCurrentOrder() {
  if (state.cart.length === 0) return;

  const totals = calculateOrderTotals();
  const metaInput = document.getElementById('input-table-customer');
  const tableOrCustomer = (metaInput ? metaInput.value : '').trim() || (state.orderType === 'dine-in' ? 'Mesa Sin Asignar' : 'Cliente Mostrador');

  const orderRecord = {
    ticketNumber: state.ticketCounter,
    createdAt: new Date().toISOString(),
    employeeId: state.currentEmployee ? state.currentEmployee.id : '101',
    employeeName: state.currentEmployee ? state.currentEmployee.name : 'Cajero',
    orderType: state.orderType,
    tableOrCustomer: tableOrCustomer,
    items: [...state.cart],
    subtotal: totals.subtotal,
    discount: totals.discountAmount,
    discountPercent: state.discountPercent,
    tax: totals.tax,
    tip: totals.tipAmount,
    total: totals.total,
    paymentMethod: 'pending',
    status: 'pending' // Estado "En espera"
  };

  await db.saveOrder(orderRecord);
  playKeyHaptic('success');

  alert(`✅ Orden #${orderRecord.ticketNumber} guardada en espera para ${tableOrCustomer}. Puede consultarla y cobrarla desde "Historial de Pedidos".`);

  // Limpiar y avanzar ticket
  state.cart = [];
  state.ticketCounter += 1;
  updateTicketNumberDisplay();
  if (metaInput) metaInput.value = '';
  renderCart();
}

// ==========================================================================
// Cobro Profesional (Modal de Pago Completo)
// ==========================================================================
function openCheckoutModal() {
  if (state.cart.length === 0) return;

  const totals = calculateOrderTotals();
  const metaInput = document.getElementById('input-table-customer');
  const tableOrCustomer = (metaInput ? metaInput.value : '').trim() || (state.orderType === 'dine-in' ? 'Mesa en Salón' : 'Para Llevar');

  const totalEl = document.getElementById('modal-checkout-total');
  const metaEl = document.getElementById('modal-checkout-meta');
  const cashInput = document.getElementById('input-cash-received');

  if (totalEl) totalEl.textContent = `$${totals.total.toFixed(2)}`;
  if (metaEl) metaEl.textContent = `${state.orderType === 'dine-in' ? '🍽️ Comer Aquí' : '🛍️ Para Llevar'} • ${tableOrCustomer} • Ticket #${state.ticketCounter}`;

  // Inicializar cálculo de efectivo
  state.activePaymentMethod = 'cash';
  setPaymentMethodTab('cash');

  if (cashInput) {
    cashInput.value = totals.total.toFixed(2);
    updateCashChange();
  }

  openModal('modal-checkout');
}

function setPaymentMethodTab(method) {
  state.activePaymentMethod = method;
  playKeyHaptic('click');

  document.querySelectorAll('.btn-method-tab').forEach(tab => {
    if (tab.dataset.method === method) tab.classList.add('active');
    else tab.classList.remove('active');
  });

  const cashSec = document.getElementById('checkout-cash-section');
  const cardSec = document.getElementById('checkout-card-section');
  const transSec = document.getElementById('checkout-transfer-section');

  if (cashSec) cashSec.style.display = method === 'cash' ? 'block' : 'none';
  if (cardSec) cardSec.style.display = method === 'card' ? 'block' : 'none';
  if (transSec) transSec.style.display = method === 'transfer' ? 'block' : 'none';
}

function updateCashChange() {
  const totals = calculateOrderTotals();
  const cashInput = document.getElementById('input-cash-received');
  const changeEl = document.getElementById('display-cash-change');
  if (!cashInput || !changeEl) return;

  const received = parseFloat(cashInput.value) || 0;
  const change = Math.max(0, received - totals.total);

  changeEl.textContent = `$${change.toFixed(2)}`;
  if (received < totals.total) {
    changeEl.style.color = '#ef4444';
    changeEl.textContent = `Faltan $${(totals.total - received).toFixed(2)}`;
  } else {
    changeEl.style.color = '#15803d';
  }
}

// Confirmar venta y guardar en Base de Datos
async function confirmAndFinishPayment() {
  const totals = calculateOrderTotals();
  const metaInput = document.getElementById('input-table-customer');
  const tableOrCustomer = (metaInput ? metaInput.value : '').trim() || (state.orderType === 'dine-in' ? 'Mesa en Salón' : 'Cliente Mostrador');

  let amountPaid = totals.total;
  let change = 0;

  if (state.activePaymentMethod === 'cash') {
    const cashInput = document.getElementById('input-cash-received');
    amountPaid = parseFloat(cashInput ? cashInput.value : 0) || totals.total;
    if (amountPaid < totals.total) {
      alert(`El monto recibido ($${amountPaid.toFixed(2)}) es menor al total a pagar ($${totals.total.toFixed(2)}).`);
      return;
    }
    change = Math.max(0, amountPaid - totals.total);
  }

  const orderRecord = {
    ticketNumber: state.ticketCounter,
    createdAt: new Date().toISOString(),
    employeeId: state.currentEmployee ? state.currentEmployee.id : '101',
    employeeName: state.currentEmployee ? state.currentEmployee.name : 'Cajero',
    orderType: state.orderType,
    tableOrCustomer: tableOrCustomer,
    items: [...state.cart],
    subtotal: totals.subtotal,
    discount: totals.discountAmount,
    discountPercent: state.discountPercent,
    tax: totals.tax,
    tip: totals.tipAmount,
    total: totals.total,
    paymentMethod: state.activePaymentMethod,
    amountPaid: amountPaid,
    change: change,
    status: 'completed'
  };

  // Guardar en la Base de Datos IndexedDB
  await db.saveOrder(orderRecord);
  state.lastCompletedOrder = orderRecord;
  playKeyHaptic('success');

  closeModal('modal-checkout');

  // Mostrar ticket impreso en modal
  renderReceiptPreview(orderRecord);
  openModal('modal-receipt');

  // Preparar siguiente orden
  state.cart = [];
  state.discountPercent = 0;
  state.tipPercent = 0;
  state.ticketCounter += 1;
  updateTicketNumberDisplay();
  if (metaInput) metaInput.value = '';
  renderCart();
}

// ==========================================================================
// Ticket Térmico de Impresión (Recibo)
// ==========================================================================
function renderReceiptPreview(order) {
  const paper = document.getElementById('receipt-paper');
  if (!paper) return;

  const dateObj = new Date(order.createdAt || Date.now());
  const dateFormatted = dateObj.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  paper.innerHTML = `
    <div class="receipt-header">
      <div class="receipt-store-name">COFFEE´S POS</div>
      <div class="receipt-meta">
        CAFETERÍA & RESTAURANTE GOURMET<br>
        RFC: CFP-260926-POS<br>
        FECHA: ${dateFormatted}<br>
        TICKET: #${order.ticketNumber} &bull; CAJERO: ${order.employeeName}<br>
        <strong>${order.orderType === 'dine-in' ? '🍽️ COMER AQUÍ' : '🛍️ PARA LLEVAR'} &bull; ${order.tableOrCustomer || ''}</strong>
      </div>
    </div>

    <div class="receipt-items-list">
      ${order.items.map(item => `
        <div class="receipt-item-line">
          <span>${item.qty}x ${item.name}</span>
          <span>$${(item.price * item.qty).toFixed(2)}</span>
        </div>
        ${item.note ? `<div style="font-size:0.7rem; color:#475569; padding-left:10px;">* ${item.note}</div>` : ''}
      `).join('')}
    </div>

    <table class="receipt-totals-table">
      <tr>
        <td>Subtotal:</td>
        <td style="text-align:right;">$${order.subtotal.toFixed(2)}</td>
      </tr>
      ${order.discount > 0 ? `
      <tr>
        <td>Descuento (${order.discountPercent}%):</td>
        <td style="text-align:right;">-$${order.discount.toFixed(2)}</td>
      </tr>` : ''}
      <tr>
        <td>IVA (16%):</td>
        <td style="text-align:right;">$${order.tax.toFixed(2)}</td>
      </tr>
      ${order.tip > 0 ? `
      <tr>
        <td>Propina:</td>
        <td style="text-align:right;">+$${order.tip.toFixed(2)}</td>
      </tr>` : ''}
      <tr class="receipt-grand-total">
        <td>TOTAL:</td>
        <td style="text-align:right;">$${order.total.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Método de Pago:</td>
        <td style="text-align:right;">${order.paymentMethod === 'cash' ? 'Efectivo' : order.paymentMethod === 'card' ? 'Tarjeta' : 'Transferencia'}</td>
      </tr>
      ${order.paymentMethod === 'cash' ? `
      <tr>
        <td>Pagó con:</td>
        <td style="text-align:right;">$${(order.amountPaid || order.total).toFixed(2)}</td>
      </tr>
      <tr>
        <td>Cambio:</td>
        <td style="text-align:right;">$${(order.change || 0).toFixed(2)}</td>
      </tr>` : ''}
    </table>

    <div class="receipt-footer-text">
      *** ¡GRACIAS POR SU COMPRA! ***<br>
      Este ticket no constituye comprobante fiscal formal.
    </div>
  `;
}

// ==========================================================================
// Vista 2: Historial de Pedidos desde Base de Datos
// ==========================================================================
async function renderHistoryOrders() {
  const tbody = document.getElementById('history-orders-tbody');
  if (!tbody) return;

  const orders = await db.getAllOrders();

  let filtered = orders;
  const todayStr = new Date().toISOString().split('T')[0];

  if (state.historyFilter === 'today') {
    filtered = orders.filter(o => (o.createdAt || '').startsWith(todayStr));
  } else if (state.historyFilter === 'dine-in') {
    filtered = orders.filter(o => o.orderType === 'dine-in');
  } else if (state.historyFilter === 'takeout') {
    filtered = orders.filter(o => o.orderType === 'takeout');
  } else if (state.historyFilter === 'completed') {
    filtered = orders.filter(o => o.status === 'completed');
  } else if (state.historyFilter === 'pending') {
    filtered = orders.filter(o => o.status === 'pending');
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 3rem; color: #64748b;">
          No hay órdenes registradas con este filtro.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(order => {
    const dateObj = new Date(order.createdAt || Date.now());
    const timeFormatted = dateObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const dateFormatted = dateObj.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

    const statusBadge = order.status === 'completed'
      ? '<span class="status-badge completed">✅ Cobrado</span>'
      : order.status === 'pending'
      ? '<span class="status-badge pending">⏳ En Espera</span>'
      : '<span class="status-badge cancelled">❌ Cancelado</span>';

    const itemsSummary = order.items.map(i => `${i.qty}x ${i.name}`).join(', ');

    return `
      <tr>
        <td style="font-weight: 800;">#${order.ticketNumber}</td>
        <td>${dateFormatted} ${timeFormatted}</td>
        <td>${order.employeeName}</td>
        <td>
          <span class="order-type-badge">${order.orderType === 'dine-in' ? '🍽️ Comer Aquí' : '🛍️ Para Llevar'}</span><br>
          <small style="color: #64748b;">${order.tableOrCustomer || ''}</small>
        </td>
        <td style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${itemsSummary}">${itemsSummary}</td>
        <td style="font-weight: 800;">$${order.total.toFixed(2)}</td>
        <td style="text-transform: capitalize;">${order.paymentMethod === 'cash' ? '💵 Efectivo' : order.paymentMethod === 'card' ? '💳 Tarjeta' : order.paymentMethod === 'pending' ? '⏳ Pendiente' : '📲 Transf.'}</td>
        <td>${statusBadge}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="demo-chip-btn btn-view-history-receipt" data-order-id="${order.id}" title="Ver e imprimir ticket">👁️ Ticket</button>
          ${order.status === 'pending' ? `<button type="button" class="demo-chip-btn btn-resume-history-order" data-order-id="${order.id}" style="background:#0f172a; color:#fff;" title="Cargar y cobrar en caja">💳 Cobrar</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  // Eventos de botones de acción
  tbody.querySelectorAll('.btn-view-history-receipt').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.orderId;
      const all = await db.getAllOrders();
      const ord = all.find(o => o.id === orderId);
      if (ord) {
        renderReceiptPreview(ord);
        openModal('modal-receipt');
      }
    });
  });

  tbody.querySelectorAll('.btn-resume-history-order').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.orderId;
      const all = await db.getAllOrders();
      const ord = all.find(o => o.id === orderId);
      if (ord) {
        resumePendingOrder(ord);
      }
    });
  });
}

// Cargar orden en espera de nuevo a la pantalla de cobro
function resumePendingOrder(order) {
  state.cart = [...order.items];
  state.orderType = order.orderType || 'dine-in';
  state.ticketCounter = order.ticketNumber;
  state.discountPercent = order.discountPercent || 0;
  state.tipPercent = (order.tip && order.subtotal) ? Math.round((order.tip / order.subtotal) * 100) : 0;

  const metaInput = document.getElementById('input-table-customer');
  if (metaInput) metaInput.value = order.tableOrCustomer || '';

  setOrderMode(state.orderType);
  updateTicketNumberDisplay();
  renderCart();
  switchPosWorkspace('pos-ordering-workspace');
}

// ==========================================================================
// Vista 3: Resumen y Corte de Turno
// ==========================================================================
async function renderShiftSummary() {
  const summary = await db.getDailySummary();

  const totalSalesEl = document.getElementById('shift-total-sales');
  const completedOrdersEl = document.getElementById('shift-completed-orders');
  const cashSalesEl = document.getElementById('shift-cash-sales');
  const cardSalesEl = document.getElementById('shift-card-sales');
  const pendingSalesEl = document.getElementById('shift-pending-sales');
  const pendingCountEl = document.getElementById('shift-pending-count');
  const avgTicketEl = document.getElementById('shift-avg-ticket');
  const typeRatioEl = document.getElementById('shift-type-ratio');

  if (totalSalesEl) totalSalesEl.textContent = `$${summary.totalSales.toFixed(2)}`;
  if (completedOrdersEl) completedOrdersEl.textContent = `${summary.completedCount} tickets cobrados`;
  if (cashSalesEl) cashSalesEl.textContent = `$${summary.totalCash.toFixed(2)}`;
  if (cardSalesEl) cardSalesEl.textContent = `$${summary.totalCard.toFixed(2)}`;
  if (pendingSalesEl) pendingSalesEl.textContent = `$${summary.totalPending.toFixed(2)}`;
  if (pendingCountEl) pendingCountEl.textContent = `${summary.pendingCount} órdenes por cobrar`;
  if (avgTicketEl) avgTicketEl.textContent = `$${summary.avgTicket.toFixed(2)}`;
  if (typeRatioEl) typeRatioEl.textContent = `${summary.dineInCount} Aquí / ${summary.takeoutCount} Llevar`;
}

// Exportar copia de respaldo en JSON
async function handleExportBackup() {
  playKeyHaptic('click');
  const jsonStr = await db.exportBackupJSON();
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CoffeesPos_Respaldo_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Importar copia de respaldo
function handleImportBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target.result;
    const res = await db.importBackupJSON(content);
    if (res.success) {
      alert(`✅ Se restauraron exitosamente ${res.count} pedidos a la base de datos.`);
      renderHistoryOrders();
      renderShiftSummary();
    } else {
      alert(`❌ Error al importar respaldo: ${res.message}`);
    }
  };
  reader.readAsText(file);
}

// ==========================================================================
// Utilidades de Error y Animación
// ==========================================================================
function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.classList.add('visible');
  }
}

function hideError(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = '';
    el.classList.remove('visible');
  }
}

function shakeElement(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.classList.remove('shake-animation');
    void el.offsetWidth;
    el.classList.add('shake-animation');
  }
}

// Modales
function openModal(modalId) {
  playKeyHaptic('click');
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('open');
}

function closeModal(modalId) {
  playKeyHaptic('click');
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.classList.remove('open');
  });
}

// ==========================================================================
// Inicialización del Sistema (Robusta para Módulos ES)
// ==========================================================================

// Función global accesible inmediatamente para empezar
window.startCoffeesPos = function() {
  playKeyHaptic('click');
  state.currentEmployeeId = '';
  updateEmployeeIdDisplay();
  switchScreen('screen-employee-id');
};
window.startTaffyPos = window.startCoffeesPos;

function initApp() {
  console.log('🚀 Coffee´s Pos inicializando...');

  // 1. Reloj en vivo de inmediato
  updateLiveClock();
  setInterval(updateLiveClock, 1000);

  // 2. Base de datos en segundo plano (sin bloquear la interfaz)
  db.initDB().then(() => {
    console.log('✅ Base de datos IndexedDB conectada');
  }).catch(err => {
    console.warn('Advertencia DB:', err);
  });

  // 3. Pantalla 1: Botón EMPEZAR
  const btnStart = document.getElementById('btn-start');
  if (btnStart) {
    btnStart.addEventListener('click', (e) => {
      e.preventDefault();
      window.startCoffeesPos();
    });
    btnStart.addEventListener('pointerdown', () => {
      playKeyHaptic('click');
    });
  }

  // 2. Navegación hacia atrás
  const btnBackToWelcome = document.getElementById('btn-back-to-welcome');
  if (btnBackToWelcome) {
    btnBackToWelcome.addEventListener('click', () => {
      playKeyHaptic('click');
      switchScreen('screen-welcome');
    });
  }

  const btnBackToId = document.getElementById('btn-back-to-id');
  if (btnBackToId) {
    btnBackToId.addEventListener('click', () => {
      playKeyHaptic('click');
      state.currentPin = '';
      switchScreen('screen-employee-id');
    });
  }

  // 3. Teclado Empleado
  const idKeypad = document.getElementById('grid-employee-id');
  if (idKeypad) {
    idKeypad.querySelectorAll('.numpad-key').forEach(button => {
      button.addEventListener('click', () => handleEmployeeIdInput(button.dataset.key));
    });
  }

  const btnConfirmId = document.getElementById('btn-confirm-employee-id');
  if (btnConfirmId) btnConfirmId.addEventListener('click', submitEmployeeId);

  const btnClearId = document.getElementById('btn-clear-id');
  if (btnClearId) {
    btnClearId.addEventListener('click', () => {
      playKeyHaptic('click');
      state.currentEmployeeId = '';
      updateEmployeeIdDisplay();
    });
  }

  document.querySelectorAll('.demo-chip-btn[data-demo-id]').forEach(chip => {
    chip.addEventListener('click', () => {
      state.currentEmployeeId = chip.dataset.demoId;
      updateEmployeeIdDisplay();
      playKeyHaptic('click');
    });
  });

  // 4. Teclado PIN
  const pinKeypad = document.getElementById('grid-employee-pin');
  if (pinKeypad) {
    pinKeypad.querySelectorAll('.numpad-key').forEach(button => {
      button.addEventListener('click', () => handlePinInput(button.dataset.key));
    });
  }

  const btnConfirmPin = document.getElementById('btn-confirm-employee-pin');
  if (btnConfirmPin) btnConfirmPin.addEventListener('click', submitPin);

  const btnClearPin = document.getElementById('btn-clear-pin');
  if (btnClearPin) {
    btnClearPin.addEventListener('click', () => {
      playKeyHaptic('click');
      state.currentPin = '';
      updatePinDisplay();
    });
  }

  // 5. Pestañas Superiores del POS
  const tabNavOrder = document.getElementById('tab-nav-order');
  const tabNavHistory = document.getElementById('tab-nav-history');
  const tabNavShift = document.getElementById('tab-nav-shift');

  if (tabNavOrder) tabNavOrder.addEventListener('click', () => switchPosWorkspace('pos-ordering-workspace'));
  if (tabNavHistory) tabNavHistory.addEventListener('click', () => switchPosWorkspace('pos-history-workspace'));
  if (tabNavShift) tabNavShift.addEventListener('click', () => switchPosWorkspace('pos-shift-workspace'));

  // 6. Selector Comer Aquí / Para Llevar
  const btnModeDineIn = document.getElementById('btn-mode-dine-in');
  const btnModeTakeout = document.getElementById('btn-mode-takeout');
  if (btnModeDineIn) btnModeDineIn.addEventListener('click', () => setOrderMode('dine-in'));
  if (btnModeTakeout) btnModeTakeout.addEventListener('click', () => setOrderMode('takeout'));

  // 7. Buscador de Productos
  const searchInput = document.getElementById('pos-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderProducts();
    });
  }

  // 8. Descuento y Propina
  const selectDiscount = document.getElementById('select-discount');
  if (selectDiscount) {
    selectDiscount.addEventListener('change', (e) => {
      state.discountPercent = Number(e.target.value) || 0;
      renderCart();
    });
  }

  const selectTip = document.getElementById('select-tip');
  if (selectTip) {
    selectTip.addEventListener('change', (e) => {
      state.tipPercent = Number(e.target.value) || 0;
      renderCart();
    });
  }

  // 9. Guardar en Espera y Cobrar
  const btnHoldOrder = document.getElementById('btn-hold-order');
  if (btnHoldOrder) btnHoldOrder.addEventListener('click', holdCurrentOrder);

  const btnOpenCheckout = document.getElementById('btn-open-checkout');
  if (btnOpenCheckout) btnOpenCheckout.addEventListener('click', openCheckoutModal);

  const btnTicketClear = document.getElementById('btn-ticket-clear');
  if (btnTicketClear) btnTicketClear.addEventListener('click', clearCart);

  // 10. Métodos de Pago y Billetes Rápidos en Cobro
  document.querySelectorAll('.btn-method-tab').forEach(tab => {
    tab.addEventListener('click', () => setPaymentMethodTab(tab.dataset.method));
  });

  document.querySelectorAll('.btn-cash-bill').forEach(billBtn => {
    billBtn.addEventListener('click', () => {
      playKeyHaptic('click');
      const cashInput = document.getElementById('input-cash-received');
      const totals = calculateOrderTotals();
      if (!cashInput) return;

      if (billBtn.dataset.amount === 'exact') {
        cashInput.value = totals.total.toFixed(2);
      } else {
        cashInput.value = Number(billBtn.dataset.amount).toFixed(2);
      }
      updateCashChange();
    });
  });

  const cashReceivedInput = document.getElementById('input-cash-received');
  if (cashReceivedInput) {
    cashReceivedInput.addEventListener('input', updateCashChange);
  }

  const btnConfirmPayment = document.getElementById('btn-confirm-payment');
  if (btnConfirmPayment) {
    btnConfirmPayment.addEventListener('click', confirmAndFinishPayment);
  }

  const btnCloseCheckout = document.getElementById('btn-close-checkout');
  if (btnCloseCheckout) {
    btnCloseCheckout.addEventListener('click', () => closeModal('modal-checkout'));
  }

  // 11. Modal de Ticket / Recibo
  const btnCloseReceipt = document.getElementById('btn-close-receipt');
  if (btnCloseReceipt) {
    btnCloseReceipt.addEventListener('click', () => closeModal('modal-receipt'));
  }

  const btnNewOrderAfterReceipt = document.getElementById('btn-new-order-after-receipt');
  if (btnNewOrderAfterReceipt) {
    btnNewOrderAfterReceipt.addEventListener('click', () => {
      playKeyHaptic('click');
      closeModal('modal-receipt');
      switchPosWorkspace('pos-ordering-workspace');
    });
  }

  const btnPrintReceipt = document.getElementById('btn-print-receipt');
  if (btnPrintReceipt) {
    btnPrintReceipt.addEventListener('click', () => {
      window.print();
    });
  }

  // 12. Modal de Nota de Cocina
  const btnSaveItemNote = document.getElementById('btn-save-item-note');
  if (btnSaveItemNote) {
    btnSaveItemNote.addEventListener('click', () => {
      const textarea = document.getElementById('textarea-item-note');
      if (state.activeEditingItemId !== null && state.cart[state.activeEditingItemId]) {
        state.cart[state.activeEditingItemId].note = (textarea ? textarea.value : '').trim();
        renderCart();
      }
      closeModal('modal-item-note');
    });
  }

  const btnCloseNote = document.getElementById('btn-close-note');
  if (btnCloseNote) btnCloseNote.addEventListener('click', () => closeModal('modal-item-note'));

  document.querySelectorAll('.quick-note-btn').forEach(chip => {
    chip.addEventListener('click', () => {
      const textarea = document.getElementById('textarea-item-note');
      if (textarea) {
        const text = chip.dataset.text;
        if (textarea.value) textarea.value += `, ${text}`;
        else textarea.value = text;
      }
      playKeyHaptic('click');
    });
  });

  // 13. Historial de Pedidos: Filtros y Respaldos
  document.querySelectorAll('.history-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.history-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.historyFilter = pill.dataset.filter;
      renderHistoryOrders();
      playKeyHaptic('click');
    });
  });

  const btnExportBackup = document.getElementById('btn-export-backup');
  if (btnExportBackup) btnExportBackup.addEventListener('click', handleExportBackup);

  const btnImportTrigger = document.getElementById('btn-import-backup-trigger');
  const inputBackupFile = document.getElementById('input-backup-file');
  if (btnImportTrigger && inputBackupFile) {
    btnImportTrigger.addEventListener('click', () => inputBackupFile.click());
    inputBackupFile.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImportBackupFile(e.target.files[0]);
      }
    });
  }

  // 14. Corte de Turno
  const btnPrintShift = document.getElementById('btn-print-shift');
  if (btnPrintShift) {
    btnPrintShift.addEventListener('click', () => {
      window.print();
    });
  }

  // 15. Cerrar Turno
  const btnPosLogout = document.getElementById('btn-pos-logout');
  if (btnPosLogout) {
    btnPosLogout.addEventListener('click', () => {
      playKeyHaptic('click');
      state.cart = [];
      state.currentEmployee = null;
      state.currentEmployeeId = '';
      state.currentPin = '';
      switchScreen('screen-welcome');
    });
  }

  // 16. Menú Hamburguesa & Pantalla Completa
  const btnOpenMenu = document.getElementById('btn-open-menu');
  if (btnOpenMenu) btnOpenMenu.addEventListener('click', () => openModal('modal-menu'));

  const btnCloseMenu = document.getElementById('btn-close-menu');
  if (btnCloseMenu) btnCloseMenu.addEventListener('click', () => closeModal('modal-menu'));

  const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
  if (btnToggleFullscreen) {
    btnToggleFullscreen.addEventListener('click', () => {
      playKeyHaptic('click');
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  const btnToggleAudio = document.getElementById('btn-toggle-audio');
  const txtAudioStatus = document.getElementById('txt-audio-status');
  if (btnToggleAudio) {
    btnToggleAudio.addEventListener('click', () => {
      state.audioFeedbackEnabled = !state.audioFeedbackEnabled;
      if (txtAudioStatus) {
        txtAudioStatus.textContent = state.audioFeedbackEnabled ? '🔊 Clic Sonoro: Activado' : '🔇 Clic Sonoro: Desactivado';
      }
      playKeyHaptic('click');
    });
  }

  // Selector de tema
  const savedTheme = localStorage.getItem('coffees_theme') || localStorage.getItem('taffy_theme') || 'theme-nordic';
  applyTheme(savedTheme);

  document.querySelectorAll('.btn-theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      localStorage.setItem('coffees_theme', theme);
      localStorage.setItem('taffy_theme', theme);
      playKeyHaptic('click');
    });
  });

  function applyTheme(themeName) {
    const rightPanel = document.getElementById('welcome-right-panel');
    if (rightPanel) {
      rightPanel.classList.remove('theme-nordic', 'theme-dark', 'theme-latte', 'theme-mint');
      rightPanel.classList.add(themeName);
    }
    document.querySelectorAll('.btn-theme-option').forEach(btn => {
      if (btn.dataset.theme === themeName) {
        btn.style.boxShadow = '0 0 0 2px #0f172a';
        btn.style.borderColor = '#0f172a';
      } else {
        btn.style.boxShadow = 'none';
        btn.style.borderColor = '#cbd5e1';
      }
    });
  }

  // Cierre de modales
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAllModals();
    });
  });
}

// Ejecutar inmediatamente si el DOM ya está listo (evita que se pierda DOMContentLoaded en módulos ES)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
