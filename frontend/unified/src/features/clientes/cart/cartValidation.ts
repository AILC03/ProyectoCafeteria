import type { CartDraftItem } from '../../../shared/storage';
import { sumCents } from '../../../shared/utils/money';
import { fetchCatalogProductDetail, fetchCatalogProductOptions } from '../catalog/catalogApi';
import { calculateEstimatedCustomizationPrice, validateOptionSelections, type OptionSelectionMap } from '../catalog/customization';

export type CheckedCartLine = {
  item: CartDraftItem;
  name: string;
  estimateCents: string;
  issue: string | null;
  selectedLabels: string[];
  /** Fingerprint of current catalogue facts, never persisted or submitted. */
  catalogSignature: string | null;
};

/** Every check obtains current detail and option rules from the API; drafts are never authority. */
export async function checkCart(items: readonly CartDraftItem[], signal?: AbortSignal): Promise<CheckedCartLine[]> {
  return Promise.all(items.map(async (item) => {
    try {
      const [product, groups] = await Promise.all([
        fetchCatalogProductDetail(item.productId, signal),
        fetchCatalogProductOptions(item.productId, signal),
      ]);
      if (!product.isAvailable || product.id !== item.productId) {
        return { item, name: product.name, estimateCents: '0', issue: 'Producto agotado o cambiado.', selectedLabels: [], catalogSignature: null };
      }
      const selections: OptionSelectionMap = Object.fromEntries(groups.map((group) => [
        group.id, item.optionValueIds.filter((id) => group.values.some((value) => value.id === id)),
      ]));
      const validation = validateOptionSelections(groups, selections);
      const allIds = new Set(groups.flatMap((group) => group.values.map((value) => value.id)));
      const issue = !validation.valid || item.optionValueIds.some((id) => !allIds.has(id))
        || validation.selectedOptionValueIds.length !== item.optionValueIds.length
        ? 'Opciones no disponibles o requisitos cambiados. Elimina y vuelve a personalizar.' : null;
      const estimate = issue === null
        ? calculateEstimatedCustomizationPrice(product.basePriceCents, groups, selections, item.quantity) : null;
      const catalogSignature = JSON.stringify([product.name, product.basePriceCents, product.isAvailable,
        groups.map((group) => [group.id, group.minSelections, group.maxSelections,
          group.values.map((value) => [value.id, value.name, value.isAvailable, value.surchargeCents])])]);
      return { item, name: product.name, estimateCents: estimate?.totalPriceCents ?? '0',
        selectedLabels: estimate?.selectedLabels ?? [], issue, catalogSignature };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { item, name: `Producto ${item.productId}`, estimateCents: '0', issue: 'No se pudo verificar este producto. Reintenta la comprobación.', selectedLabels: [], catalogSignature: null };
    }
  }));
}

export function cartEstimate(lines: readonly CheckedCartLine[]): string {
  return sumCents(lines.map((line) => line.estimateCents));
}
