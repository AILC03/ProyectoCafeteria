import { useState } from 'react';
import { cashQrToken } from '../payment/cashQrApi';
import { CashQrScanner } from '../payment/CashQrScanner';
import { PosDialog } from './PosDialog';

type PosQrDialogProps = {
  mode: 'scan' | 'token';
  busy: boolean;
  onToken: (token: string) => void;
  onClose: () => void;
};

export function PosQrDialog({ mode, busy, onToken, onClose }: PosQrDialogProps) {
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const token = cashQrToken(manual);

  function submitManual(): void {
    if (token === null) {
      setManualError('Pega el código QR completo o el token de 43 caracteres.');
      return;
    }
    setManualError(null);
    onToken(token);
    onClose();
  }

  if (mode === 'scan') {
    return (
      <PosDialog
        titleId="pos-qr-scan-title"
        title="Escanear QR"
        description="Apunta la cámara al código QR del cliente. Escanear no cobra ni envía el pedido a preparación."
        onClose={onClose}
        className="pos-qr-dialog"
      >
        <CashQrScanner mode="camera" variant="compact" autoStart busy={busy} onToken={(value) => { onToken(value); onClose(); }} />
      </PosDialog>
    );
  }

  return (
    <PosDialog
      titleId="pos-qr-token-title"
      title="Ingresar token"
      description="Pega el código QR completo o el token de 43 caracteres que muestra el cliente."
      onClose={onClose}
      className="pos-qr-dialog"
    >
      <form
        className="pos-dialog-search"
        onSubmit={(event) => {
          event.preventDefault();
          submitManual();
        }}
      >
        <div className="form-field">
          <label htmlFor="pos-qr-token-input">Código QR o token</label>
          <input
            id="pos-qr-token-input"
            value={manual}
            onChange={(event) => { setManual(event.target.value); }}
            autoComplete="off"
            spellCheck={false}
            placeholder={`cafeteria:cash:${'A'.repeat(10)}…`}
          />
        </div>
        {manualError !== null && <p role="alert" className="form-alert">{manualError}</p>}
        <div className="auth-dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={busy || token === null}>
            {busy ? 'Cargando…' : 'Cargar pedido'}
          </button>
        </div>
      </form>
    </PosDialog>
  );
}
