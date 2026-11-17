import React from 'react';
import type { Product } from '../types';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/money';

interface ProductCardProps {
  product: Product;
  onOpenCustomize: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onOpenCustomize }) => {
  const { addToCart } = useCart();
  const { currentUser, toggleFavorite } = useAuth();

  const isFavorite = currentUser ? currentUser.favorites.includes(product.id) : product.isFavorite;

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(product.id);
  };

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.isAvailable) return;
    if (product.customizable) {
      onOpenCustomize(product);
    } else {
      addToCart(product);
    }
  };

  return (
    <div
      className={`flex flex-col bg-surface-container-lowest rounded-2xl shadow-sm overflow-hidden border border-surface-container hover:border-outline-variant/60 hover:shadow-md transition-all duration-200 group ${
        !product.isAvailable ? 'opacity-70' : ''
      }`}
    >
      {/* Product Image Box */}
      <div
        className="relative w-full h-28 sm:h-32 bg-surface-container-low overflow-hidden cursor-pointer"
        onClick={() => product.isAvailable && onOpenCustomize(product)}
      >
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80';
          }}
        />

        {/* Badge o Agotado */}
        {!product.isAvailable ? (
          <span className="absolute top-2 left-2 bg-error text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm backdrop-blur-sm">
            Agotado
          </span>
        ) : product.badge ? (
          <span className="absolute top-2 left-2 bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm backdrop-blur-sm">
            {product.badge}
          </span>
        ) : null}

        {/* Heart Favorite Button */}
        <button
          type="button"
          onClick={handleFavoriteClick}
          className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${
            isFavorite
              ? 'bg-secondary text-on-secondary shadow-sm'
              : 'bg-black/30 hover:bg-black/50 text-white'
          }`}
          title="Guardar como favorito"
        >
          <span
            className="material-symbols-outlined text-[16px]"
            style={{ fontVariationSettings: isFavorite ? "'FILL' 1" : "'FILL' 0" }}
          >
            favorite
          </span>
        </button>
      </div>

      {/* Info & Action Body */}
      <div className="p-2.5 flex flex-col justify-between flex-1 gap-2">
        <div
          className="flex flex-col gap-0.5 cursor-pointer"
          onClick={() => product.isAvailable && onOpenCustomize(product)}
        >
          <h3 className="text-[13px] font-bold text-primary leading-tight line-clamp-1 group-hover:text-secondary transition-colors">
            {product.name}
          </h3>
          <p className="text-[11px] text-on-surface-variant line-clamp-1">
            {product.description}
          </p>
          <span className="font-bold text-[15px] text-secondary pt-0.5">
            {formatPrice(product.basePriceCents || product.price * 100)}
          </span>
        </div>

        {/* Action Button */}
        {!product.isAvailable ? (
          <button
            type="button"
            disabled
            className="w-full h-8 rounded-xl bg-surface-container text-outline flex items-center justify-center gap-1 text-[12px] font-bold cursor-not-allowed"
          >
            <span>No disponible</span>
          </button>
        ) : product.customizable ? (
          <button
            type="button"
            onClick={() => onOpenCustomize(product)}
            className="w-full h-8 rounded-xl bg-primary-container text-on-primary hover:bg-primary flex items-center justify-center gap-1 text-[12px] font-bold active:scale-95 transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span>Pedir</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleQuickAdd}
            className="w-full h-8 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary flex items-center justify-center gap-1 text-[12px] font-bold active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Agregar</span>
          </button>
        )}
      </div>
    </div>
  );
};
