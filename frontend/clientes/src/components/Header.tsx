import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { Link } from 'react-router-dom';

interface HeaderProps {
  onToggleFavorites?: () => void;
  showOnlyFavorites?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onToggleFavorites, showOnlyFavorites = false }) => {
  const { currentUser, isGuest } = useAuth();
  const {
    setIsHistoryOpen,
    setIsProfileOpen,
  } = useCart();

  return (
    <header className="sticky top-0 w-full h-16 shrink-0 z-40 bg-surface/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(45,26,18,0.06)] border-b border-surface-container">
      <div className="w-full max-w-[1280px] mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/menu" className="flex items-center gap-2.5 active:scale-95 transition-transform">
          <img
            src="/logo.png"
            alt="COFFEE'S POS"
            className="h-10 w-auto object-contain max-w-[170px]"
          />
        </Link>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {/* Favorites Filter button */}
          <button
            type="button"
            onClick={onToggleFavorites}
            className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all ${
              showOnlyFavorites
                ? 'bg-secondary text-on-secondary shadow-sm'
                : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
            }`}
            title={showOnlyFavorites ? 'Mostrar todo el menú' : 'Ver solo favoritos'}
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: showOnlyFavorites ? "'FILL' 1" : "'FILL' 0" }}
            >
              favorite
            </span>
          </button>

          {/* Historial de pedidos button */}
          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface active:scale-90 transition-transform relative"
            title="Historial de pedidos"
          >
            <span className="material-symbols-outlined text-[20px]">receipt_long</span>
          </button>

          {/* Perfil button */}
          <button
            type="button"
            onClick={() => setIsProfileOpen(true)}
            className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface active:scale-90 transition-transform"
            title={currentUser ? `Perfil de ${currentUser.name}` : isGuest ? 'Perfil de Invitado' : 'Cuenta'}
          >
            <span className="material-symbols-outlined text-[20px]">person</span>
          </button>
        </div>
      </div>
    </header>
  );
};
