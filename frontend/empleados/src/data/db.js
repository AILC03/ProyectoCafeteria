// ==========================================================================
// Coffee´s Pos - Capa de Datos de Frontend (Almacenamiento Local en Memoria/LocalStorage)
// Totalmente desacoplada de backend y bases de datos externas
// ==========================================================================

const STORAGE_ORDERS_KEY = 'coffees_orders_local';
const LEGACY_STORAGE_ORDERS_KEY = 'taffy_orders_local';

// Inicialización de la capa de datos local limpia sin órdenes demo
export function initDB() {
  return new Promise((resolve) => {
    try {
      const raw = localStorage.getItem(STORAGE_ORDERS_KEY) || localStorage.getItem(LEGACY_STORAGE_ORDERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Limpieza de órdenes demo antiguas
          const clean = parsed.filter(
            (o) => !String(o.id).startsWith('ord_demo_') && o.cashierName !== 'Cajero Demo'
          );
          if (clean.length !== parsed.length) {
            localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(clean));
            localStorage.setItem(LEGACY_STORAGE_ORDERS_KEY, JSON.stringify(clean));
          }
        }
      }
    } catch (err) {
      console.warn('Almacenamiento local:', err);
    }
    resolve(true);
  });
}

// Obtener todas las órdenes registradas (limpio de demostración)
export async function getAllOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_ORDERS_KEY) || localStorage.getItem(LEGACY_STORAGE_ORDERS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const clean = parsed.filter(
        (o) => !String(o.id).startsWith('ord_demo_') && o.cashierName !== 'Cajero Demo'
      );
      if (clean.length !== parsed.length) {
        localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(clean));
        localStorage.setItem(LEGACY_STORAGE_ORDERS_KEY, JSON.stringify(clean));
      }
      return clean;
    }
    return [];
  } catch {
    return [];
  }
}

// Guardar nueva orden en memoria local
export async function saveOrder(order) {
  const currentOrders = await getAllOrders();
  const normalized = {
    ...order,
    id: order.id || `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    createdAt: order.createdAt || order.timestamp || new Date().toISOString(),
    timestamp: order.timestamp || order.createdAt || new Date().toISOString(),
    status: order.status || 'completed'
  };

  const existingIndex = currentOrders.findIndex((o) => o.id === normalized.id);
  if (existingIndex >= 0) {
    currentOrders[existingIndex] = normalized;
  } else {
    currentOrders.unshift(normalized);
  }

  try {
    localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(currentOrders));
    localStorage.setItem(LEGACY_STORAGE_ORDERS_KEY, JSON.stringify(currentOrders));
  } catch (e) {
    console.warn('Error guardando orden en local:', e);
  }

  window.dispatchEvent(new CustomEvent('coffees:orders_updated', { detail: normalized }));
  window.dispatchEvent(new CustomEvent('taffy:orders_updated', { detail: normalized }));
  return normalized;
}

// Actualizar estatus de una orden
export async function updateOrderStatus(orderId, newStatus) {
  const orders = await getAllOrders();
  const target = orders.find((o) => o.id === orderId);
  if (target) {
    target.status = newStatus;
    if (newStatus === 'completed' && !target.completedAt) {
      target.completedAt = new Date().toISOString();
    }
    return await saveOrder(target);
  }
  return null;
}

// Eliminar orden
export async function deleteOrder(orderId) {
  const orders = await getAllOrders();
  const filtered = orders.filter((o) => o.id !== orderId);
  try {
    localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(filtered));
    localStorage.setItem(LEGACY_STORAGE_ORDERS_KEY, JSON.stringify(filtered));
  } catch {}
  window.dispatchEvent(new CustomEvent('coffees:orders_updated'));
  window.dispatchEvent(new CustomEvent('taffy:orders_updated'));
  return true;
}

// Resumen de corte de caja diario
export async function getDailySummary() {
  const orders = await getAllOrders();
  const today = new Date().toISOString().split('T')[0];

  const todayOrders = orders.filter((o) => {
    const orderDate = (o.createdAt || o.timestamp || '').split('T')[0];
    return orderDate === today && o.status !== 'cancelled';
  });

  let totalSales = 0;
  let totalCash = 0;
  let totalCard = 0;
  let totalTransfer = 0;
  let totalTips = 0;
  let dineInCount = 0;
  let takeoutCount = 0;

  const employeeMap = {};

  todayOrders.forEach((o) => {
    const orderTotal = Number(o.total || 0);
    const orderTip = Number(o.tip ?? o.tipAmount ?? 0);
    totalTips += orderTip;

    if (o.status === 'completed') {
      totalSales += orderTotal;
      if (o.paymentMethod === 'cash') totalCash += orderTotal;
      else if (o.paymentMethod === 'card') totalCard += orderTotal;
      else if (o.paymentMethod === 'transfer') totalTransfer += orderTotal;
      else totalCash += orderTotal;

      const empId = String(o.employeeId || o.cashierId || '1');
      const empName = o.employeeName || o.cashierName || 'Empleado';

      if (!employeeMap[empId]) {
        employeeMap[empId] = {
          id: empId,
          name: empName,
          ordersCount: 0,
          totalSales: 0,
          cashSales: 0,
          cardSales: 0,
          transferSales: 0
        };
      }

      employeeMap[empId].ordersCount += 1;
      employeeMap[empId].totalSales += orderTotal;
      if (o.paymentMethod === 'cash') employeeMap[empId].cashSales += orderTotal;
      else if (o.paymentMethod === 'card') employeeMap[empId].cardSales += orderTotal;
      else if (o.paymentMethod === 'transfer') employeeMap[empId].transferSales += orderTotal;
      else employeeMap[empId].cashSales += orderTotal;
    }

    if (o.orderType === 'dine-in') dineInCount++;
    else takeoutCount++;
  });

  const completedOrders = todayOrders.filter((o) => o.status === 'completed');
  const employeeSalesList = Object.values(employeeMap).map((e) => ({
    ...e,
    averageTicket: e.ordersCount > 0 ? e.totalSales / e.ordersCount : 0
  }));

  employeeSalesList.sort((a, b) => b.totalSales - a.totalSales);

  return {
    date: today,
    ordersCount: todayOrders.length,
    completedCount: completedOrders.length,
    totalSales,
    totalCash,
    totalCard,
    totalTransfer,
    totalTips,
    dineInCount,
    takeoutCount,
    avgTicket: completedOrders.length ? totalSales / completedOrders.length : 0,
    employeeSales: employeeSalesList,
    todayOrders: completedOrders
  };
}

// Exportar respaldo JSON
export async function exportBackupJSON() {
  const orders = await getAllOrders();
  const backup = {
    app: 'Coffee´s Pos Frontend',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    totalOrders: orders.length,
    orders
  };
  return JSON.stringify(backup, null, 2);
}

// Importar respaldo JSON
export async function importBackupJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (data && Array.isArray(data.orders)) {
      for (const ord of data.orders) {
        await saveOrder(ord);
      }
      return { success: true, count: data.orders.length };
    }
    return { success: false, message: 'Formato de archivo inválido' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// Limpiar todas las órdenes locales
export function clearAllOrders() {
  try {
    localStorage.removeItem(STORAGE_ORDERS_KEY);
    localStorage.removeItem(LEGACY_STORAGE_ORDERS_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent('coffees:orders_updated'));
  window.dispatchEvent(new CustomEvent('taffy:orders_updated'));
}
