import { HttpProblem } from '../../shared/http/problem.js';
import { priceOrder, type CatalogProduct } from '../orders/orders.pricing.js';
import { mobileOrder } from '../orders/orders.validation.js';

export type RepeatSource = {
  id: bigint;
  items: {
    productId: bigint;
    productName: string;
    unitPriceCents: bigint;
    quantity: number;
    options: { optionValueId: bigint; optionName: string }[];
  }[];
};
type WarningCode =
  | 'PRODUCT_UNAVAILABLE'
  | 'OPTION_UNAVAILABLE'
  | 'SELECTION_INVALID'
  | 'PRICE_CHANGED'
  | 'PRODUCT_CHANGED'
  | 'OPTION_CHANGED'
  | 'TOTAL_LIMIT_EXCEEDED';
type Warning = {
  line: number | null;
  code: WarningCode;
  blocking: boolean;
  optionValueId: string | null;
};

export function repeatSelection(source: RepeatSource, products: CatalogProduct[]) {
  const warnings: Warning[] = [];
  const warn = (
    line: number | null,
    code: WarningCode,
    blocking = true,
    optionValueId: string | null = null,
  ) => warnings.push({ line, code, blocking, optionValueId });
  let total = 0n;
  const selection = source.items.map((item) => ({
    productId: item.productId.toString(),
    quantity: item.quantity,
    optionValueIds: item.options.map((option) => option.optionValueId.toString()),
  }));
  if (!mobileOrder.safeParse({ paymentMethod: 'CASH', items: selection }).success)
    warn(null, 'SELECTION_INVALID');
  const items = source.items.map((old, index) => {
    const line = index + 1,
      input = selection[index]!;
    const product = products.find((product) => product.id === old.productId);
    const item = {
      ...input,
      productName: old.productName,
      currentUnitPriceCents: null as bigint | null,
      currentLineTotalCents: null as bigint | null,
    };
    if (
      !product ||
      product.deletedAt ||
      !product.isAvailable ||
      product.category.deletedAt ||
      !product.category.isActive
    ) {
      warn(line, 'PRODUCT_UNAVAILABLE');
      return item;
    }
    item.productName = product.name;
    if (product.name !== old.productName) warn(line, 'PRODUCT_CHANGED', false);
    const available = product.product_option_group_productId.flatMap((assignment) =>
      assignment.optionGroup.deletedAt
        ? []
        : assignment.product_option_value_productOptionGroupId
            .filter(
              (link) =>
                !link.optionValue.deletedAt &&
                link.optionValue.isAvailable &&
                link.optionValue.optionGroupId === assignment.optionGroup.id,
            )
            .map((link) => link.optionValue),
    );
    let missing = false;
    for (const selected of old.options) {
      const current = available.find((option) => option.id === selected.optionValueId);
      if (!current) {
        warn(line, 'OPTION_UNAVAILABLE', true, selected.optionValueId.toString());
        missing = true;
      } else if (current.name !== selected.optionName)
        warn(line, 'OPTION_CHANGED', false, current.id.toString());
    }
    if (missing) return item;
    try {
      const priced = priceOrder({ paymentMethod: 'CASH', items: [input] }, [product]).items[0]!;
      item.currentUnitPriceCents = priced.unitPriceCents;
      item.currentLineTotalCents = priced.lineTotalCents;
      total += priced.lineTotalCents;
      if (priced.unitPriceCents !== old.unitPriceCents) warn(line, 'PRICE_CHANGED', false);
    } catch (error) {
      if (!(error instanceof HttpProblem) || error.code !== 'ORDER_CONFLICT') throw error;
      warn(line, 'SELECTION_INVALID');
    }
    return item;
  });
  if (total > 9999900n) warn(null, 'TOTAL_LIMIT_EXCEEDED');
  const canCreateOrder = !warnings.some((warning) => warning.blocking);
  return {
    sourceOrderId: source.id,
    canCreateOrder,
    items,
    warnings,
    totalCents: canCreateOrder ? total : null,
  };
}
