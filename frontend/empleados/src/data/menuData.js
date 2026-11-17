// ==========================================================================
// Coffee´s Pos - Catálogo y Gestión del Menú en Frontend
// Almacenamiento local desacoplado de backend o sincronizado con base de datos
// ==========================================================================

const STORAGE_MENU_KEY = 'coffees_menu_products_local';
const LEGACY_STORAGE_MENU_KEY = 'taffy_menu_products_local';
const STORAGE_CATEGORIES_KEY = 'coffees_menu_categories_local';
const LEGACY_STORAGE_CATEGORIES_KEY = 'taffy_menu_categories_local';

export const MENU_CATEGORIES = [
  { id: "all", name: "Todos" }
];

export const MENU_PRODUCTS = [];

export function getMenuCategories() {
  try {
    const raw = localStorage.getItem(STORAGE_CATEGORIES_KEY) || localStorage.getItem(LEGACY_STORAGE_CATEGORIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    return [{ id: 'all', name: 'Todos' }];
  } catch {
    return [{ id: 'all', name: 'Todos' }];
  }
}

export function saveMenuCategories(list) {
  try {
    const cleanList = Array.isArray(list) ? list : [{ id: 'all', name: 'Todos' }];
    localStorage.setItem(STORAGE_CATEGORIES_KEY, JSON.stringify(cleanList));
    localStorage.setItem(LEGACY_STORAGE_CATEGORIES_KEY, JSON.stringify(cleanList));
    window.dispatchEvent(new CustomEvent('coffees:categories_updated', { detail: cleanList }));
  } catch (e) {
    console.error('Error al guardar categorías:', e);
  }
}

export function getMenuProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_MENU_KEY) || localStorage.getItem(LEGACY_STORAGE_MENU_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Filtrar y eliminar cualquier producto demo antiguo (con ID tipo "p1", "p2", o SKU demo)
      const clean = parsed.filter(
        (p) =>
          !/^p\d+$/i.test(String(p.id)) &&
          !String(p.sku || '').startsWith('DES-') &&
          !String(p.sku || '').startsWith('ENT-') &&
          !String(p.sku || '').startsWith('PLA-') &&
          !String(p.sku || '').startsWith('CAF-') &&
          !String(p.sku || '').startsWith('BEB-') &&
          !String(p.sku || '').startsWith('POS-') &&
          !String(p.name || '').includes('(demo)')
      );
      if (clean.length !== parsed.length) {
        saveMenuProducts(clean);
      }
      return clean;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveMenuProducts(productsList) {
  try {
    const cleanList = Array.isArray(productsList) ? productsList : [];
    localStorage.setItem(STORAGE_MENU_KEY, JSON.stringify(cleanList));
    localStorage.setItem(LEGACY_STORAGE_MENU_KEY, JSON.stringify(cleanList));
    window.dispatchEvent(new CustomEvent('coffees:menu_updated', { detail: cleanList }));
    window.dispatchEvent(new CustomEvent('taffy:menu_updated', { detail: cleanList }));
  } catch (e) {
    console.error('Error al guardar productos del menú:', e);
  }
}

export function addProduct({ id, name, price, categoryId, desc = '', sku = '' }) {
  const cleanName = String(name || '').trim();
  const numPrice = Number(price);

  if (!cleanName) {
    return { success: false, message: 'El nombre del producto es obligatorio.' };
  }
  if (isNaN(numPrice) || numPrice <= 0) {
    return { success: false, message: 'El precio debe ser un número válido mayor a 0.' };
  }

  const products = getMenuProducts();
  const newId = id ? String(id) : `prod_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const cleanSku = sku ? String(sku).trim() : `SKU-${Date.now().toString().slice(-4)}`;

  const newProduct = {
    id: newId,
    name: cleanName,
    price: Number(numPrice.toFixed(2)),
    categoryId: categoryId || 'platillos',
    desc: String(desc || '').trim(),
    sku: cleanSku,
    favorite: false
  };

  products.push(newProduct);
  saveMenuProducts(products);
  return { success: true, product: newProduct };
}

export function updateProduct(id, updatedFields) {
  const cleanId = String(id || '').trim();
  const products = getMenuProducts();
  const index = products.findIndex((p) => String(p.id).trim() === cleanId);

  if (index === -1) {
    return { success: false, message: 'Producto no encontrado.' };
  }

  if (updatedFields.name) products[index].name = String(updatedFields.name).trim();
  if (updatedFields.price !== undefined && !isNaN(Number(updatedFields.price))) {
    products[index].price = Number(Number(updatedFields.price).toFixed(2));
  }
  if (updatedFields.categoryId) products[index].categoryId = updatedFields.categoryId;
  if (updatedFields.desc !== undefined) products[index].desc = String(updatedFields.desc).trim();
  if (updatedFields.sku !== undefined) products[index].sku = String(updatedFields.sku).trim();
  if (updatedFields.favorite !== undefined) products[index].favorite = Boolean(updatedFields.favorite);

  saveMenuProducts(products);
  return { success: true, product: products[index] };
}

export function deleteProduct(id) {
  const cleanId = String(id || '').trim();
  const products = getMenuProducts();
  const filtered = products.filter((p) => String(p.id).trim() !== cleanId);

  if (filtered.length === products.length) {
    return { success: false, message: 'Producto no encontrado.' };
  }

  saveMenuProducts(filtered);
  return { success: true };
}

export async function syncMenuProductsFromCloud() {
  return getMenuProducts();
}
