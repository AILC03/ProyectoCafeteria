import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types';
import { loginCustomer, logoutCustomer, getCustomerProfile, updateCustomerProfile } from '../api/auth';
import { getCustomerFavorites, addCustomerFavorite, removeCustomerFavorite } from '../api/favorites';

interface AuthContextType {
  currentUser: User | null;
  isGuest: boolean;
  guestName: string;
  isLoading: boolean;
  login: (identifier: string, pin: string) => Promise<{ success: boolean; message?: string }>;
  guestLogin: (name?: string) => void;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  toggleFavorite: (productId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [guestName, setGuestName] = useState<string>('Invitado');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Carga inicial: verificar si existe una sesión de cliente válida en cookies HttpOnly
  const refreshProfile = useCallback(async () => {
    try {
      const profile = await getCustomerProfile();
      let favorites: string[] = [];
      try {
        const favProducts = await getCustomerFavorites();
        favorites = favProducts.map((p) => p.id);
      } catch {
        favorites = [];
      }

      setCurrentUser({
        id: profile.customerNumber,
        customerNumber: profile.customerNumber,
        name: profile.name,
        phone: profile.phone,
        email: profile.recoveryEmail || undefined,
        favorites,
      });
      setIsGuest(false);
      localStorage.removeItem('taffy_is_guest');
    } catch (err: any) {
      // Si la cookie en el navegador pertenece a un rol de empleado (403),
      // limpiamos la cookie de la pestaña de clientes para evitar colisiones
      if (err?.status === 403) {
        logoutCustomer().catch(() => {});
      }
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const login = async (identifier: string, pin: string) => {
    try {
      setIsLoading(true);
      await loginCustomer(identifier.trim(), pin.trim());
      await refreshProfile();
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión';
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  };

  const guestLogin = (name = 'Invitado') => {
    setIsGuest(true);
    setGuestName(name.trim() || 'Invitado');
    setCurrentUser(null);
    localStorage.setItem('taffy_is_guest', 'true');
    localStorage.setItem('taffy_guest_name', name.trim() || 'Invitado');
    logoutCustomer().catch(() => {});
  };

  const logout = async () => {
    try {
      await logoutCustomer();
    } catch (err) {
      console.warn('Error en logout:', err);
    } finally {
      setCurrentUser(null);
      setIsGuest(false);
      localStorage.removeItem('taffy_is_guest');
      localStorage.removeItem('taffy_guest_name');
    }
  };

  const updateProfile = async (name: string) => {
    if (currentUser) {
      await updateCustomerProfile({ name: name.trim() });
      await refreshProfile();
    } else if (isGuest) {
      setGuestName(name.trim());
      localStorage.setItem('taffy_guest_name', name.trim());
    }
  };

  const toggleFavorite = async (productId: string) => {
    if (!currentUser) return;

    const isFav = currentUser.favorites.includes(productId);
    const updated = isFav
      ? currentUser.favorites.filter((id) => id !== productId)
      : [...currentUser.favorites, productId];

    // Actualización optimista local
    setCurrentUser((prev) => (prev ? { ...prev, favorites: updated } : null));

    try {
      if (isFav) {
        await removeCustomerFavorite(productId);
      } else {
        await addCustomerFavorite(productId);
      }
    } catch (err) {
      console.error('Error al actualizar favorito en backend:', err);
      // Revertir en caso de fallo
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              favorites: isFav
                ? [...prev.favorites, productId]
                : prev.favorites.filter((id) => id !== productId),
            }
          : null
      );
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isGuest,
        guestName,
        isLoading,
        login,
        guestLogin,
        logout,
        updateProfile,
        toggleFavorite,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
};
