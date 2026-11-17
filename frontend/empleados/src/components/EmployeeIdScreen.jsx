import React, { useState, useEffect, useRef } from 'react';
import { findEmployee } from '../data/employees.js';
import { playHapticSound } from '../utils/audio.js';

export default function EmployeeIdScreen({ onBack, onEmployeeIdentified, audioEnabled }) {
  const [username, setUsername] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Foco automático en el campo de texto al cargar la pantalla
    if (inputRef.current) {
      inputRef.current.focus();
    }
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

  function handleSubmit(e) {
    if (e) e.preventDefault();
    const raw = username.trim();
    const clean = raw.toLowerCase().replace(/^@/, '');

    if (!clean) {
      triggerError('Por favor ingresa tu nombre de usuario (Username).');
      return;
    }

    if (clean.length < 3) {
      triggerError('El nombre de usuario debe contener al menos 3 caracteres.');
      return;
    }

    if (clean.length > 24) {
      triggerError('El nombre de usuario no puede exceder 24 caracteres.');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      triggerError('Formato inválido: solo se permiten letras, números y guión bajo (sin espacios ni símbolos especiales).');
      return;
    }

    // Buscar si el usuario existe en los registros del sistema
    const found = findEmployee(clean);

    if (!found) {
      triggerError(`El usuario "@${clean}" no se encuentra registrado en el sistema. Verifica tu usuario o solicita tu registro al administrador.`);
      return;
    }

    if (found.isActive === false) {
      triggerError(`La cuenta del usuario "@${clean}" ha sido dada de baja o se encuentra inactiva.`);
      return;
    }

    playHapticSound('success', audioEnabled);
    onEmployeeIdentified(found);
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
                  maxLength={24}
                  value={username}
                  onChange={(e) => {
                    setErrorMsg('');
                    setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''));
                  }}
                  placeholder="ej. admin o usuario"
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.75rem',
                  color: '#64748b',
                  marginTop: '0.4rem',
                  padding: '0 0.25rem'
                }}
              >
                <span>3 a 24 caracteres (letras, números y guión bajo)</span>
                <span style={{ fontWeight: 600, color: username.length >= 24 ? '#ef4444' : '#64748b' }}>
                  {username.length}/24
                </span>
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
                marginBottom: '0'
              }}
            >
              <span>CONTINUAR (ENTER)</span>
              <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>&rarr;</span>
            </button>
          </form>
        </main>
      </div>
    </section>
  );
}
