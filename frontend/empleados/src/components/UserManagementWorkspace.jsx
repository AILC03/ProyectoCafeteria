import React, { useState, useEffect } from 'react';
import {
  getEmployees,
  saveEmployees,
  addEmployee,
  deleteEmployee,
  updateEmployee,
  isEmployeeAdmin
} from '../data/employees.js';
import { showToast, showConfirm } from '../utils/notify.js';
import { getAdminEmployees, createAdminEmployee, updateAdminEmployee } from '../api/employees.js';
import { loginStaff } from '../api/auth.js';

export default function UserManagementWorkspace({ currentEmployee }) {
  const [employees, setEmployees] = useState(getEmployees);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Formulario de alta / edición
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('CAJERO');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadApiEmployees() {
      try {
        const list = await getAdminEmployees();
        if (isMounted && list && list.length > 0) {
          const mapped = list.map((e) => ({
            id: String(e.id),
            name: e.name,
            role: e.role,
            username: e.username,
            isAdmin: e.role === 'ADMINISTRADOR',
            isActive: e.isActive !== false,
            isSyncedWithDb: true,
          }));
          setEmployees(mapped);
          localStorage.setItem('coffees_employees_local', JSON.stringify(mapped));
          localStorage.setItem('taffy_employees_local', JSON.stringify(mapped));
        }
      } catch {
        // Fallback local
      }
    }
    loadApiEmployees();

    function handleUpdate(e) {
      if (e?.detail && Array.isArray(e.detail)) {
        setEmployees(e.detail);
      } else {
        setEmployees(getEmployees());
      }
    }
    window.addEventListener('coffees:employees_updated', handleUpdate);
    window.addEventListener('taffy:employees_updated', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('coffees:employees_updated', handleUpdate);
      window.removeEventListener('taffy:employees_updated', handleUpdate);
    };
  }, []);

  function resetForm() {
    setFormName('');
    setFormRole('CAJERO');
    setFormUsername('');
    setFormPassword('');
    setFormIsActive(true);
    setEditingEmployee(null);
    setErrorMessage('');
  }

  function handleOpenAdd() {
    resetForm();
    setShowAddForm(true);
    setSuccessMessage('');
  }

  function handleOpenEdit(emp) {
    setEditingEmployee(emp);
    setFormName(emp.name);
    setFormRole(emp.role || 'CAJERO');
    setFormUsername(emp.username || emp.id);
    setFormPassword('');
    setFormIsActive(emp.isActive !== false);
    setShowAddForm(true);
    setErrorMessage('');
    setSuccessMessage('');
  }

  async function handleSave(e) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const cleanName = formName.trim();
      if (!cleanName) {
        setErrorMessage('El nombre completo es obligatorio.');
        return;
      }
      if (cleanName.length < 3 || cleanName.length > 50) {
        setErrorMessage('El nombre completo debe tener entre 3 y 50 caracteres.');
        return;
      }
      if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(cleanName)) {
        setErrorMessage('El nombre completo solo puede contener letras y espacios.');
        return;
      }

      if (editingEmployee) {
        if (/^\d+$/.test(String(editingEmployee.id))) {
          try {
            await updateAdminEmployee(editingEmployee.id, {
              name: cleanName,
              role: formRole,
              isActive: formIsActive,
              reason: 'Modificación desde panel administrativo POS',
            });
            showToast('Empleado actualizado en la base de datos PostgreSQL', 'success');
          } catch (err) {
            setErrorMessage(err.message || 'Error al actualizar empleado en la base de datos');
            return;
          }
        }

        // Actualizar empleado existente localmente
        const res = updateEmployee(editingEmployee.id, {
          name: cleanName,
          role: formRole,
          isActive: formIsActive,
          isAdmin: formRole === 'ADMINISTRADOR',
        });
        if (!res.success) {
          setErrorMessage(res.message);
          return;
        }
        setEmployees(getEmployees());
        setShowAddForm(false);
        resetForm();
        setSuccessMessage('Usuario actualizado con éxito.');
      } else {
        // Alta de nuevo empleado
        const cleanUser = formUsername.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,24}$/.test(cleanUser)) {
          setErrorMessage('El nombre de usuario debe tener entre 3 y 24 caracteres (solo letras minúsculas, números y guión bajo).');
          return;
        }

        // Validación de existencia previa (no permitir usernames duplicados)
        const alreadyExists = employees.some(
          (e) => (e.username && e.username.toLowerCase() === cleanUser) ||
                 String(e.id).toLowerCase() === cleanUser
        );
        if (alreadyExists) {
          setErrorMessage(`El nombre de usuario "@${cleanUser}" ya se encuentra registrado. Por favor elija un nombre diferente.`);
          return;
        }

        if (formPassword.length < 8 || formPassword.length > 24) {
          setErrorMessage('La contraseña debe tener entre 8 y 24 caracteres (requerido por Argon2id para la base de datos).');
          return;
        }

        let backendUser = null;
        try {
          backendUser = await createAdminEmployee({
            name: cleanName,
            username: cleanUser,
            password: formPassword,
            role: formRole,
          });
          showToast(`Empleado "${cleanName}" creado y guardado en la base de datos PostgreSQL`, 'success');
        } catch (err) {
          console.warn('API create error:', err);
          setErrorMessage(err.message || 'No se pudo crear el empleado en la base de datos. Verifica credenciales y username.');
          return;
        }

        // Alta en almacenamiento local garantizada con el ID real de la base de datos
        const newEmployee = {
          id: backendUser?.id ? String(backendUser.id) : String(Date.now()).slice(-4),
          name: cleanName,
          username: cleanUser,
          role: formRole,
          pin: formPassword,
          isAdmin: formRole === 'ADMINISTRADOR',
          isActive: true,
          isSyncedWithDb: true,
        };

        const res = addEmployee(newEmployee);
        if (!res.success) {
          setErrorMessage(res.message);
          return;
        }
        setEmployees(getEmployees());
        setShowAddForm(false);
        resetForm();
        setSuccessMessage(`Usuario ${newEmployee.name} (@${cleanUser}) registrado con éxito en la base de datos.`);
      }
    } catch (unexpectedErr) {
      console.error('Error inesperado al guardar usuario:', unexpectedErr);
      setErrorMessage('Ocurrió un error al procesar el guardado.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Dar de baja (desactivar usuario en base de datos)
  function handleDeactivate(emp) {
    const currentId = currentEmployee?.id;
    if (String(emp.id).trim() === String(currentId).trim()) {
      showToast('No puedes dar de baja tu propio usuario mientras tienes la sesión iniciada.', 'error');
      return;
    }

    showConfirm({
      title: 'Dar de Baja Empleado',
      message: `¿Confirmas que deseas dar de baja al usuario ${emp.name} (@${emp.username || emp.id})? Su acceso al sistema será revocado y pasará a estado Inactivo en la base de datos.`,
      confirmText: 'Dar de Baja',
      cancelText: 'Cancelar',
      isDestructive: true,
      onConfirm: async () => {
        try {
          if (/^\d+$/.test(String(emp.id))) {
            await updateAdminEmployee(emp.id, {
              isActive: false,
              reason: 'Baja solicitada en panel gerencial POS',
            });
          }
          // Actualizar estado local y en pantalla
          updateEmployee(emp.id, { isActive: false });
          setEmployees((prev) =>
            prev.map((e) => (String(e.id).trim() === String(emp.id).trim() ? { ...e, isActive: false } : e))
          );
          showToast(`Usuario ${emp.name} dado de baja exitosamente en la base de datos.`, 'success');
        } catch (err) {
          showToast(err.message || 'Error al dar de baja al usuario en la base de datos', 'error');
        }
      }
    });
  }

  // Dar de alta / Reactivar (activar usuario en base de datos)
  function handleReactivate(emp) {
    showConfirm({
      title: 'Dar de Alta / Reactivar Empleado',
      message: `¿Deseas reactivar al usuario ${emp.name} (@${emp.username || emp.id}) para que vuelva a tener acceso al sistema?`,
      confirmText: 'Reactivar',
      cancelText: 'Cancelar',
      isDestructive: false,
      onConfirm: async () => {
        try {
          if (/^\d+$/.test(String(emp.id))) {
            await updateAdminEmployee(emp.id, {
              isActive: true,
              reason: 'Reactivación solicitada en panel gerencial POS',
            });
          }
          updateEmployee(emp.id, { isActive: true });
          setEmployees((prev) =>
            prev.map((e) => (String(e.id).trim() === String(emp.id).trim() ? { ...e, isActive: true } : e))
          );
          showToast(`Usuario ${emp.name} reactivado con éxito en la base de datos.`, 'success');
        } catch (err) {
          showToast(err.message || 'Error al reactivar usuario en la base de datos', 'error');
        }
      }
    });
  }

  if (!isEmployeeAdmin(currentEmployee)) {
    return (
      <div className="pos-workspace-view active" style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔒</div>
        <h3 style={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 800 }}>Acceso Restringido</h3>
        <p style={{ marginTop: '0.5rem', fontSize: '0.95rem' }}>
          Se requieren permisos de <strong>Administrador</strong> para gestionar el personal del sistema.
        </p>
      </div>
    );
  }

  return (
    <div className="pos-workspace-view active" style={{ padding: '1.5rem', overflowY: 'auto' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Gestión de Usuarios
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Altas y bajas de personal &bull; {employees.length} usuarios registrados
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          style={{
            padding: '0.65rem 1.35rem',
            background: '#0f172a',
            color: '#ffffff',
            border: 'none',
            borderRadius: '9999px',
            fontWeight: 700,
            fontSize: '0.88rem',
            cursor: 'pointer'
          }}
        >
          + Dar de Alta Usuario
        </button>
      </div>

      {/* Mensajes de retroalimentación */}
      {successMessage && (
        <div style={{ padding: '0.75rem 1.25rem', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600 }}>
          {successMessage}
        </div>
      )}

      {/* Formulario de Alta / Edición (Inline / Card) */}
      {showAddForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
            {editingEmployee ? `Modificar Usuario: ${editingEmployee.name}` : 'Registrar Nuevo Usuario'}
          </h3>

          {errorMessage && (
            <div style={{ padding: '0.6rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Nombre Completo
              </label>
              <input
                type="text"
                placeholder="Ej. Ana Martínez"
                maxLength={50}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                style={{ width: '100%', padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Usuario de Acceso (Username)
              </label>
              <input
                type="text"
                placeholder="Ej. cajero_ana"
                maxLength={24}
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                disabled={Boolean(editingEmployee)}
                required={!editingEmployee}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.9rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  background: editingEmployee ? '#e2e8f0' : '#ffffff',
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem', display: 'block' }}>
                {editingEmployee ? 'Identificador en base de datos no editable' : '3 a 24 caracteres (letras, números y guión bajo)'}
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Rol y Permisos
              </label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                style={{ width: '100%', padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', background: '#fff', boxSizing: 'border-box' }}
              >
                <option value="CAJERO">CAJERO — Mostrador, Cobro y Turnos</option>
                <option value="PREPARACION">PREPARACION — Cocina / Barista (KDS)</option>
                <option value="GERENTE">GERENTE — Supervisión y Reportes (Solo Lectura)</option>
                <option value="ADMINISTRADOR">ADMINISTRADOR — Control Total y Administración</option>
              </select>
            </div>

            {!editingEmployee && (
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Contraseña de Acceso (Personal)
                </label>
                <input
                  type="password"
                  placeholder="Mínimo 8 caracteres (8 a 24)"
                  minLength={8}
                  maxLength={24}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.65rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem', display: 'block' }}>
                  8 a 24 caracteres (política de seguridad para empleados con Argon2id)
                </span>
              </div>
            )}

            {editingEmployee && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
                <input
                  type="checkbox"
                  id="chk-is-active"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="chk-is-active" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}>
                  Usuario Activo en el Sistema
                </label>
              </div>
            )}

            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  color: '#475569'
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: '0.6rem 1.5rem',
                  background: isSubmitting ? '#94a3b8' : '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer'
                }}
              >
                {isSubmitting
                  ? 'Guardando...'
                  : (editingEmployee ? 'Guardar Cambios' : 'Registrar en Base de Datos')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla de Usuarios */}
      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
              <th style={{ padding: '0.9rem 1.25rem' }}>ID</th>
              <th style={{ padding: '0.9rem 1.25rem' }}>Nombre</th>
              <th style={{ padding: '0.9rem 1.25rem' }}>Usuario (Login)</th>
              <th style={{ padding: '0.9rem 1.25rem' }}>Rol</th>
              <th style={{ padding: '0.9rem 1.25rem' }}>Estado</th>
              <th style={{ padding: '0.9rem 1.25rem', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const admin = isEmployeeAdmin(emp);
              const isGerente = emp.role === 'GERENTE' || String(emp.role).toUpperCase().includes('GERENTE');
              const isKitchen = emp.role === 'PREPARACION' || String(emp.role).toUpperCase().includes('COCINA');
              const isCurrent = String(emp.id).trim() === String(currentEmployee?.id).trim() ||
                                String(emp.username || '').toLowerCase() === String(currentEmployee?.username || '').toLowerCase();
              const active = emp.isActive !== false;

              return (
                <tr key={emp.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: active ? 1 : 0.6 }}>
                  <td style={{ padding: '0.9rem 1.25rem', fontWeight: 800, color: '#0f172a' }}>
                    #{emp.id}
                  </td>
                  <td style={{ padding: '0.9rem 1.25rem', fontWeight: 600, color: '#1e293b' }}>
                    {emp.name}
                    {isCurrent && (
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', background: '#dbeafe', color: '#1e40af', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                        Sesión Actual
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.9rem 1.25rem', color: '#475569', fontFamily: 'monospace' }}>
                    @{emp.username || emp.id}
                  </td>
                  <td style={{ padding: '0.9rem 1.25rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background: admin ? '#0f172a' : isGerente ? '#7c3aed' : isKitchen ? '#059669' : '#2563eb',
                        color: '#ffffff'
                      }}
                    >
                      {admin ? 'Administrador' : isGerente ? 'Gerente' : isKitchen ? 'Cocina / Barista' : 'Cajero'}
                    </span>
                  </td>
                  <td style={{ padding: '0.9rem 1.25rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: active ? '#dcfce7' : '#fef2f2',
                        color: active ? '#166534' : '#991b1b',
                        border: active ? '1px solid #bbf7d0' : '1px solid #fecaca',
                      }}
                    >
                      {active ? 'Activo' : 'Dado de baja'}
                    </span>
                  </td>
                  <td style={{ padding: '0.9rem 1.25rem', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(emp)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          background: '#f8fafc',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: '#334155'
                        }}
                      >
                        Editar
                      </button>
                      {active ? (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(emp)}
                          disabled={isCurrent}
                          title={isCurrent ? 'No puedes darte de baja a ti mismo' : 'Dar de baja en la base de datos'}
                          style={{
                            padding: '0.35rem 0.75rem',
                            background: isCurrent ? '#f1f5f9' : '#fff1f2',
                            border: isCurrent ? '1px solid #e2e8f0' : '1px solid #fecdd3',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: isCurrent ? 'not-allowed' : 'pointer',
                            color: isCurrent ? '#94a3b8' : '#be123c'
                          }}
                        >
                          Dar de baja
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleReactivate(emp)}
                          title="Dar de alta / Reactivar acceso en la base de datos"
                          style={{
                            padding: '0.35rem 0.75rem',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            color: '#166534'
                          }}
                        >
                          Dar de alta
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
