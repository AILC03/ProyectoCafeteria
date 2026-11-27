import { describe, expect, it } from 'vitest';
import type { ConfirmedCustomization } from '../../clientes/catalog/ProductCustomizationDialog';
import {
  appendDraftLine,
  createDraftLine,
  formatDraftLineLabel,
  hydrateDraftLines,
  sumDraftLines,
  toPosDraftLines,
  toPosLineInput,
  updateDraftLineQuantity,
} from './posDraft';

const summary: ConfirmedCustomization = {
  productId: '10',
  productName: 'Latte',
  quantity: 2,
  optionValueIds: ['5', '8'],
  selectedLabels: ['Chico', 'Vainilla'],
  estimatedTotalCents: '14000',
};

describe('POS draft lines', () => {
  it('creates a line with consistent quantity, label and estimate', () => {
    const line = createDraftLine(summary);
    expect(line.quantity).toBe(2);
    expect(line.label).toBe('2 × Latte (Chico, Vainilla)');
    expect(line.estimateCents).toBe('14000');
    expect(line.unitEstimateCents).toBe('7000');
    expect(line.optionValueIds).toEqual(['5', '8']);
  });

  it('updates the quantity and recalculates label and estimate together', () => {
    const line = createDraftLine(summary);
    const increased = updateDraftLineQuantity(line, 4);
    expect(increased.quantity).toBe(4);
    expect(increased.label).toBe('4 × Latte (Chico, Vainilla)');
    expect(increased.estimateCents).toBe('28000');
    expect(increased.unitEstimateCents).toBe('7000');

    const decreased = updateDraftLineQuantity(increased, 1);
    expect(decreased.quantity).toBe(1);
    expect(decreased.label).toBe('1 × Latte (Chico, Vainilla)');
    expect(decreased.estimateCents).toBe('7000');
  });

  it('clamps quantities to the API-supported 1..99 range', () => {
    const line = createDraftLine(summary);
    expect(updateDraftLineQuantity(line, 0).quantity).toBe(1);
    expect(updateDraftLineQuantity(line, -5).quantity).toBe(1);
    expect(updateDraftLineQuantity(line, 500).quantity).toBe(99);
  });

  it('keeps visual fields out of the snapshot payload', () => {
    const line = createDraftLine(summary);
    expect(toPosLineInput(line)).toEqual({
      productId: '10',
      quantity: 2,
      optionValueIds: ['5', '8'],
    });
  });

  it('merges identical product and options, ignoring option order', () => {
    const first = createDraftLine(summary);
    const same = createDraftLine({ ...summary, quantity: 1, estimatedTotalCents: '7000', optionValueIds: ['8', '5'] });
    const merged = appendDraftLine([first], same);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.quantity).toBe(3);
    expect(merged[0]!.label).toBe('3 × Latte (Chico, Vainilla)');
    expect(merged[0]!.estimateCents).toBe('21000');
    expect(merged[0]!.localId).toBe(first.localId);
  });

  it('keeps different options as separate lines and caps merged quantity at 99', () => {
    const first = createDraftLine({ ...summary, quantity: 1, estimatedTotalCents: '7000' });
    const different = createDraftLine({
      ...summary, quantity: 1, optionValueIds: ['5'], selectedLabels: ['Chico'], estimatedTotalCents: '7000',
    });
    expect(appendDraftLine([first], different)).toHaveLength(2);
    const many = createDraftLine({ ...summary, quantity: 99, estimatedTotalCents: '693000' });
    expect(appendDraftLine([first], many)[0]!.quantity).toBe(99);
  });

  it('hydrates persisted lines with fresh ids and derived estimates', () => {
    const line = createDraftLine(summary);
    const stored = toPosDraftLines([line]);
    const [restored] = hydrateDraftLines(stored);
    expect(restored!.localId).not.toBe(line.localId);
    expect(restored!.label).toBe(line.label);
    expect(restored!.estimateCents).toBe(line.estimateCents);
    expect(stored[0]).toEqual({
      productId: '10', quantity: 2, optionValueIds: ['5', '8'],
      productName: 'Latte', selectedLabels: ['Chico', 'Vainilla'], unitEstimateCents: '7000',
    });
  });

  it('sums line estimates and formats labels without options', () => {
    const first = createDraftLine(summary);
    const second = createDraftLine({ ...summary, productName: 'Agua', quantity: 1, selectedLabels: [], estimatedTotalCents: '2000' });
    expect(sumDraftLines([first, second])).toBe('16000');
    expect(formatDraftLineLabel(1, 'Agua', [])).toBe('1 × Agua');
  });
});
