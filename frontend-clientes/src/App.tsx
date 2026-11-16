import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { AuthPage } from './pages/AuthPage';
import { MenuPage } from './pages/MenuPage';

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <Routes>
              {/* Pantalla de Origen del Link de Cliente: Siempre Iniciar Sesión */}
              <Route path="/" element={<Navigate to="/iniciar-sesion" replace />} />
              <Route path="/iniciar-sesion" element={<AuthPage />} />
              <Route path="/registro" element={<Navigate to="/iniciar-sesion" replace />} />
              <Route path="/menu" element={<MenuPage />} />
              <Route path="*" element={<Navigate to="/iniciar-sesion" replace />} />
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
