// Capa de datos para gestión de mesas y comandas en restaurantes
// Sincronización híbrida Supabase Cloud + LocalStorage
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const STORAGE_KEY_TABLES = 'taffy_tables_v1';
let tablesRealtimeSubscribed = false;

// Sincronizar mesas desde Supabase
export async function syncTablesFromSupabase() {
  if (!isSupabaseConfigured()) return;
  try {
    const { data, error } = await supabase
      .from('tables')
      .select('*');

    if (!error && Array.isArray(data) && data.length > 0) {
      const mapped = data.map(t => ({
        id: t.id,
        number: t.number,
        capacity: Number(t.capacity || 4),
        status: t.status || 'available',
        currentOrder: t.current_order || null
      }));
      localStorage.setItem(STORAGE_KEY_TABLES, JSON.stringify(mapped));
      window.dispatchEvent(new CustomEvent('taffy:tables_updated', { detail: mapped }));
      return mapped;
    }
  } catch (err) {
    console.warn('Error sincronizando mesas desde Supabase:', err);
  }
}

// Iniciar Realtime para sincronización instantánea de mesas entre múltiples dispositivos
if (typeof window !== 'undefined' && isSupabaseConfigured() && !tablesRealtimeSubscribed) {
  try {
    supabase
      .channel('public:tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        syncTablesFromSupabase();
      })
      .subscribe();
    tablesRealtimeSubscribed = true;
    syncTablesFromSupabase();
  } catch (e) {
    console.warn('Error al iniciar Realtime para mesas:', e);
  }
}

export const DEFAULT_TABLES = [
  { id: 't1', number: '1', capacity: 4, status: 'available', currentOrder: null },
  { id: 't2', number: '2', capacity: 4, status: 'available', currentOrder: null },
  { id: 't3', number: '3', capacity: 2, status: 'available', currentOrder: null },
  { id: 't4', number: '4', capacity: 6, status: 'available', currentOrder: null },
  { id: 't5', number: '5', capacity: 4, status: 'available', currentOrder: null },
  { id: 't6', number: '6', capacity: 4, status: 'available', currentOrder: null },
  { id: 't7', number: '7', capacity: 2, status: 'available', currentOrder: null },
  { id: 't8', number: '8', capacity: 8, status: 'available', currentOrder: null },
  { id: 't9', number: 'Barra 1', capacity: 1, status: 'available', currentOrder: null },
  { id: 't10', number: 'Barra 2', capacity: 1, status: 'available', currentOrder: null },
  { id: 't11', number: 'Terraza 1', capacity: 4, status: 'available', currentOrder: null },
  { id: 't12', number: 'Terraza 2', capacity: 4, status: 'available', currentOrder: null }
];

// Obtener todas las mesas registradas
export function getTables() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TABLES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_TABLES, JSON.stringify(DEFAULT_TABLES));
      return [...DEFAULT_TABLES];
    }
    const list = JSON.parse(raw);
    if (Array.isArray(list) && list.length > 0) {
      return list;
    }
    localStorage.setItem(STORAGE_KEY_TABLES, JSON.stringify(DEFAULT_TABLES));
    return [...DEFAULT_TABLES];
  } catch (e) {
    return [...DEFAULT_TABLES];
  }
}

// Guardar lista de mesas y emitir evento reactivo (local + Supabase)
export function saveTables(tablesList) {
  try {
    localStorage.setItem(STORAGE_KEY_TABLES, JSON.stringify(tablesList));
    window.dispatchEvent(new CustomEvent('taffy:tables_updated', { detail: tablesList }));

    if (isSupabaseConfigured()) {
      const rows = tablesList.map(t => ({
        id: t.id,
        number: t.number,
        capacity: t.capacity,
        status: t.status,
        current_order: t.currentOrder,
        updated_at: new Date().toISOString()
      }));
      supabase.from('tables').upsert(rows).then(({ error }) => {
        if (error) console.warn('Error sincronizando mesas en Supabase:', error.message);
      }).catch(err => {
        console.warn('Error de red en mesas:', err);
      });
    }
  } catch (e) {
    console.error('Error guardando mesas:', e);
  }
}


