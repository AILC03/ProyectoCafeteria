import React, { useState, useEffect, useRef } from 'react';
import { isEmployeeAdmin } from '../data/employees.js';

export default function PosHeader({
  activeTab,
  onTabChange,
  employee,
  onLogout,
  audioEnabled = true,
  onOpenSettings,
  businessMode = 'restaurant',
  activeTable = null
}) {
  const [clockText, setClockText] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isAdmin = isEmployeeAdmin(employee);
  const isRestaurant = businessMode === 'restaurant';
  const mainTab = isRestaurant ? 'tables' : 'order';

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
    if (onOpenSettings) {
      onOpenSettings();
    }
  }

  return (
    <header className="pos-top-nav">
      <div className="pos-nav-left">
        <h1 className="pos-logo-text" style={{ margin: 0 }}>
          Coffee´s Pos
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {/* Navegación activa limpia */}
          {activeTab === mainTab ? (
            <div
              className="pos-view-tab active"
              style={{ cursor: 'default', pointerEvents: 'none' }}
            >
              <span>{isRestaurant ? 'Mesas' : 'Tomar Orden'}</span>
            </div>
          ) : (
            <button
              type="button"
              className="pos-view-tab"
              onClick={() => onTabChange(mainTab)}
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
              <span>&larr; {isRestaurant ? 'Volver a Mesas' : 'Volver a Tomar Orden'}</span>
            </button>
          )}

          {/* Indicador de sección si no está en la vista principal */}
          {activeTab === 'order' && activeTable && isRestaurant && (
            <span
              className="pos-view-tab active"
              style={{ cursor: 'default', pointerEvents: 'none' }}
            >
              <span>Mesa {activeTable.number}</span>
            </span>
          )}

          {activeTab === 'admin-dashboard' && (
            <span
              className="pos-view-tab active"
              style={{ cursor: 'default', pointerEvents: 'none' }}
            >
              <span>Administración</span>
            </span>
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
                {/* Opción 1: Administración (Solo perfil Administrador) */}
                {isAdmin && (
                  <button
                    type="button"
                    className="admin-menu-item"
                    onClick={handleSelectAdminDashboard}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: '46px',
                      padding: '0.75rem 1rem',
                      borderRadius: '10px',
                      border: 'none',
                      background:
                        activeTab === 'admin-dashboard'
                          ? '#0f172a'
                          : 'transparent',
                      color:
                        activeTab === 'admin-dashboard'
                          ? '#ffffff'
                          : '#0f172a',
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      textAlign: 'left',
                      cursor: 'pointer',
                      width: '100%',
                      touchAction: 'manipulation',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      if (activeTab !== 'admin-dashboard') {
                        e.currentTarget.style.background = '#f8fafc';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeTab !== 'admin-dashboard') {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    Administración
                  </button>
                )}

                {/* Opción 2: Configuración (Visible para Administrador y Empleados) */}
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
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pos-nav-right">
        {/* Atiende: [Nombre] */}
        <div
          className="pos-cashier-badge"
          style={{
            background: '#f8fafc',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            fontWeight: 700,
            fontSize: '0.88rem',
            padding: '0.45rem 1rem',
            borderRadius: '9999px'
          }}
        >
          <span>Atiende: {employee?.name || 'Personal'}</span>
        </div>

        <div className="pos-live-clock">{clockText}</div>

        <button
          type="button"
          className="btn-pos-logout"
          onClick={onLogout}
          title="Cerrar turno y salir a pantalla de bienvenida"
          style={{
            minHeight: '40px',
            padding: '0.45rem 1.1rem',
            touchAction: 'manipulation',
            fontWeight: 700
          }}
        >
          Cerrar Turno &times;
        </button>
      </div>
    </header>
  );
}
