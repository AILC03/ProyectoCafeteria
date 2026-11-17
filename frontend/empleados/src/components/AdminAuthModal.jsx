import React, { useState, useEffect, useRef } from 'react';
import Numpad from './Numpad.jsx';
import { findEmployee, isEmployeeAdmin, verifyEmployeeCredentials } from '../data/employees.js';
import { playHapticSound } from '../utils/audio.js';
import { loginStaff } from '../api/auth.js';

export default function AdminAuthModal({
  isOpen,
  onClose,
  onSuccess,
  targetTitle = 'esta sección',
  audioEnabled
}) {
  const [step, setStep] = useState('id'); // 'id' | 'password'
  const [managerId, setManagerId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [shake, setShake] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const passwordInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setStep('id');
      setManagerId('');
      setPassword('');
      setShowPassword(false);
      setSelectedAdmin(null);
      setErrorMsg('');
      setShake(false);
      setIsLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (step === 'password' && passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  }, [step]);

  function triggerError(msg) {
    setErrorMsg(msg);
    setShake(true);
    playHapticSound('error', audioEnabled);
    setTimeout(() => setShake(false), 500);
    if (step === 'password') {
      setPassword('');
      if (passwordInputRef.current) passwordInputRef.current.focus();
    }
  }

  function handleInput(key) {
    playHapticSound('click', audioEnabled);
    setErrorMsg('');

    if (step === 'id') {
      if (key >= '0' && key <= '9') {
        if (managerId.length < 10) {
          setManagerId((prev) => prev + key);
        }
      } else if (key === 'Backspace') {
        setManagerId((prev) => prev.slice(0, -1));
      } else if (key === 'Enter') {
        submitId();
      }
    }
  }

  function submitId(idToUse = managerId) {
    const cleanId = String(idToUse).trim();
    if (!cleanId) {
      triggerError('Ingrese el número o usuario del administrador');
      return;
    }

    const emp = findEmployee(cleanId);
    if (!emp) {
      triggerError('Número o usuario de administrador no encontrado en el sistema');
      return;
    }

    if (emp.isActive === false) {
      triggerError('Esta cuenta de administrador ha sido dada de baja en el sistema');
      return;
    }

    if (!isEmployeeAdmin(emp)) {
      triggerError('El usuario no cuenta con permisos de administrador');
      return;
    }

    setSelectedAdmin(emp);
    setStep('password');
    setPassword('');
    setErrorMsg('');
    playHapticSound('click', audioEnabled);
  }

  async function submitPassword(pwdToVerify = password) {
    const cleanPassword = String(pwdToVerify).trim();
    if (!cleanPassword) {
      triggerError('Ingrese la contraseña de administrador');
      return;
    }

    if (cleanPassword.length < 8) {
      triggerError('La contraseña debe tener al menos 8 caracteres (ADR 0005)');
      return;
    }

    if (cleanPassword.length > 24) {
      triggerError('La contraseña no puede exceder los 24 caracteres');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    const username = selectedAdmin?.username || selectedAdmin?.name || 'admin';

    try {
      const user = await loginStaff(username, cleanPassword);
      playHapticSound('success', audioEnabled);
      onSuccess({
        ...selectedAdmin,
        id: String(user.id),
        name: user.name,
        role: user.role,
        isAdmin: true,
      });
      onClose();
    } catch (err) {
      console.warn('Error en auth de administrador:', err);
      if (verifyEmployeeCredentials(selectedAdmin, cleanPassword)) {
        playHapticSound('success', audioEnabled);
        onSuccess(selectedAdmin);
        onClose();
      } else {
        const errorDetail =
          err.status === 401
            ? 'Contraseña de administrador incorrecta.'
            : err.status === 429
            ? 'Demasiados intentos fallidos. Bloqueado temporalmente por 15 minutos.'
            : err.message || 'Contraseña incorrecta o error de conexión.';
        triggerError(errorDetail);
      }
    } finally {
      setIsLoading(false);
    }
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (!isOpen) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      let key = e.key;
      if (key.startsWith('Numpad')) key = key.replace('Numpad', '');

      if (step === 'id') {
        if (key >= '0' && key <= '9') {
          handleInput(key);
        } else if (key === 'Backspace') {
          handleInput('Backspace');
        } else if (key === 'Enter') {
          submitId();
        }
      }
      if (key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, step, managerId]);

  if (!isOpen) return null;

  const isPasswordValid = password.length >= 8 && password.length <= 24;

  return (
    <div className="modal-overlay open" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-window admin-auth-window"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '420px', padding: '1.75rem', textAlign: 'center' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
            Acceso de Administrador
          </h3>
          <button type="button" className="btn-modal-close" onClick={onClose} aria-label="Cerrar">
            &times;
          </button>
        </div>

        <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.88rem', lineHeight: 1.4 }}>
          {step === 'id'
            ? `Ingrese el usuario o número de empleado del administrador para autorizar ${targetTitle}.`
            : `Ingrese la contraseña de seguridad de ${selectedAdmin?.name || 'Administrador'}:`}
        </p>

        {step === 'id' ? (
          <>
            {/* Input para Usuario o ID de Administrador */}
            <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#475569',
                  marginBottom: '0.4rem'
                }}
              >
                Usuario o ID de Administrador
              </label>

              <div
                className={`password-input-box ${shake ? 'shake-anim' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#f8fafc',
                  border: `2px solid ${shake ? '#ef4444' : managerId.length > 0 ? '#0f172a' : '#cbd5e1'}`,
                  borderRadius: '16px',
                  padding: '0.6rem 0.85rem',
                  transition: 'all 0.2s ease'
                }}
              >
                <span style={{ fontSize: '1.1rem', color: '#64748b', marginRight: '0.6rem', userSelect: 'none' }}>
                  @
                </span>
                <input
                  type="text"
                  value={managerId}
                  onChange={(e) => {
                    setErrorMsg('');
                    setManagerId(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitId();
                    }
                  }}
                  placeholder="ej. admin o 1"
                  autoFocus
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    color: '#0f172a',
                    outline: 'none',
                    padding: '0.2rem 0'
                  }}
                />
                {managerId.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      playHapticSound('click', audioEnabled);
                      setManagerId('');
                      setErrorMsg('');
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
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {errorMsg && (
              <div className="error-banner visible" style={{ marginBottom: '1rem' }}>
                {errorMsg}
              </div>
            )}

            {/* Accesos rápidos a Administradores */}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setManagerId('admin');
                  submitId('admin');
                }}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '9999px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  cursor: 'pointer'
                }}
              >
                Admin (@admin)
              </button>
            </div>

            {/* Botones de acción ID */}
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '0.85rem',
                  borderRadius: '9999px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => submitId()}
                style={{
                  flex: 1.4,
                  padding: '0.85rem',
                  borderRadius: '9999px',
                  border: 'none',
                  background: '#0f172a',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)'
                }}
              >
                Continuar
              </button>
            </div>
          </>
        ) : (
          /* PASO 2: CONTRASEÑA DE ADMINISTRADOR */
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitPassword();
            }}
            style={{ width: '100%', textAlign: 'left' }}
          >
            {/* Header del Admin seleccionado */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                padding: '0.75rem 1rem',
                borderRadius: '16px',
                marginBottom: '1.25rem'
              }}
            >
              <div
                style={{
                  backgroundColor: selectedAdmin?.color || '#0f172a',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '1rem',
                  flexShrink: 0
                }}
              >
                {selectedAdmin?.avatar || (selectedAdmin?.name ? selectedAdmin.name.slice(0, 2).toUpperCase() : 'AD')}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                  {selectedAdmin?.name || 'Administrador'}
                </div>
                <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600 }}>
                  ROL: {selectedAdmin?.role || 'ADMINISTRADOR'}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label
                  htmlFor="admin-password-field"
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#475569'
                  }}
                >
                  Contraseña de Administrador
                </label>
                <span
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: isPasswordValid ? '#16a34a' : password.length > 24 ? '#dc2626' : '#94a3b8'
                  }}
                >
                  {password.length}/24 {isPasswordValid ? '✓' : ''}
                </span>
              </div>

              <div
                className={`password-input-box ${shake ? 'shake-anim' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#f8fafc',
                  border: `2px solid ${shake ? '#ef4444' : isPasswordValid ? '#0f172a' : '#cbd5e1'}`,
                  borderRadius: '16px',
                  padding: '0.6rem 0.85rem',
                  transition: 'all 0.2s ease'
                }}
              >
                <span style={{ fontSize: '1.1rem', color: '#64748b', marginRight: '0.6rem', userSelect: 'none' }}>
                  🔑
                </span>
                <input
                  ref={passwordInputRef}
                  id="admin-password-field"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setErrorMsg('');
                    if (e.target.value.length <= 24) {
                      setPassword(e.target.value);
                    }
                  }}
                  placeholder="Ingrese contraseña de admin"
                  autoComplete="current-password"
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: '#0f172a',
                    outline: 'none',
                    letterSpacing: showPassword ? 'normal' : '0.15em',
                    padding: '0.2rem 0'
                  }}
                />

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
                    title={showPassword ? 'Ocultar' : 'Ver'}
                    aria-label={showPassword ? 'Ocultar' : 'Ver'}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                )}

                {password.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      playHapticSound('click', audioEnabled);
                      setPassword('');
                      setErrorMsg('');
                      if (passwordInputRef.current) passwordInputRef.current.focus();
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

              <p
                style={{
                  margin: '0.5rem 0 0',
                  fontSize: '0.73rem',
                  color: '#64748b',
                  lineHeight: 1.4
                }}
              >
                🔒 Política de seguridad (ADR 0005): Contraseña de <strong>8 a 24 caracteres</strong>.
              </p>
            </div>

            {errorMsg && (
              <div
                className="error-banner visible"
                style={{
                  backgroundColor: '#fef2f2',
                  color: '#b91c1c',
                  border: '1px solid #fecaca',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => {
                  setStep('id');
                  setPassword('');
                  setErrorMsg('');
                }}
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '0.85rem',
                  borderRadius: '9999px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer'
                }}
              >
                Atrás
              </button>

              <button
                type="submit"
                disabled={isLoading || !isPasswordValid}
                style={{
                  flex: 1.4,
                  padding: '0.85rem',
                  borderRadius: '9999px',
                  border: 'none',
                  background: isPasswordValid && !isLoading ? '#0f172a' : '#94a3b8',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: isPasswordValid && !isLoading ? 'pointer' : 'not-allowed',
                  boxShadow: isPasswordValid && !isLoading ? '0 4px 12px rgba(15, 23, 42, 0.2)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                {isLoading ? 'Verificando...' : 'Autorizar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
