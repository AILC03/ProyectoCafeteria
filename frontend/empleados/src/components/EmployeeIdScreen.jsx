import React, { useState, useEffect, useRef } from 'react';
import { getEmployees, saveEmployees, findEmployee } from '../data/employees.js';
import { playHapticSound } from '../utils/audio.js';
import { getAdminEmployees } from '../api/employees.js';

export default function EmployeeIdScreen({ onBack, onEmployeeIdentified, audioEnabled }) {
  const [username, setUsername] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [shake, setShake] = useState(false);
  const [employeesList, setEmployeesList] = useState(getEmployees);
  const inputRef = useRef(null);

  useEffect(() => {
    // Foco automático en el campo de texto al cargar la pantalla
    if (inputRef.current) {
      inputRef.current.focus();
    }

    // Intentar sincronizar lista de empleados del backend si es posible
    let isMounted = true;
    getAdminEmployees()
      .then((apiList) => {
        if (isMounted && apiList && Array.isArray(apiList) && apiList.length > 0) {
          const mapped = apiList.map((e) => ({
            id: String(e.id),
            name: e.name,
            username: e.username,
            role: e.role,
            avatar: e.name
              ? e.name.slice(0, 2).toUpperCase()
              : e.username
              ? e.username.slice(0, 2).toUpperCase()
              : 'EM',
            color: e.role === 'ADMINISTRADOR' ? '#0f172a' : '#2563eb',
            isAdmin: e.role === 'ADMINISTRADOR',
            isActive: e.isActive !== false,
            isSyncedWithDb: true,
          }));
          saveEmployees(mapped);
          setEmployeesList(mapped);
        }
      })
      .catch(() => {
        // Fallback a los datos locales
        setEmployeesList(getEmployees());
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function triggerError(msg) {
    setErrorMsg(msg);
    setShake(true);
    playHapticSound('error', audioEnabled);
    setTimeout(() => setShake(false), 500);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }

  function handleSelectEmployee(emp) {
    playHapticSound('success', audioEnabled);
    onEmployeeIdentified(emp);
  }

  function handleSubmit(e) {
    if (e) e.preventDefault();
    const clean = username.trim().toLowerCase().replace(/^@/, '');

    if (!clean) {
      triggerError('Por favor ingresa tu nombre de usuario (Username)');
      return;
    }

    if (clean.length < 3) {
      triggerError('El nombre de usuario debe contener al menos 3 caracteres');
      return;
    }

    // Buscar si existe en la lista local o registrada
    const found = findEmployee(clean);
    const employeeToIdentify = found || {
      id: clean,
      username: clean,
      name: clean,
      role: 'PERSONAL',
      avatar: clean.slice(0, 2).toUpperCase(),
      color: '#2563eb',
      isAdmin: false,
    };

    playHapticSound('success', audioEnabled);
    onEmployeeIdentified(employeeToIdentify);
  }

  return (
    <section id="screen-employee-id" className="screen-view active" aria-label="Ingreso de Usuario de Personal">
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
        <header className="top-action-bar" style={{ width: '100%', maxWidth: '460px', marginBottom: '1rem' }}>
          <button
            type="button"
            className="btn-nav-back"
            onClick={onBack}
            aria-label="Volver a la pantalla de bienvenida"
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
            <span>&larr; Volver</span>
          </button>
        </header>

        <main
          className="kiosk-chassis"
          style={{
            maxWidth: '460px',
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
          {/* Encabezado */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                fontSize: '1.5rem',
                marginBottom: '0.75rem',
                boxShadow: '0 8px 16px -4px rgba(15, 23, 42, 0.25)'
              }}
            >
              👤
            </div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
              Acceso de Personal
            </h2>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.86rem' }}>
              Ingresa tu nombre de usuario para iniciar turno en la terminal
            </p>
          </div>

          {/* Formulario de Username */}
          <form onSubmit={handleSubmit} style={{ width: '100%' }}>
            <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
              <label
                htmlFor="employee-username-input"
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#475569',
                  marginBottom: '0.5rem'
                }}
              >
                Usuario de Acceso (Username)
              </label>

              <div
                className={`username-input-container ${shake ? 'shake-anim' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#f8fafc',
                  border: `2px solid ${shake ? '#ef4444' : username.length >= 3 ? '#0f172a' : '#cbd5e1'}`,
                  borderRadius: '16px',
                  padding: '0.65rem 0.95rem',
                  transition: 'all 0.2s ease'
                }}
              >
                <span
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: '#64748b',
                    marginRight: '0.5rem',
                    userSelect: 'none'
                  }}
                >
                  @
                </span>
                <input
                  ref={inputRef}
                  id="employee-username-input"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setErrorMsg('');
                    setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''));
                  }}
                  placeholder="ej. cajero_marvin o AngelAdmin"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck="false"
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    color: '#0f172a',
                    outline: 'none',
                    padding: '0.2rem 0'
                  }}
                />

                {username.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      playHapticSound('click', audioEnabled);
                      setUsername('');
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
            </div>

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

            <button
              type="submit"
              disabled={username.trim().length < 3}
              style={{
                width: '100%',
                padding: '0.95rem 1.25rem',
                borderRadius: '16px',
                background: username.trim().length >= 3 ? '#0f172a' : '#94a3b8',
                color: '#ffffff',
                fontSize: '1rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                border: 'none',
                cursor: username.trim().length >= 3 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                boxShadow: username.trim().length >= 3 ? '0 10px 25px -5px rgba(15, 23, 42, 0.25)' : 'none',
                transition: 'all 0.2s ease',
                marginBottom: '1.5rem'
              }}
            >
              <span>CONTINUAR (ENTER)</span>
              <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>&rarr;</span>
            </button>
          </form>

          {/* Separador */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              margin: '0.5rem 0 1.25rem',
              color: '#94a3b8',
              fontSize: '0.78rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em'
            }}
          >
            <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }}></div>
            <span style={{ padding: '0 0.85rem' }}>o selecciona tu perfil</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }}></div>
          </div>

          {/* Lista de perfiles registrados para clic rápido */}
          <div
            className="quick-employees-list"
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              maxHeight: '220px',
              overflowY: 'auto',
              paddingRight: '0.2rem'
            }}
          >
            {employeesList.map((emp) => {
              const displayHandle = emp.username || emp.name;
              return (
                <button
                  key={emp.id || emp.username}
                  type="button"
                  onClick={() => handleSelectEmployee(emp)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    padding: '0.65rem 0.95rem',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      backgroundColor: emp.color || (emp.role === 'ADMINISTRADOR' ? '#0f172a' : '#2563eb'),
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.9rem',
                      fontWeight: 800,
                      flexShrink: 0
                    }}
                  >
                    {emp.avatar || (emp.name ? emp.name.slice(0, 2).toUpperCase() : 'EM')}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.92rem',
                        fontWeight: 700,
                        color: '#0f172a',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {emp.name || displayHandle}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                      @{displayHandle}
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.25rem 0.55rem',
                      borderRadius: '9999px',
                      backgroundColor: emp.role === 'ADMINISTRADOR' ? '#0f172a' : '#e0e7ff',
                      color: emp.role === 'ADMINISTRADOR' ? '#ffffff' : '#3730a3',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}
                  >
                    {emp.role || 'EMPLEADO'}
                  </span>
                </button>
              );
            })}
          </div>
        </main>
      </div>
    </section>
  );
}
