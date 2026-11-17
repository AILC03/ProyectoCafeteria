// Sistema de Notificaciones y Confirmaciones In-App para Coffee´s Pos
// Reemplaza window.alert y window.confirm por componentes visuales nativos touch-friendly

export function showToast(message, type = 'success') {
  if (typeof window !== 'undefined') {
    const detail = { message, type };
    window.dispatchEvent(new CustomEvent('coffees:toast', { detail }));
    window.dispatchEvent(new CustomEvent('taffy:toast', { detail }));
  }
}

export function showConfirm({
  title = 'Confirmación',
  message = '',
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  isDestructive = false,
  onConfirm
}) {
  if (typeof window !== 'undefined') {
    const detail = {
      title,
      message,
      confirmText,
      cancelText,
      isDestructive,
      onConfirm
    };
    window.dispatchEvent(new CustomEvent('coffees:confirm', { detail }));
    window.dispatchEvent(new CustomEvent('taffy:confirm', { detail }));
  }
}
