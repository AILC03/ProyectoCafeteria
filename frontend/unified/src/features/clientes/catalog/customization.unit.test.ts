import { describe, expect, it } from 'vitest';
import type { CatalogOptionGroup } from './catalogApi';
import {
  calculateEstimatedCustomizationPrice,
  createInitialSelections,
  toggleOptionValue,
  validateOptionSelections,
} from './customization';

const groups: CatalogOptionGroup[] = [
  {
    id: 'g-size',
    name: 'Tamaño',
    pricingScope: 'PER_PRODUCT',
    minSelections: 1,
    maxSelections: 1,
    values: [
      { id: 'v-small', name: 'Chico', surchargeCents: '0', isAvailable: false },
      { id: 'v-med', name: 'Mediano', surchargeCents: '500', isAvailable: true },
      { id: 'v-large', name: 'Grande', surchargeCents: '1200', isAvailable: true },
    ],
  },
  {
    id: 'g-extras',
    name: 'Extras',
    pricingScope: 'GLOBAL',
    minSelections: 0,
    maxSelections: 2,
    values: [
      { id: 'v-shot', name: 'Shot extra', surchargeCents: '1000', isAvailable: true },
      { id: 'v-oat', name: 'Leche de avena', surchargeCents: '1200', isAvailable: true },
      { id: 'v-vanilla', name: 'Vainilla', surchargeCents: '800', isAvailable: true },
      { id: 'v-caramel', name: 'Caramelo', surchargeCents: '800', isAvailable: false },
    ],
  },
];

describe('catalog customization helpers', () => {
  it('preselects the first available values for mandatory groups and skips unavailable ones', () => {
    const initial = createInitialSelections(groups);
    expect(initial).toEqual({
      'g-size': ['v-med'],
      'g-extras': [],
    });
    expect(validateOptionSelections(groups, initial).valid).toBe(true);
  });

  it('enforces single-select, multi-select maxSelections, and unavailable guards', () => {
    let selections = createInitialSelections(groups);

    // Unavailable value cannot be selected.
    selections = toggleOptionValue(groups[0], selections, groups[0].values[0]);
    expect(selections['g-size']).toEqual(['v-med']);

    // Clicking selected mandatory single option keeps it selected.
    selections = toggleOptionValue(groups[0], selections, groups[0].values[1]);
    expect(selections['g-size']).toEqual(['v-med']);

    // Switching single selection replaces cleanly.
    selections = toggleOptionValue(groups[0], selections, groups[0].values[2]);
    expect(selections['g-size']).toEqual(['v-large']);

    // Multi-select allows up to maxSelections=2 and ignores a 3rd without duplicates.
    selections = toggleOptionValue(groups[1], selections, groups[1].values[0]);
    selections = toggleOptionValue(groups[1], selections, groups[1].values[1]);
    selections = toggleOptionValue(groups[1], selections, groups[1].values[2]);
    expect(selections['g-extras']).toEqual(['v-shot', 'v-oat']);

    // Deselecting works in multi-select.
    selections = toggleOptionValue(groups[1], selections, groups[1].values[0]);
    expect(selections['g-extras']).toEqual(['v-oat']);
  });

  it('validates missing mandatory selections, duplicates, and unavailable options', () => {
    const missingMandatory = validateOptionSelections(groups, { 'g-size': [], 'g-extras': [] });
    expect(missingMandatory.valid).toBe(false);
    expect(missingMandatory.errorsByGroup['g-size']).toContain('al menos 1');

    const duplicated = validateOptionSelections(groups, {
      'g-size': ['v-med'],
      'g-extras': ['v-shot', 'v-shot'],
    });
    expect(duplicated.valid).toBe(false);
    expect(duplicated.errorsByGroup['g-extras']).toContain('repetidas');

    const unavailable = validateOptionSelections(groups, {
      'g-size': ['v-small'],
      'g-extras': [],
    });
    expect(unavailable.valid).toBe(false);
  });

  it('computes estimated unit and total cents using BigInt integer arithmetic', () => {
    const selections = { 'g-size': ['v-large'], 'g-extras': ['v-shot', 'v-oat'] };
    const estimate = calculateEstimatedCustomizationPrice('6500', groups, selections, 2);
    expect(estimate).toEqual({
      unitPriceCents: '9900',
      totalPriceCents: '19800',
      selectedLabels: ['Grande', 'Shot extra', 'Leche de avena'],
    });
  });
});
