import React, { useState, useEffect } from 'react';
import type { Product, CustomizationOptions } from '../types';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { getProductOptions, type ApiOptionGroup, type ApiOptionValue } from '../api/catalog';
import { formatCents, formatPrice } from '../utils/money';

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({ product, onClose }) => {
  const { addToCart } = useCart();
  const { currentUser, guestName } = useAuth();

  const [quantity, setQuantity] = useState(1);
  const [cupName, setCupName] = useState('');
  const [optionGroups, setOptionGroups] = useState<ApiOptionGroup[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  useEffect(() => {
    if (!product) return;

    setQuantity(1);
    setCupName(currentUser ? currentUser.name : guestName || 'Cliente');

    let isMounted = true;
    setIsLoadingOptions(true);

    getProductOptions(product.id)
      .then((groups) => {
        if (!isMounted) return;
        setOptionGroups(groups || []);

        // Preseleccionar opciones por defecto (la primera disponible de cada grupo obligatorio)
        const defaults: Record<string, string[]> = {};
        for (const grp of groups) {
          if (grp.minSelections >= 1 && grp.values.length > 0) {
            const firstAvailable = grp.values.find((v) => v.isAvailable) || grp.values[0];
            if (firstAvailable) {
              defaults[grp.id] = [firstAvailable.id];
            }
          }
        }
        setSelectedOptions(defaults);
      })
      .catch((err) => {
        console.warn('No se pudieron obtener opciones de backend:', err);
        setOptionGroups([]);
      })
      .finally(() => {
        if (isMounted) setIsLoadingOptions(false);
      });

    return () => {
      isMounted = false;
    };
  }, [product, currentUser, guestName]);

  if (!product) return null;

  // Manejo de selección en grupos de opciones
  const handleSelectOption = (group: ApiOptionGroup, value: ApiOptionValue) => {
    if (!value.isAvailable) return;

    setSelectedOptions((prev) => {
      const current = prev[group.id] || [];
      const isSingle = group.maxSelections === 1;

      if (isSingle) {
        return { ...prev, [group.id]: [value.id] };
      }

      if (current.includes(value.id)) {
        return { ...prev, [group.id]: current.filter((id) => id !== value.id) };
      }

      if (current.length < group.maxSelections) {
        return { ...prev, [group.id]: [...current, value.id] };
      }

      return prev;
    });
  };

  // Cálculo de precio exacto en centavos
  const baseCents = parseInt(product.basePriceCents || '0', 10);
  let extraCents = 0;
  const allSelectedValueIds: string[] = [];
  const selectedSummaries: string[] = [];

  for (const group of optionGroups) {
    const selectedIds = selectedOptions[group.id] || [];
    for (const val of group.values) {
      if (selectedIds.includes(val.id)) {
        extraCents += parseInt(val.surchargeCents || '0', 10);
        allSelectedValueIds.push(val.id);
        selectedSummaries.push(val.name);
      }
    }
  }

  const unitCents = baseCents + extraCents;
  const totalCents = unitCents * quantity;

  const handleAdd = () => {
    const customizations: CustomizationOptions = {
      selectedOptionIds: allSelectedValueIds,
      size: selectedSummaries[0],
      milk: selectedSummaries[1],
    };

    addToCart(
      product,
      customizations,
      quantity,
      cupName,
      allSelectedValueIds,
      unitCents.toString()
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-surface-container flex flex-col max-h-[92vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pull tab en móvil */}
        <div className="w-full flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-12 h-1.5 bg-surface-container-high rounded-full"></div>
        </div>

        {/* Modal Hero Header con Imagen */}
        <div className="relative h-44 sm:h-52 w-full bg-surface-container-low shrink-0">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/30 to-transparent"></div>

          {/* Botón cerrar */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-md active:scale-95 transition-transform z-10"
            aria-label="Cerrar modal"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>

          {/* Título de producto */}
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <h2 className="text-xl sm:text-2xl font-bold leading-tight mt-1 text-white">
              {product.name}
            </h2>
            <p className="text-xs text-white/80 line-clamp-1 mt-0.5">{product.description}</p>
          </div>
        </div>

        {/* Opciones de personalización */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto flex flex-col gap-5 no-scrollbar">
          {/* Nombre para el vaso */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cupNameInput" className="text-xs font-bold uppercase tracking-wider text-primary">
              ¿A nombre de quién preparamos el vaso?
            </label>
            <div className="relative">
              <input
                id="cupNameInput"
                type="text"
                value={cupName}
                onChange={(e) => setCupName(e.target.value)}
                placeholder="Nombre para entrega (ej. Sofía)"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs font-medium text-primary placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Opciones dinámicas del backend */}
          {isLoadingOptions ? (
            <div className="py-6 flex items-center justify-center gap-2 text-outline">
              <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
              <span className="text-xs">Cargando opciones...</span>
            </div>
          ) : (
            optionGroups.map((group) => {
              const selectedIds = selectedOptions[group.id] || [];
              return (
                <div key={group.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      {group.name}
                    </span>
                    {group.minSelections > 0 && (
                      <span className="text-[10px] text-secondary font-bold uppercase tracking-wider">
                        Requerido
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.values.map((val) => {
                      const isSelected = selectedIds.includes(val.id);
                      const surcharge = parseInt(val.surchargeCents || '0', 10);
                      return (
                        <button
                          key={val.id}
                          type="button"
                          disabled={!val.isAvailable}
                          onClick={() => handleSelectOption(group, val)}
                          className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                            !val.isAvailable
                              ? 'opacity-40 cursor-not-allowed bg-surface-container-low border-surface-container'
                              : isSelected
                              ? 'bg-primary-container text-on-primary border-primary shadow-xs'
                              : 'bg-surface-container-lowest border-surface-container text-on-surface hover:bg-surface-container-low'
                          }`}
                        >
                          <span className="text-xs font-semibold leading-tight">{val.name}</span>
                          {surcharge > 0 && (
                            <span
                              className={`text-[10px] mt-1 font-bold ${
                                isSelected ? 'text-secondary-container' : 'text-secondary'
                              }`}
                            >
                              +{formatCents(val.surchargeCents)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Bottom Sticky Bar */}
        <div className="p-4 bg-surface/90 border-t border-surface-container flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center bg-surface-container rounded-2xl p-1 border border-outline-variant/30">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-8 h-8 rounded-xl bg-surface-container-lowest text-primary flex items-center justify-center font-bold active:scale-90 transition-transform"
            >
              -
            </button>
            <span className="w-8 text-center text-xs font-bold text-primary">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              className="w-8 h-8 rounded-xl bg-surface-container-lowest text-primary flex items-center justify-center font-bold active:scale-90 transition-transform"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            className="flex-1 h-12 rounded-2xl bg-primary text-on-primary font-bold text-xs shadow-lg hover:bg-primary/95 active:scale-[0.98] transition-all flex items-center justify-between px-4"
          >
            <span>Agregar al pedido</span>
            <span>{formatPrice(totalCents)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
