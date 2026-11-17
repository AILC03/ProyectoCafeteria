import { apiFetch, invalidateCsrfToken } from './client';

export interface CustomerAuthUser {
  id: string;
  name: string;
  role: 'CLIENTE';
  accountType: 'CUSTOMER';
  mustChangePin: boolean;
}

export interface CustomerProfile {
  customerNumber: string;
  name: string;
  phone: string;
  recoveryEmail: string | null;
  recoveryEmailVerifiedAt: string | null;
  createdAt: string;
}

export interface CustomerLoginResponse {
  data: {
    user: CustomerAuthUser;
    csrfToken: string;
  };
}

/**
 * Inicia sesión de cliente mediante teléfono (+52 o 10 dígitos) o número C y NIP de 4 dígitos.
 */
export async function loginCustomer(identifier: string, pin: string): Promise<CustomerAuthUser> {
  const res = await apiFetch<CustomerLoginResponse>('/auth/login/customer', {
    method: 'POST',
    body: JSON.stringify({ identifier, pin }),
  });
  return res.data.user;
}

/**
 * Obtiene el perfil del cliente autenticado según la sesión actual en cookies HttpOnly.
 */
export async function getCustomerProfile(): Promise<CustomerProfile> {
  const res = await apiFetch<{ data: CustomerProfile }>('/customers/me');
  return res.data;
}

/**
 * Actualiza el perfil propio del cliente (nombre o teléfono).
 */
export async function updateCustomerProfile(data: { name?: string; phone?: string; currentPin?: string }): Promise<void> {
  await apiFetch('/customers/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Cierra la sesión activa en el backend y limpia las cookies HttpOnly.
 */
export async function logoutCustomer(): Promise<void> {
  try {
    await apiFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  } finally {
    invalidateCsrfToken();
  }
}
