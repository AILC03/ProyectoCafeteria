import { HttpProblem } from '../../shared/http/problem.js';
import { digest } from '../auth/auth.tokens.js';
import { hashCredential } from '../auth/auth.credentials.js';
import { CustomerRegistrationRepository } from './customer-registration.repository.js';
import type { TicketRegistrationInput } from './customer-registration.schemas.js';

export const registrationTokenUsed = () =>
  new HttpProblem(409, 'REGISTRATION_TOKEN_USED', 'El código de registro ya fue utilizado');
export const registrationTokenExpired = () =>
  new HttpProblem(409, 'REGISTRATION_TOKEN_EXPIRED', 'El código de registro ha vencido');
export const registrationPurchaseIneligible = () =>
  new HttpProblem(
    409,
    'REGISTRATION_PURCHASE_INELIGIBLE',
    'El ticket no permite registrar una cuenta',
  );
export const registrationPhoneTaken = () =>
  new HttpProblem(409, 'PHONE_ALREADY_REGISTERED', 'El teléfono ya está registrado');
export class CustomerRegistrationService {
  constructor(
    readonly repository: CustomerRegistrationRepository,
    readonly now: () => Date = () => new Date(),
    private hashPin: (pin: string) => Promise<string> = hashCredential,
  ) {}
  register(input: TicketRegistrationInput) {
    return this.repository.transaction(async (tx) => {
      const token = await tx.lockToken(digest(input.token));
      if (!token)
        throw new HttpProblem(
          404,
          'REGISTRATION_TOKEN_INVALID',
          'Código de registro no disponible',
        );
      if (token.usedAt || token.usedByCustomerId !== null) throw registrationTokenUsed();
      if (token.expiresAt <= this.now()) throw registrationTokenExpired();
      const purchase = await tx.lockPurchase(token.saleId);
      const order = purchase?.order,
        payment = purchase?.payment;
      if (
        !purchase ||
        !order ||
        !payment ||
        order.customerId !== null ||
        !['EN_PREPARACION', 'LISTO'].includes(order.status) ||
        !order.paidAt ||
        order.expiredAt ||
        payment.status !== 'SUCCEEDED' ||
        !payment.confirmedAt ||
        payment.currency !== 'MXN' ||
        payment.orderId !== order.id ||
        payment.method !== order.paymentMethod ||
        payment.amountCents !== purchase.sale.totalCents ||
        order.totalCents !== purchase.sale.totalCents ||
        order.paidAt > this.now() ||
        payment.confirmedAt > this.now()
      )
        throw registrationPurchaseIneligible();
      const deadline = Math.min(
        token.expiresAt.getTime(),
        payment.confirmedAt.getTime() + 24 * 3600000,
      );
      if (this.now().getTime() >= deadline) throw registrationTokenExpired();
      await tx.lockPhone(digest(input.phone));
      if (await tx.phoneExists(input.phone)) throw registrationPhoneTaken();
      const roleId = await tx.clientRoleId();
      const pinHash = await this.hashPin(input.pin);
      const createdAt = this.now();
      if (createdAt.getTime() >= deadline) throw registrationTokenExpired();
      const customer = await tx.createCustomer({
        roleId,
        name: input.name,
        phone: input.phone,
        pinHash,
        now: createdAt,
      });
      if (!customer) throw registrationPhoneTaken();
      if (!(await tx.associate(order.id, customer.id))) throw registrationPurchaseIneligible();
      const consumedAt = this.now();
      if (consumedAt.getTime() >= deadline) throw registrationTokenExpired();
      if (!(await tx.consume(token.id, customer.id, consumedAt))) throw registrationTokenUsed();
      await tx.audit(customer.id, purchase.sale.id, consumedAt);
      return {
        customer: {
          customerNumber: customer.customerNumber,
          name: customer.name,
          phone: customer.phone,
        },
      };
    });
  }
}
