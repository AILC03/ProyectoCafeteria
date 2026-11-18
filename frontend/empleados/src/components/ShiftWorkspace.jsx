import React, { useState, useEffect } from 'react';
import * as db from '../data/db.js';
import { getEmployees, isEmployeeGerente } from '../data/employees.js';
import { showToast } from '../utils/notify.js';
import { getCurrentCashSession, openCashSession, closeCashSession } from '../api/cash.js';
import { getSalesSummary } from '../api/sales.js';
import { formatCents, numberToCents } from '../utils/money.js';

export default function ShiftWorkspace({ cashierName, currentEmployee }) {
  const isGerente = isEmployeeGerente(currentEmployee);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [startingCashInput, setStartingCashInput] = useState('500');
  const [countedCashInput, setCountedCashInput] = useState('');
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadSession(), loadSummary()]);
    setLoading(false);
  }

  async function loadSession() {
    try {
      const sess = await getCurrentCashSession();
      setActiveSession(sess);
    } catch {
      setActiveSession(null);
    }
  }

  async function loadSummary() {
    try {
      // Intentar cargar resumen de ventas de hoy desde el Backend
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0).toISOString();

      const apiSummary = await getSalesSummary({ from, to });
      if (apiSummary) {
        setSummary({
          totalSales: parseInt(apiSummary.totalCents || '0', 10) / 100,
          ordersCount: apiSummary.count || 0,
          totalOrders: apiSummary.count || 0,
          completedCount: apiSummary.count || 0,
          totalCash: parseInt(apiSummary.cashTotalCents || '0', 10) / 100,
          totalCard: parseInt(apiSummary.stripeTotalCents || '0', 10) / 100,
          avgTicket: apiSummary.count > 0 ? (parseInt(apiSummary.totalCents, 10) / 100) / apiSummary.count : 0,
        });
        return;
      }
    } catch {
      // Fallback a IndexedDB local si API está apagada
    }

    try {
      const data = await db.getDailySummary();
      setSummary(data);
    } catch (err) {
      console.error('Error cargando corte:', err);
    }
  }

  async function handleOpenShift(e) {
    e.preventDefault();
    const cleanInput = String(startingCashInput).trim();
    if (!cleanInput) {
      showToast('Por favor introduce el monto del fondo inicial de caja', 'warning');
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(cleanInput)) {
      showToast('Formato inválido: el fondo inicial debe ser un número positivo (ej. 500.00)', 'error');
      return;
    }
    const cashNum = parseFloat(cleanInput);
    if (isNaN(cashNum) || cashNum < 0) {
      showToast('El fondo inicial debe ser mayor o igual a cero', 'warning');
      return;
    }
    if (cashNum > 50000) {
      showToast('El fondo inicial no puede exceder $50,000.00', 'warning');
      return;
    }

    setIsOpeningSession(true);
    try {
      const sess = await openCashSession(numberToCents(cashNum));
      setActiveSession(sess);
      showToast('¡Turno de caja abierto en el backend!', 'success');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Error al abrir caja', 'error');
    } finally {
      setIsOpeningSession(false);
    }
  }

  async function handleCloseShift(e) {
    e.preventDefault();
    if (!activeSession) return;
    const cleanInput = String(countedCashInput).trim();
    if (!cleanInput) {
      showToast('Por favor introduce el monto en efectivo contado al arqueo', 'warning');
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(cleanInput)) {
      showToast('Formato inválido: el efectivo contado debe ser un número positivo (ej. 1250.50)', 'error');
      return;
    }
    const cashNum = parseFloat(cleanInput);
    if (isNaN(cashNum) || cashNum < 0) {
      showToast('Por favor introduce un monto en efectivo contado válido', 'warning');
      return;
    }
    if (cashNum > 500000) {
      showToast('El monto en efectivo contado no puede exceder $500,000.00', 'warning');
      return;
    }

    setIsClosingSession(true);
    try {
      const res = await closeCashSession(activeSession.id, numberToCents(cashNum));
      showToast('Turno de caja cerrado exitosamente.', 'success');
      setActiveSession(null);
      setCountedCashInput('');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Error al cerrar caja', 'error');
    } finally {
      setIsClosingSession(false);
    }
  }

  async function handleExportJson() {
    try {
      const json = await db.exportBackupJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `corte_caja_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast('Error al exportar: ' + err.message, 'error');
    }
  }

  function handlePrintShift() {
    window.print();
  }

  if (loading) {
    return (
      <div className="pos-workspace-view active" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
        Calculando corte y sincronizando sesión de caja con el backend...
      </div>
    );
  }

  const s = {
    totalSales: Number(summary?.totalSales || 0),
    totalOrders: Number(summary?.ordersCount ?? summary?.totalOrders ?? 0),
    completedCount: Number(summary?.completedCount ?? 0),
    averageTicket: Number(summary?.avgTicket ?? summary?.averageTicket ?? 0),
    cashSales: Number(summary?.totalCash ?? summary?.cashSales ?? 0),
    cardSales: Number(summary?.totalCard ?? summary?.cardSales ?? 0),
    transferSales: Number(summary?.totalTransfer ?? summary?.transferSales ?? 0),
    totalTips: Number(summary?.totalTips || 0),
  };

  const allEmployees = getEmployees();
  const salesByEmp = summary?.employeeSales || [];

  const employeeReportList = allEmployees.map((emp) => {
    const saleData = salesByEmp.find(
      (s) => String(s.id).trim() === String(emp.id).trim() || s.name === emp.name
    );
    return {
      id: emp.id,
      name: emp.name,
      role: emp.role,
      ordersCount: saleData?.ordersCount || 0,
      totalSales: saleData?.totalSales || 0,
      cashSales: saleData?.cashSales || 0,
      cardSales: saleData?.cardSales || 0,
      transferSales: saleData?.transferSales || 0,
      averageTicket: saleData?.averageTicket || 0,
    };
  });

  employeeReportList.sort((a, b) => b.totalSales - a.totalSales);

  return (
    <div className="pos-workspace-view active" style={{ flexDirection: 'column', padding: '1.5rem', overflowY: 'auto' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Corte y Sesión de Caja
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Fecha: {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} &bull; Turno en curso
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={loadAll}
            style={{
              padding: '0.6rem 1.2rem',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '9999px',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
              color: '#0f172a'
            }}
          >
            Actualizar
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            style={{
              padding: '0.6rem 1.2rem',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '9999px',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
              color: '#0f172a'
            }}
          >
            Exportar Respaldo
          </button>
          <button
            type="button"
            onClick={handlePrintShift}
            style={{
              padding: '0.6rem 1.25rem',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '9999px',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer'
            }}
          >
            Imprimir Reporte
          </button>
        </div>
      </div>

      {/* Bloque 0: Estado de Sesión de Caja en Backend */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.85rem' }}>
          Estado de Caja del Turno (Backend)
        </h3>

        {activeSession ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>SESIÓN ID</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>#{activeSession.id}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>FONDO INICIAL</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>{formatCents(activeSession.startingCashCents)}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>VENTAS EFECTIVO CAJA</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669' }}>{formatCents(activeSession.cashSalesCents || '0')}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>ESTADO</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#2563eb' }}>● ABIERTA Y OPERANDO</div>
              </div>
            </div>

            {/* Formulario de Cierre de Caja / Aviso Gerencial */}
            {isGerente ? (
              <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '0.9rem 1.25rem', borderRadius: '12px', color: '#6b21a8', fontSize: '0.88rem', fontWeight: 600 }}>
                ℹ️ Modo Supervisión Gerencial (Solo Lectura): La caja se encuentra abierta y operando. El arqueo y cierre corresponden al cajero en turno o al administrador.
              </div>
            ) : (
              <form onSubmit={handleCloseShift} style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#92400e', marginBottom: '0.3rem' }}>
                    ARQUEO DE CIERRE: Efectivo contado en caja ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={countedCashInput}
                    onChange={(e) => setCountedCashInput(e.target.value)}
                    placeholder="Ej. 1250"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', fontWeight: 700 }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isClosingSession || !countedCashInput}
                  style={{
                    height: '42px',
                    padding: '0 1.5rem',
                    background: '#b45309',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    marginTop: '1.2rem'
                  }}
                >
                  {isClosingSession ? 'CERRANDO CAJA...' : 'CERRAR TURNO Y REALIZAR ARQUEO'}
                </button>
              </form>
            )}
          </div>
        ) : isGerente ? (
          <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '1.25rem', borderRadius: '14px', color: '#64748b' }}>
            <span style={{ display: 'block', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.2rem' }}>
              No hay una sesión de caja abierta actualmente
            </span>
            <p style={{ fontSize: '0.85rem', margin: 0 }}>
              ℹ️ Modo Supervisión Gerencial (Solo Lectura): La apertura de turno de caja corresponde al personal en turno o administrador.
            </p>
          </div>
        ) : (
          <form onSubmit={handleOpenShift} style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '1.25rem', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <span style={{ display: 'block', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.2rem' }}>
                No hay una sesión de caja abierta actualmente
              </span>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
                Para cobrar órdenes en efectivo en el punto de venta, abre la caja registradora con un fondo inicial.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.2rem' }}>
                  FONDO INICIAL ($ MXN)
                </label>
                <input
                  type="number"
                  step="50"
                  value={startingCashInput}
                  onChange={(e) => setStartingCashInput(e.target.value)}
                  style={{ width: '130px', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', fontWeight: 800 }}
                />
              </div>
              <button
                type="submit"
                disabled={isOpeningSession}
                className="btn-confirm-action"
                style={{ height: '42px', padding: '0 1.5rem', marginTop: '1.2rem' }}
              >
                {isOpeningSession ? 'ABRIENDO...' : 'ABRIR CAJA REGISTRADORA'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Bloque 1: Total de Dinero y Métricas del Día */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.85rem' }}>
          Resumen Consolidado de Ventas del Día
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ background: '#0f172a', color: '#ffffff', padding: '1.25rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)' }}>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Total de Dinero Cobrado</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ffffff', marginTop: '0.25rem' }}>
              ${s.totalSales.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.35rem' }}>
              {s.completedCount} tickets cerrados hoy
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Efectivo en Caja</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#059669', marginTop: '0.25rem' }}>
              ${s.cashSales.toFixed(2)}
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Ventas con Tarjeta</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#2563eb', marginTop: '0.25rem' }}>
              ${s.cardSales.toFixed(2)}
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Ticket Promedio</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#0f172a', marginTop: '0.25rem' }}>
              ${s.averageTicket.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Bloque 2: Ventas del Día de Todos los Empleados */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Ventas por Personal
            </h3>
            <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
              Desglose de actividad por empleado en turno
            </p>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.85rem 1rem' }}>Empleado</th>
                <th style={{ padding: '0.85rem 1rem' }}>Rol</th>
                <th style={{ padding: '0.85rem 1rem' }}>Órdenes</th>
                <th style={{ padding: '0.85rem 1rem' }}>Total Cobrado</th>
              </tr>
            </thead>
            <tbody>
              {employeeReportList.map((emp) => (
                <tr key={emp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#0f172a' }}>{emp.name}</td>
                  <td style={{ padding: '0.85rem 1rem', color: '#64748b' }}>{emp.role}</td>
                  <td style={{ padding: '0.85rem 1rem', color: '#0f172a' }}>{emp.ordersCount}</td>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#059669' }}>${emp.totalSales.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
