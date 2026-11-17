import React, { useEffect } from 'react';

export default function ToastNotification({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 3200);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isError = toast.type === 'error';
  const isWarning = toast.type === 'warning';
  const dotColor = isError ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '28px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        background: '#0f172a',
        color: '#ffffff',
        padding: '0.9rem 1.6rem',
        borderRadius: '9999px',
        boxShadow: '0 12px 30px -6px rgba(0, 0, 0, 0.35), 0 0 1px 1px rgba(255, 255, 255, 0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem',
        fontSize: '0.95rem',
        fontWeight: 600,
        maxWidth: '92vw',
        animation: 'coffeesFadeUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: 'auto',
        userSelect: 'none',
        cursor: 'pointer',
        touchAction: 'manipulation'
      }}
      onClick={onDismiss}
      role="status"
      aria-live="polite"
    >
      <span
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
          boxShadow: `0 0 8px ${dotColor}`
        }}
      />
      <span>{toast.message}</span>
    </div>
  );
}
