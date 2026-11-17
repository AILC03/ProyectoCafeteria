// Catálogo completo y editable de productos para Coffee´s Pos
export const MENU_CATEGORIES = [
  { id: "all", name: "Todos" },
  { id: "desayunos", name: "Desayunos" },
  { id: "entradas", name: "Entradas & Snacks" },
  { id: "platillos", name: "Platillos Fuertes" },
  { id: "cafe", name: "Cafetería Especial" },
  { id: "bebidas", name: "Bebidas Frías" },
  { id: "postres", name: "Panadería & Postres" }
];

export const MENU_PRODUCTS = [
  // Desayunos
  {
    id: "p1",
    categoryId: "desayunos",
    name: "Chilaquiles Verdes con Pollo",
    price: 135.00,
    sku: "DES-01",
    desc: "Totopos horneados, salsa tomatillo, pechuga deshebrada, crema y queso fresco",
    favorite: true
  },
  {
    id: "p2",
    categoryId: "desayunos",
    name: "Huevos Benedictinos",
    price: 145.00,
    sku: "DES-02",
    desc: "Huevos pochados sobre muffin inglés, lomo canadiense y salsa holandesa",
    favorite: false
  },
  {
    id: "p3",
    categoryId: "desayunos",
    name: "Avocado Toast con Huevo",
    price: 110.00,
    sku: "DES-03",
    desc: "Pan de masa madre, aguacate machacado, huevo estrellado y ajonjolí negro",
    favorite: true
  },
  {
    id: "p4",
    categoryId: "desayunos",
    name: "Pancakes con Frutos Rojos",
    price: 115.00,
    sku: "DES-04",
    desc: "Tres esponjosos hotcakes con mantequilla batida, fresas y miel maple",
    favorite: false
  },

  // Entradas & Snacks
  {
    id: "p5",
    categoryId: "entradas",
    name: "Papas Rústicas a la Francesa",
    price: 75.00,
    sku: "ENT-01",
    desc: "Corte grueso sazonadas con sal marina, romero y dip de alioli",
    favorite: true
  },
  {
    id: "p6",
    categoryId: "entradas",
    name: "Dedos de Queso Gouda",
    price: 95.00,
    sku: "ENT-02",
    desc: "6 piezas empanizadas artesanalmente servidas con salsa marinara",
    favorite: false
  },
  {
    id: "p7",
    categoryId: "entradas",
    name: "Nachos Especiales Tex-Mex",
    price: 125.00,
    sku: "ENT-03",
    desc: "Frijoles refritos, queso cheddar fundido, pico de gallo y jalapeños",
    favorite: false
  },

  // Platillos Fuertes
  {
    id: "p8",
    categoryId: "platillos",
    name: "Hamburguesa Coffee´s Pos Smash",
    price: 165.00,
    sku: "PLA-01",
    desc: "Doble carne angus (180g), doble cheddar, tocino caramelizado y aderezo secreto",
    favorite: true
  },
  {
    id: "p9",
    categoryId: "platillos",
    name: "Tacos al Pastor Gourmet (3 pzas)",
    price: 115.00,
    sku: "PLA-02",
    desc: "Carne marinada con achiote, piña asada, cebollita y cilantro en tortilla de maíz",
    favorite: true
  },
  {
    id: "p10",
    categoryId: "platillos",
    name: "Sandwich Club Clásico",
    price: 130.00,
    sku: "PLA-03",
    desc: "Triple capa con pechuga de pavo, tocino crujiente, queso suizo y papas",
    favorite: false
  },
  {
    id: "p11",
    categoryId: "platillos",
    name: "Bowl de Pollo Teriyaki",
    price: 140.00,
    sku: "PLA-04",
    desc: "Arroz jazmín al vapor, pechuga glaseada, brócoli, edamames y ajonjolí",
    favorite: false
  },

  // Cafetería Especial
  {
    id: "p12",
    categoryId: "cafe",
    name: "Espresso Doble",
    price: 45.00,
    sku: "CAF-01",
    desc: "Extracción doble de café de especialidad origen Chiapas",
    favorite: false
  },
  {
    id: "p13",
    categoryId: "cafe",
    name: "Americano Clásico",
    price: 48.00,
    sku: "CAF-02",
    desc: "12 oz con agua caliente filtrada y tueste medio",
    favorite: true
  },
  {
    id: "p14",
    categoryId: "cafe",
    name: "Cappuccino Italiano",
    price: 65.00,
    sku: "CAF-03",
    desc: "Espuma densa aterciopelada y cacao espolvoreado",
    favorite: true
  },
  {
    id: "p15",
    categoryId: "cafe",
    name: "Latte de Vainilla",
    price: 70.00,
    sku: "CAF-04",
    desc: "Leche vaporizada con jarabe natural de vainilla Papantla",
    favorite: true
  },
  {
    id: "p16",
    categoryId: "cafe",
    name: "Cold Brew Artesanal",
    price: 68.00,
    sku: "CAF-05",
    desc: "Macerado en frío por 18 horas, notas a chocolate amargo",
    favorite: false
  },

  // Bebidas Frías
  {
    id: "p17",
    categoryId: "bebidas",
    name: "Limonada con Menta Frappé",
    price: 52.00,
    sku: "BEB-01",
    desc: "Limón eureka fresco, hojas de hierbabuena y hielo triturado",
    favorite: true
  },
  {
    id: "p18",
    categoryId: "bebidas",
    name: "Smoothie Verde Matcha",
    price: 78.00,
    sku: "BEB-02",
    desc: "Matcha ceremonial Uji, piña miel, espinaca y leche vegetal",
    favorite: false
  },
  {
    id: "p19",
    categoryId: "bebidas",
    name: "Té Helado de Durazno",
    price: 50.00,
    sku: "BEB-03",
    desc: "Infusión fría de té negro con rodajas de fruta fresca",
    favorite: false
  },
  {
    id: "p20",
    categoryId: "bebidas",
    name: "Refresco en Lata (355ml)",
    price: 38.00,
    sku: "BEB-04",
    desc: "Coca-Cola clásica, Sprite, Manzana o Agua Mineral",
    favorite: false
  },

  // Panadería & Postres
  {
    id: "p21",
    categoryId: "postres",
    name: "Cheesecake Frutos Rojos",
    price: 85.00,
    sku: "POS-01",
    desc: "Receta horneada New York con reducción artesanal de zarzamora",
    favorite: true
  },
  {
    id: "p22",
    categoryId: "postres",
    name: "Brownie con Nuez & Helado",
    price: 75.00,
    sku: "POS-02",
    desc: "Chocolate amargo 70%, centro suave tibio y bola de helado de vainilla",
    favorite: false
  },
  {
    id: "p23",
    categoryId: "postres",
    name: "Croissant de Almendras",
    price: 65.00,
    sku: "POS-03",
    desc: "Hojaldrado artesanal relleno de crema frangipane y almendras fileteadas",
    favorite: true
  },
  {
    id: "p24",
    categoryId: "postres",
    name: "Muffin de Arándanos",
    price: 48.00,
    sku: "POS-04",
    desc: "Esponjoso con arándanos frescos y crumble de canela",
    favorite: false
  }
];

