import { useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';

export interface PinInputProps {
  value: string;
  onChange: (pin: string) => void;
  disabled?: boolean;
  describedBy?: string;
  labelledBy?: string;
}

const PIN_DIGITS = [0, 1, 2, 3] as const;

/** Accessible 4-digit PIN entry with keyboard navigation, paste support, and visibility toggle. */
export function PinInput({ value, onChange, disabled = false, describedBy, labelledBy }: PinInputProps) {
  const [showPin, setShowPin] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = PIN_DIGITS.map((index) => value[index] ?? '');

  function updateDigits(nextDigits: string[]): void {
    onChange(nextDigits.join(''));
  }

  function focusBox(index: number): void {
    inputRefs.current[index]?.focus();
  }

  function handleDigitChange(index: number, event: ChangeEvent<HTMLInputElement>): void {
    const cleaned = event.target.value.replace(/\D/g, '');
    if (cleaned.length === 0) {
      const next = [...digits];
      next[index] = '';
      updateDigits(next);
      return;
    }

    if (cleaned.length > 1 && (digits[index] === '' || cleaned.length >= 3)) {
      const pasted = cleaned.slice(0, 4);
      onChange(pasted);
      focusBox(Math.min(pasted.length - 1, 3));
      return;
    }

    const nextDigit = digits[index] !== '' && cleaned.length === 2
      ? (cleaned.startsWith(digits[index]) ? cleaned[1] : cleaned[0])
      : cleaned.slice(-1);

    const next = [...digits];
    next[index] = nextDigit;
    updateDigits(next);
    if (index < 3) focusBox(index + 1);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = [...digits];
      if (digits[index] !== '') {
        next[index] = '';
        updateDigits(next);
      } else if (index > 0) {
        next[index - 1] = '';
        updateDigits(next);
        focusBox(index - 1);
      }
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusBox(index - 1);
      return;
    }
    if (event.key === 'ArrowRight' && index < 3) {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>): void {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 0) return;
    onChange(pasted);
    focusBox(Math.min(pasted.length - 1, 3));
  }

  return (
    <div className="pin-input-wrapper">
      <div
        className="pin-input-grid"
        role="group"
        aria-label={labelledBy === undefined ? 'NIP de 4 dígitos' : undefined}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onPaste={handlePaste}
      >
        {PIN_DIGITS.map((index) => (
          <input
            key={index}
            ref={(element) => { inputRefs.current[index] = element; }}
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoComplete="off"
            disabled={disabled}
            value={digits[index]}
            onChange={(event) => handleDigitChange(index, event)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onFocus={(event) => event.target.select()}
            className="pin-input-cell"
            aria-label={`Dígito ${index + 1} del NIP`}
          />
        ))}
      </div>
      <div className="pin-input-controls">
        <span className="field-hint">4 dígitos numéricos</span>
        <button
          type="button"
          className="secondary-button"
          aria-pressed={showPin}
          disabled={disabled}
          onClick={() => setShowPin((prev) => !prev)}
        >
          {showPin ? 'Ocultar NIP' : 'Mostrar NIP'}
        </button>
      </div>
    </div>
  );
}
