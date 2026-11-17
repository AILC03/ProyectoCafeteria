import React, { useState, useEffect, useMemo } from 'react';
import {
  getMenuCategories,
  getMenuProducts,
  saveMenuCategories,
  saveMenuProducts,
  addProduct,
  updateProduct,
  deleteProduct
} from '../data/menuData.js';
import { showToast, showConfirm } from '../utils/notify.js';
import {
  getCategories,
  getProducts,
  setProductAvailability,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  createAdminCategory,
  deleteAdminCategory
} from '../api/catalog.js';
import { centsToNumber, numberToCents } from '../utils/money.js';
import { isEmployeeAdmin } from '../data/employees.js';

export default function MenuManagementWorkspace({ currentEmployee }) {
  const [categories, setCategories] = useState(getMenuCategories);
  const [products, setProducts] = useState(getMenuProducts);
  const [selectedCat, setSelectedCat] = useState('all');
  const [search, setSearch] = useState('');

  // Estado del modal de alta / edición de producto
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSku, setFormSku] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Estado del modal de gestión de categorías
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [catErrorMessage, setCatErrorMessage] = useState('');

  async function refreshAllCatalog() {
    try {
      const [apiCats, apiProds] = await Promise.all([
        getCategories().catch(() => []),
        getProducts().catch(() => []),
      ]);

      const localCats = getMenuCategories();
      const catsMap = new Map();
      catsMap.set('all', { id: 'all', name: 'Todos' });
      localCats.forEach((c) => {
        if (c.id !== 'all' && c.name) {
          catsMap.set(c.name.toLowerCase().trim(), c);
        }
      });
      if (apiCats && apiCats.length > 0) {
        apiCats.forEach((c) => {
          if (c.name) {
            catsMap.set(c.name.toLowerCase().trim(), { id: String(c.id), name: c.name });
          }
        });
      }
      const finalCats = Array.from(catsMap.values());
      setCategories(finalCats);
      saveMenuCategories(finalCats);
      if (!formCategory || formCategory === 'all') {
        const firstValid = finalCats.find((c) => c.id !== 'all');
        if (firstValid) setFormCategory(String(firstValid.id));
      }

      const localProds = getMenuProducts();
      const prodsMap = new Map();
      localProds.forEach((p) => {
        if (p.name) prodsMap.set(p.name.toLowerCase().trim(), p);
      });
      if (apiProds && apiProds.length > 0) {
        apiProds.forEach((p) => {
          if (p.name) {
            prodsMap.set(p.name.toLowerCase().trim(), {
              id: String(p.id),
              name: p.name,
              price: centsToNumber(p.basePriceCents),
              basePriceCents: p.basePriceCents,
              categoryId: String(p.categoryId),
              desc: p.description || '',
              sku: `PRD-${p.id}`,
              isAvailable: p.isAvailable,
            });
          }
        });
      }
      const finalProds = Array.from(prodsMap.values());
      setProducts(finalProds);
      saveMenuProducts(finalProds);
    } catch (err) {
      console.warn('Error refrescando catálogo:', err);
    }
  }

  useEffect(() => {
    refreshAllCatalog();

    function handleMenuUpdate() {
      setProducts(getMenuProducts());
      setCategories(getMenuCategories());
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

  function resetForm() {
    setFormName('');
    const validCats = categories.filter((c) => c.id !== 'all');
    setFormCategory(validCats.length > 0 ? String(validCats[0].id) : '');
    setFormPrice('');
    setFormDesc('');
    setFormSku('');
    setEditingProduct(null);
    setErrorMessage('');
  }

  function handleOpenCreate() {
    resetForm();
    setIsModalOpen(true);
    setSuccessMessage('');
  }

  function handleOpenEdit(prod) {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormCategory(String(prod.categoryId || prod.category || ''));
    setFormPrice(String(prod.price));
    setFormDesc(prod.desc || '');
    setFormSku(prod.sku || '');
    setIsModalOpen(true);
    setErrorMessage('');
    setSuccessMessage('');
  }

  async function handleToggleAvailability(prod) {
    const nextVal = !prod.isAvailable;
    // Actualizar estado local e historial persistente de inmediato
    setProducts((prev) =>
      prev.map((p) => (p.id === prod.id ? { ...p, isAvailable: nextVal } : p))
    );
    updateProduct(prod.id, { isAvailable: nextVal });

    if (/^\d+$/.test(String(prod.id))) {
      try {
        await setProductAvailability(prod.id, nextVal);
        showToast(
          `Producto "${prod.name}" marcado como ${nextVal ? 'Disponible' : 'Agotado'} en la base de datos`,
          'success'
        );
      } catch (err) {
        console.warn('Aviso backend disponibilidad:', err);
        showToast(
          `"${prod.name}" marcado como ${nextVal ? 'Disponible' : 'Agotado'} (${err.message})`,
          'info'
        );
      }
    } else {
      showToast(
        `Producto "${prod.name}" marcado como ${nextVal ? 'Disponible' : 'Agotado'}`,
        'success'
      );
    }
  }

  async function handleCreateCategory(e) {
    e.preventDefault();
    const cleanName = newCatName.trim();
    if (!cleanName) {
      setCatErrorMessage('El nombre de la categoría es obligatorio.');
      return;
    }
    if (cleanName.length < 2 || cleanName.length > 50) {
      setCatErrorMessage('El nombre de la categoría debe tener entre 2 y 50 caracteres.');
      return;
    }
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s'-]+$/.test(cleanName)) {
      setCatErrorMessage('El nombre solo puede contener letras, números y espacios.');
      return;
    }

    // Verificar si la categoría ya existe
    const catAlreadyExists = categories.some(
      (c) => c.name && c.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (catAlreadyExists) {
      setCatErrorMessage(`La categoría "${cleanName}" ya se encuentra registrada.`);
      return;
    }

    setIsCreatingCategory(true);
    setCatErrorMessage('');

    let created = null;
    try {
      created = await createAdminCategory({ name: cleanName });
      showToast(`Categoría "${cleanName}" guardada en la base de datos PostgreSQL`, 'success');
    } catch (err) {
      console.warn('Aviso backend crear categoría:', err);
      if (err.message && !err.message.includes('Origen no permitido') && !err.message.includes('Failed to fetch')) {
        setCatErrorMessage(err.message);
      }
    }

    // Persistir de inmediato para habilitar su uso instantáneo en el selector
    const newId = created?.id ? String(created.id) : `cat_${Date.now()}`;
    const validCats = categories.filter((c) => c.id !== 'all' && c.name.toLowerCase() !== cleanName.toLowerCase());
    const newCatList = [
      { id: 'all', name: 'Todos' },
      ...validCats,
      { id: newId, name: cleanName }
    ];
    setCategories(newCatList);
    saveMenuCategories(newCatList);
    setFormCategory(newId);
    setNewCatName('');
    setIsCreatingCategory(false);
    showToast(`Categoría "${cleanName}" lista para usar`, 'success');
  }

  async function handleDeleteCategory(catId, catName) {
    showConfirm({
      title: 'Eliminar Categoría',
      message: `¿Deseas eliminar la categoría "${catName}" de la base de datos?`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteAdminCategory(catId);
          showToast(`Categoría "${catName}" eliminada de la base de datos`, 'success');
          await refreshAllCatalog();
        } catch (err) {
          showToast(err.message || 'No se puede eliminar la categoría (puede tener productos asociados)', 'error');
        }
      }
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanName = formName.trim();
    if (!cleanName) {
      setErrorMessage('El nombre del platillo o producto es obligatorio.');
      return;
    }
    if (cleanName.length < 2 || cleanName.length > 80) {
      setErrorMessage('El nombre del producto debe tener entre 2 y 80 caracteres.');
      return;
    }

    if (!formCategory || formCategory === 'all') {
      setErrorMessage('Debes seleccionar o crear una categoría válida antes de guardar el producto.');
      return;
    }

    const catExists = categories.some((c) => c.id !== 'all' && String(c.id) === String(formCategory));
    if (!catExists) {
      setErrorMessage('La categoría seleccionada no existe o no es válida.');
      return;
    }

    const cleanPrice = String(formPrice).trim();
    if (!cleanPrice) {
      setErrorMessage('El precio del producto es obligatorio.');
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(cleanPrice)) {
      setErrorMessage('El precio debe ser un número positivo válido con máximo 2 decimales (ej. 45.00).');
      return;
    }
    const numPrice = parseFloat(cleanPrice);
    if (isNaN(numPrice) || numPrice <= 0) {
      setErrorMessage('El precio del producto debe ser mayor a $0.00.');
      return;
    }
    if (numPrice > 99999) {
      setErrorMessage('El precio del producto no puede exceder los $99,999.00.');
      return;
    }

    // Verificar que no exista ya un producto con el mismo nombre en la misma categoría o globalmente
    const duplicate = products.some(
      (p) => (!editingProduct || String(p.id) !== String(editingProduct.id)) &&
             p.name && p.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      setErrorMessage(`Ya existe un producto registrado con el nombre "${cleanName}". Por favor elija un nombre diferente.`);
      return;
    }

    if (editingProduct) {
      if (/^\d+$/.test(String(editingProduct.id))) {
        try {
          await updateAdminProduct(editingProduct.id, {
            name: cleanName,
            categoryId: formCategory,
            basePriceCents: numberToCents(cleanPrice),
            description: formDesc.trim(),
          });
          showToast(`Producto "${cleanName}" actualizado en la base de datos PostgreSQL`, 'success');
        } catch (err) {
          setErrorMessage(err.message || 'Error al actualizar producto en la base de datos');
          return;
        }
      }

      const res = updateProduct(editingProduct.id, {
        name: cleanName,
        categoryId: formCategory,
        price: numPrice,
        desc: formDesc.trim(),
        sku: formSku.trim()
      });
      if (!res.success) {
        setErrorMessage(res.message);
        return;
      }
      setProducts(getMenuProducts());
      setIsModalOpen(false);
      resetForm();
      setSuccessMessage('Producto actualizado exitosamente.');
      await refreshAllCatalog();
    } else {
      let targetCategoryId = formCategory;

      // Si la categoría seleccionada no tiene ID numérico de DB, asegurar su registro en PostgreSQL primero
      if (!/^\d+$/.test(String(targetCategoryId))) {
        const catObj = categories.find((c) => String(c.id) === String(targetCategoryId));
        if (catObj && catObj.name) {
          try {
            const syncedCat = await createAdminCategory({ name: catObj.name });
            if (syncedCat?.id) {
              targetCategoryId = String(syncedCat.id);
              const updatedCats = categories.map((c) =>
                c.name.toLowerCase() === catObj.name.toLowerCase() ? { ...c, id: targetCategoryId } : c
              );
              setCategories(updatedCats);
              saveMenuCategories(updatedCats);
              setFormCategory(targetCategoryId);
            }
          } catch (catErr) {
            console.warn('Registro previo de categoría en backend:', catErr);
          }
        }
      }

      let backendCreated = null;
      if (/^\d+$/.test(String(targetCategoryId))) {
        try {
          backendCreated = await createAdminProduct({
            categoryId: targetCategoryId,
            name: cleanName,
            description: formDesc.trim(),
            basePriceCents: numberToCents(cleanPrice),
          });
          showToast(`Producto "${cleanName}" guardado en la base de datos PostgreSQL`, 'success');
        } catch (err) {
          console.warn('Backend create product error:', err);
          setErrorMessage(err.message || 'Error al guardar el producto en la base de datos');
          return;
        }
      }

      const res = addProduct({
        id: backendCreated?.id ? String(backendCreated.id) : undefined,
        name: cleanName,
        categoryId: targetCategoryId,
        price: numPrice,
        desc: formDesc.trim(),
        sku: formSku.trim(),
        isAvailable: true,
      });
      if (!res.success) {
        setErrorMessage(res.message);
        return;
      }
      setProducts(getMenuProducts());
      setIsModalOpen(false);
      resetForm();
      setSuccessMessage('Producto agregado al menú exitosamente.');
      await refreshAllCatalog();
    }
  }

  function handleDelete(prod) {
    showConfirm({
      title: 'Eliminar Producto',
      message: `¿Confirmas que deseas dar de baja y eliminar el producto "${prod.name}" del menú y la base de datos?`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      isDestructive: true,
      onConfirm: async () => {
        if (/^\d+$/.test(String(prod.id))) {
          try {
            await deleteAdminProduct(prod.id);
            showToast(`Producto "${prod.name}" eliminado de la base de datos.`, 'success');
          } catch (err) {
            showToast(err.message || 'Error al eliminar producto en backend', 'error');
            return;
          }
        }
        deleteProduct(prod.id);
        await refreshAllCatalog();
      }
    });
  }

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat =
        selectedCat === 'all' ||
        String(p.categoryId) === String(selectedCat) ||
        String(p.category) === String(selectedCat);
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.desc && p.desc.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });
  }, [products, selectedCat, search]);

  if (currentEmployee && !isEmployeeAdmin(currentEmployee)) {
    return (
      <div className="pos-workspace-view active" style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔒</div>
        <h3 style={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 800 }}>Acceso Restringido</h3>
        <p style={{ marginTop: '0.5rem', fontSize: '0.95rem' }}>
          Se requieren permisos de <strong>Administrador</strong> para gestionar el menú de productos.
        </p>
      </div>
    );
  }

  const activeCategories = categories.filter((c) => c.id !== 'all');

  return (
    <div className="pos-workspace-view active" style={{ padding: '1.5rem', overflowY: 'auto' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Editar Menú
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Administración del catálogo de productos y precios &bull; {products.length} productos activos &bull; {activeCategories.length} categorías
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button
            type="button"
            onClick={() => {
              setIsCatModalOpen(true);
              setCatErrorMessage('');
              setNewCatName('');
            }}
            style={{
              padding: '0.65rem 1.15rem',
              background: '#f1f5f9',
              color: '#0f172a',
              border: '1px solid #cbd5e1',
              borderRadius: '9999px',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}
          >
            <span>📁</span>
            <span>+ Categorías</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            style={{
              padding: '0.65rem 1.35rem',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '9999px',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
            }}
          >
            <span>+</span>
            <span>Agregar Producto</span>
          </button>
        </div>
      </div>

      {/* Mensaje de éxito */}
      {successMessage && (
        <div style={{ padding: '0.75rem 1.25rem', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600 }}>
          {successMessage}
        </div>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCat(c.id)}
              style={{
                padding: '0.45rem 0.95rem',
                borderRadius: '9999px',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: selectedCat === c.id ? '1px solid #0f172a' : '1px solid #e2e8f0',
                background: selectedCat === c.id ? '#0f172a' : '#ffffff',
                color: selectedCat === c.id ? '#ffffff' : '#475569',
                cursor: 'pointer'
              }}
            >
              {c.name}
            </button>
          ))}

          {activeCategories.length === 0 && (
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', marginLeft: '0.5rem' }}>
              No hay categorías creadas aún. Pulsa "+ Categorías" para comenzar.
            </span>
          )}
        </div>

        <input
          type="text"
          placeholder="Buscar producto o código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '0.55rem 1rem',
            border: '1px solid #cbd5e1',
            borderRadius: '9999px',
            fontSize: '0.88rem',
            minWidth: '220px'
          }}
        />
      </div>

      {/* Modal / Panel de Alta y Edición de Producto */}
      {isModalOpen && (
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
            {editingProduct ? `Editar Producto: ${editingProduct.name}` : 'Añadir Nuevo Producto al Menú'}
          </h3>

          {errorMessage && (
            <div style={{ padding: '0.6rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Nombre del Producto
              </label>
              <input
                type="text"
                placeholder="Ej. Café Americano Doble"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                style={{ width: '100%', padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                  Categoría
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsCatModalOpen(true);
                    setCatErrorMessage('');
                    setNewCatName('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  + Nueva Categoría
                </button>
              </div>

              {activeCategories.length === 0 ? (
                <div style={{ padding: '0.6rem 0.8rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '0.82rem', color: '#92400e' }}>
                  No hay categorías registradas. Haz clic en <strong>+ Nueva Categoría</strong> para crear una primero.
                </div>
              ) : (
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', background: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="" disabled>Selecciona una categoría...</option>
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Precio ($ MXN)
              </label>
              <input
                type="number"
                step="0.50"
                min="0.50"
                placeholder="Ej. 65.00"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                required
                style={{ width: '100%', padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Código / SKU (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. CAF-05"
                value={formSku}
                onChange={(e) => setFormSku(e.target.value)}
                style={{ width: '100%', padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Descripción de Ingredientes / Preparación (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. Extracto de café de grano fresco con agua caliente purificada"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                style={{ width: '100%', padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  color: '#475569'
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{
                  padding: '0.6rem 1.5rem',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                {editingProduct ? 'Actualizar Producto' : 'Guardar Producto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Gestión de Categorías */}
      {isCatModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
          onClick={() => setIsCatModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '480px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📁</span>
                <span>Gestión de Categorías</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCatModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
              >
                &times;
              </button>
            </div>

            <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.4 }}>
              Crea categorías para organizar tu menú. Se guardarán directamente en PostgreSQL y se sincronizarán en tiempo real con la app de clientes.
            </p>

            {catErrorMessage && (
              <div style={{ padding: '0.6rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {catErrorMessage}
              </div>
            )}

            {/* Formulario de Alta de Categoría */}
            <form onSubmit={handleCreateCategory} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input
                type="text"
                placeholder="Ej. Cafetería, Bebidas Frías, Repostería..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                maxLength={120}
                required
                style={{ flex: 1, padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem' }}
              />
              <button
                type="submit"
                disabled={isCreatingCategory}
                style={{
                  padding: '0.65rem 1.25rem',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  opacity: isCreatingCategory ? 0.6 : 1
                }}
              >
                {isCreatingCategory ? 'Guardando...' : '+ Crear'}
              </button>
            </form>

            {/* Lista de Categorías Existentes */}
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.88rem', fontWeight: 700, color: '#334155' }}>
              Categorías en Base de Datos ({activeCategories.length})
            </h4>

            <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff' }}>
              {activeCategories.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  No hay categorías creadas aún.<br />Escribe un nombre arriba y haz clic en <strong>+ Crear</strong>.
                </div>
              ) : (
                activeCategories.map((cat) => {
                  const prodCount = products.filter(
                    (p) => String(p.categoryId) === String(cat.id) || String(p.category) === String(cat.id)
                  ).length;
                  return (
                    <div
                      key={cat.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid #f1f5f9'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontSize: '1rem' }}>☕</span>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{cat.name}</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '0.15rem 0.55rem', borderRadius: '9999px', fontWeight: 600 }}>
                          {prodCount} {prodCount === 1 ? 'producto' : 'productos'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        title={prodCount > 0 ? "No se puede eliminar una categoría que tiene productos asociados" : "Eliminar categoría de la base de datos"}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: prodCount > 0 ? '#cbd5e1' : '#ef4444',
                          cursor: prodCount > 0 ? 'not-allowed' : 'pointer',
                          fontSize: '1rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '6px'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={() => setIsCatModalOpen(false)}
                style={{
                  padding: '0.55rem 1.35rem',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  color: '#334155'
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de Productos */}
      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
              <th style={{ padding: '0.9rem 1.25rem' }}>Código</th>
              <th style={{ padding: '0.9rem 1.25rem' }}>Producto</th>
              <th style={{ padding: '0.9rem 1.25rem' }}>Categoría</th>
              <th style={{ padding: '0.9rem 1.25rem' }}>Descripción</th>
              <th style={{ padding: '0.9rem 1.25rem' }}>Precio</th>
              <th style={{ padding: '0.9rem 1.25rem' }}>Estado</th>
              <th style={{ padding: '0.9rem 1.25rem', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                  No se encontraron productos con el filtro seleccionado.
                </td>
              </tr>
            ) : (
              filteredProducts.map((p) => {
                const categoryObj = categories.find((c) => String(c.id) === String(p.categoryId || p.category));
                const catName = categoryObj?.name || p.categoryId || 'General';

                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.9rem 1.25rem', color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
                      {p.sku || '-'}
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem', fontWeight: 700, color: '#0f172a' }}>
                      {p.name}
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      <span style={{
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        background: '#f1f5f9',
                        color: '#334155',
                        fontSize: '0.78rem',
                        fontWeight: 600
                      }}>
                        {catName}
                      </span>
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem', color: '#64748b', fontSize: '0.84rem', maxWidth: '280px' }}>
                      {p.desc || '-'}
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem', fontWeight: 800, color: '#0f172a' }}>
                      ${Number(p.price || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleAvailability(p)}
                        title="Clic para cambiar disponibilidad en catálogo"
                        style={{
                          padding: '0.25rem 0.65rem',
                          borderRadius: '9999px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: 'none',
                          background: p.isAvailable !== false ? '#dcfce7' : '#fee2e2',
                          color: p.isAvailable !== false ? '#15803d' : '#b91c1c'
                        }}
                      >
                        {p.isAvailable !== false ? '● Disponible' : '○ Agotado'}
                      </button>
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(p)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            color: '#334155'
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            background: '#fff1f2',
                            border: '1px solid #fecdd3',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            color: '#be123c'
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
