import React, { useState, useEffect, useRef } from 'react';
import { verifyEmployeeCredentials } from '../data/employees.js';
import { playHapticSound } from '../utils/audio.js';
import { loginStaff } from '../api/auth.js';

export default function EmployeePinScreen({ employee, onBack, onLoginSuccess, audioEnabled }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [shake, setShake] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!employee) {
      onBack();
      return;
    }
    // Foco automático en el campo de contraseña al montar la pantalla
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [employee, onBack]);

  function triggerError(msg) {
    setErrorMsg(msg);
    setShake(true);
    playHapticSound('error', audioEnabled);
    setTimeout(() => setShake(false), 500);
  }

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    const cleanPassword = password.trim();

    if (employee && employee.isActive === false) {
      triggerError('Esta cuenta de empleado ha sido dada de baja en el sistema.');
      if (inputRef.current) inputRef.current.focus();
      return;
    }

    if (!cleanPassword) {
      triggerError('Por favor ingrese su contraseña de empleado');
      if (inputRef.current) inputRef.current.focus();
      return;
    }

    if (cleanPassword.length < 8) {
      triggerError('La contraseña debe tener al menos 8 caracteres (política de seguridad ADR 0005)');
      if (inputRef.current) inputRef.current.focus();
      return;
    }

    if (cleanPassword.length > 24) {
      triggerError('La contraseña no puede exceder los 24 caracteres');
      if (inputRef.current) inputRef.current.focus();
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const username = employee?.username || employee?.name || 'AngelAdmin';
      const user = await loginStaff(username, cleanPassword);

      playHapticSound('success', audioEnabled);
      onLoginSuccess({
        id: String(user.id),
        name: user.name,
        username: user.username || user.name,
        role: user.role,
        isAdmin: user.role === 'ADMINISTRADOR',
        pin: cleanPassword,
        password: cleanPassword,
      });
    } catch (err) {
      console.warn('Error de autenticación staff:', err);
      if (err.status === 401) {
        triggerError('Credenciales incorrectas o la cuenta ha sido dada de baja.');
        if (inputRef.current) inputRef.current.focus();
        return;
      }
      if (employee?.isActive !== false && verifyEmployeeCredentials(employee, cleanPassword)) {
        playHapticSound('success', audioEnabled);
        const resolvedRole =
          employee?.role && employee.role !== 'PERSONAL'
            ? employee.role
            : employee?.username?.toLowerCase().includes('admin')
            ? 'ADMINISTRADOR'
            : 'CAJERO';
        onLoginSuccess({
          ...employee,
          role: resolvedRole,
          pin: cleanPassword,
          password: cleanPassword,
        });
      } else {
        const errorDetail =
          err.status === 401
            ? 'Contraseña incorrecta. Verifique sus credenciales.'
            : err.status === 429
            ? 'Demasiados intentos fallidos. Cuenta bloqueada temporalmente por 15 minutos.'
            : err.message || 'Contraseña incorrecta o error de conexión.';
        triggerError(errorDetail);
        if (inputRef.current) inputRef.current.focus();
      }
    } finally {
      setIsLoading(false);
    }
  }

  const isValidLength = password.length >= 8 && password.length <= 24;

  return (
    <section id="screen-employee-password" className="screen-view active" aria-label="Ingreso de Contraseña de Personal">
      <div
        className="numpad-screen-container"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          backgroundColor: '#f8fafc'
        }}
      >
        <header className="top-action-bar" style={{ width: '100%', maxWidth: '440px', marginBottom: '1rem' }}>
          <button
            type="button"
            className="btn-nav-back"
            onClick={onBack}
            aria-label="Cambiar de empleado"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.1rem',
              borderRadius: '9999px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
          >
            <span>&larr; Cambiar Empleado</span>
          </button>
        </header>

        <main
          className="kiosk-chassis"
          style={{
            maxWidth: '440px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '28px',
            padding: '2rem 1.75rem',
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.08), 0 0 1px 1px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          {/* Tarjeta con los datos del empleado seleccionado */}
          <div
            className="employee-header-card"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              padding: '0.85rem 1.2rem',
              borderRadius: '20px',
              marginBottom: '1.5rem'
            }}
          >
            <div
              className="employee-avatar-badge"
              style={{
                backgroundColor:
                  employee?.color && employee.color !== '#2563eb'
                    ? employee.color
                    : employee?.username?.includes('gerente')
                    ? '#7c3aed'
                    : employee?.username?.includes('admin')
                    ? '#0f172a'
                    : '#2563eb',
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '1.1rem',
                flexShrink: 0
              }}
            >
              {employee?.avatar || (employee?.name ? employee.name.slice(0, 2).toUpperCase() : 'EP')}
            </div>
            <div className="employee-info-col" style={{ flex: 1, textAlign: 'left' }}>
              <div
                className="employee-name-text"
                style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}
              >
                {employee?.name || employee?.username || 'Empleado'}
              </div>
              <div
                className="employee-role-text"
                style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginTop: '2px' }}
              >
                {employee?.role && employee.role !== 'PERSONAL'
                  ? `ROL: ${employee.role}`
                  : employee?.username?.toLowerCase().includes('admin')
                  ? 'ROL: ADMINISTRADOR'
                  : employee?.username?.toLowerCase().includes('gerente')
                  ? 'ROL: GERENTE'
                  : employee?.username?.toLowerCase().includes('cajero')
                  ? 'ROL: CAJERO'
                  : employee?.username?.toLowerCase().includes('cocina') || employee?.username?.toLowerCase().includes('prep')
                  ? 'ROL: PREPARACION'
                  : `ID: #${employee?.id || '1'}`}
              </div>
            </div>
          </div>

          {/* Formulario de contraseña */}
          <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label
                  htmlFor="employee-password-input"
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#475569'
                  }}
                >
                  Contraseña de Personal
                </label>
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: isValidLength ? '#16a34a' : password.length > 24 ? '#dc2626' : '#94a3b8'
                  }}
                >
                  {password.length}/24 {isValidLength ? '✓' : ''}
                </span>
              </div>

              {/* Contenedor del campo con bordes y toggle de visibilidad */}
              <div
                className={`password-input-box ${shake ? 'shake-anim' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#f8fafc',
                  border: `2px solid ${shake ? '#ef4444' : isValidLength ? '#0f172a' : '#cbd5e1'}`,
                  borderRadius: '16px',
                  padding: '0.6rem 0.85rem',
                  transition: 'all 0.2s ease'
                }}
              >
                <span style={{ fontSize: '1.15rem', color: '#64748b', marginRight: '0.6rem', userSelect: 'none' }}>
                  🔑
                </span>
                <input
                  ref={inputRef}
                  id="employee-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setErrorMsg('');
                    if (e.target.value.length <= 24) {
                      setPassword(e.target.value);
                    }
                  }}
                  placeholder="Ingresa tu contraseña"
                  autoComplete="current-password"
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    color: '#0f172a',
                    outline: 'none',
                    letterSpacing: showPassword ? 'normal' : '0.15em',
                    padding: '0.2rem 0'
                  }}
                />

                {/* Botón ver/ocultar contraseña */}
                {password.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      playHapticSound('click', audioEnabled);
                      setShowPassword(!showPassword);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.1rem',
                      padding: '0.2rem 0.4rem',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                )}

                {/* Botón limpiar */}
                {password.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      playHapticSound('click', audioEnabled);
                      setPassword('');
                      setErrorMsg('');
                      if (inputRef.current) inputRef.current.focus();
                    }}
                    style={{
                      background: '#e2e8f0',
                      border: 'none',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#475569',
                      cursor: 'pointer',
                      marginLeft: '0.35rem'
                    }}
                    title="Borrar texto"
                    aria-label="Borrar texto"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Nota explicativa de política de seguridad */}
              <p
                style={{
                  margin: '0.55rem 0 0',
                  fontSize: '0.74rem',
                  color: '#64748b',
                  lineHeight: 1.4
                }}
              >
                🔒 Según la política de seguridad del backend (ADR 0005), la contraseña debe tener <strong>de 8 a 24 caracteres</strong>.
              </p>
            </div>

            {/* Mensaje de error si falla */}
            {errorMsg && (
              <div
                className="error-banner visible"
                style={{
                  backgroundColor: '#fef2f2',
                  color: '#b91c1c',
                  border: '1px solid #fecaca',
                  padding: '0.75rem 1rem',
                  borderRadius: '14px',
                  fontSize: '0.83rem',
                  fontWeight: 600,
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  textAlign: 'left'
                }}
              >
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Botón principal de acceso */}
            <button
              type="submit"
              disabled={isLoading || !isValidLength}
              style={{
                width: '100%',
                padding: '0.95rem 1.25rem',
                borderRadius: '16px',
                background: isValidLength && !isLoading ? '#0f172a' : '#94a3b8',
                color: '#ffffff',
                fontSize: '1rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                border: 'none',
                cursor: isValidLength && !isLoading ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                boxShadow: isValidLength && !isLoading ? '0 10px 25px -5px rgba(15, 23, 42, 0.25)' : 'none',
                transition: 'all 0.2s ease',
                marginTop: '0.5rem'
              }}
            >
              {isLoading ? (
                <span>Verificando credenciales...</span>
              ) : (
                <>
                  <span>INICIAR TURNO</span>
                  <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>&rarr;</span>
                </>
              )}
            </button>
          </form>
        </main>
      </div>
    </section>
  );
}
