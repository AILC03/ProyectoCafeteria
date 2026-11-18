import React, { createContext, useContext, useState, useEffect } from 'react';
import type { CartItem, CustomizationOptions, Order, PastOrderItem, Product, NotificationItem } from '../types';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { createMobileOrder } from '../api/orders';
import { logoutCustomer } from '../api/auth';
import { centsToNumber } from '../utils/money';

interface CartContextType {
  cart: CartItem[];
  addToCart: (
    product: Product,
    customizations?: CustomizationOptions,
    quantity?: number,
    cupName?: string,
    optionValueIds?: string[],
    unitPriceCents?: string
  ) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  totalItemsCount: number;
  subtotal: number;
  discount: number;
  setDiscount: (val: number) => void;
  grandTotal: number;
  pastOrders: PastOrderItem[];
  reorderPastItem: (pastItem: PastOrderItem) => void;
  reorderAllPastItems: () => void;
  completedOrders: Order[];
  submitOrder: (paymentMethod: 'CASH' | 'STRIPE', pickupType: 'aqui' | 'llevar') => Promise<Order>;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  isHistoryOpen: boolean;
  setIsHistoryOpen: (open: boolean) => void;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  isNotificationsOpen: boolean;
  setIsNotificationsOpen: (open: boolean) => void;
  selectedCustomizingProduct: Product | null;
  setSelectedCustomizingProduct: (p: Product | null) => void;
  lastCompletedOrder: Order | null;
  setLastCompletedOrder: (o: Order | null) => void;
  notifications: NotificationItem[];
  markNotificationsAsRead: () => void;
  unreadNotificationsCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, guestName } = useAuth();
  const { showToast } = useToast();

  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('taffy_cart');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [pastOrders] = useState<PastOrderItem[]>(() => {
    const saved = localStorage.getItem('taffy_past_orders');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filtrar cualquier pedido demo anterior
          const clean = parsed.filter(
            (p: any) =>
              !String(p.id).startsWith('past-') &&
              !String(p.productId).startsWith('prod-flat') &&
              !String(p.productId).startsWith('prod-caramel') &&
              !String(p.productId).startsWith('prod-croissant') &&
              !String(p.productId).startsWith('prod-matcha')
          );
          localStorage.setItem('taffy_past_orders', JSON.stringify(clean));
          return clean;
        }
      } catch (e) {
        console.error(e);
      }
    }
    localStorage.removeItem('taffy_past_orders');
    return [];
  });

  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [lastCompletedOrder, setLastCompletedOrder] = useState<Order | null>(null);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [selectedCustomizingProduct, setSelectedCustomizingProduct] = useState<Product | null>(null);

  const [discount, setDiscount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    localStorage.setItem('taffy_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('taffy_past_orders', JSON.stringify(pastOrders));
  }, [pastOrders]);

  const addToCart = (
    product: Product,
    customizations?: CustomizationOptions,
    quantity = 1,
    cupName?: string,
    optionValueIds: string[] = [],
    unitPriceCents?: string
  ) => {
    const resolvedUnitPriceCents = unitPriceCents || product.basePriceCents || '0';
    const unitPrice = centsToNumber(resolvedUnitPriceCents);
    const assignedCupName = cupName?.trim() || (currentUser ? currentUser.name : guestName || 'Cliente');

    // Resumen de personalización legible
    const summaries: string[] = [];
    if (customizations?.size) summaries.push(customizations.size);
    if (customizations?.milk) summaries.push(customizations.milk);
    if (customizations?.shots) summaries.push(customizations.shots);
    if (customizations?.syrup) summaries.push(customizations.syrup);

    const newItem: CartItem = {
      cartItemId: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: product.id,
      name: product.name,
      price: unitPrice,
      basePriceCents: product.basePriceCents || String(Math.round(unitPrice * 100)),
      unitPriceCents: resolvedUnitPriceCents,
      quantity,
      image: product.image,
      cupName: assignedCupName,
      optionValueIds,
      customizationsSummary: summaries.join(' · '),
      customizations,
    };

    setCart((prev) => [...prev, newItem]);
    showToast(`"${product.name}" agregado al pedido ☕`, 'success');
  };

  const removeFromCart = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
    showToast('Producto eliminado del pedido', 'info');
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.cartItemId === cartItemId ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
  };

  const totalItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const grandTotal = Math.max(0, subtotal - discount);

  const reorderPastItem = (pastItem: PastOrderItem) => {
    const p: Product = {
      id: pastItem.productId,
      name: pastItem.name,
      description: pastItem.details,
      price: pastItem.price,
      basePriceCents: Math.round(pastItem.price * 100).toString(),
      category: pastItem.category,
      image: pastItem.image,
      customizable: true,
      isAvailable: true,
    };
    addToCart(p, pastItem.customizations, 1);
    setIsCartOpen(true);
  };

  const reorderAllPastItems = () => {
    pastOrders.forEach((item) => {
      reorderPastItem(item);
    });
    showToast('Todos los pedidos anteriores fueron agregados al carrito', 'success');
  };

  const submitOrder = async (
    paymentMethod: 'CASH' | 'STRIPE',
    pickupType: 'aqui' | 'llevar'
  ): Promise<Order> => {
    const assignedCupName = currentUser ? currentUser.name : guestName || 'Cliente';

    // Llamada oficial al backend mediante createMobileOrder
    const orderItems = cart.map((c) => ({
      productId: c.productId,
      quantity: c.quantity,
      optionValueIds: c.optionValueIds,
    }));

    let response;
    try {
      response = await createMobileOrder({
        paymentMethod,
        items: orderItems,
        guestName: !currentUser ? assignedCupName : undefined,
        includeCashQr: paymentMethod === 'CASH',
        includeCheckoutToken: paymentMethod === 'STRIPE' && !currentUser,
      });
    } catch (err: any) {
      // Si falló por conflicto con sesión previa de empleado en el mismo navegador (403 o 400),
      // limpiar cookies residuales e intentar una vez como invitado limpio
      if (!currentUser && (err?.status === 403 || err?.code === 'FORBIDDEN' || err?.code === 'VALIDATION_ERROR' || err?.status === 400)) {
        await logoutCustomer().catch(() => {});
        response = await createMobileOrder({
          paymentMethod,
          items: orderItems,
          guestName: assignedCupName,
          includeCashQr: paymentMethod === 'CASH',
          includeCheckoutToken: paymentMethod === 'STRIPE',
        });
      } else {
        throw err;
      }
    }

    const backendOrder = response.data;
    const orderTotalCents = backendOrder.totalCents;
    const orderTotal = centsToNumber(orderTotalCents);

    const newOrder: Order = {
      id: backendOrder.id,
      folio: backendOrder.folio,
      orderNumber: backendOrder.folio,
      date: new Date(backendOrder.createdAt).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      items: [...cart],
      subtotal: orderTotal,
      discount,
      total: orderTotal,
      totalCents: orderTotalCents,
      cupName: assignedCupName,
      pickupType,
      paymentMethod,
      status: backendOrder.status,
      userEmail: currentUser?.email,
      cashQr: response.cashQr,
    };

    setCompletedOrders((prev) => [newOrder, ...prev]);
    setLastCompletedOrder(newOrder);

    clearCart();
    setIsCartOpen(false);

    return newOrder;
  };

  const markNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItemsCount,
        subtotal,
        discount,
        setDiscount,
        grandTotal,
        pastOrders,
        reorderPastItem,
        reorderAllPastItems,
        completedOrders,
        submitOrder,
        isCartOpen,
        setIsCartOpen,
        isHistoryOpen,
        setIsHistoryOpen,
        isProfileOpen,
        setIsProfileOpen,
        isNotificationsOpen,
        setIsNotificationsOpen,
        selectedCustomizingProduct,
        setSelectedCustomizingProduct,
        lastCompletedOrder,
        setLastCompletedOrder,
        notifications,
        markNotificationsAsRead,
        unreadNotificationsCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart debe usarse dentro de un CartProvider');
  }
  return context;
};
