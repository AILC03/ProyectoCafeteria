import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import type { PastOrderItem } from '../types';

export const OrderHistoryModal: React.FC = () => {
  const {
    isHistoryOpen,
    setIsHistoryOpen,
    pastOrders,
    reorderPastItem,
    reorderAllPastItems,
  } = useCart();

  const [activeFilter, setActiveFilter] = useState<'all' | 'caliente' | 'frio' | 'panaderia' | 'te'>('all');

  if (!isHistoryOpen) return null;

  // Filter items
  const filteredItems = pastOrders.filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'caliente' && (item.category === 'caliente' || item.category === 'frio')) return true;
    return item.category === activeFilter;
  });

  const cafeCount = pastOrders.filter((p) => p.category === 'caliente' || p.category === 'frio').length;
  const panaderiaCount = pastOrders.filter((p) => p.category === 'panaderia').length;
  const teCount = pastOrders.filter((p) => p.category === 'te').length;

  const totalPastPrice = pastOrders.reduce((sum, item) => sum + item.price, 0);

  return (
    <div
      aria-labelledby="modal-history-title"
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 animate-fade-in"
      onClick={() => setIsHistoryOpen(false)}
    >
      <div
        className="w-full max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-surface-container flex flex-col max-h-[90vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pull bar for mobile */}
        <div className="w-full flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-12 h-1.5 bg-surface-container-high rounded-full"></div>
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-3.5 flex items-center justify-between border-b border-surface-container">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-secondary-container/20 border border-secondary-container/40 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px] text-secondary">history</span>
            </div>
            <div className="flex flex-col">
              <h2
                className="text-[17px] font-bold text-primary tracking-tight leading-tight"
                id="modal-history-title"
              >
                Historial de Pedidos
              </h2>
              <p className="text-[12px] text-secondary font-semibold">
                {pastOrders.length} pedidos anteriores · Listos para reordenar
              </p>
            </div>
          </div>
          <button
            aria-label="Cerrar modal"
            className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface active:scale-95 transition-transform shrink-0"
            onClick={() => setIsHistoryOpen(false)}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-5 no-scrollbar">
          {/* Filter Pills */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-wider text-primary">
                Filtrar Historial
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary/10 text-secondary">
                {pastOrders.length} en total
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button
                className={`px-3.5 py-1.5 rounded-xl text-[12px] font-bold shrink-0 active:scale-95 transition-all shadow-sm ${
                  activeFilter === 'all'
                    ? 'bg-primary text-on-primary'
                    : 'border border-surface-container bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-medium'
                }`}
                onClick={() => setActiveFilter('all')}
                type="button"
              >
                Todos ({pastOrders.length})
              </button>
              <button
                className={`px-3.5 py-1.5 rounded-xl text-[12px] font-medium shrink-0 active:scale-95 transition-all ${
                  activeFilter === 'caliente'
                    ? 'bg-primary text-on-primary font-bold'
                    : 'border border-surface-container bg-surface-container-low hover:bg-surface-container text-on-surface-variant'
                }`}
                onClick={() => setActiveFilter('caliente')}
                type="button"
              >
                Café ({cafeCount})
              </button>
              <button
                className={`px-3.5 py-1.5 rounded-xl text-[12px] font-medium shrink-0 active:scale-95 transition-all ${
                  activeFilter === 'panaderia'
                    ? 'bg-primary text-on-primary font-bold'
                    : 'border border-surface-container bg-surface-container-low hover:bg-surface-container text-on-surface-variant'
                }`}
                onClick={() => setActiveFilter('panaderia')}
                type="button"
              >
                Panadería ({panaderiaCount})
              </button>
              <button
                className={`px-3.5 py-1.5 rounded-xl text-[12px] font-medium shrink-0 active:scale-95 transition-all ${
                  activeFilter === 'te'
                    ? 'bg-primary text-on-primary font-bold'
                    : 'border border-surface-container bg-surface-container-low hover:bg-surface-container text-on-surface-variant'
                }`}
                onClick={() => setActiveFilter('te')}
                type="button"
              >
                Té ({teCount})
              </button>
            </div>
          </div>

          {/* Past Items List */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-wider text-primary">
                Tus Pedidos Anteriores
              </span>
              <span className="text-[11px] text-on-surface-variant font-medium">Selección rápida</span>
            </div>

            <div className="flex flex-col gap-2.5">
              {filteredItems.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                  <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center mb-2.5 text-outline">
                    <span className="material-symbols-outlined text-[28px]">receipt_long</span>
                  </div>
                  <p className="text-[14px] font-bold text-primary mb-1">Sin pedidos anteriores</p>
                  <p className="text-[12px] text-on-surface-variant max-w-[240px]">
                    Tu cuenta es nueva. Los pedidos que realices se registrarán aquí para que puedas repetirlos fácilmente.
                  </p>
                </div>
              ) : (
                filteredItems.map((item: PastOrderItem) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-2xl border border-surface-container bg-surface-container-lowest shadow-sm hover:bg-surface-container-low flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        alt={item.name}
                        className="w-14 h-14 rounded-xl object-cover shrink-0 border border-surface-container"
                        src={item.image}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80';
                        }}
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-[13px] font-bold text-primary truncate">{item.name}</h3>
                          <span className="material-symbols-outlined text-[15px] text-secondary shrink-0">
                            history
                          </span>
                        </div>
                        <p className="text-[11px] text-on-surface-variant truncate">{item.details}</p>
                        <span className="text-[13px] font-bold text-primary pt-0.5">
                          ${item.price.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <button
                      className="h-8 px-3 rounded-xl bg-primary-container hover:bg-primary text-on-primary flex items-center justify-center gap-1 text-[12px] font-bold shrink-0 active:scale-95 transition-all shadow-sm"
                      onClick={() => reorderPastItem(item)}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[15px]">replay</span>
                      <span>Repetir</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="p-4 border-t border-surface-container bg-surface-container-lowest flex items-center gap-3 shrink-0">
          <div className="flex items-center bg-surface-container rounded-xl p-1 shrink-0">
            <button
              className="w-8 h-8 rounded-lg bg-surface-container-lowest text-primary flex items-center justify-center active:scale-90 font-bold"
              type="button"
              title="Guardados"
            >
              <span className="material-symbols-outlined text-[16px]">bookmark_added</span>
            </button>
            <span className="w-8 text-center font-bold text-[14px] text-primary">
              {pastOrders.length}
            </span>
            <button
              className="w-8 h-8 rounded-lg bg-surface-container-lowest text-primary flex items-center justify-center active:scale-90 font-bold"
              type="button"
              onClick={() => setActiveFilter('all')}
              title="Restablecer filtros"
            >
              <span className="material-symbols-outlined text-[16px]">sync</span>
            </button>
          </div>
          <button
            className={`flex-1 h-12 rounded-xl bg-primary-container text-on-primary font-bold text-[12px] tracking-wide flex items-center justify-between px-4 shadow-md transition-all ${
              pastOrders.length === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-primary active:scale-[0.98]'
            }`}
            onClick={reorderAllPastItems}
            disabled={pastOrders.length === 0}
            type="button"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-secondary-container">
                shopping_bag
              </span>
              <span>REORDENAR TODOS</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[14px] font-bold text-secondary-container">
                ${totalPastPrice.toFixed(2)}
              </span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
