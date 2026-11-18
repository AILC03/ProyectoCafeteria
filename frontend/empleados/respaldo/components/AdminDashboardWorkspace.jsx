import React, { useState } from 'react';
import ShiftWorkspace from './ShiftWorkspace.jsx';
import AdminTablesManager from './AdminTablesManager.jsx';
import MenuManagementWorkspace from './MenuManagementWorkspace.jsx';
import UserManagementWorkspace from './UserManagementWorkspace.jsx';
import HistoryWorkspace from './HistoryWorkspace.jsx';

export default function AdminDashboardWorkspace({
  currentEmployee,
  onBack,
  businessMode = 'restaurant',
  onReprintOrder
}) {
  const [activeAdminTab, setActiveAdminTab] = useState(
    businessMode === 'restaurant' ? 'tables-admin' : 'shift'
  );

  const tabs = [
    ...(businessMode === 'restaurant'
      ? [{ id: 'tables-admin', label: 'Gestión de Mesas' }]
      : []),
    { id: 'shift', label: 'Corte de Caja' },
    { id: 'menu-admin', label: 'Editar Menú' },
    { id: 'users-admin', label: 'Usuarios' },
    { id: 'history', label: 'Historial de Pedidos' }
  ];

  return (
    <div
      className="pos-workspace-view active"
      style={{
        padding: '1.5rem',
        background: '#f8fafc',
        minHeight: 'calc(100vh - 64px)',
        overflowY: 'auto',
        boxSizing: 'border-box'
      }}
    >
      {/* Barra Superior del Dashboard */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
          paddingBottom: '1.25rem',
          borderBottom: '1px solid #e2e8f0'
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '1.6rem',
              fontWeight: 900,
              color: '#0f172a',
              margin: 0,
              letterSpacing: '-0.02em'
            }}
          >
            Dashboard de Administración
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Panel de control gerencial &bull; {currentEmployee?.name || 'Administrador'}
          </p>
        </div>

        {/* Botón táctil para volver al punto de toma de órdenes / salón */}
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            minHeight: '48px',
            padding: '0.75rem 1.4rem',
            background: '#ffffff',
            color: '#0f172a',
            border: '2px solid #0f172a',
            borderRadius: '12px',
            fontSize: '0.92rem',
            fontWeight: 800,
            cursor: 'pointer',
            touchAction: 'manipulation',
            boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
          }}
        >
          &larr; {businessMode === 'restaurant' ? 'Volver a Mesas' : 'Volver a Ventas'}
        </button>
      </div>

      {/* Pestañas de Navegación del Dashboard */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          paddingBottom: '0.75rem',
          marginBottom: '1.25rem',
          scrollbarWidth: 'none'
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeAdminTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveAdminTab(tab.id)}
              style={{
                minHeight: '48px',
                padding: '0.65rem 1.4rem',
                borderRadius: '12px',
                border: 'none',
                background: isActive ? '#0f172a' : '#ffffff',
                color: isActive ? '#ffffff' : '#475569',
                fontSize: '0.92rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                touchAction: 'manipulation',
                boxShadow: isActive
                  ? '0 4px 12px rgba(15, 23, 42, 0.18)'
                  : '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Contenido según pestaña activa */}
      <div style={{ paddingBottom: '2rem' }}>
        {activeAdminTab === 'tables-admin' && <AdminTablesManager />}

        {activeAdminTab === 'shift' && (
          <ShiftWorkspace cashierName={currentEmployee?.name} />
        )}

        {activeAdminTab === 'menu-admin' && <MenuManagementWorkspace />}

        {activeAdminTab === 'users-admin' && (
          <UserManagementWorkspace currentEmployee={currentEmployee} />
        )}

        {activeAdminTab === 'history' && (
          <HistoryWorkspace onReprintOrder={onReprintOrder} />
        )}
      </div>
    </div>
  );
}
