import type { Product, Category } from '../types';

export const CATEGORIES: Category[] = [
  { id: 'caliente', name: 'Café Caliente', icon: 'local_cafe', count: 0 },
  { id: 'frio', name: 'Café Frío', icon: 'mode_fan', count: 0 },
  { id: 'te', name: 'Té & Infusiones', icon: 'eco', count: 0 },
  { id: 'panaderia', name: 'Panadería', icon: 'bakery_dining', count: 0 },
  { id: 'snacks', name: 'Snacks', icon: 'lunch_dining', count: 0 },
];

export const INITIAL_PRODUCTS: Product[] = [];
