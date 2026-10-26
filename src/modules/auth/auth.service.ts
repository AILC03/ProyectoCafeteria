import { randomUUID } from 'node:crypto';
import { hash, verify, argon2id } from 'argon2';
import { HttpProblem } from '../../shared/http/problem.js';
import { AuthTokens, digest, opaque, unauthorized, forbidden } from './auth.tokens.js';
import { AuthRepository } from './auth.repository.js';
import {
  userDto,
  type AuthConfig,
  type AuthUser,
  type Principal,
  type RoleName,
} from './auth.types.js';

const hashOptions = { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const blocked = () =>
  new HttpProblem(429, 'AUTH_RATE_LIMITED', 'No se puede iniciar sesión en este momento');
let dummyHash: Promise<string> | undefined;
function validUser(user: AuthUser | null): user is AuthUser {
  return (
    !!user &&
    user.isActive &&
    (user.accountType === 'CUSTOMER'
      ? user.role.name === 'CLIENTE'
      : ['CAJERO', 'PREPARACION', 'ADMINISTRADOR'].includes(user.role.name))
  );
}
export class AuthService {
  readonly tokens: AuthTokens;
  constructor(
    readonly repository: AuthRepository,
    readonly config: AuthConfig,
    readonly now: () => Date = () => new Date(),
  ) {
    this.tokens = new AuthTokens(config, now);
  }
  async binding(refresh: string | undefined) {
    const session = refresh ? await this.repository.sessionHash(digest(refresh)) : null;
    return session ? this.tokens.key(`family:${session.familyId}`) : 'pre';
  }
  private credentials(
    user: AuthUser,
    sessionId: bigint,
    familyId: string,
    absoluteExpiresAt: Date,
    refresh: string,
  ) {
    return {
      user: userDto(user),
      access: this.tokens.access(user.id, sessionId, absoluteExpiresAt),
      refresh,
      expiresAt: absoluteExpiresAt,
      csrf: this.tokens.csrf(this.tokens.key(`family:${familyId}`)),
    };
  }
  async login(kind: 'staff' | 'customer', identifier: string, secret: string, ip: string) {
    const now = this.now();
    const ipKey = this.tokens.key(`ip:${ip}`);
    const ipAllowed = await this.repository.transaction(async (tx) => {
      const counter = await this.repository.counter(tx, ipKey, now, 60000);
      if (counter.attemptCount >= this.config.ipLimit) return false;
      await tx.authAttemptLimit.update({
        where: { id: counter.id },
        data: { attemptCount: { increment: 1 } },
      });
      return true;
    });
    if (!ipAllowed) throw blocked();
    const candidate = await this.repository.loginUser(kind, identifier);
    const accountKey = this.tokens.key(
      candidate ? `account:${candidate.id}` : `missing:${kind}:${identifier}`,
    );
    const result = await this.repository.transaction(async (tx) => {
      if (candidate) await this.repository.lockUser(tx, candidate.id);
      const counter = await this.repository.counter(tx, accountKey, now, 15 * 60000);
      if (counter.blockedUntil && counter.blockedUntil > now) return { status: 'blocked' } as const;
      const user = candidate ? await this.repository.user(candidate.id, tx) : null;
      const stored = user ? (kind === 'staff' ? user.passwordHash : user.pinHash) : null;
      dummyHash ??= hash('comparison-only-not-an-account', hashOptions);
      const fallbackHash = await dummyHash;
      let correct: boolean;
      try {
        correct = await verify(stored ?? fallbackHash, secret);
      } catch {
        correct = false;
      }
      if (!validUser(user) || !correct) {
        const count = counter.attemptCount + 1;
        await tx.authAttemptLimit.update({
          where: { id: counter.id },
          data: {
            attemptCount: count,
            blockedUntil: count >= 5 ? new Date(now.getTime() + 15 * 60000) : null,
          },
        });
        return { status: count >= 5 ? 'blocked' : 'invalid' } as const;
      }
      await tx.authAttemptLimit.update({
        where: { id: counter.id },
        data: { attemptCount: 0, blockedUntil: null, windowStartedAt: now },
      });
      const absolute = new Date(now.getTime() + (kind === 'staff' ? 8 * 3600000 : 30 * 86400000));
      const refresh = opaque(),
        familyId = randomUUID();
      const session = await tx.authSession.create({
        data: {
          userId: user.id,
          familyId,
          refreshTokenHash: digest(refresh),
          createdAt: now,
          lastSeenAt: now,
          absoluteExpiresAt: absolute,
        },
      });
      return {
        status: 'ok',
        credentials: this.credentials(user, session.id, familyId, absolute, refresh),
      } as const;
    });
    if (result.status === 'blocked') throw blocked();
    if (result.status !== 'ok') throw unauthorized();
    return result.credentials;
  }
  async authenticate(token: string | undefined): Promise<Principal> {
    if (!token) throw unauthorized();
    const claims = this.tokens.verifyAccess(token);
    const session = await this.repository.sessionId(BigInt(claims.sid));
    if (
      !session ||
      session.userId.toString() !== claims.sub ||
      session.revokedAt ||
      session.absoluteExpiresAt <= this.now() ||
      !validUser(session.user) ||
      claims.exp > Math.floor(session.absoluteExpiresAt.getTime() / 1000)
    )
      throw unauthorized();
    return {
      userId: session.userId,
      sessionId: session.id,
      familyId: session.familyId,
      role: session.user.role.name as RoleName,
      accountType: session.user.accountType,
      mustChangePin: session.user.mustChangePin,
    };
  }
  async refresh(token: string | undefined) {
    if (!token) throw unauthorized();
    const original = await this.repository.sessionHash(digest(token));
    if (!original) throw unauthorized();
    const result = await this.repository.transaction(async (tx) => {
      await this.repository.lockUser(tx, original.userId);
      await this.repository.lock(tx, `family:${original.familyId}`);
      const session = await this.repository.sessionHash(digest(token), tx);
      const now = this.now();
      if (
        !session ||
        session.revokedAt ||
        session.absoluteExpiresAt <= now ||
        !validUser(session.user)
      )
        return { status: 'invalid' } as const;
      if (session.user.mustChangePin) return { status: 'pin' } as const;
      if (session.rotatedAt) {
        const age = now.getTime() - session.rotatedAt.getTime();
        if (age >= 0 && age <= 5000) return { status: 'race' } as const;
        await this.repository.revokeFamily(tx, session.familyId, now);
        return { status: 'invalid' } as const;
      }
      const refresh = opaque();
      const next = await tx.authSession.create({
        data: {
          userId: session.userId,
          familyId: session.familyId,
          refreshTokenHash: digest(refresh),
          rotatedFromId: session.id,
          createdAt: now,
          lastSeenAt: now,
          absoluteExpiresAt: session.absoluteExpiresAt,
        },
      });
      await tx.authSession.update({
        where: { id: session.id },
        data: { rotatedAt: now, lastSeenAt: now },
      });
      return {
        status: 'ok',
        credentials: this.credentials(
          session.user,
          next.id,
          session.familyId,
          session.absoluteExpiresAt,
          refresh,
        ),
      } as const;
    });
    if (result.status === 'race')
      throw new HttpProblem(
        409,
        'REFRESH_ALREADY_ROTATED',
        'Renovación concurrente; reintentar con la cookie vigente',
      );
    if (result.status === 'pin')
      throw new HttpProblem(403, 'PIN_CHANGE_REQUIRED', 'Debes cambiar tu NIP');
    if (result.status !== 'ok') throw unauthorized();
    return result.credentials;
  }
  async logout(refresh: string | undefined, access: string | undefined) {
    let session = refresh ? await this.repository.sessionHash(digest(refresh)) : null;
    if (!session && access) {
      try {
        session = await this.repository.sessionId(BigInt(this.tokens.verifyAccess(access).sid));
      } catch {
        /* Logout idempotente. */
      }
    }
    if (session) {
      const found = session;
      await this.repository.transaction(async (tx) => {
        await this.repository.lockUser(tx, found.userId);
        await this.repository.revokeFamily(tx, found.familyId, this.now());
      });
    }
  }
  async me(principal: Principal) {
    const user = await this.repository.user(principal.userId);
    if (!validUser(user)) throw unauthorized();
    return userDto(user);
  }
  async changeSecret(
    principal: Principal,
    kind: 'pin' | 'password',
    current: string,
    next: string,
  ) {
    if ((kind === 'pin') !== (principal.accountType === 'CUSTOMER')) throw forbidden();
    const accepted = await this.repository.transaction(async (tx) => {
      await this.repository.lockUser(tx, principal.userId);
      const user = await this.repository.user(principal.userId, tx);
      const session = await this.repository.sessionId(principal.sessionId, tx);
      if (
        !validUser(user) ||
        !session ||
        session.revokedAt ||
        session.absoluteExpiresAt <= this.now()
      )
        return 'invalid' as const;
      const now = this.now();
      const counter = await this.repository.counter(
        tx,
        this.tokens.key(`account:${user.id}`),
        now,
        15 * 60000,
      );
      if (counter.blockedUntil && counter.blockedUntil > now) return 'blocked' as const;
      const stored = kind === 'pin' ? user.pinHash : user.passwordHash;
      let correct: boolean;
      try {
        correct = !!stored && (await verify(stored, current));
      } catch {
        correct = false;
      }
      if (!correct) {
        const count = counter.attemptCount + 1;
        await tx.authAttemptLimit.update({
          where: { id: counter.id },
          data: {
            attemptCount: count,
            blockedUntil: count >= 5 ? new Date(now.getTime() + 15 * 60000) : null,
          },
        });
        return count >= 5 ? ('blocked' as const) : ('invalid' as const);
      }
      const newHash = await hash(next, hashOptions);
      await tx.authAttemptLimit.update({
        where: { id: counter.id },
        data: { attemptCount: 0, blockedUntil: null, windowStartedAt: now },
      });
      await tx.user.update({
        where: { id: user.id },
        data:
          kind === 'pin' ? { pinHash: newHash, mustChangePin: false } : { passwordHash: newHash },
      });
      await tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: this.now() },
      });
      return 'ok' as const;
    });
    if (accepted === 'blocked') throw blocked();
    if (accepted !== 'ok') throw unauthorized();
  }
}
