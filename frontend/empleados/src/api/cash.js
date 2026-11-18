import { apiFetch } from './client.js';

/**
 * Consulta la sesión de caja activa del cajero/administrador y su resumen.
 */
export async function getCurrentCashSession() {
  const res = await apiFetch('/cash-sessions/current');
  return res.data;
}

/**
 * Abre una sesión de caja para el turno con el fondo inicial en centavos.
 */
export async function openCashSession(openingAmountCents = '50000') {
  const idempotencyKey = crypto.randomUUID();
  const res = await apiFetch('/cash-sessions', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      openingAmountCents: openingAmountCents.toString(),
    }),
  });
  return res.data;
}

/**
 * Consulta la sesión activa o abre una por defecto si no existe.
 */
export async function getOrEnsureCashSession() {
  try {
    const res = await apiFetch('/cash-sessions/current');
    if (res?.data?.id) {
      return res.data;
    }
  } catch (err) {
    console.warn('Verificando sesión de caja activa:', err);
  }
  return await openCashSession('50000');
}

/**
 * Cierra la sesión de caja del turno con el monto contado.
 */
export async function closeCashSession(sessionId, countedCashCents, reason) {
  const idempotencyKey = crypto.randomUUID();
  const body = {
    countedCashCents: countedCashCents.toString(),
  };
  if (reason) {
    body.exceptionalCloseReason = reason.trim();
  }
  const res = await apiFetch(`/cash-sessions/${sessionId}/close`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
  return res.data;
}

/**
 * Crea una orden directamente en caja/POS (CASH).
 */
export async function createCashierOrder({ items, guestName, customer, includeCashQr = true }) {
  const idempotencyKey = crypto.randomUUID();
  const body = {
    paymentMethod: 'CASH',
    items: items.map((it) => ({
      productId: it.productId.toString(),
      quantity: it.quantity,
      optionValueIds: it.optionValueIds || [],
    })),
  };

  if (guestName) {
    body.guestName = guestName.trim();
  } else if (customer) {
    body.customer = customer;
  }

  if (includeCashQr) {
    body.includeCashQr = true;
  }

  const res = await apiFetch('/cashier/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
  return res;
}

/**
 * Resuelve y valida el QR de cobro de un cliente en efectivo (sin consumirlo ni cobrar).
 */
export async function scanCashPaymentQr(token) {
  const cleanToken = token.replace('cafeteria:cash:', '').trim();
  const res = await apiFetch('/cashier/orders/scan-cash-qr', {
    method: 'POST',
    body: JSON.stringify({ token: cleanToken }),
  });
  return res.data;
}

/**
 * Cobra una orden en efectivo vinculándola con la sesión de caja abierta en PostgreSQL.
 */
export async function chargeCashOrder(orderId, cashReceivedCents, cashSessionId = null) {
  let sessionId = cashSessionId;
  if (!sessionId) {
    const active = await getOrEnsureCashSession();
    sessionId = active?.id;
  }
  const idempotencyKey = crypto.randomUUID();
  const res = await apiFetch('/payments/cash', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      cashSessionId: sessionId.toString(),
      orderId: orderId.toString(),
      cashReceivedCents: cashReceivedCents.toString(),
    }),
  });
  return res.data;
}

/**
 * Emite el código de registro en ticket para que un cliente invitado pueda registrar su cuenta.
 */
export async function issueTicketAccess(saleId) {
  const res = await apiFetch(`/sales/${saleId}/ticket-access`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return res.data;
}
