import React, { useState, useEffect } from 'react';
import {
  getTables,
  addTable,
  updateTable,
  deleteTable,
  clearTable
} from '../data/tablesData.js';
import { showToast, showConfirm } from '../utils/notify.js';

export default function AdminTablesManager() {
  const [tables, setTables] = useState(getTables);
  const [showModal, setShowModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [formNumber, setFormNumber] = useState('');
  const [formCapacity, setFormCapacity] = useState('4');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    function handleUpdate() {
      setTables(getTables());
    }
    window.addEventListener('taffy:tables_updated', handleUpdate);
    return () => window.removeEventListener('taffy:tables_updated', handleUpdate);
  }, []);

  function handleOpenAdd() {
    setEditingTable(null);
    setFormNumber('');
    setFormCapacity('4');
    setErrorMessage('');
    setShowModal(true);
  }

  function handleOpenEdit(table) {
    setEditingTable(table);
    setFormNumber(table.number);
    setFormCapacity(String(table.capacity || 4));
    setErrorMessage('');
    setShowModal(true);
  }

  function handleDeleteTable(table) {
    showConfirm({
      title: 'Eliminar Mesa',
      message: `¿Confirmas que deseas eliminar la ${table.number}? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      isDestructive: true,
      onConfirm: () => {
        const res = deleteTable(table.id);
        if (!res.success) {
          showToast(res.message, 'error');
        } else {
          showToast(`Mesa ${table.number} eliminada correctamente`, 'success');
        }
      }
    });
  }

  function handleForceRelease(table) {
    showConfirm({
      title: 'Liberar Mesa',
      message: `¿Deseas liberar la ${table.number} y vaciar su comanda activa?`,
      confirmText: 'Liberar',
      cancelText: 'Cancelar',
      onConfirm: () => {
        clearTable(table.id);
        showToast(`Mesa ${table.number} liberada`, 'success');
      }
    });
  }

  function handleSave(e) {
    e.preventDefault();
    setErrorMessage('');

    if (editingTable) {
      const res = updateTable(editingTable.id, {
        number: formNumber,
        capacity: Number(formCapacity)
      });
      if (!res.success) {
        setErrorMessage(res.message);
        return;
      }
      showToast(`Mesa ${formNumber} actualizada`, 'success');
    } else {
      const res = addTable({
        number: formNumber,
        capacity: Number(formCapacity)
      });
      if (!res.success) {
        setErrorMessage(res.message);
        return;
      }
      showToast(`Mesa ${formNumber} creada con éxito`, 'success');
    }

    setShowModal(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header de Gestión de Mesas */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: '#ffffff',
          padding: '1.25rem 1.5rem',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
            Distribución y Gestión de Mesas
          </h3>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>
            Agrega, edita capacidades o elimina mesas del salón.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          style={{
            minHeight: '48px',
            padding: '0.75rem 1.4rem',
            background: '#0f172a',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            fontWeight: 700,
            fontSize: '0.92rem',
            cursor: 'pointer',
            touchAction: 'manipulation',
            boxShadow: '0 2px 6px rgba(15, 23, 42, 0.15)'
          }}
        >
          + Agregar Mesa
        </button>
      </div>

      {/* Grid de Mesas para Administrador */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1rem'
        }}
      >
        {tables.map((table) => {
          const isOccupied = table.status === 'occupied' || table.status === 'bill_requested';
          const isBillRequested = table.status === 'bill_requested';
          const stripeColor = !isOccupied ? '#10b981' : isBillRequested ? '#f59e0b' : '#ef4444';

          return (
            <div
              key={table.id}
              style={{
                position: 'relative',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                overflow: 'hidden'
              }}
            >
              {/* Barra de color superior */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '6px',
                  background: stripeColor
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '0.25rem' }}>
                <div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
                    {table.number}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.15rem' }}>
                    Capacidad: {table.capacity || 4} comensales
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                    background: !isOccupied ? '#ecfdf5' : isBillRequested ? '#fffbeb' : '#fef2f2',
                    color: !isOccupied ? '#059669' : isBillRequested ? '#d97706' : '#dc2626'
                  }}
                >
                  {!isOccupied ? 'Disponible' : isBillRequested ? 'Cuenta Pedida' : 'Ocupada'}
                </span>
              </div>

              {/* Botones de acción touch-friendly */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(table)}
                  style={{
                    flex: 1,
                    minHeight: '40px',
                    padding: '0.45rem',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    color: '#1e293b',
                    cursor: 'pointer',
                    touchAction: 'manipulation'
                  }}
                >
                  Editar
                </button>

                {!isOccupied ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteTable(table)}
                    style={{
                      flex: 1,
                      minHeight: '40px',
                      padding: '0.45rem',
                      background: '#fff1f2',
                      border: '1px solid #fecdd3',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      color: '#be123c',
                      cursor: 'pointer',
                      touchAction: 'manipulation'
                    }}
                  >
                    Eliminar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleForceRelease(table)}
                    style={{
                      flex: 1,
                      minHeight: '40px',
                      padding: '0.45rem',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      color: '#b45309',
                      cursor: 'pointer',
                      touchAction: 'manipulation'
                    }}
                  >
                    Liberar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Agregar / Editar Mesa */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem'
          }}
          onClick={() => setShowModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '1.75rem',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 20px 40px -10px rgba(0,0,0,0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                {editingTable ? `Editar Mesa ${editingTable.number}` : 'Nueva Mesa'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#f1f5f9',
                  color: '#64748b',
                  fontSize: '1.2rem',
                  cursor: 'pointer'
                }}
              >
                &times;
              </button>
            </div>

            {errorMessage && (
              <div
                style={{
                  padding: '0.65rem 0.9rem',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  fontSize: '0.88rem'
                }}
              >
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Número o Identificador
                </label>
                <input
                  type="text"
                  placeholder="Ej. 14, Barra 3, Terraza 5"
                  value={formNumber}
                  onChange={(e) => setFormNumber(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    minHeight: '48px',
                    padding: '0.75rem 1rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    fontSize: '0.95rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Capacidad de Comensales
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formCapacity}
                  onChange={(e) => setFormCapacity(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    minHeight: '48px',
                    padding: '0.75rem 1rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    fontSize: '0.95rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    minHeight: '48px',
                    padding: '0.75rem 1.25rem',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    color: '#475569'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    minHeight: '48px',
                    padding: '0.75rem 1.5rem',
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  {editingTable ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
