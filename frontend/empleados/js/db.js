
const DB_NAME = 'CoffeesPosDatabase';
const DB_VERSION = 1;
const STORE_ORDERS = 'orders';

let dbInstance = null;

// Inicializar IndexedDB
export function initDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('IndexedDB no soportado, utilizando localStorage como respaldo');
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Error al abrir IndexedDB:', event.target.error);
      resolve(null); // Seguir con fallback
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      console.log('✅ Base de datos IndexedDB Coffee´s Pos inicializada correctamente');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_ORDERS)) {
        const store = db.createObjectStore(STORE_ORDERS, { keyPath: 'id' });
        store.createIndex('ticketNumber', 'ticketNumber', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('employeeId', 'employeeId', { unique: false });
        store.createIndex('orderType', 'orderType', { unique: false });
      }
    };
  });
}

// Guardar o actualizar un pedido completo
export function saveOrder(order) {
  return new Promise(async (resolve, reject) => {
    // Asegurar estructura del pedido
    const cleanOrder = {
      id: order.id || `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      ticketNumber: order.ticketNumber || 1000,
      createdAt: order.createdAt || new Date().toISOString(),
      employeeId: order.employeeId || '101',
      employeeName: order.employeeName || 'Empleado',
      orderType: order.orderType || 'dine-in', // 'dine-in' (Comer aquí) | 'takeout' (Para llevar)
      tableOrCustomer: order.tableOrCustomer || '',
      items: order.items || [],
      subtotal: Number(order.subtotal || 0),
      discount: Number(order.discount || 0),
      discountPercent: Number(order.discountPercent || 0),
      tax: Number(order.tax || 0),
      tip: Number(order.tip || 0),
      total: Number(order.total || 0),
      paymentMethod: order.paymentMethod || 'cash', // 'cash' | 'card' | 'pending'
      amountPaid: Number(order.amountPaid || order.total || 0),
      change: Number(order.change || 0),
      status: order.status || 'completed', // 'completed' (Cobrado) | 'pending' (En espera / En mesa) | 'cancelled'
      notes: order.notes || ''
    };

    if (dbInstance) {
      try {
        const tx = dbInstance.transaction([STORE_ORDERS], 'readwrite');
        const store = tx.objectStore(STORE_ORDERS);
        const req = store.put(cleanOrder);

        req.onsuccess = () => {
          // También respaldar en localStorage para doble seguridad
          backupToLocalStorage(cleanOrder);
          resolve(cleanOrder);
        };
        req.onerror = (e) => {
          backupToLocalStorage(cleanOrder);
          resolve(cleanOrder);
        };
        return;
      } catch (err) {
        console.warn('Fallback a localStorage por excepción en IndexedDB:', err);
      }
    }

    backupToLocalStorage(cleanOrder);
    resolve(cleanOrder);
  });
}

// Obtener todos los pedidos ordenados de más reciente a más antiguo
export function getAllOrders() {
  return new Promise((resolve) => {
    if (dbInstance) {
      try {
        const tx = dbInstance.transaction([STORE_ORDERS], 'readonly');
        const store = tx.objectStore(STORE_ORDERS);
        const req = store.getAll();

        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          resolve(list);
        };
        req.onerror = () => {
          resolve(getOrdersFromLocalStorage());
        };
        return;
      } catch (err) {
        resolve(getOrdersFromLocalStorage());
        return;
      }
    }
    resolve(getOrdersFromLocalStorage());
  });
}

// Actualizar estatus de un pedido (por ejemplo, de "En espera" a "Completado")
export async function updateOrderStatus(orderId, newStatus) {
  const orders = await getAllOrders();
  const order = orders.find(o => o.id === orderId);
  if (order) {
    order.status = newStatus;
    if (newStatus === 'completed' && !order.completedAt) {
      order.completedAt = new Date().toISOString();
    }
    return await saveOrder(order);
  }
  return null;
}

// Eliminar o anular un pedido
export function deleteOrder(orderId) {
  return new Promise((resolve) => {
    if (dbInstance) {
      try {
        const tx = dbInstance.transaction([STORE_ORDERS], 'readwrite');
        const store = tx.objectStore(STORE_ORDERS);
        store.delete(orderId);
      } catch (e) {}
    }
    let local = getOrdersFromLocalStorage();
    local = local.filter(o => o.id !== orderId);
    localStorage.setItem('coffees_orders_backup', JSON.stringify(local));
    localStorage.setItem('taffy_orders_backup', JSON.stringify(local));
    resolve(true);
  });
}

// Resumen del corte de caja diario (Ventas, efectivo, tarjeta, tickets)
export async function getDailySummary() {
  const orders = await getAllOrders();
  const today = new Date().toISOString().split('T')[0];

  const todayOrders = orders.filter(o => {
    const orderDate = (o.createdAt || '').split('T')[0];
    return orderDate === today && o.status !== 'cancelled';
  });

  let totalSales = 0;
  let totalCash = 0;
  let totalCard = 0;
  let totalPending = 0;
  let dineInCount = 0;
  let takeoutCount = 0;

  todayOrders.forEach(o => {
    if (o.status === 'completed') {
      totalSales += o.total;
      if (o.paymentMethod === 'cash') totalCash += o.total;
      else if (o.paymentMethod === 'card') totalCard += o.total;
    } else if (o.status === 'pending') {
      totalPending += o.total;
    }

    if (o.orderType === 'dine-in') dineInCount++;
    else takeoutCount++;
  });

  return {
    date: today,
    ordersCount: todayOrders.length,
    completedCount: todayOrders.filter(o => o.status === 'completed').length,
    pendingCount: todayOrders.filter(o => o.status === 'pending').length,
    totalSales,
    totalCash,
    totalCard,
    totalPending,
    dineInCount,
    takeoutCount,
    avgTicket: todayOrders.length ? (totalSales / (todayOrders.filter(o => o.status === 'completed').length || 1)) : 0
  };
}

// Exportar copia de seguridad en JSON para descarga o sincronización en la nube
export async function exportBackupJSON() {
  const orders = await getAllOrders();
  const backup = {
    app: 'Coffee´s Pos',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    totalOrders: orders.length,
    orders: orders
  };
  return JSON.stringify(backup, null, 2);
}

// Importar copia de seguridad desde un archivo JSON
export async function importBackupJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (data && Array.isArray(data.orders)) {
      for (const ord of data.orders) {
        await saveOrder(ord);
      }
      return { success: true, count: data.orders.length };
    }
    return { success: false, message: 'Formato de respaldo inválido' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// Funciones auxiliares para localStorage
function backupToLocalStorage(order) {
  try {
    const list = getOrdersFromLocalStorage();
    const index = list.findIndex(o => o.id === order.id);
    if (index >= 0) {
      list[index] = order;
    } else {
      list.unshift(order);
    }
    localStorage.setItem('coffees_orders_backup', JSON.stringify(list));
    localStorage.setItem('taffy_orders_backup', JSON.stringify(list));
  } catch (e) {
    console.warn('Error al guardar en localStorage:', e);
  }
}

function getOrdersFromLocalStorage() {
  try {
    const raw = localStorage.getItem('coffees_orders_backup') || localStorage.getItem('taffy_orders_backup');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
