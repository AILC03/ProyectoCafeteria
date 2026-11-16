import React from 'react';

export default function ConfirmModal({
  isOpen,
  title = 'Confirmación',
  message,
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  isDestructive = false
}) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 99998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem'
      }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.25)',
          maxWidth: '420px',
          width: '100%',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          animation: 'coffeesModalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1.3
          }}
        >
          {title}
        </h3>

        <p
          style={{
            margin: 0,
            fontSize: '0.96rem',
            color: '#475569',
            lineHeight: 1.5
          }}
        >
          {message}
        </p>

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'flex-end',
            marginTop: '0.5rem'
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '0.75rem 1.25rem',
              minHeight: '48px',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '0.92rem',
              fontWeight: 700,
              cursor: 'pointer',
              touchAction: 'manipulation'
            }}
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={() => {
              if (onConfirm) onConfirm();
            }}
            style={{
              padding: '0.75rem 1.4rem',
              minHeight: '48px',
              borderRadius: '12px',
              border: 'none',
              background: isDestructive ? '#ef4444' : '#0f172a',
              color: '#ffffff',
              fontSize: '0.92rem',
              fontWeight: 700,
              cursor: 'pointer',
              touchAction: 'manipulation'
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
