import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useNavigate } from 'react-router-dom';

export const ProfileModal: React.FC = () => {
  const { currentUser, isGuest, guestName, logout, updateProfile } = useAuth();
  const { isProfileOpen, setIsProfileOpen } = useCart();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(currentUser?.name || guestName || '');

  if (!isProfileOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      showToast('El nombre no puede estar vacío.', 'warning');
      return;
    }
    updateProfile(editName);
    setIsEditing(false);
    showToast('Nombre actualizado para tus pedidos.', 'success');
  };

  const handleLogout = () => {
    logout();
    setIsProfileOpen(false);
    showToast('Sesión cerrada.');
    navigate('/iniciar-sesion');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 animate-fade-in"
      onClick={() => setIsProfileOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-surface-container flex flex-col max-h-[90vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-surface-container">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary-fixed/50 flex items-center justify-center text-secondary border border-secondary-container/40">
              <span className="material-symbols-outlined text-2xl">account_circle</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-primary">
                {currentUser ? currentUser.name : isGuest ? `Invitado (${guestName})` : 'Mi Cuenta'}
              </h2>
              <p className="text-xs text-on-surface-variant">
                {currentUser ? currentUser.email : 'Modo Pedido Rápido'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsProfileOpen(false)}
            className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto no-scrollbar">
          {/* Datos de Cuenta Real */}
          {currentUser && (
            <div className="p-4 rounded-2xl bg-surface-container-low border border-surface-container flex flex-col gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                Información de tu Cuenta
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-on-surface-variant block">No. de Cliente:</span>
                  <span className="font-bold text-primary">{currentUser.customerNumber || currentUser.id}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant block">Teléfono:</span>
                  <span className="font-bold text-primary">{currentUser.phone || 'No registrado'}</span>
                </div>
                {currentUser.email && (
                  <div className="col-span-2">
                    <span className="text-on-surface-variant block">Correo de contacto:</span>
                    <span className="font-semibold text-primary">{currentUser.email}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Edit Name on Cup */}
          <div className="p-3.5 rounded-2xl bg-surface-container-low border border-surface-container flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Nombre para tus vasos
            </span>
            {isEditing ? (
              <form onSubmit={handleSave} className="flex gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 h-9 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant/60 text-xs font-semibold text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <button
                  type="submit"
                  className="h-9 px-3 rounded-xl bg-primary text-on-primary text-xs font-bold active:scale-95"
                >
                  Guardar
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-primary">
                  {currentUser ? currentUser.name : guestName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditName(currentUser ? currentUser.name : guestName);
                    setIsEditing(true);
                  }}
                  className="text-xs text-secondary font-bold hover:underline flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  <span>Cambiar</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-container bg-surface-container-lowest flex items-center justify-between gap-2 shrink-0">
          {currentUser ? (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full h-11 rounded-xl bg-surface-container hover:bg-error/10 hover:text-error text-on-surface-variant text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-base">logout</span>
              <span>Cerrar sesión</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsProfileOpen(false);
                navigate('/iniciar-sesion');
              }}
              className="w-full h-11 rounded-xl bg-primary text-on-primary text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
            >
              <span className="material-symbols-outlined text-base">login</span>
              <span>Iniciar sesión</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
