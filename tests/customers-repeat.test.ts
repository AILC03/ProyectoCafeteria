import { describe, it, expect } from 'vitest';
import { repeatSelection, type RepeatSource } from '../src/modules/customers/customers.repeat.js';
import type { CatalogProduct } from '../src/modules/orders/orders.pricing.js';

const product = (): CatalogProduct => ({
  id: 9007199254740993n,
  name: 'Café',
  basePriceCents: 100n,
  isAvailable: true,
  deletedAt: null,
  category: { isActive: true, deletedAt: null },
  product_option_group_productId: [
    {
      minSelections: 1,
      maxSelections: 1,
      optionGroup: { id: 1n, name: 'Tamaño', pricingScope: 'PER_PRODUCT', deletedAt: null },
      product_option_value_productOptionGroupId: [
        {
          surchargeOverrideCents: 50n,
          optionValue: {
            id: 2n,
            name: 'Grande',
            optionGroupId: 1n,
            globalSurchargeCents: null,
            isAvailable: true,
            deletedAt: null,
          },
        },
      ],
    },
  ],
});
const source = (): RepeatSource => ({
  id: 9007199254740995n,
  items: [
    {
      productId: 9007199254740993n,
      productName: 'Café',
      unitPriceCents: 150n,
      quantity: 2,
      options: [{ optionValueId: 2n, optionName: 'Grande' }],
    },
  ],
});
describe('FAV-01: repetición pura con precios actuales y avisos', () => {
  it('selección válida sin cambios, IDs/centavos exactos y sin mutar fuente', () => {
    const old = source(),
      copy = structuredClone(old),
      result = repeatSelection(old, [product()]);
    expect(result.canCreateOrder).toBe(true);
    expect(result.totalCents).toBe(300n);
    expect(result.items[0]!.productId).toBe('9007199254740993');
    expect(result.warnings).toEqual([]);
    expect(old).toEqual(copy);
  });
  it('avisa precio y nombres actuales sin bloquear; resuelve GLOBAL y PER_PRODUCT', () => {
    const current = product();
    current.name = 'Nombre actual';
    current.basePriceCents = 200n;
    const assignment = current.product_option_group_productId[0]!;
    assignment.optionGroup.pricingScope = 'GLOBAL';
    const link = assignment.product_option_value_productOptionGroupId[0]!;
    link.surchargeOverrideCents = null;
    link.optionValue.globalSurchargeCents = 75n;
    link.optionValue.name = 'Etiqueta actual';
    const result = repeatSelection(source(), [current]);
    expect(result.canCreateOrder).toBe(true);
    expect(result.totalCents).toBe(550n);
    expect(result.warnings.map((warning) => warning.code).sort()).toEqual([
      'OPTION_CHANGED',
      'PRICE_CHANGED',
      'PRODUCT_CHANGED',
    ]);
    expect(result.warnings.every((warning) => !warning.blocking)).toBe(true);
  });
  it.each(['absent', 'deleted', 'unavailable', 'category'] as const)(
    'bloquea producto %s sin eliminar su selección',
    (kind) => {
      const current = product();
      if (kind === 'deleted') current.deletedAt = new Date();
      if (kind === 'unavailable') current.isAvailable = false;
      if (kind === 'category') current.category.isActive = false;
      const result = repeatSelection(source(), kind === 'absent' ? [] : [current]);
      expect(result.canCreateOrder).toBe(false);
      expect(result.totalCents).toBeNull();
      expect(result.warnings[0]!.code).toBe('PRODUCT_UNAVAILABLE');
      expect(result.items[0]!.optionValueIds).toEqual(['2']);
      expect(result.items[0]!.currentUnitPriceCents).toBeNull();
    },
  );
  it.each(['deleted', 'unavailable', 'unassigned', 'group'] as const)(
    'opción %s avisa sin quitarla ni cobrar parcial',
    (kind) => {
      const current = product(),
        assignment = current.product_option_group_productId[0]!;
      if (kind === 'deleted')
        assignment.product_option_value_productOptionGroupId[0]!.optionValue.deletedAt = new Date();
      if (kind === 'unavailable')
        assignment.product_option_value_productOptionGroupId[0]!.optionValue.isAvailable = false;
      if (kind === 'unassigned') assignment.product_option_value_productOptionGroupId = [];
      if (kind === 'group') assignment.optionGroup.deletedAt = new Date();
      const result = repeatSelection(source(), [current]);
      expect(result.canCreateOrder).toBe(false);
      expect(result.totalCents).toBeNull();
      expect(result.items[0]!.optionValueIds).toEqual(['2']);
      expect(result.warnings).toContainEqual({
        line: 1,
        code: 'OPTION_UNAVAILABLE',
        blocking: true,
        optionValueId: '2',
      });
    },
  );
  it('min/max y límite de 50 líneas impiden confirmar selección inválida', () => {
    const current = product();
    current.product_option_group_productId[0]!.minSelections = 2;
    expect(
      repeatSelection(source(), [current]).warnings.some(
        (warning) => warning.code === 'SELECTION_INVALID',
      ),
    ).toBe(true);
    const many = source();
    many.items = Array.from({ length: 51 }, () => many.items[0]!);
    expect(repeatSelection(many, [product()]).canCreateOrder).toBe(false);
  });
  it('máximo monetario exacto y total acumulado excesivo sin Number', () => {
    const current = product(),
      old = source();
    old.items[0]!.quantity = 1;
    current.basePriceCents = 9999850n;
    expect(repeatSelection(old, [current]).totalCents).toBe(9999900n);
    current.basePriceCents = 4999950n;
    old.items = [old.items[0]!, structuredClone(old.items[0]!)];
    const result = repeatSelection(old, [current]);
    expect(result.totalCents).toBeNull();
    expect(result.canCreateOrder).toBe(false);
    expect(result.warnings).toContainEqual({
      line: null,
      code: 'TOTAL_LIMIT_EXCEEDED',
      blocking: true,
      optionValueId: null,
    });
  });
});
