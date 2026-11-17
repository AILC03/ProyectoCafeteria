import { apiFetch } from './client.js';

export async function getCategories() {
  const res = await apiFetch('/categories?limit=100');
  return res.data || [];
}

export async function getProducts(categoryId) {
  const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}&limit=100` : '?limit=100';
  const res = await apiFetch(`/products${query}`);
  return res.data || [];
}

export async function getProductOptions(productId) {
  const res = await apiFetch(`/products/${productId}/options`);
  return res.data || [];
}

export async function setProductAvailability(productId, isAvailable) {
  const res = await apiFetch(`/products/${productId}/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ isAvailable }),
  });
  return res.data;
}

export async function createAdminProduct({ categoryId, name, description, basePriceCents }) {
  const res = await apiFetch('/admin/products', {
    method: 'POST',
    body: JSON.stringify({
      categoryId: categoryId.toString(),
      name: name.trim(),
      description: description?.trim() || null,
      basePriceCents: basePriceCents.toString(),
    }),
  });
  return res.data;
}

export async function updateAdminProduct(id, { categoryId, name, description, basePriceCents, isAvailable }) {
  const body = {};
  if (categoryId !== undefined) body.categoryId = categoryId.toString();
  if (name !== undefined) body.name = name.trim();
  if (description !== undefined) body.description = description ? description.trim() : null;
  if (basePriceCents !== undefined) body.basePriceCents = basePriceCents.toString();
  if (isAvailable !== undefined) body.isAvailable = isAvailable;

  const res = await apiFetch(`/admin/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function createAdminCategory({ name, isActive = true }) {
  const res = await apiFetch('/admin/categories', {
    method: 'POST',
    body: JSON.stringify({
      name: name.trim(),
      isActive,
    }),
  });
  return res.data;
}

export async function deleteAdminCategory(id) {
  const res = await apiFetch(`/admin/categories/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
  return res.data;
}

export async function deleteAdminProduct(id) {
  const res = await apiFetch(`/admin/products/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
  return res.data;
}