// Agregar nueva mesa (solo gerencia)
export function addTable({ number, capacity = 4 }) {
  const cleanNumber = String(number || '').trim();
  if (!cleanNumber) {
    return { success: false, message: 'El número o nombre de la mesa es requerido.' };
  }

  const list = getTables();
  const exists = list.some(t => String(t.number).toLowerCase().trim() === cleanNumber.toLowerCase());
  if (exists) {
    return { success: false, message: `La mesa "${cleanNumber}" ya existe.` };
  }

  const newTable = {
    id: `table_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    number: cleanNumber,
    capacity: Number(capacity) || 4,
    status: 'available',
    currentOrder: null
  };

  list.push(newTable);
  saveTables(list);
  return { success: true, table: newTable };
}

// Editar número o capacidad de una mesa existente (solo gerencia)
export function updateTable(id, fields) {
  const list = getTables();
  const index = list.findIndex(t => String(t.id) === String(id));
  if (index === -1) {
    return { success: false, message: 'Mesa no encontrada.' };
  }

  const cleanNumber = fields.number !== undefined ? String(fields.number).trim() : list[index].number;
  if (!cleanNumber) {
    return { success: false, message: 'El número de mesa no puede estar vacío.' };
  }

  const exists = list.some(t => String(t.id) !== String(id) && String(t.number).toLowerCase().trim() === cleanNumber.toLowerCase());
  if (exists) {
    return { success: false, message: `Ya existe otra mesa con el identificador "${cleanNumber}".` };
  }

  list[index] = {
    ...list[index],
    number: cleanNumber,
    capacity: fields.capacity !== undefined ? Number(fields.capacity) : list[index].capacity
  };

  saveTables(list);
  return { success: true, table: list[index] };
}

// Eliminar mesa (solo gerencia)
export function deleteTable(id) {
  const list = getTables();
  const target = list.find(t => String(t.id) === String(id));
  if (!target) {
    return { success: false, message: 'Mesa no encontrada.' };
  }

  if (target.status === 'occupied' || target.status === 'bill_requested') {
    return { success: false, message: 'No se puede eliminar una mesa que tiene una orden activa.' };
  }

  const filtered = list.filter(t => String(t.id) !== String(id));
  saveTables(filtered);

  if (isSupabaseConfigured()) {
    try {
      supabase.from('tables').delete().eq('id', id).then(({ error }) => {
        if (error) console.warn('Error al eliminar mesa en Supabase:', error.message);
      });
    } catch (e) {
      console.warn('Error de red al eliminar mesa:', e);
    }
  }

  return { success: true };
}

// Calcular total de una comanda
function calculateOrderTotal(items) {
  return items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 1)), 0);
}

// Abrir comanda en mesa (mesero pide primer orden)
export function openTableOrder(tableId, { items, serverId = '101', serverName = 'Mesero', notes = '' }) {
  const list = getTables();
  const index = list.findIndex(t => String(t.id) === String(tableId));
  if (index === -1) return { success: false, message: 'Mesa no encontrada.' };

  const table = list[index];
  const itemsWithTime = (items || []).map(it => ({
    ...it,
    sentAt: it.sentAt || new Date().toISOString()
  }));

  const total = calculateOrderTotal(itemsWithTime);

  table.status = 'occupied';
  table.currentOrder = {
    items: itemsWithTime,
    total,
    openedAt: new Date().toISOString(),
    serverId,
    serverName,
    notes: notes || ''
  };

  list[index] = table;
  saveTables(list);
  return { success: true, table };
}

// Agregar más productos a la comanda activa de una mesa
export function appendItemsToTable(tableId, newItems) {
  const list = getTables();
  const index = list.findIndex(t => String(t.id) === String(tableId));
  if (index === -1) return { success: false, message: 'Mesa no encontrada.' };

  const table = list[index];
  if (!table.currentOrder) {
    return openTableOrder(tableId, { items: newItems });
  }

  const stampedNewItems = (newItems || []).map(it => ({
    ...it,
    sentAt: new Date().toISOString()
  }));

  const combinedItems = [...table.currentOrder.items, ...stampedNewItems];
  table.currentOrder.items = combinedItems;
  table.currentOrder.total = calculateOrderTotal(combinedItems);
  table.status = 'occupied'; // Si estaba en cuenta pedida, vuelve a ocupada al pedir más

  list[index] = table;
  saveTables(list);
  return { success: true, table };
}

// Solicitar cuenta / Cerrar mesa para cobro en caja
export function requestTableBill(tableId) {
  const list = getTables();
  const index = list.findIndex(t => String(t.id) === String(tableId));
  if (index === -1) return { success: false, message: 'Mesa no encontrada.' };

  const table = list[index];
  if (!table.currentOrder) {
    return { success: false, message: 'La mesa no tiene ninguna comanda activa.' };
  }

  table.status = 'bill_requested';
  list[index] = table;
  saveTables(list);
  return { success: true, table };
}

// Liberar mesa (cuando caja cobra o se desocupa la mesa)
export function clearTable(tableId) {
  const list = getTables();
  const index = list.findIndex(t => String(t.id) === String(tableId));
  if (index === -1) return { success: false, message: 'Mesa no encontrada.' };

  list[index] = {
    ...list[index],
    status: 'available',
    currentOrder: null
  };

  saveTables(list);
  return { success: true, table: list[index] };
}
