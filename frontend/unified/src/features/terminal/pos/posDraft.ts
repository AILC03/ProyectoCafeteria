import { multiplyCents, sumCents } from '../../../shared/utils/money';
import type { ConfirmedCustomization } from '../../clientes/catalog/ProductCustomizationDialog';
import type { PosLineInput } from './posApi';

export const MIN_POS_QUANTITY = 1;
export const MAX_POS_QUANTITY = 99;

export type DraftLine = PosLineInput & {
  localId: string;
  productName: string;
  selectedLabels: readonly string[];
  unitEstimateCents: string;
  label: string;
  estimateCents: string;
};

let sequence = 0;

function nextLocalId(): string {
  sequence += 1;
  return `pos-line-${sequence}`;
}

export function formatDraftLineLabel(
  quantity: number,
  productName: string,
  selectedLabels: readonly string[],
): string {
  const options = selectedLabels.length > 0 ? ` (${selectedLabels.join(', ')})` : '';
  return `${quantity} × ${productName}${options}`;
}

function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return MIN_POS_QUANTITY;
  return Math.min(MAX_POS_QUANTITY, Math.max(MIN_POS_QUANTITY, Math.trunc(quantity)));
}

/** Creates a POS draft line while keeping quantity, label and estimate consistent. */
export function createDraftLine(summary: ConfirmedCustomization): DraftLine {
  const quantity = clampQuantity(summary.quantity);
  const estimatedTotal = BigInt(summary.estimatedTotalCents);
  const unitEstimateCents = quantity > 0 ? (estimatedTotal / BigInt(quantity)).toString() : '0';
  return {
    localId: nextLocalId(),
    productId: summary.productId,
    quantity,
    optionValueIds: summary.optionValueIds,
    productName: summary.productName,
    selectedLabels: summary.selectedLabels,
    unitEstimateCents,
    label: formatDraftLineLabel(quantity, summary.productName, summary.selectedLabels),
    estimateCents: summary.estimatedTotalCents,
  };
}

/** Changes only the quantity of a draft line and recalculates its label and estimate. */
export function updateDraftLineQuantity(line: DraftLine, quantity: number): DraftLine {
  const nextQuantity = clampQuantity(quantity);
  if (nextQuantity === line.quantity) return line;
  return {
    ...line,
    quantity: nextQuantity,
    label: formatDraftLineLabel(nextQuantity, line.productName, line.selectedLabels),
    estimateCents: multiplyCents(line.unitEstimateCents, nextQuantity),
  };
}

export function sumDraftLines(lines: readonly DraftLine[]): string {
  return sumCents(lines.map((line) => line.estimateCents));
}

/** Snapshot payload: only server-approved fields leave the client. */
export function toPosLineInput(line: DraftLine): PosLineInput {
  return {
    productId: line.productId,
    quantity: line.quantity,
    ...(line.optionValueIds !== undefined ? { optionValueIds: line.optionValueIds } : {}),
  };
}
