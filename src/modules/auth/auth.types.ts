import type { Prisma } from '../../generated/prisma/client.js';

export type RoleName = 'CLIENTE' | 'CAJERO' | 'PREPARACION' | 'ADMINISTRADOR';
export type AuthUser = Prisma.UserGetPayload<{ include: { role: true } }>;
export type SessionUser = Prisma.AuthSessionGetPayload<{
  include: { user: { include: { role: true } } };
}>;
export type Principal = {
  userId: bigint;
  sessionId: bigint;
  familyId: string;
  role: RoleName;
  accountType: 'STAFF' | 'CUSTOMER';
  mustChangePin: boolean;
};
export type AuthConfig = {
  jwtSecret: string;
  csrfSecret: string;
  issuer: string;
  audience: string;
  secure: boolean;
  origin: string;
  ipLimit: number;
};
export function userDto(user: AuthUser) {
  return {
    id: user.id.toString(),
    name: user.name,
    role: user.role.name,
    accountType: user.accountType,
    mustChangePin: user.mustChangePin,
  };
}
