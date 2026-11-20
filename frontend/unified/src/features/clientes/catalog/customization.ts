import { multiplyCents, sumCents } from '../../../shared/utils/money';
import type { CatalogOptionGroup, CatalogOptionValue } from './catalogApi';

export type OptionSelectionMap = Record<string, string[]>;

export interface CustomizationValidationResult {
  valid: boolean;
  errorsByGroup: Record<string, string>;
  selectedOptionValueIds: string[];
}

export interface EstimatedCustomizationPrice {
  unitPriceCents: string;
  totalPriceCents: string;
  selectedLabels: string[];
}

/** Preselects available defaults only up to each group's minSelections requirement. */
export function createInitialSelections(groups: readonly CatalogOptionGroup[]): OptionSelectionMap {
  const selections: OptionSelectionMap = {};
  for (const group of groups) {
    if (group.minSelections <= 0 || group.maxSelections <= 0) {
      selections[group.id] = [];
      continue;
    }
    const targetCount = Math.min(group.minSelections, group.maxSelections);
    const availableIds = group.values
      .filter((value) => value.isAvailable)
      .slice(0, targetCount)
      .map((value) => value.id);
    selections[group.id] = availableIds;
  }
  return selections;
}

/** Toggles or replaces a value inside a customization group respecting availability and bounds. */
export function toggleOptionValue(
  group: CatalogOptionGroup,
  currentSelections: OptionSelectionMap,
  value: CatalogOptionValue,
): OptionSelectionMap {
  if (!value.isAvailable || group.maxSelections <= 0) {
    return currentSelections;
  }
  if (!group.values.some((candidate) => candidate.id === value.id)) {
    return currentSelections;
  }

  const current = currentSelections[group.id] ?? [];
  const isSelected = current.includes(value.id);

  if (group.maxSelections === 1) {
    if (isSelected) {
      return group.minSelections === 0
        ? { ...currentSelections, [group.id]: [] }
        : currentSelections;
    }
    return { ...currentSelections, [group.id]: [value.id] };
  }

  if (isSelected) {
    return {
      ...currentSelections,
      [group.id]: current.filter((id) => id !== value.id),
    };
  }

  if (current.length >= group.maxSelections) {
    return currentSelections;
  }

  return {
    ...currentSelections,
    [group.id]: [...current, value.id],
  };
}

/** Validates group min/max constraints, availability, and option uniqueness. */
export function validateOptionSelections(
  groups: readonly CatalogOptionGroup[],
  selections: OptionSelectionMap,
): CustomizationValidationResult {
  const errorsByGroup: Record<string, string> = {};
  const selectedOptionValueIds: string[] = [];
  const globalSeenIds = new Set<string>();

  for (const group of groups) {
    const rawSelected = selections[group.id] ?? [];
    const valuesById = new Map(group.values.map((value) => [value.id, value]));
    const uniqueSelected: string[] = [];
    let hasUnavailableOrInvalid = false;

    for (const id of rawSelected) {
      if (uniqueSelected.includes(id)) {
        hasUnavailableOrInvalid = true;
        continue;
      }
      const option = valuesById.get(id);
      if (option === undefined || !option.isAvailable) {
        hasUnavailableOrInvalid = true;
        continue;
      }
      uniqueSelected.push(id);
    }

    if (hasUnavailableOrInvalid) {
      errorsByGroup[group.id] = 'Algunas opciones elegidas ya no están disponibles o están repetidas.';
    } else if (uniqueSelected.length < group.minSelections) {
      errorsByGroup[group.id] = `Selecciona al menos ${group.minSelections} ${
        group.minSelections === 1 ? 'opción' : 'opciones'
      }.`;
    } else if (uniqueSelected.length > group.maxSelections) {
      errorsByGroup[group.id] = `Puedes seleccionar máximo ${group.maxSelections} ${
        group.maxSelections === 1 ? 'opción' : 'opciones'
      }.`;
    }

    for (const id of uniqueSelected) {
      if (!globalSeenIds.has(id)) {
        globalSeenIds.add(id);
        selectedOptionValueIds.push(id);
      }
    }
  }

  return {
    valid: Object.keys(errorsByGroup).length === 0,
    errorsByGroup,
    selectedOptionValueIds,
  };
}

/** Computes a visual-only estimated price in cents using BigInt integer arithmetic. */
export function calculateEstimatedCustomizationPrice(
  basePriceCents: string,
  groups: readonly CatalogOptionGroup[],
  selections: OptionSelectionMap,
  quantity: number,
): EstimatedCustomizationPrice {
  const surcharges: string[] = [];
  const selectedLabels: string[] = [];

  for (const group of groups) {
    const selectedSet = new Set(selections[group.id] ?? []);
    for (const value of group.values) {
      if (selectedSet.has(value.id)) {
        surcharges.push(value.surchargeCents);
        selectedLabels.push(value.name);
      }
    }
  }

  const unitPriceCents = sumCents([basePriceCents, ...surcharges]);
  const totalPriceCents = multiplyCents(unitPriceCents, quantity);
  return { unitPriceCents, totalPriceCents, selectedLabels };
}
