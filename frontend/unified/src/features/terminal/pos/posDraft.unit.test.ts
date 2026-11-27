import { describe, expect, it } from 'vitest';
import type { ConfirmedCustomization } from '../../clientes/catalog/ProductCustomizationDialog';
import {
  createDraftLine,
  formatDraftLineLabel,
  sumDraftLines,
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

  it('sums line estimates and formats labels without options', () => {
    const first = createDraftLine(summary);
    const second = createDraftLine({ ...summary, productName: 'Agua', quantity: 1, selectedLabels: [], estimatedTotalCents: '2000' });
    expect(sumDraftLines([first, second])).toBe('16000');
    expect(formatDraftLineLabel(1, 'Agua', [])).toBe('1 × Agua');
  });
});
