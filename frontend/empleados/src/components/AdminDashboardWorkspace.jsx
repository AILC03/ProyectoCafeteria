import React, { useState, useEffect } from 'react';
import ShiftWorkspace from './ShiftWorkspace.jsx';
import MenuManagementWorkspace from './MenuManagementWorkspace.jsx';
import UserManagementWorkspace from './UserManagementWorkspace.jsx';
import HistoryWorkspace from './HistoryWorkspace.jsx';
import { isEmployeeAdmin } from '../data/employees.js';

export default function AdminDashboardWorkspace({
  currentEmployee,
  account,
  onBack,
  onReprintOrder,
  onLogout,
  onUnlinkAccount
}) {
  const isAdmin = isEmployeeAdmin(currentEmployee);
  const [activeAdminTab, setActiveAdminTab] = useState('shift');

  const allMenuItems = [
    {
      id: 'shift',
      label: 'Corte de Caja',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      )
    },
    {
      id: 'menu-admin',
      label: 'Editar Menú',
      adminOnly: true,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      )
    },
    {
      id: 'users-admin',
      label: 'Personal y Usuarios',
      adminOnly: true,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      id: 'history',
      label: 'Historial de Pedidos',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )
    }
  ];

  const menuItems = allMenuItems.filter((m) => !m.adminOnly || isAdmin);

  if (!isAdmin) {
    return (
      <div style={{ padding: '4rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔒</div>
        <h3 style={{ fontSize: '1.4rem', color: '#0f172a', fontWeight: 800 }}>Acceso Restringido</h3>
        <p style={{ marginTop: '0.5rem', fontSize: '1rem' }}>
          Este panel es de uso exclusivo para Administradores.
        </p>
        <button
          type="button"
          onClick={onBack}
          style={{
            marginTop: '1.25rem',
            padding: '0.65rem 1.5rem',
            background: '#0f172a',
            color: '#fff',
            borderRadius: '9999px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          &larr; Volver
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: '#f8fafc',
        fontFamily: 'var(--font-inter, sans-serif)'
      }}
    >
      {/* ============================================================== */}
      {/* BARRA LATERAL IZQUIERDA (Estilo Supabase Dashboard)            */}
      {/* ============================================================== */}
      <aside
        style={{
          width: '270px',
          minWidth: '270px',
          background: '#0b1120',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '1.25rem 0.9rem',
          boxSizing: 'border-box',
          userSelect: 'none'
        }}
      >
        {/* Parte Superior del Sidebar: Negocio y Navegación */}
        <div>
          {/* Encabezado del Local */}
          <div
            style={{
              padding: '0.5rem 0.6rem 1.25rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '1rem'
            }}
          >
            <div
              style={{
                fontSize: '1.15rem',
                fontWeight: 900,
                color: '#ffffff',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                textTransform: 'uppercase'
              }}
            >
              {account?.businessName || 'Coffee´s Pos'}
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#94a3b8',
                fontWeight: 600,
                marginTop: '0.3rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#10b981'
                }}
              />
              <span>Panel de Administración</span>
            </div>
          </div>

          {/* Menú de Opciones */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {menuItems.map((item) => {
              const isActive = activeAdminTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveAdminTab(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    width: '100%',
                    padding: '0.75rem 0.85rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: isActive ? '#1e293b' : 'transparent',
                    color: isActive ? '#38bdf8' : '#cbd5e1',
                    fontSize: '0.88rem',
                    fontWeight: isActive ? 700 : 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                      e.currentTarget.style.color = '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#cbd5e1';
                    }
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', color: isActive ? '#38bdf8' : '#94a3b8' }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Parte Inferior del Sidebar: Volver y Cerrar Sesión */}
        <div
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: '0.9rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}
        >
          {/* Volver al Punto de Venta */}
          <button
            type="button"
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#ffffff',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Volver a Ventas</span>
          </button>

          {/* Cerrar Sesión (Solo Admin) */}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.7rem 1rem',
                borderRadius: '10px',
                border: 'none',
                background: 'transparent',
                color: '#f87171',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Cerrar Sesión</span>
            </button>
          )}
        </div>
      </aside>

      {/* ============================================================== */}
      {/* ÁREA DE CONTENIDO PRINCIPAL                                    */}
      {/* ============================================================== */}
      <main
        style={{
          flex: 1,
          height: '100vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box'
        }}
      >
        {/* Barra Superior del Panel */}
        <header
          style={{
            padding: '1rem 2rem',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxSizing: 'border-box'
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '1.35rem',
                fontWeight: 800,
                color: '#0f172a',
                margin: 0,
                letterSpacing: '-0.02em'
              }}
            >
              {menuItems.find((m) => m.id === activeAdminTab)?.label || 'Administración'}
            </h1>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
              Terminal: {account?.terminalName || 'Caja Principal'} &bull; {account?.businessName || 'Cafetería'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: '#0f172a',
                background: '#f1f5f9',
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                border: '1px solid #e2e8f0'
              }}
            >
              Administrador: {currentEmployee?.name || 'Administrador'}
            </div>
          </div>
        </header>

        {/* Vista del Contenido Activo */}
        <div style={{ flex: 1, padding: '1.75rem 2rem', boxSizing: 'border-box' }}>
          {activeAdminTab === 'shift' && (
            <ShiftWorkspace
              cashierName={currentEmployee?.name}
              currentEmployee={currentEmployee}
            />
          )}

          {activeAdminTab === 'menu-admin' && (
            isAdmin ? (
              <MenuManagementWorkspace />
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔒</div>
                <h3>Acceso Restringido</h3>
                <p>La edición de catálogo está reservada exclusivamente para Administradores.</p>
              </div>
            )
          )}

          {activeAdminTab === 'users-admin' && (
            isAdmin ? (
              <UserManagementWorkspace currentEmployee={currentEmployee} />
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔒</div>
                <h3>Acceso Restringido</h3>
                <p>La gestión de usuarios y personal está reservada exclusivamente para Administradores.</p>
              </div>
            )
          )}

          {activeAdminTab === 'history' && (
            <HistoryWorkspace onReprintOrder={onReprintOrder} />
          )}
        </div>
      </main>
    </div>
  );
}
