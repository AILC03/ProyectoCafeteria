import React, { useState, useEffect } from 'react';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import EmployeeIdScreen from './components/EmployeeIdScreen.jsx';
import EmployeePinScreen from './components/EmployeePinScreen.jsx';
import PosHeader from './components/PosHeader.jsx';
import OrderingWorkspace from './components/OrderingWorkspace.jsx';
import HistoryWorkspace from './components/HistoryWorkspace.jsx';
import ShiftWorkspace from './components/ShiftWorkspace.jsx';
import MenuManagementWorkspace from './components/MenuManagementWorkspace.jsx';
import UserManagementWorkspace from './components/UserManagementWorkspace.jsx';
import TablesWorkspace from './components/TablesWorkspace.jsx';
import AdminDashboardWorkspace from './components/AdminDashboardWorkspace.jsx';
import CheckoutModal from './components/CheckoutModal.jsx';
import ReceiptModal from './components/ReceiptModal.jsx';
import NoteModal from './components/NoteModal.jsx';
import MenuModal from './components/MenuModal.jsx';
import AdminAuthModal from './components/AdminAuthModal.jsx';
import ToastNotification from './components/ToastNotification.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';

import * as db from './data/db.js';
import { openTableOrder, appendItemsToTable, requestTableBill } from './data/tablesData.js';
import { playHapticSound } from './utils/audio.js';
import { showToast, showConfirm } from './utils/notify.js';

