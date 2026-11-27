import { useState } from 'react';
import { PosDialog } from './PosDialog';

type PosGuestDialogProps = {
  initialName: string;
  onAccept: (name: string) => void;
  onClose: () => void;
};

export function PosGuestDialog({ initialName, onAccept, onClose }: PosGuestDialogProps) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  return (
    <PosDialog
      titleId="pos-guest-dialog-title"
      title="Nombre de invitado"
      description="Opcional. El nombre se registra en la orden sin crear una cuenta de cliente."
      onClose={onClose}
      className="pos-guest-dialog"
    >
      <form
        className="pos-dialog-search"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed.length > 0) onAccept(trimmed);
        }}
      >
        <div className="form-field">
          <label htmlFor="pos-guest-name">Nombre del invitado</label>
          <input
            id="pos-guest-name"
            type="text"
            maxLength={120}
            value={name}
            autoFocus
            onChange={(event) => { setName(event.target.value); }}
          />
        </div>
        <p className="field-hint">Máximo 120 caracteres. Si no escribes un nombre, el invitado queda como anónimo.</p>
      </form>
      <div className="auth-dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
        <button
          type="button"
          onClick={() => onAccept(trimmed)}
        >
          Aceptar
        </button>
      </div>
    </PosDialog>
  );
}
