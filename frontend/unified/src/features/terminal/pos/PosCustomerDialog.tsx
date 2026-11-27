import { useState } from 'react';
import {
  formatPosError,
  isValidCustomerIdentifier,
  normalizeCustomerIdentifier,
  searchOrderCustomer,
  type OrderCustomerMinimum,
} from './posApi';
import { PosDialog } from './PosDialog';

export type FoundCustomer = OrderCustomerMinimum & { identifier: string };

type PosCustomerDialogProps = {
  initialCustomer: FoundCustomer | null;
  initialConfirmedName: string;
  onAccept: (customer: FoundCustomer, confirmedName: string) => void;
  onClose: () => void;
};

export function PosCustomerDialog({
  initialCustomer,
  initialConfirmedName,
  onAccept,
  onClose,
}: PosCustomerDialogProps) {
  const [identifier, setIdentifier] = useState(initialCustomer?.identifier ?? '');
  const [candidate, setCandidate] = useState<FoundCustomer | null>(initialCustomer);
  const [confirmedName, setConfirmedName] = useState(initialConfirmedName);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSearch(): Promise<void> {
    if (!isValidCustomerIdentifier(identifier)) {
      setError('Introduce un teléfono MX de 10 dígitos o un número de cliente válido.');
      setCandidate(null);
      return;
    }
    setSearching(true);
    setError(null);
    setMessage(null);
    setCandidate(null);
    try {
      const found = await searchOrderCustomer(identifier);
      setCandidate({ ...found, identifier: normalizeCustomerIdentifier(identifier) });
      setConfirmedName(found.name);
      setMessage(`Cliente encontrado: ${found.name} (${found.customerNumber}). Confirma el nombre antes de usarlo.`);
    } catch (searchError) {
      setError(formatPosError(searchError));
    } finally {
      setSearching(false);
    }
  }

  function handleAccept(): void {
    if (candidate === null || confirmedName.trim().length < 1) {
      setError('Confirma el nombre del cliente antes de continuar.');
      return;
    }
    onAccept(candidate, confirmedName.trim());
  }

  return (
    <PosDialog
      titleId="pos-customer-dialog-title"
      title="Buscar cliente"
      description="Búsqueda exacta por teléfono MX de 10 dígitos o número de cliente."
      onClose={onClose}
      className="pos-customer-dialog"
    >
      <form
        className="pos-dialog-search"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSearch();
        }}
      >
        <div className="form-field">
          <label htmlFor="pos-customer-identifier">Teléfono o número de cliente</label>
          <input
            id="pos-customer-identifier"
            type="text"
            inputMode="text"
            autoComplete="off"
            maxLength={20}
            value={identifier}
            disabled={searching}
            autoFocus
            onChange={(event) => { setIdentifier(event.target.value); }}
          />
        </div>
        <button type="submit" disabled={searching}>
          {searching ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {error !== null && <p role="alert" className="form-alert">{error}</p>}
      {message !== null && <p role="status" className="field-hint">{message}</p>}

      {candidate !== null && (
        <div className="auth-confirm-box pos-dialog-result">
          <p><strong>{candidate.name}</strong> — {candidate.customerNumber}</p>
          <div className="form-field">
            <label htmlFor="pos-confirmed-name">Nombre confirmado por el cliente</label>
            <input
              id="pos-confirmed-name"
              type="text"
              maxLength={120}
              value={confirmedName}
              onChange={(event) => { setConfirmedName(event.target.value); }}
            />
          </div>
        </div>
      )}

      <div className="auth-dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
        <button type="button" disabled={candidate === null || confirmedName.trim().length < 1} onClick={handleAccept}>
          Aceptar
        </button>
      </div>
    </PosDialog>
  );
}
