import { useState } from 'react';
import { formatMxnCents, parseCentsBigInt, splitIncludedIva } from '../../../shared/utils/money';
import { parseMxnAmountToCents } from '../cash/cashApi';
import { PosDialog } from './PosDialog';

type PosCheckoutDialogProps = {
  totalCents: string;
  totalSource: 'estimate' | 'server';
  busy: boolean;
  blocked: boolean;
  error: string | null;
  onConfirm: (received: string) => void;
  onClose: () => void;
};

/** Cash checkout confirmation: it only charges when the received amount covers the total. */
export function PosCheckoutDialog({
  totalCents,
  totalSource,
  busy,
  blocked,
  error,
  onConfirm,
  onClose,
}: PosCheckoutDialogProps) {
  const [received, setReceived] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const breakdown = splitIncludedIva(totalCents);

  let receivedCents: string | null = null;
  try {
    receivedCents = parseMxnAmountToCents(received);
  } catch {
    receivedCents = null;
  }
  const covers = receivedCents !== null && parseCentsBigInt(receivedCents) >= parseCentsBigInt(totalCents);
  const changeCents = covers && receivedCents !== null
    ? (parseCentsBigInt(receivedCents) - parseCentsBigInt(totalCents)).toString()
    : null;
  const displayError = localError ?? error;

  function submit(): void {
    if (!covers) {
      setLocalError('El efectivo no cubre el total a pagar.');
      return;
    }
    setLocalError(null);
    onConfirm(received);
  }

  function requestClose(): void {
    if (busy || blocked) return;
    onClose();
  }

  return (
    <PosDialog
      titleId="pos-checkout-title"
      title="Cobro en efectivo"
      description="Al aceptar se crea la orden y se registra el cobro. Cancelar no crea nada."
      onClose={requestClose}
      className="pos-checkout-dialog"
    >
      <div className="pos-checkout-total">
        <span>TOTAL A PAGAR</span>
        <strong>{formatMxnCents(totalCents)}</strong>
      </div>

      <dl className="pos-checkout-breakdown">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMxnCents(breakdown.subtotalCents)}</dd>
        </div>
        <div>
          <dt>IVA incluido (16%)</dt>
          <dd>{formatMxnCents(breakdown.ivaCents)}</dd>
        </div>
        <div className="pos-checkout-breakdown-total">
          <dt>{totalSource === 'server' ? 'Total confirmado' : 'Total estimado'}</dt>
          <dd>{formatMxnCents(totalCents)}</dd>
        </div>
      </dl>

      <div className="form-field">
        <label htmlFor="pos-checkout-received">Efectivo recibido (MXN)</label>
        <input
          id="pos-checkout-received"
          inputMode="decimal"
          value={received}
          disabled={busy || blocked}
          onChange={(event) => {
            setReceived(event.target.value);
            setLocalError(null);
          }}
          autoFocus
        />
      </div>

      <p className="pos-checkout-change" aria-live="polite">
        {changeCents !== null
          ? `Cambio: ${formatMxnCents(changeCents)}`
          : 'El efectivo recibido debe cubrir el total.'}
      </p>

      {displayError !== null && <p role="alert" className="form-alert">{displayError}</p>}
      {blocked && (
        <p role="status" className="form-alert">
          Resultado incierto. No cierres ni inicies otra operación; reintenta exactamente la misma.
        </p>
      )}

      <div className="auth-dialog-actions">
        <button type="button" className="secondary-button" disabled={busy || blocked} onClick={onClose}>
          Cancelar
        </button>
        <button type="button" disabled={busy || (!blocked && !covers)} onClick={submit}>
          {busy ? 'Cobrando…' : blocked ? 'Reintentar cobro' : 'Aceptar y cobrar'}
        </button>
      </div>
    </PosDialog>
  );
}
