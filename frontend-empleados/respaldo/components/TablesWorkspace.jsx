import React, { useState, useEffect, useMemo } from 'react';
import { getTables } from '../data/tablesData.js';

export default function TablesWorkspace({ onSelectTable }) {
  const [tables, setTables] = useState(getTables);

  useEffect(() => {
    function handleUpdate() {
      setTables(getTables());
    }
    window.addEventListener('taffy:tables_updated', handleUpdate);
    return () => window.removeEventListener('taffy:tables_updated', handleUpdate);
  }, []);

  const counts = useMemo(() => {
    const total = tables.length;
    const occupied = tables.filter(
      (t) => t.status === 'occupied' || t.status === 'bill_requested'
    ).length;
    const available = total - occupied;
    return { total, occupied, available };
  }, [tables]);

  return (
    <div
      className="pos-workspace-view active"
      style={{
        padding: '1.75rem',
        overflowY: 'auto',
        background: '#f8fafc',
        minHeight: 'calc(100vh - 64px)',
        boxSizing: 'border-box'
      }}
    >
      {/* Encabezado Simple y Limpio (Sin barra de filtros) */}
      <div
        style={{
          marginBottom: '1.75rem'
        }}
      >
        <h2
          style={{
            fontSize: '1.6rem',
            fontWeight: 900,
            color: '#0f172a',
            margin: 0,
            letterSpacing: '-0.02em'
          }}
        >
          Control de Mesas
        </h2>
        <p
          style={{
            margin: '0.35rem 0 0',
            color: '#64748b',
            fontSize: '0.95rem',
            fontWeight: 500
          }}
        >
          {counts.total} mesas registradas &bull; {counts.occupied} ocupadas &bull; {counts.available} disponibles
        </p>
      </div>

      {/* Cuadrícula de Mesas - Diseño Minimalista Táctil */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))',
          gap: '1.5rem',
          paddingBottom: '2.5rem'
        }}
      >
        {tables.map((table) => {
          const isOccupied =
            table.status === 'occupied' || table.status === 'bill_requested';
          const isBillRequested = table.status === 'bill_requested';

          // Barra superior: Verde si disponible, Ámbar si cuenta pedida, Roja si ocupada
          const stripeColor = !isOccupied
            ? '#10b981'
            : isBillRequested
            ? '#f59e0b'
            : '#ef4444';

          return (
            <div
              key={table.id}
              onClick={() => onSelectTable(table)}
              style={{
                position: 'relative',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '20px',
                aspectRatio: '1 / 1',
                minHeight: '175px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.5rem 1rem',
                cursor: 'pointer',
                boxShadow: isOccupied
                  ? '0 6px 16px rgba(239, 68, 68, 0.08)'
                  : '0 4px 12px rgba(15, 23, 42, 0.04)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                touchAction: 'manipulation',
                userSelect: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.09)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = isOccupied
                  ? '0 6px 16px rgba(239, 68, 68, 0.08)'
                  : '0 4px 12px rgba(15, 23, 42, 0.04)';
              }}
            >
              {/* Línea de Estado Superior (Bordes superiores redondeados) */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '7px',
                  background: stripeColor,
                  borderTopLeftRadius: '19px',
                  borderTopRightRadius: '19px'
                }}
              />

              {/* Número de Mesa Centrado en Grande */}
              <div
                style={{
                  fontSize: '2.8rem',
                  fontWeight: 900,
                  color: '#0f172a',
                  lineHeight: 1,
                  letterSpacing: '-0.03em'
                }}
              >
                {table.number}
              </div>

              {/* Capacidad de Comensales */}
              <div
                style={{
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color: '#64748b',
                  marginTop: '0.6rem',
                  textAlign: 'center'
                }}
              >
                Capacidad: {table.capacity || 4} comensales
              </div>

              {/* Indicador sutil si tiene comanda o cuenta pedida */}
              {isOccupied && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '12px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: isBillRequested ? '#d97706' : '#dc2626'
                  }}
                >
                  {isBillRequested ? 'Cuenta Pedida' : 'Ocupada'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
