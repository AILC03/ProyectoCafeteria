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
import AdminDashboardWorkspace from './components/AdminDashboardWorkspace.jsx';
import CheckoutModal from './components/CheckoutModal.jsx';
import ReceiptModal from './components/ReceiptModal.jsx';
import MenuModal from './components/MenuModal.jsx';
import AdminAuthModal from './components/AdminAuthModal.jsx';
import ToastNotification from './components/ToastNotification.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import ScanQrModal from './components/ScanQrModal.jsx';
import KitchenWorkspace from './components/KitchenWorkspace.jsx';

import * as db from './data/db.js';
import { isEmployeeAdmin, isEmployeeCashier, isEmployeeKitchen, isEmployeeGerente } from './data/employees.js';
import { playHapticSound } from './utils/audio.js';
import { showToast, showConfirm } from './utils/notify.js';
import { createCashierOrder, chargeCashOrder, issueTicketAccess } from './api/cash.js';
import { logoutStaff } from './api/auth.js';
import { numberToCents, centsToNumber } from './utils/money.js';
import { DEFAULT_TEST_EMPLOYEES } from './utils/tenant.js';

export default function App() {
  // Estado de Cuenta / Terminal
  const [account, setAccount] = useState(() => {
    try {
      const saved = localStorage.getItem('coffees_pos_account');
      if (saved) return JSON.parse(saved);
      return { businessName: "Coffee's POS", terminalName: 'Caja Principal' };
    } catch {
      return { businessName: "Coffee's POS", terminalName: 'Caja Principal' };
    }
  });

  // Employee Authentication State
  const [currentEmployee, setCurrentEmployee] = useState(null);

  // Navigation State - Pantalla de Origen del Link: Siempre Bienvenida (WelcomeScreen)
  const [activeScreen, setActiveScreen] = useState('welcome');
  const [activePosTab, setActivePosTab] = useState('order');
  const [adminAuthPendingTab, setAdminAuthPendingTab] = useState(null);

  // Preference Settings
  const [theme, setTheme] = useState(() => localStorage.getItem('coffees_theme') || 'theme-nordic');
  const [audioEnabled, setAudioEnabled] = useState(() => localStorage.getItem('coffees_audio') !== 'false');

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
  const [heldOrders, setHeldOrders] = useState([]);

  // Modals State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScanQrOpen, setIsScanQrOpen] = useState(false);
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

    window.addEventListener('coffees:toast', handleToastEvent);
    window.addEventListener('taffy:toast', handleToastEvent);
    window.addEventListener('coffees:confirm', handleConfirmEvent);
    window.addEventListener('taffy:confirm', handleConfirmEvent);
    return () => {
      window.removeEventListener('coffees:toast', handleToastEvent);
      window.removeEventListener('taffy:toast', handleToastEvent);
      window.removeEventListener('coffees:confirm', handleConfirmEvent);
      window.removeEventListener('taffy:confirm', handleConfirmEvent);
    };
  }, []);

  // Save theme to localStorage
  useEffect(() => {
    localStorage.setItem('coffees_theme', theme);
    localStorage.setItem('taffy_theme', theme);
  }, [theme]);

  // Save audio preference
  useEffect(() => {
    localStorage.setItem('coffees_audio', String(audioEnabled));
    localStorage.setItem('taffy_audio', String(audioEnabled));
  }, [audioEnabled]);

  // Protección de acceso y redirección automática según rol
  useEffect(() => {
    if (!currentEmployee) return;

    if (isEmployeeKitchen(currentEmployee)) {
      if (activePosTab !== 'kitchen') {
        setActivePosTab('kitchen');
      }
    } else if (isEmployeeGerente(currentEmployee)) {
      // Es Gerente: solo puede acceder a vistas de supervisión directa (Historial y Corte de Caja)
      const allowedGerenteTabs = ['history', 'shift'];
      if (!allowedGerenteTabs.includes(activePosTab)) {
        setActivePosTab('history');
      }
    } else if (isEmployeeAdmin(currentEmployee)) {
      // Es Administrador: las herramientas de gestión interna (menú, personal, historial, corte) se consultan dentro de 'admin-dashboard'
      const adminInternalTabs = ['menu-admin', 'users-admin', 'history', 'shift'];
      if (adminInternalTabs.includes(activePosTab)) {
        setActivePosTab('admin-dashboard');
      }
    } else if (!isEmployeeAdmin(currentEmployee)) {
      // Es Cajero: bloquear acceso a vistas exclusivas de administrador
      const adminOnlyTabs = ['admin-dashboard', 'menu-admin', 'users-admin'];
      if (adminOnlyTabs.includes(activePosTab)) {
        setActivePosTab('order');
      }
    }
  }, [currentEmployee, activePosTab]);

  // Account Onboarding handlers
  function handleAccountConfigured(accountData) {
    try {
      localStorage.removeItem('coffees_unlinked_manual');
      localStorage.removeItem('taffy_unlinked_manual');
    } catch {}
    setAccount(accountData);
    localStorage.setItem('coffees_pos_account', JSON.stringify(accountData));
    localStorage.setItem('taffy_account', JSON.stringify(accountData));
    setActiveScreen('welcome');
    showToast(`Terminal vinculada con éxito a ${accountData.businessName || 'tu cafetería'}`, 'success');
  }

  function handleUnlinkAccount() {
    showConfirm({
      title: 'Desvincular Terminal',
      message: '¿Estás seguro de que deseas cerrar la sesión de esta terminal y desvincularla de la cuenta?',
      confirmText: 'Desvincular',
      cancelText: 'Cancelar',
      isDestructive: true,
      onConfirm: () => {
        try {
          localStorage.setItem('coffees_unlinked_manual', 'true');
          localStorage.setItem('taffy_unlinked_manual', 'true');
        } catch {}
        const oldTenant = account?.tenantId || (account?.email ? account.email.toLowerCase().trim() : null);
        if (oldTenant) {
          localStorage.removeItem(`coffees_employees_${oldTenant}`);
          localStorage.removeItem(`taffy_employees_${oldTenant}`);
          localStorage.removeItem(`coffees_menu_products_${oldTenant}`);
          localStorage.removeItem(`taffy_menu_products_${oldTenant}`);
          localStorage.removeItem(`coffees_orders_backup_${oldTenant}`);
          localStorage.removeItem(`taffy_orders_backup_${oldTenant}`);
        }
        localStorage.removeItem('coffees_employees_local');
        localStorage.removeItem('taffy_employees_v1');
        localStorage.removeItem('coffees_menu_products_local');
        localStorage.removeItem('taffy_menu_products_v1');
        localStorage.removeItem('coffees_orders_local');
        localStorage.removeItem('taffy_orders_backup');
        localStorage.removeItem('coffees_pos_account');
        localStorage.removeItem('taffy_account');
        localStorage.removeItem('coffees_current_employee');
        localStorage.removeItem('taffy_current_employee');
        setAccount(null);
        setCurrentEmployee(null);
        setCart([]);
        setTableOrCustomer('');
        setActiveScreen('setup');
        setIsMenuOpen(false);
        showToast('Terminal desvinculada del negocio.', 'info');
      }
    });
  }

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
    localStorage.setItem('coffees_current_employee', JSON.stringify(emp));
    localStorage.setItem('taffy_current_employee', JSON.stringify(emp));
    setActiveScreen('pos');
    if (isEmployeeKitchen(emp)) {
      setActivePosTab('kitchen');
    } else if (isEmployeeGerente(emp)) {
      setActivePosTab('history');
    } else {
      setActivePosTab('order');
    }
  }

  function handleTabChange(targetTab) {
    if (isEmployeeKitchen(currentEmployee)) {
      if (targetTab !== 'kitchen') {
        showToast('Acceso exclusivo a pantalla de Cocina / Barista.', 'warning');
        return;
      }
    } else if (isEmployeeGerente(currentEmployee)) {
      const allowedGerenteTabs = ['history', 'shift'];
      if (!allowedGerenteTabs.includes(targetTab)) {
        if (targetTab === 'kitchen') {
          showToast('Acceso restringido: El perfil de Gerente no tiene acceso a Cocina / Barista.', 'warning');
        } else if (targetTab === 'order') {
          showToast('Acceso restringido: El perfil de Gerente es de supervisión y no realiza cobros en caja.', 'warning');
        } else {
          showToast('Acceso restringido: El perfil de Gerente no tiene acceso a esta sección.', 'warning');
        }
        return;
      }
    } else if (!isEmployeeAdmin(currentEmployee)) {
      const adminOnlyTabs = ['admin-dashboard', 'menu-admin', 'users-admin'];
      if (adminOnlyTabs.includes(targetTab)) {
        showToast('Acceso restringido: Se requieren permisos de Administrador.', 'warning');
        return;
      }
    }
    playHapticSound('click', audioEnabled);
    setActivePosTab(targetTab);
  }

  function handleLogout() {
    playHapticSound('click', audioEnabled);

    function doLogout() {
      logoutStaff().catch(() => {});
      localStorage.removeItem('coffees_current_employee');
      localStorage.removeItem('taffy_current_employee');
      setCurrentEmployee(null);
      setCart([]);
      setTableOrCustomer('');
      setActiveScreen('welcome');
      setIsMenuOpen(false);
      showToast('Sesión de empleado cerrada.', 'info');
    }

    if (cart.length > 0) {
      showConfirm({
        title: 'Descartar Orden',
        message: 'Tiene una orden activa en el ticket. ¿Desea salir y descartarla?',
        confirmText: 'Salir y Descartar',
        cancelText: 'Continuar Orden',
        isDestructive: true,
        onConfirm: doLogout
      });
      return;
    }
    doLogout();
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

  // Calculate order totals
  function getOrderTotals() {
    const rawSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const taxAmount = rawSubtotal * 0.16;
    const finalTotal = rawSubtotal + taxAmount;

    return {
      subtotal: rawSubtotal,
      tax: taxAmount,
      total: finalTotal
    };
  }

  // Payment Confirmation
  async function handleConfirmPayment({ method, cashReceived, changeDue }) {
    const { subtotal, tax, total } = getOrderTotals();

    let backendFolio = null;
    let backendSaleId = null;
    let registrationToken = null;

    try {
      if (method === 'cash') {
        const orderItems = cart.map((item) => ({
          productId: item.id.toString(),
          quantity: item.qty,
          optionValueIds: [],
        }));

        const cashierOrderRes = await createCashierOrder({
          items: orderItems,
          guestName: tableOrCustomer.trim() || (orderType === 'dine-in' ? 'Mostrador' : 'Para Llevar'),
        });

        if (cashierOrderRes && cashierOrderRes.data) {
          const backendOrder = cashierOrderRes.data;
          backendFolio = backendOrder.folio;

          // Cobrar con cargo a sesión de caja en backend
          const paymentRes = await chargeCashOrder(
            backendOrder.id,
            numberToCents(cashReceived)
          );
          backendSaleId = paymentRes?.sale?.id || paymentRes?.saleId;
          changeDue = centsToNumber(paymentRes?.payment?.changeCents || paymentRes?.changeCents || '0');

          if (backendSaleId) {
            try {
              const ticketRes = await issueTicketAccess(backendSaleId);
              if (ticketRes?.token) {
                registrationToken = ticketRes.token;
              }
            } catch (ticketErr) {
              console.warn('Aviso emisión ticket registration token:', ticketErr);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Aviso cobro backend:', err);
      if (err.message) {
        showToast(err.message, 'warning');
      }
    }

    const orderRecord = {
      ticketNumber: backendFolio || ticketCounter,
      folio: backendFolio,
      saleId: backendSaleId,
      registrationToken,
      orderType,
      tableOrCustomer: tableOrCustomer.trim() || (orderType === 'dine-in' ? 'Mostrador' : 'Para Llevar'),
      cashierId: currentEmployee?.id || '101',
      cashierName: currentEmployee?.name || 'Cajero',
      items: [...cart],
      itemCount: cart.reduce((sum, item) => sum + item.qty, 0),
      subtotal,
      tax,
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

  function handleOrderPaidFromQr(orderRecord) {
    setActiveOrderReceipt(orderRecord);
    setIsReceiptOpen(true);
  }

  function handleStartNewOrder() {
    setIsReceiptOpen(false);
    setCart([]);
    setTableOrCustomer('');
    setTicketCounter((prev) => prev + 1);
  }

  function handleReprintOrder(order) {
    setActiveOrderReceipt(order);
    setIsReceiptOpen(true);
  }

  async function handleReprintLastOrder() {
    if (activeOrderReceipt) {
      setIsReceiptOpen(true);
      return;
    }
    try {
      const orders = await db.getAllOrders();
      if (orders && orders.length > 0) {
        const sorted = [...orders].sort(
          (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
        );
        setActiveOrderReceipt(sorted[0]);
        setIsReceiptOpen(true);
      } else {
        showToast('No hay tickets registrados aún para reimprimir', 'info');
      }
    } catch (err) {
      showToast('No hay tickets disponibles para reimprimir', 'info');
    }
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
          businessName={account?.businessName}
        />
      )}

      {/* PANTALLA 2: USUARIO DE ACCESO (USERNAME) */}
      {activeScreen === 'employee-id' && (
        <EmployeeIdScreen
          onBack={() => setActiveScreen('welcome')}
          onEmployeeIdentified={handleEmployeeIdentified}
          audioEnabled={audioEnabled}
        />
      )}

      {/* PANTALLA 3: CONTRASEÑA DEL EMPLEADO */}
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
          {activePosTab !== 'admin-dashboard' && (
            <PosHeader
              activeTab={activePosTab}
              onTabChange={handleTabChange}
              employee={currentEmployee}
              onLogout={handleLogout}
              audioEnabled={audioEnabled}
              onOpenSettings={() => {
                if (isEmployeeGerente(currentEmployee)) {
                  showToast('Acceso restringido: El perfil de Gerente no tiene acceso a ajustes del sistema.', 'warning');
                  return;
                }
                setIsMenuOpen(true);
              }}
              onReprintLastTicket={handleReprintLastOrder}
              businessName={account?.businessName}
            />
          )}

          {/* VISTA: TOMA DE ÓRDENES Y COBRO RÁPIDO */}
          {activePosTab === 'order' && !isEmployeeKitchen(currentEmployee) && !isEmployeeGerente(currentEmployee) && (
            <OrderingWorkspace
              orderType={orderType}
              setOrderType={setOrderType}
              tableOrCustomer={tableOrCustomer}
              setTableOrCustomer={setTableOrCustomer}
              ticketCounter={ticketCounter}
              cart={cart}
              setCart={setCart}
              onOpenCheckout={() => setIsCheckoutOpen(true)}
              onOpenScanQr={() => setIsScanQrOpen(true)}
              onHoldOrder={handleHoldOrder}
              heldOrders={heldOrders}
              onRestoreHeldOrder={handleRestoreHeldOrder}
              audioEnabled={audioEnabled}
            />
          )}

          {/* VISTA: DASHBOARD INTEGRAL DE ADMINISTRACIÓN */}
          {activePosTab === 'admin-dashboard' && isEmployeeAdmin(currentEmployee) && (
            <AdminDashboardWorkspace
              currentEmployee={currentEmployee}
              account={account}
              onBack={() => handleTabChange('order')}
              onReprintOrder={handleReprintOrder}
              onLogout={handleLogout}
              onUnlinkAccount={handleUnlinkAccount}
            />
          )}

          {/* VISTA: HISTORIAL DE PEDIDOS */}
          {activePosTab === 'history' && !isEmployeeKitchen(currentEmployee) && (
            <HistoryWorkspace
              onReprintOrder={handleReprintOrder}
            />
          )}

          {/* VISTA: CORTE DE CAJA */}
          {activePosTab === 'shift' && !isEmployeeKitchen(currentEmployee) && (
            <ShiftWorkspace
              cashierName={currentEmployee?.name}
              currentEmployee={currentEmployee}
            />
          )}

          {/* VISTA: COCINA / BARISTA (KDS) */}
          {activePosTab === 'kitchen' && !isEmployeeGerente(currentEmployee) && (
            <KitchenWorkspace
              audioEnabled={audioEnabled}
            />
          )}

          {/* VISTA: EDICIÓN DE MENÚ (SOLO ADMIN) */}
          {activePosTab === 'menu-admin' && isEmployeeAdmin(currentEmployee) && (
            <MenuManagementWorkspace
              currentEmployee={currentEmployee}
            />
          )}

          {/* VISTA: ADMINISTRACIÓN DE PERSONAL (SOLO ADMIN) */}
          {activePosTab === 'users-admin' && isEmployeeAdmin(currentEmployee) && (
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

      {/* MODAL COBRO QR CLIENTE MÓVIL */}
      <ScanQrModal
        isOpen={isScanQrOpen}
        onClose={() => setIsScanQrOpen(false)}
        onOrderPaid={handleOrderPaidFromQr}
        audioEnabled={audioEnabled}
      />

      {/* MODAL MENÚ / CONFIGURACIÓN DEL SISTEMA */}
      <MenuModal
        isOpen={isMenuOpen && !isEmployeeGerente(currentEmployee)}
        onClose={() => setIsMenuOpen(false)}
        theme={theme}
        setTheme={setTheme}
        audioEnabled={audioEnabled}
        setAudioEnabled={setAudioEnabled}
        account={account}
        onUnlinkAccount={handleUnlinkAccount}
        currentEmployee={currentEmployee}
        onReprintOrder={handleReprintOrder}
        onReprintLastTicket={handleReprintLastOrder}
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
