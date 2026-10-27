import { HttpProblem } from '../../shared/http/problem.js';
import type { OrderInput } from './orders.validation.js';

export const orderConflict = (detail: string) =>
  new HttpProblem(409, 'ORDER_CONFLICT', 'Conflicto de orden', detail);
export type CatalogProduct = {
  id: bigint;
  name: string;
  basePriceCents: bigint;
  isAvailable: boolean;
  deletedAt: Date | null;
  category: { isActive: boolean; deletedAt: Date | null };
  product_option_group_productId: {
    minSelections: number;
    maxSelections: number;
    optionGroup: {
      id: bigint;
      name: string;
      pricingScope: 'GLOBAL' | 'PER_PRODUCT';
      deletedAt: Date | null;
    };
    product_option_value_productOptionGroupId: {
      surchargeOverrideCents: bigint | null;
      optionValue: {
        id: bigint;
        name: string;
        optionGroupId: bigint;
        globalSurchargeCents: bigint | null;
        isAvailable: boolean;
        deletedAt: Date | null;
      };
    }[];
  }[];
};
export type PricedItem = {
  productId: bigint;
  productNameSnapshot: string;
  basePriceCentsSnapshot: bigint;
  unitPriceCents: bigint;
  quantity: number;
  lineTotalCents: bigint;
  options: {
    optionValueId: bigint;
    groupNameSnapshot: string;
    optionNameSnapshot: string;
    surchargeCentsSnapshot: bigint;
  }[];
};
export function priceOrder(input: OrderInput, products: CatalogProduct[]) {
  let totalCents = 0n;
  const items: PricedItem[] = input.items.map((line) => {
    const product = products.find((candidate) => candidate.id.toString() === line.productId);
    if (
      !product ||
      product.deletedAt ||
      !product.isAvailable ||
      !product.category.isActive ||
      product.category.deletedAt
    )
      throw orderConflict('Producto o categoría no disponible');
    const selected = new Set(line.optionValueIds);
    const options: PricedItem['options'] = [];
    for (const assignment of product.product_option_group_productId) {
      const group = assignment.optionGroup;
      if (group.deletedAt) continue;
      let count = 0;
      for (const link of assignment.product_option_value_productOptionGroupId) {
        const value = link.optionValue;
        if (!selected.has(value.id.toString())) continue;
        if (value.deletedAt || !value.isAvailable || value.optionGroupId !== group.id)
          throw orderConflict('Opción no disponible o ajena al grupo');
        const surcharge =
          group.pricingScope === 'GLOBAL'
            ? value.globalSurchargeCents
            : link.surchargeOverrideCents;
        if (
          surcharge === null ||
          surcharge < 0n ||
          (group.pricingScope === 'GLOBAL'
            ? link.surchargeOverrideCents !== null
            : value.globalSurchargeCents !== null)
        )
          throw orderConflict('Configuración de precios incompatible');
        options.push({
          optionValueId: value.id,
          groupNameSnapshot: group.name,
          optionNameSnapshot: value.name,
          surchargeCentsSnapshot: surcharge,
        });
        count++;
      }
      if (count < assignment.minSelections || count > assignment.maxSelections)
        throw orderConflict('Selección fuera de los límites del grupo');
    }
    if (options.length !== selected.size) throw orderConflict('Opción no asignada al producto');
    if (product.basePriceCents < 0n) throw orderConflict('Precio inválido');
    const unitPriceCents =
      product.basePriceCents +
      options.reduce((sum, option) => sum + option.surchargeCentsSnapshot, 0n);
    const lineTotalCents = unitPriceCents * BigInt(line.quantity);
    totalCents += lineTotalCents;
    if (totalCents > 9999900n) throw orderConflict('Total supera 9999900 centavos');
    return {
      productId: product.id,
      productNameSnapshot: product.name,
      basePriceCentsSnapshot: product.basePriceCents,
      unitPriceCents,
      quantity: line.quantity,
      lineTotalCents,
      options,
    };
  });
  return { items, totalCents };
}
