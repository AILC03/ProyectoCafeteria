import type { Prisma } from '../../generated/prisma/client.js';
import { z } from 'zod';
import { HttpProblem, notFound } from '../../shared/http/problem.js';
import type { Principal } from '../auth/auth.types.js';
import { unauthorized, forbidden } from '../auth/auth.tokens.js';
import { AdminRepository } from './admin.repository.js';
import * as input from './admin.validation.js';

type Tx = Prisma.TransactionClient;
export const conflict = (detail = 'La operación dejaría una configuración inválida') =>
  new HttpProblem(409, 'CATALOG_CONFLICT', 'Conflicto de catálogo', detail);
export class AdminService {
  constructor(
    readonly repository: AdminRepository,
    readonly now: () => Date = () => new Date(),
  ) {}
  async write<T>(actor: Principal, action: string, fn: (tx: Tx) => Promise<T>, cashier = false) {
    return this.repository.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id=${actor.userId} FOR SHARE`;
        const session = await tx.authSession.findUnique({
          where: { id: actor.sessionId },
          include: { user: { include: { role: true } } },
        });
        if (
          !session ||
          session.revokedAt ||
          session.absoluteExpiresAt <= this.now() ||
          !session.user.isActive ||
          session.user.id !== actor.userId
        )
          throw unauthorized();
        if (
          session.user.mustChangePin ||
          !(cashier ? ['CAJERO', 'ADMINISTRADOR'] : ['ADMINISTRADOR']).includes(
            session.user.role.name,
          )
        )
          throw forbidden();
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026,1)`;
        const result = await fn(tx);
        await tx.auditEvent.create({
          data: { actorId: actor.userId, action, reason: 'Modificación autorizada de catálogo' },
        });
        return result;
      },
      { timeout: 15000 },
    );
  }
  private async category(tx: Tx, id: bigint) {
    const row = await tx.category.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw notFound();
    return row;
  }
  private async product(tx: Tx, id: bigint) {
    const row = await tx.product.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw notFound();
    return row;
  }
  private async group(tx: Tx, id: bigint) {
    const row = await tx.optionGroup.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw notFound();
    return row;
  }
  createCategory(actor: Principal, data: z.infer<typeof input.categoryCreate>) {
    return this.write(actor, 'CATEGORY_CREATED', (tx) => tx.category.create({ data }));
  }
  updateCategory(actor: Principal, id: bigint, data: z.infer<typeof input.categoryPatch>) {
    return this.write(actor, 'CATEGORY_UPDATED', async (tx) => {
      await this.category(tx, id);
      return tx.category.update({ where: { id }, data });
    });
  }
  deleteCategory(actor: Principal, id: bigint) {
    return this.write(actor, 'CATEGORY_RETIRED', async (tx) => {
      await this.category(tx, id);
      if (await tx.product.count({ where: { categoryId: id } }))
        throw conflict('La categoría conserva productos asociados, incluidos los retirados');
      return tx.category.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
    });
  }
  createProduct(actor: Principal, data: z.infer<typeof input.productCreate>) {
    return this.write(actor, 'PRODUCT_CREATED', async (tx) => {
      const category = await this.category(tx, data.categoryId);
      if (!category.isActive) throw conflict('Categoría inactiva');
      return tx.product.create({ data });
    });
  }
  updateProduct(actor: Principal, id: bigint, data: z.infer<typeof input.productPatch>) {
    return this.write(actor, 'PRODUCT_UPDATED', async (tx) => {
      await this.product(tx, id);
      if (data.categoryId) {
        const category = await this.category(tx, data.categoryId);
        if (!category.isActive) throw conflict('Categoría inactiva');
      }
      return tx.product.update({ where: { id }, data });
    });
  }
  deleteProduct(actor: Principal, id: bigint) {
    return this.write(actor, 'PRODUCT_RETIRED', async (tx) => {
      await this.product(tx, id);
      return tx.product.update({
        where: { id },
        data: { deletedAt: new Date(), isAvailable: false },
      });
    });
  }
  availability(actor: Principal, id: bigint, isAvailable: boolean) {
    return this.write(
      actor,
      'PRODUCT_AVAILABILITY',
      async (tx) => {
        await this.product(tx, id);
        return tx.product.update({ where: { id }, data: { isAvailable } });
      },
      true,
    );
  }
  createGroup(actor: Principal, data: z.infer<typeof input.groupCreate>) {
    return this.write(actor, 'OPTION_GROUP_CREATED', (tx) => tx.optionGroup.create({ data }));
  }
  updateGroup(actor: Principal, id: bigint, data: z.infer<typeof input.groupPatch>) {
    return this.write(actor, 'OPTION_GROUP_UPDATED', async (tx) => {
      const group = await this.group(tx, id);
      if (
        data.pricingScope &&
        data.pricingScope !== group.pricingScope &&
        ((await tx.optionValue.count({ where: { optionGroupId: id } })) ||
          (await tx.productOptionGroup.count({ where: { optionGroupId: id } })))
      )
        throw conflict(
          'Un grupo con valores o asignaciones conserva su alcance; crea un grupo nuevo',
        );
      return tx.optionGroup.update({ where: { id }, data });
    });
  }
  deleteGroup(actor: Principal, id: bigint) {
    return this.write(actor, 'OPTION_GROUP_RETIRED', async (tx) => {
      await this.group(tx, id);
      if (
        await tx.productOptionGroup.count({
          where: { optionGroupId: id, product: { deletedAt: null } },
        })
      )
        throw conflict('Desasigna el grupo de productos activos antes de retirarlo');
      return tx.optionGroup.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
  private price(scope: 'GLOBAL' | 'PER_PRODUCT', price: bigint | null | undefined) {
    if ((scope === 'GLOBAL' && price == null) || (scope === 'PER_PRODUCT' && price != null))
      throw conflict('El precio no corresponde al alcance del grupo');
  }
  createValue(actor: Principal, groupId: bigint, data: z.infer<typeof input.valueCreate>) {
    return this.write(actor, 'OPTION_VALUE_CREATED', async (tx) => {
      const group = await this.group(tx, groupId);
      this.price(group.pricingScope, data.globalSurchargeCents);
      return tx.optionValue.create({
        data: {
          ...data,
          optionGroupId: groupId,
          globalSurchargeCents: data.globalSurchargeCents ?? null,
        },
      });
    });
  }
  private async validateMinimums(tx: Tx, optionValueId: bigint) {
    const assignments = await tx.productOptionValue.findMany({
      where: { optionValueId },
      include: { productOptionGroup: { include: { product: true, optionGroup: true } } },
    });
    for (const link of assignments) {
      const assignment = link.productOptionGroup;
      if (assignment.product.deletedAt || assignment.optionGroup.deletedAt) continue;
      const count = await tx.productOptionValue.count({
        where: {
          productOptionGroupId: assignment.id,
          optionValue: { deletedAt: null, isAvailable: true },
        },
      });
      if (count < assignment.minSelections)
        throw conflict('El cambio dejaría un grupo obligatorio sin opciones suficientes');
    }
  }
  updateValue(actor: Principal, id: bigint, data: z.infer<typeof input.valuePatch>) {
    return this.write(actor, 'OPTION_VALUE_UPDATED', async (tx) => {
      const value = await tx.optionValue.findFirst({
        where: { id, deletedAt: null },
        include: { optionGroup: true },
      });
      if (!value || value.optionGroup.deletedAt) throw notFound();
      this.price(
        value.optionGroup.pricingScope,
        data.globalSurchargeCents === undefined
          ? value.globalSurchargeCents
          : data.globalSurchargeCents,
      );
      const result = await tx.optionValue.update({ where: { id }, data });
      await this.validateMinimums(tx, id);
      return result;
    });
  }
  deleteValue(actor: Principal, id: bigint) {
    return this.write(actor, 'OPTION_VALUE_RETIRED', async (tx) => {
      if (!(await tx.optionValue.findFirst({ where: { id, deletedAt: null } }))) throw notFound();
      const result = await tx.optionValue.update({
        where: { id },
        data: { deletedAt: new Date(), isAvailable: false },
      });
      await this.validateMinimums(tx, id);
      return result;
    });
  }
  async getConfiguration(id: bigint) {
    const product = await this.repository.db.product.findUnique({ where: { id } });
    if (!product) throw notFound();
    const groups = await this.repository.db.productOptionGroup.findMany({
      where: { productId: id },
      include: { product_option_value_productOptionGroupId: { orderBy: { id: 'asc' } } },
      orderBy: { id: 'asc' },
    });
    return {
      groups: groups.map((group) => ({
        groupId: group.optionGroupId,
        minSelections: group.minSelections,
        maxSelections: group.maxSelections,
        values: group.product_option_value_productOptionGroupId.map((value) => ({
          valueId: value.optionValueId,
          surchargeOverrideCents: value.surchargeOverrideCents,
        })),
      })),
    };
  }
  setConfiguration(actor: Principal, id: bigint, data: z.infer<typeof input.configuration>) {
    return this.write(actor, 'PRODUCT_CONFIGURATION', async (tx) => {
      await this.product(tx, id);
      const groupIds = data.groups.map((group) => group.groupId.toString());
      if (new Set(groupIds).size !== groupIds.length) throw conflict('Grupos repetidos');
      for (const entry of data.groups) {
        const group = await this.group(tx, entry.groupId);
        if (entry.minSelections > entry.maxSelections) throw conflict('Límites inválidos');
        const valueIds = entry.values.map((value) => value.valueId);
        if (new Set(valueIds.map(String)).size !== valueIds.length)
          throw conflict('Opciones repetidas');
        const values = await tx.optionValue.findMany({
          where: { id: { in: valueIds }, optionGroupId: group.id, deletedAt: null },
        });
        if (
          values.length !== valueIds.length ||
          values.filter((value) => value.isAvailable).length < entry.minSelections ||
          entry.maxSelections > values.length
        )
          throw conflict('Opciones ajenas, retiradas o insuficientes');
        for (const value of entry.values) {
          const stored = values.find((row) => row.id === value.valueId)!;
          this.price(group.pricingScope, stored.globalSurchargeCents);
          if (
            (group.pricingScope === 'GLOBAL' && value.surchargeOverrideCents != null) ||
            (group.pricingScope === 'PER_PRODUCT' && value.surchargeOverrideCents == null)
          )
            throw conflict('Recargo incompatible con el grupo');
        }
        const assignment = await tx.productOptionGroup.upsert({
          where: { productId_optionGroupId: { productId: id, optionGroupId: group.id } },
          create: {
            productId: id,
            optionGroupId: group.id,
            minSelections: entry.minSelections,
            maxSelections: entry.maxSelections,
          },
          update: { minSelections: entry.minSelections, maxSelections: entry.maxSelections },
        });
        await tx.productOptionValue.deleteMany({ where: { productOptionGroupId: assignment.id } });
        if (entry.values.length)
          await tx.productOptionValue.createMany({
            data: entry.values.map((value) => ({
              productOptionGroupId: assignment.id,
              optionValueId: value.valueId,
              surchargeOverrideCents: value.surchargeOverrideCents ?? null,
            })),
          });
      }
      const obsolete = await tx.productOptionGroup.findMany({
        where: {
          productId: id,
          optionGroupId: { notIn: data.groups.map((group) => group.groupId) },
        },
      });
      await tx.productOptionValue.deleteMany({
        where: { productOptionGroupId: { in: obsolete.map((group) => group.id) } },
      });
      await tx.productOptionGroup.deleteMany({
        where: { id: { in: obsolete.map((group) => group.id) } },
      });
      return data;
    });
  }
}
