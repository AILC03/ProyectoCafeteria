import React, { useState, useEffect, useRef } from 'react';
import { isEmployeeAdmin, isEmployeeCashier, isEmployeeKitchen, isEmployeeGerente } from '../data/employees.js';

export default function PosHeader({
  activeTab,
  onTabChange,
  employee,
  onLogout,
  audioEnabled = true,
  onOpenSettings,
  onReprintLastTicket,
  businessName
}) {
  const [clockText, setClockText] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isAdmin = isEmployeeAdmin(employee);
  const isGerente = isEmployeeGerente(employee);
  const isKitchen = isEmployeeKitchen(employee);
  const isCashier = isEmployeeCashier(employee) && !isAdmin && !isGerente;

  // Reloj en tiempo real
  useEffect(() => {
    function tick() {
      const now = new Date();
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const formattedHours = String(hours).padStart(2, '0');
      setClockText(`${formattedHours}:${minutes}:${seconds} ${ampm}`);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cerrar dropdown al hacer clic o tap fuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  function handleSelectAdminDashboard() {
    setIsDropdownOpen(false);
    onTabChange('admin-dashboard');
  }

  function handleOpenConfig() {
    setIsDropdownOpen(false);
    if (isGerente) return;
    if (onOpenSettings) {
      onOpenSettings();
    }
  }

  return (
    <header className="pos-top-nav">
      <div className="pos-nav-left">
        <h1 className="pos-logo-text" style={{ margin: 0 }}>
          {businessName || 'Coffee´s Pos'}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {/* Navegación según Rol */}
          {isKitchen ? (
            <div
              className="pos-view-tab active"
              style={{ cursor: 'default', pointerEvents: 'none' }}
            >
              <span>Cocina / Barista (KDS)</span>
            </div>
          ) : isGerente ? null : (
            <>
              {activeTab === 'order' ? (
                <div
                  className="pos-view-tab active"
                  style={{ cursor: 'default', pointerEvents: 'none' }}
                >
                  <span>Tomar Orden</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="pos-view-tab"
                  onClick={() => onTabChange('order')}
                  style={{
                    minHeight: '40px',
                    padding: '0.45rem 1rem',
                    background: '#f1f5f9',
                    color: '#0f172a',
                    fontWeight: 700,
                    cursor: 'pointer',
                    touchAction: 'manipulation'
                  }}
                >
                  <span>&larr; Volver a Tomar Orden</span>
                </button>
              )}

              {activeTab === 'kitchen' && (
                <span
                  className="pos-view-tab active"
                  style={{ cursor: 'default', pointerEvents: 'none' }}
                >
                  <span>Cocina / Barista</span>
                </span>
              )}

              {/* Badges de vista activa para cajero (no admin) */}
              {!isAdmin && activeTab === 'history' && (
                <span
                  className="pos-view-tab active"
                  style={{ cursor: 'default', pointerEvents: 'none' }}
                >
                  <span>Historial de Pedidos</span>
                </span>
              )}

              {!isAdmin && activeTab === 'shift' && (
                <span
                  className="pos-view-tab active"
                  style={{ cursor: 'default', pointerEvents: 'none' }}
                >
                  <span>Corte de Caja</span>
                </span>
              )}
            </>
          )}

          {/* Botón de 3 líneas (o 3 puntitos) para menú desplegable */}
          <div
            className="admin-dropdown-container"
            ref={dropdownRef}
            style={{ position: 'relative' }}
          >
            <button
              type="button"
              className={`pos-menu-icon-btn ${isDropdownOpen ? 'active' : ''}`}
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              aria-expanded={isDropdownOpen}
              aria-label="Menú de opciones"
              title="Opciones"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: isDropdownOpen ? '#0f172a' : '#f1f5f9',
                color: isDropdownOpen ? '#ffffff' : '#334155',
                border: '1px solid #cbd5e1',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                touchAction: 'manipulation'
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="4" y1="6" x2="20" y2="6"></line>
                <line x1="4" y1="12" x2="20" y2="12"></line>
                <line x1="4" y1="18" x2="20" y2="18"></line>
              </svg>
            </button>

            {/* Menú desplegable estructurado */}
            {isDropdownOpen && (
              <div
                className="admin-dropdown-menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  zIndex: 1000,
                  minWidth: '220px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  boxShadow:
                    '0 16px 36px -8px rgba(0, 0, 0, 0.16), 0 0 1px 1px rgba(0, 0, 0, 0.05)',
                  padding: '0.45rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem'
                }}
              >
                {/* Opción: Panel de Administración (Solo Administrador) */}
                {isAdmin && (
                  <button
                    type="button"
                    className="admin-menu-item"
                    onClick={handleSelectAdminDashboard}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: '42px',
                      padding: '0.65rem 0.9rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: activeTab === 'admin-dashboard' ? '#0f172a' : 'transparent',
                      color: activeTab === 'admin-dashboard' ? '#ffffff' : '#0f172a',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      textAlign: 'left',
                      cursor: 'pointer',
                      width: '100%',
                      touchAction: 'manipulation'
                    }}
                  >
                    Panel de Administración
                  </button>
                )}

                {/* Opción: Tomar Orden (Cajero y Admin - No Gerente) */}
                {!isKitchen && !isGerente && activeTab !== 'order' && (
                  <button
                    type="button"
                    className="admin-menu-item"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onTabChange('order');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: '40px',
                      padding: '0.6rem 0.9rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'transparent',
                      color: '#0f172a',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                      width: '100%'
                    }}
                  >
                    Tomar Orden
                  </button>
                )}

                {/* Historial de Pedidos (Solo roles sin Panel de Administración: Cajero y Gerente) */}
                {!isKitchen && !isAdmin && (
                  <button
                    type="button"
                    className="admin-menu-item"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onTabChange('history');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: '40px',
                      padding: '0.6rem 0.9rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: activeTab === 'history' ? '#0f172a' : 'transparent',
                      color: activeTab === 'history' ? '#ffffff' : '#334155',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                      width: '100%'
                    }}
                  >
                    Historial de Pedidos
                  </button>
                )}

                {/* Cocina / Barista (KDS) (Disponible en el menú de opciones para Admin y Personal) */}
                {!isGerente && (
                  <button
                    type="button"
                    className="admin-menu-item"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onTabChange('kitchen');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: '40px',
                      padding: '0.6rem 0.9rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: activeTab === 'kitchen' ? '#0f172a' : 'transparent',
                      color: activeTab === 'kitchen' ? '#ffffff' : '#334155',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                      width: '100%'
                    }}
                  >
                    Cocina / Barista (KDS)
                  </button>
                )}

                {/* Corte de Caja (Solo roles sin Panel de Administración) */}
                {!isKitchen && !isAdmin && (
                  <button
                    type="button"
                    className="admin-menu-item"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onTabChange('shift');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: '40px',
                      padding: '0.6rem 0.9rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: activeTab === 'shift' ? '#0f172a' : 'transparent',
                      color: activeTab === 'shift' ? '#ffffff' : '#334155',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                      width: '100%'
                    }}
                  >
                    Corte de Caja
                  </button>
                )}

                {/* Opción 2: Configuración (Todos excepto Gerente) */}
                {!isGerente && (
                  <button
                    type="button"
                    className="admin-menu-item"
                    onClick={handleOpenConfig}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: '46px',
                      padding: '0.75rem 1rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'transparent',
                      color: '#0f172a',
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                      width: '100%',
                      touchAction: 'manipulation',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = '#f8fafc')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = 'transparent')
                    }
                  >
                    Configuración
                  </button>
                )}

                {/* Opción 3: Reimprimir Último Ticket (Cajero y Admin) */}
                {!isKitchen && !isGerente && (
                  <button
                    type="button"
                    className="admin-menu-item"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onReprintLastTicket?.();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      minHeight: '44px',
                      padding: '0.75rem 1rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'transparent',
                      color: '#334155',
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                      width: '100%',
                      touchAction: 'manipulation',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = '#f8fafc')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = 'transparent')
                    }
                  >
                    <span>Reimprimir Último Ticket</span>
                  </button>
                )}

                {/* Opción 4: Cerrar Sesión (Todos) */}
                <button
                  type="button"
                  className="admin-menu-item"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onLogout();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: '44px',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'transparent',
                    color: '#ef4444',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                    width: '100%',
                    touchAction: 'manipulation',
                    transition: 'background 0.15s',
                    borderTop: '1px solid #f1f5f9',
                    marginTop: '0.2rem'
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = '#fef2f2')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'transparent')
                  }
                >
                  Cerrar Sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pos-nav-right">
        {/* Atiende: [Nombre] + Badge de Rol */}
        <div
          className="pos-cashier-badge"
          style={{
            background: '#f8fafc',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            fontWeight: 700,
            fontSize: '0.88rem',
            padding: '0.35rem 0.85rem',
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem'
          }}
        >
          <span>Atiende: {employee?.name || 'Personal'}</span>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '0.15rem 0.55rem',
              borderRadius: '9999px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: isAdmin
                ? '#0f172a'
                : isGerente
                ? '#7c3aed'
                : isKitchen
                ? '#059669'
                : '#2563eb',
              color: '#ffffff'
            }}
          >
            {isAdmin ? 'Admin' : isGerente ? 'Gerente' : isKitchen ? 'Cocina' : 'Cajero'}
          </span>
        </div>

        <div className="pos-live-clock">{clockText}</div>
      </div>
    </header>
  );
}
