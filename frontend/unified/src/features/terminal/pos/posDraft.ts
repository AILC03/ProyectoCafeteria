import { multiplyCents, sumCents } from '../../../shared/utils/money';
import type { PosDraftLine } from '../../../shared/storage';
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

/** Identical product and option set; option order never creates a new line. */
function draftLineKey(line: Pick<DraftLine, 'productId' | 'optionValueIds'>): string {
  const options = [...new Set(line.optionValueIds ?? [])].sort((a, b) => a.localeCompare(b));
  return `${line.productId}\u0000${options.join('\u0001')}`;
}

/** Adds a line, summing quantity when product and options are identical. */
export function appendDraftLine(lines: readonly DraftLine[], line: DraftLine): DraftLine[] {
  const key = draftLineKey(line);
  const index = lines.findIndex((existing) => draftLineKey(existing) === key);
  if (index < 0) return [...lines, line];
  const existing = lines[index]!;
  const quantity = clampQuantity(existing.quantity + line.quantity);
  const merged: DraftLine = {
    ...existing,
    quantity,
    unitEstimateCents: line.unitEstimateCents,
    label: formatDraftLineLabel(quantity, line.productName, line.selectedLabels),
    estimateCents: multiplyCents(line.unitEstimateCents, quantity),
  };
  return lines.map((item, position) => (position === index ? merged : item));
}

/** Rebuilds persisted draft lines with fresh local IDs and consistent derived fields. */
export function hydrateDraftLines(stored: readonly PosDraftLine[]): DraftLine[] {
  return stored.map((line) => {
    const quantity = clampQuantity(line.quantity);
    return {
      localId: nextLocalId(),
      productId: line.productId,
      quantity,
      optionValueIds: [...line.optionValueIds],
      productName: line.productName,
      selectedLabels: [...line.selectedLabels],
      unitEstimateCents: line.unitEstimateCents,
      label: formatDraftLineLabel(quantity, line.productName, line.selectedLabels),
      estimateCents: multiplyCents(line.unitEstimateCents, quantity),
    };
  });
}

export function toPosDraftLines(lines: readonly DraftLine[]): PosDraftLine[] {
  return lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    optionValueIds: [...(line.optionValueIds ?? [])],
    productName: line.productName,
    selectedLabels: [...line.selectedLabels],
    unitEstimateCents: line.unitEstimateCents,
  }));
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