export default function App() {
  // Business Mode State
  const [businessMode, setBusinessMode] = useState(() => localStorage.getItem('taffy_business_mode') || 'restaurant');
  const [activeTable, setActiveTable] = useState(null);

  // Navigation State
  const [activeScreen, setActiveScreen] = useState('welcome'); // 'welcome' | 'employee-id' | 'employee-pin' | 'pos'
  const [activePosTab, setActivePosTab] = useState(() => {
    const mode = localStorage.getItem('taffy_business_mode') || 'restaurant';
    return mode === 'restaurant' ? 'tables' : 'order';
  });
  const [adminAuthPendingTab, setAdminAuthPendingTab] = useState(null);

  // Employee Authentication State
  const [currentEmployee, setCurrentEmployee] = useState(null);

  // Preference Settings
  const [theme, setTheme] = useState(() => localStorage.getItem('taffy_theme') || 'theme-nordic');
  const [audioEnabled, setAudioEnabled] = useState(() => localStorage.getItem('taffy_audio') !== 'false');

  // In-App Toast & Confirmation Modal State
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Aceptar',
    cancelText: 'Cancelar',
    isDestructive: false,
    onConfirm: null
  });

  // Order & Cart State
  const [orderType, setOrderType] = useState('dine-in'); // 'dine-in' | 'takeout'
  const [tableOrCustomer, setTableOrCustomer] = useState('');
  const [ticketCounter, setTicketCounter] = useState(1001);
  const [cart, setCart] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [tipPercent, setTipPercent] = useState(0);
  const [heldOrders, setHeldOrders] = useState([]);

  // Modals State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [activeOrderReceipt, setActiveOrderReceipt] = useState(null);

  // Initialize DB and fetch next ticket counter on mount
  useEffect(() => {
    db.initDB()
      .then(async () => {
        const all = await db.getAllOrders();
        if (all && all.length > 0) {
          const maxTicket = Math.max(...all.map((o) => Number(o.ticketNumber) || 1000));
          setTicketCounter(maxTicket + 1);
        }
      })
      .catch((err) => console.warn('IndexedDB Init:', err));
  }, []);

  // Listeners for global In-App Toasts and Confirmations
  useEffect(() => {
    function handleToastEvent(e) {
      if (e.detail) {
        setToast(e.detail);
      }
    }

    function handleConfirmEvent(e) {
      if (e.detail) {
        setConfirmModal({
          isOpen: true,
          title: e.detail.title || 'Confirmación',
          message: e.detail.message || '',
          confirmText: e.detail.confirmText || 'Aceptar',
          cancelText: e.detail.cancelText || 'Cancelar',
          isDestructive: Boolean(e.detail.isDestructive),
          onConfirm: () => {
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
            if (e.detail.onConfirm) {
              e.detail.onConfirm();
            }
          }
        });
      }
    }

    window.addEventListener('taffy:toast', handleToastEvent);
    window.addEventListener('taffy:confirm', handleConfirmEvent);
    return () => {
      window.removeEventListener('taffy:toast', handleToastEvent);
      window.removeEventListener('taffy:confirm', handleConfirmEvent);
    };
  }, []);

  // Save theme to localStorage
  useEffect(() => {
    localStorage.setItem('taffy_theme', theme);
  }, [theme]);

  // Save audio preference
  useEffect(() => {
    localStorage.setItem('taffy_audio', String(audioEnabled));
  }, [audioEnabled]);

  // Flow handlers
  function handleStart() {
    playHapticSound('click', audioEnabled);
    setActiveScreen('employee-id');
  }

  function handleEmployeeIdentified(emp) {
    setCurrentEmployee(emp);
    setActiveScreen('employee-pin');
  }

  function handleLoginSuccess(emp) {
    setCurrentEmployee(emp);
    setActiveScreen('pos');
    setActivePosTab(businessMode === 'restaurant' ? 'tables' : 'order');
  }

  function handleLogout() {
    playHapticSound('click', audioEnabled);
    if (cart.length > 0) {
      showConfirm({
        title: 'Descartar Orden',
        message: 'Tiene una orden activa en el ticket. ¿Desea salir y descartarla?',
        confirmText: 'Salir y Descartar',
        cancelText: 'Continuar Orden',
        isDestructive: true,
        onConfirm: () => {
          setCart([]);
          setTableOrCustomer('');
          setActiveTable(null);
          setActiveScreen('welcome');
        }
      });
      return;
    }
    setCart([]);
    setTableOrCustomer('');
    setActiveTable(null);
    setActiveScreen('welcome');
  }

  // Table Server Operations (Restaurant Mode)
  function handleSelectTable(table) {
    playHapticSound('click', audioEnabled);
    setActiveTable(table);
    setTableOrCustomer(`Mesa ${table.number}`);
    setOrderType('dine-in');
    setCart([]);
    setActivePosTab('order');
  }

  function handleSaveTableOrder(newItems) {
    if (!activeTable) return;
    playHapticSound('click', audioEnabled);

    if (activeTable.currentOrder) {
      appendItemsToTable(activeTable.id, newItems);
    } else {
      openTableOrder(activeTable.id, {
        items: newItems,
        serverId: currentEmployee?.id || '101',
        serverName: currentEmployee?.name || 'Mesero'
      });
    }

    setCart([]);
    showToast(`Comanda enviada a cocina para Mesa ${activeTable.number}`, 'success');
    setActiveTable(null);
    setActivePosTab('tables');
  }

  function handleRequestTableBill() {
    if (!activeTable) return;
    playHapticSound('click', audioEnabled);

    showConfirm({
      title: 'Solicitar Cuenta',
      message: `¿Solicitar cuenta y cerrar la Mesa ${activeTable.number} para cobro en Caja?`,
      confirmText: 'Solicitar Cuenta',
      cancelText: 'Cancelar',
      onConfirm: () => {
        requestTableBill(activeTable.id);
        setCart([]);
        setActiveTable(null);
        setActivePosTab('tables');
        showToast(`Cuenta solicitada para Mesa ${activeTable.number}. Lista para cobro en Caja.`, 'success');
      }
    });
  }

  function handleBackToTables() {
    playHapticSound('click', audioEnabled);
    if (cart.length > 0) {
      showConfirm({
        title: 'Productos sin Enviar',
        message: 'Hay productos sin enviar a cocina. ¿Deseas descartarlos y volver a las mesas?',
        confirmText: 'Descartar y Volver',
        cancelText: 'Permanecer en Comanda',
        isDestructive: true,
        onConfirm: () => {
          setCart([]);
          setActiveTable(null);
          setActivePosTab('tables');
        }
      });
      return;
    }
    setCart([]);
    setActiveTable(null);
    setActivePosTab('tables');
  }

  // Hold current order
  function handleHoldOrder() {
    if (cart.length === 0) return;
    playHapticSound('click', audioEnabled);

    const heldItem = {
      ticketNumber: ticketCounter,
      orderType,
      tableOrCustomer,
      cart: [...cart],
      discountPercent,
      tipPercent,
      heldAt: new Date().toISOString()
    };

    setHeldOrders((prev) => [...prev, heldItem]);
    setCart([]);
    setTableOrCustomer('');
    setDiscountPercent(0);
    setTipPercent(0);
    setTicketCounter((prev) => prev + 1);
    showToast(`Orden #${heldItem.ticketNumber} colocada en espera.`, 'info');
  }

  function handleRestoreHeldOrder(index) {
    playHapticSound('click', audioEnabled);
    const target = heldOrders[index];
    if (!target) return;

    if (cart.length > 0) {
      showConfirm({
        title: 'Reemplazar Orden',
        message: 'La orden actual se reemplazará por la orden en espera. ¿Continuar?',
        confirmText: 'Reemplazar',
        cancelText: 'Cancelar',
        onConfirm: () => {
          setOrderType(target.orderType);
          setTableOrCustomer(target.tableOrCustomer);
          setCart(target.cart);
          setDiscountPercent(target.discountPercent || 0);
          setTipPercent(target.tipPercent || 0);
          setHeldOrders((prev) => prev.filter((_, i) => i !== index));
        }
      });
      return;
    }

    setOrderType(target.orderType);
    setTableOrCustomer(target.tableOrCustomer);
    setCart(target.cart);
    setDiscountPercent(target.discountPercent || 0);
    setTipPercent(target.tipPercent || 0);
    setHeldOrders((prev) => prev.filter((_, i) => i !== index));
  }

  // Note Modal
  function handleEditItemNote(index) {
    setEditingItemIndex(index);
    setIsNoteOpen(true);
  }

  function handleSaveItemNote(note) {
    if (editingItemIndex !== null && editingItemIndex >= 0) {
      setCart((prevCart) =>
        prevCart.map((item, idx) =>
          idx === editingItemIndex ? { ...item, note } : item
        )
      );
    }
  }

  // Calculate order totals
  function getOrderTotals() {
    const rawSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const discountAmount = rawSubtotal * (discountPercent / 100);
    const subtotalAfterDiscount = Math.max(0, rawSubtotal - discountAmount);
    const taxAmount = subtotalAfterDiscount * 0.16;
    const tipAmount = subtotalAfterDiscount * (tipPercent / 100);
    const finalTotal = subtotalAfterDiscount + taxAmount + tipAmount;

    return {
      subtotal: rawSubtotal,
      discountAmount,
      tax: taxAmount,
      tipAmount,
      total: finalTotal
    };
  }

  // Payment Confirmation
  async function handleConfirmPayment({ method, cashReceived, changeDue }) {
    const { subtotal, discountAmount, tax, tipAmount, total } = getOrderTotals();

    const orderRecord = {
      ticketNumber: ticketCounter,
      orderType,
      tableOrCustomer: tableOrCustomer.trim() || (orderType === 'dine-in' ? 'Mostrador' : 'Para Llevar'),
      cashierId: currentEmployee?.id || '101',
      cashierName: currentEmployee?.name || 'Cajero',
      items: [...cart],
      itemCount: cart.reduce((sum, item) => sum + item.qty, 0),
      subtotal,
      discountPercent,
      discountAmount,
      tax,
      tipPercent,
      tipAmount,
      total,
      paymentMethod: method,
      cashReceived,
      changeDue,
      timestamp: new Date().toISOString()
    };

    try {
      await db.saveOrder(orderRecord);
    } catch (err) {
      console.warn('Error guardando orden en IndexedDB:', err);
    }

    setIsCheckoutOpen(false);
    setActiveOrderReceipt(orderRecord);
    setIsReceiptOpen(true);
  }

  function handleStartNewOrder() {
    setIsReceiptOpen(false);
    setCart([]);
    setTableOrCustomer('');
    setDiscountPercent(0);
    setTipPercent(0);
    setTicketCounter((prev) => prev + 1);
  }

  function handleReprintOrder(order) {
    setActiveOrderReceipt(order);
    setIsReceiptOpen(true);
  }

  const currentTotals = getOrderTotals();

  return (
    <div id="app-viewport">
      {/* PANTALLA 1: BIENVENIDA */}
      {activeScreen === 'welcome' && (
        <WelcomeScreen
          onStart={handleStart}
          onOpenMenu={() => setIsMenuOpen(true)}
          theme={theme}
        />
      )}

      {/* PANTALLA 2: NÚMERO DE EMPLEADO */}
      {activeScreen === 'employee-id' && (
        <EmployeeIdScreen
          onBack={() => setActiveScreen('welcome')}
          onEmployeeIdentified={handleEmployeeIdentified}
          audioEnabled={audioEnabled}
        />
      )}

      {/* PANTALLA 3: PIN DEL EMPLEADO */}
      {activeScreen === 'employee-pin' && (
        <EmployeePinScreen
          employee={currentEmployee}
          onBack={() => setActiveScreen('employee-id')}
          onLoginSuccess={handleLoginSuccess}
          audioEnabled={audioEnabled}
        />
      )}

      {/* PANTALLA 4: PUNTO DE VENTA (POS) */}
      {activeScreen === 'pos' && (
        <section id="screen-pos" className="screen-view active" aria-label="Punto de Venta Principal">
          <PosHeader
            activeTab={activePosTab}
            onTabChange={(tab) => {
              playHapticSound('click', audioEnabled);
              if (tab === 'tables') setActiveTable(null);
              setActivePosTab(tab);
            }}
            employee={currentEmployee}
            onLogout={handleLogout}
            audioEnabled={audioEnabled}
            onOpenSettings={() => setIsMenuOpen(true)}
            businessMode={businessMode}
            activeTable={activeTable}
          />

          {/* VISTA 1: SALÓN DE MESAS (MODO RESTAURANTE) */}
          {activePosTab === 'tables' && (
            <TablesWorkspace
              onSelectTable={handleSelectTable}
            />
          )}

          {/* VISTA 2: TOMA DE ÓRDENES Y COMANDAS */}
          {activePosTab === 'order' && (
            <OrderingWorkspace
              orderType={orderType}
              setOrderType={setOrderType}
              tableOrCustomer={tableOrCustomer}
              setTableOrCustomer={setTableOrCustomer}
              ticketCounter={ticketCounter}
              cart={cart}
              setCart={setCart}
              discountPercent={discountPercent}
              setDiscountPercent={setDiscountPercent}
              tipPercent={tipPercent}
              setTipPercent={setTipPercent}
              onOpenCheckout={() => setIsCheckoutOpen(true)}
              onHoldOrder={handleHoldOrder}
              heldOrders={heldOrders}
              onRestoreHeldOrder={handleRestoreHeldOrder}
              onEditItemNote={handleEditItemNote}
              audioEnabled={audioEnabled}
              activeTable={activeTable}
              onSaveTableOrder={handleSaveTableOrder}
              onRequestTableBill={handleRequestTableBill}
              onBackToTables={handleBackToTables}
            />
          )}

          {/* VISTA 3: DASHBOARD INTEGRAL DE ADMINISTRACIÓN (SOLO GERENCIA) */}
          {activePosTab === 'admin-dashboard' && (
            <AdminDashboardWorkspace
              currentEmployee={currentEmployee}
              onBack={() => setActivePosTab(businessMode === 'restaurant' ? 'tables' : 'order')}
              businessMode={businessMode}
              onReprintOrder={handleReprintOrder}
            />
          )}

          {/* VISTAS LEGACY PARA COMPATIBILIDAD DIRECTA */}
          {activePosTab === 'history' && (
            <HistoryWorkspace
              onReprintOrder={handleReprintOrder}
            />
          )}

          {activePosTab === 'shift' && (
            <ShiftWorkspace
              cashierName={currentEmployee?.name}
            />
          )}

          {activePosTab === 'menu-admin' && (
            <MenuManagementWorkspace />
          )}

          {activePosTab === 'users-admin' && (
            <UserManagementWorkspace
              currentEmployee={currentEmployee}
            />
          )}
        </section>
      )}

      {/* MODAL COBRO */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        totalAmount={currentTotals.total}
        onConfirmPayment={handleConfirmPayment}
        audioEnabled={audioEnabled}
      />

      {/* MODAL TICKET / RECIBO TÉRMICO */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        order={activeOrderReceipt}
        onStartNewOrder={handleStartNewOrder}
      />

      {/* MODAL NOTAS DE COCINA */}
      <NoteModal
        isOpen={isNoteOpen}
        onClose={() => setIsNoteOpen(false)}
        initialNote={editingItemIndex !== null ? cart[editingItemIndex]?.note : ''}
        onSaveNote={handleSaveItemNote}
      />

      {/* MODAL MENÚ / CONFIGURACIÓN DEL SISTEMA */}
      <MenuModal
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        theme={theme}
        setTheme={setTheme}
        audioEnabled={audioEnabled}
        setAudioEnabled={setAudioEnabled}
        businessMode={businessMode}
        setBusinessMode={(mode) => {
          setBusinessMode(mode);
          localStorage.setItem('taffy_business_mode', mode);
          setActiveTable(null);
          if (mode === 'restaurant') {
            setActivePosTab('tables');
          } else {
            setActivePosTab('order');
          }
        }}
      />

      {/* MODAL AUTORIZACIÓN GERENCIAL */}
      <AdminAuthModal
        isOpen={Boolean(adminAuthPendingTab)}
        onClose={() => setAdminAuthPendingTab(null)}
        onSuccess={(admin) => {
          if (adminAuthPendingTab) {
            setActivePosTab(adminAuthPendingTab);
            setAdminAuthPendingTab(null);
          }
        }}
        targetTitle={adminAuthPendingTab === 'history' ? 'Historial de pedidos' : 'Corte de turno'}
        audioEnabled={audioEnabled}
      />

      {/* NOTIFICACIONES TOAST IN-APP */}
      <ToastNotification
        toast={toast}
        onDismiss={() => setToast(null)}
      />

      {/* MODAL DE CONFIRMACIÓN IN-APP TOUCH */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        isDestructive={confirmModal.isDestructive}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
