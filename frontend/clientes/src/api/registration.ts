import { apiFetch } from './client';

export interface TicketRegistrationInput {
  token: string;
  name: string;
  phone: string;
  pin: string;
}

export interface TicketRegistrationResponse {
  data: {
    id: string;
    customerNumber: string;
    name: string;
    phone: string;
  };
}

/**
 * Registra una cuenta de cliente en PostgreSQL vinculada a un ticket de compra confirmado.
 */
export async function registerWithTicket(input: TicketRegistrationInput): Promise<TicketRegistrationResponse['data']> {
  const cleanPhone = input.phone.trim();
  const normalizedPhone = cleanPhone.startsWith('+52')
    ? cleanPhone
    : `+52${cleanPhone.replace(/^0+/, '')}`;

  const res = await apiFetch<TicketRegistrationResponse>('/customer-registration/ticket', {
    method: 'POST',
    body: JSON.stringify({
      token: input.token.trim(),
      name: input.name.trim(),
      phone: normalizedPhone,
      pin: input.pin.trim(),
    }),
  });
  return res.data;
}
