export type CategoryId = string;

export interface Category {
  id: string;
  name: string;
  icon?: string;
  count?: number;
}

export interface CustomizationOptionValue {
  id: string;
  name: string;
  surchargeCents: string;
  isAvailable: boolean;
}

export interface CustomizationOptionGroup {
  id: string;
  name: string;
  pricingScope: 'GLOBAL' | 'PER_PRODUCT';
  minSelections: number;
  maxSelections: number;
  values: CustomizationOptionValue[];
}

export interface CustomizationOptions {
  size?: string;
  milk?: string;
  shots?: string;
  syrup?: string;
  ice?: string;
  warming?: string;
  notes?: string;
  selectedOptionIds?: string[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  basePriceCents?: string;
  category: string;
  image: string;
  badge?: string;
  isFavorite?: boolean;
  customizable: boolean;
  isAvailable?: boolean;
  optionGroups?: CustomizationOptionGroup[];
  defaultOptions?: Partial<CustomizationOptions>;
}

export interface CartItem {
  cartItemId: string;
  productId: string;
  name: string;
  price: number;
  basePriceCents: string;
  unitPriceCents: string;
  quantity: number;
  image: string;
  cupName: string;
  optionValueIds: string[];
  customizationsSummary?: string;
  customizations?: CustomizationOptions;
}

export interface PastOrderItem {
  id: string;
  productId: string;
  name: string;
  details: string;
  price: number;
  category: string;
  image: string;
  customizations?: CustomizationOptions;
}

export interface User {
  id: string;
  customerNumber?: string;
  name: string;
  phone?: string;
  email?: string;
  pin?: string;
  favorites: string[];
}

export interface Order {
  id: string;
  folio: string;
  orderNumber: string;
  date: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  totalCents: string;
  cupName: string;
  pickupType: 'aqui' | 'llevar';
  paymentMethod: 'CASH' | 'STRIPE';
  status: 'PENDIENTE_PAGO' | 'PAGADA' | 'PREPARANDO' | 'LISTO' | 'ENTREGADA' | 'EXPIRADA' | 'CANCELADA';
  userEmail?: string;
  cashQr?: {
    purpose: 'CASH_PAYMENT';
    token: string;
    qrPayload: string;
    expiresAt: string;
  };
  checkoutUrl?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  icon: string;
}
