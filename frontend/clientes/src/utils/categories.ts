/**
 * Mapeo intuitivo de iconos Material Symbols para categorías dinámicas provenientes del backend.
 */
export function getCategoryIcon(categoryName: string): string {
  const lower = categoryName.toLowerCase();
  if (lower.includes('caliente') || lower.includes('café') || lower.includes('cafe')) {
    return 'local_cafe';
  }
  if (lower.includes('frío') || lower.includes('frio') || lower.includes('cold') || lower.includes('frapp')) {
    return 'mode_fan';
  }
  if (lower.includes('té') || lower.includes('te') || lower.includes('infus')) {
    return 'eco';
  }
  if (lower.includes('pan') || lower.includes('postre') || lower.includes('dulce') || lower.includes('bakery')) {
    return 'bakery_dining';
  }
  if (lower.includes('alimento') || lower.includes('comida') || lower.includes('snack') || lower.includes('crepa')) {
    return 'lunch_dining';
  }
  if (lower.includes('bebida') || lower.includes('agua') || lower.includes('jugo')) {
    return 'local_bar';
  }
  return 'restaurant_menu';
}
