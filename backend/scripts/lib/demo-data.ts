import type { PrismaClient } from '../../src/generated/prisma/client.js';

// Semilla aditiva: una repetición no modifica precios ni datos existentes.
export async function seedDemo(database: PrismaClient) {
  return database.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026, 1)`;
    for (const name of ['CLIENTE', 'CAJERO', 'PREPARACION', 'ADMINISTRADOR']) {
      await tx.role.upsert({ where: { name }, create: { name }, update: {} });
    }
    const category = async (name: string) => {
      const found = await tx.category.findMany({ where: { name } });
      if (found.length > 1) throw new Error('Categoría demo ambigua; revisar sin sobrescribir.');
      return found[0] ?? tx.category.create({ data: { name } });
    };
    const coffee = await category('Café (demo)');
    const drinks = await category('Bebidas (demo)');
    const food = await category('Alimentos (demo)');
    const group = async (name: string, pricingScope: 'GLOBAL' | 'PER_PRODUCT') => {
      const found = await tx.optionGroup.findMany({ where: { name } });
      if (found.length > 1 || (found[0] && found[0].pricingScope !== pricingScope))
        throw new Error('Grupo demo ambiguo.');
      return found[0] ?? tx.optionGroup.create({ data: { name, pricingScope } });
    };
    const sizes = await group('Tamaño (demo)', 'PER_PRODUCT');
    const milks = await group('Leche (demo)', 'GLOBAL');
    const flavors = await group('Sabor (demo)', 'GLOBAL');
    const extras = await group('Extras (demo)', 'GLOBAL');
    const value = async (groupId: bigint, name: string, price: bigint | null) => {
      const found = await tx.optionValue.findMany({ where: { optionGroupId: groupId, name } });
      if (found.length > 1) throw new Error('Opción demo ambigua.');
      return (
        found[0] ??
        tx.optionValue.create({
          data: { optionGroupId: groupId, name, globalSurchargeCents: price },
        })
      );
    };
    const small = await value(sizes.id, 'Chico', null);
    const medium = await value(sizes.id, 'Mediano', null);
    const large = await value(sizes.id, 'Grande', null);
    const whole = await value(milks.id, 'Entera', 0n);
    const almond = await value(milks.id, 'Almendra', 1000n);
    const vanilla = await value(flavors.id, 'Vainilla', 500n);
    const espresso = await value(extras.id, 'Shot extra', 1500n);
    const strawberry = await value(extras.id, 'Fresa extra', 1000n);
    const products = [];
    for (const [name, categoryId, price] of [
      ['Latte (demo)', coffee.id, 6500n],
      ['Americano (demo)', coffee.id, 4500n],
      ['Agua (demo)', drinks.id, 2000n],
      ['Crepa (demo)', food.id, 7500n],
    ] as const) {
      const found = await tx.product.findMany({ where: { name, categoryId } });
      if (found.length > 1) throw new Error('Producto demo ambiguo.');
      products.push(
        found[0] ??
          (await tx.product.create({ data: { name, categoryId, basePriceCents: price } })),
      );
    }
    const attach = async (
      productId: bigint,
      optionGroupId: bigint,
      minSelections: number,
      maxSelections: number,
      options: readonly (readonly [bigint, bigint | null])[],
    ) => {
      const assignment = await tx.productOptionGroup.upsert({
        where: { productId_optionGroupId: { productId, optionGroupId } },
        create: { productId, optionGroupId, minSelections, maxSelections },
        update: {},
      });
      for (const [optionValueId, surchargeOverrideCents] of options) {
        await tx.productOptionValue.upsert({
          where: {
            productOptionGroupId_optionValueId: {
              productOptionGroupId: assignment.id,
              optionValueId,
            },
          },
          create: { productOptionGroupId: assignment.id, optionValueId, surchargeOverrideCents },
          update: {},
        });
      }
    };
    const [latte, americano, , crepe] = products;
    if (!latte || !americano || !crepe) throw new Error('Semilla incompleta.');
    await attach(latte.id, sizes.id, 1, 1, [
      [small.id, 0n],
      [medium.id, 1000n],
      [large.id, 2000n],
    ]);
    await attach(americano.id, sizes.id, 1, 1, [
      [small.id, 0n],
      [medium.id, 500n],
      [large.id, 1000n],
    ]);
    await attach(latte.id, milks.id, 1, 1, [
      [whole.id, null],
      [almond.id, null],
    ]);
    for (const product of [latte, americano]) {
      await attach(product.id, flavors.id, 0, 1, [[vanilla.id, null]]);
      await attach(product.id, extras.id, 0, 1, [[espresso.id, null]]);
    }
    await attach(crepe.id, extras.id, 0, 1, [[strawberry.id, null]]);
    return { roles: 4, categories: 3, products: 4 };
  });
}