const STORAGE_KEY_PRODUCTS = 'coffees_menu_products_v1';
const LEGACY_STORAGE_KEY_PRODUCTS = 'taffy_menu_products_v1';

// Obtener todas las categorías del menú
export function getMenuCategories() {
  return [...MENU_CATEGORIES];
}

// Obtener lista activa de productos (desde localStorage o por defecto)
export function getMenuProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRODUCTS) || localStorage.getItem(LEGACY_STORAGE_KEY_PRODUCTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(MENU_PRODUCTS));
      localStorage.setItem(LEGACY_STORAGE_KEY_PRODUCTS, JSON.stringify(MENU_PRODUCTS));
      return [...MENU_PRODUCTS];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(MENU_PRODUCTS));
    return [...MENU_PRODUCTS];
  } catch (e) {
    return [...MENU_PRODUCTS];
  }
}

// Guardar productos en localStorage y notificar actualización
export function saveMenuProducts(productsList) {
  try {
    localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(productsList));
    localStorage.setItem(LEGACY_STORAGE_KEY_PRODUCTS, JSON.stringify(productsList));
    window.dispatchEvent(new CustomEvent('coffees:menu_updated', { detail: productsList }));
    window.dispatchEvent(new CustomEvent('taffy:menu_updated', { detail: productsList }));
  } catch (e) {
    console.error('Error al guardar productos del menú:', e);
  }
}

// Agregar nuevo producto al menú
export function addProduct({ name, price, categoryId, desc = '', sku = '' }) {
  const cleanName = String(name || '').trim();
  const numPrice = Number(price);

  if (!cleanName) {
    return { success: false, message: 'El nombre del producto es obligatorio.' };
  }
  if (isNaN(numPrice) || numPrice <= 0) {
    return { success: false, message: 'El precio debe ser un número válido mayor a 0.' };
  }

  const products = getMenuProducts();
  const newId = `prod_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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

// Actualizar un producto existente
export function updateProduct(id, fields) {
  const products = getMenuProducts();
  const index = products.findIndex(p => String(p.id) === String(id));
  if (index === -1) {
    return { success: false, message: 'Producto no encontrado.' };
  }

  const current = products[index];
  const updated = {
    ...current,
    ...fields,
    name: fields.name !== undefined ? String(fields.name).trim() : current.name,
    price: fields.price !== undefined ? Number(Number(fields.price).toFixed(2)) : current.price,
    categoryId: fields.categoryId !== undefined ? fields.categoryId : current.categoryId,
    desc: fields.desc !== undefined ? String(fields.desc).trim() : current.desc,
    sku: fields.sku !== undefined ? String(fields.sku).trim() : current.sku
  };

  products[index] = updated;
  saveMenuProducts(products);
  return { success: true, product: updated };
}

// Eliminar un producto del menú
export function deleteProduct(id) {
  const products = getMenuProducts();
  const exists = products.some(p => String(p.id) === String(id));
  if (!exists) {
    return { success: false, message: 'Producto no encontrado.' };
  }

  const filtered = products.filter(p => String(p.id) !== String(id));
  saveMenuProducts(filtered);
  return { success: true };
}
