import React, { useRef, useState } from 'react';

interface PinInputProps {
  value: string;
  onChange: (pin: string) => void;
  disabled?: boolean;
}

export const PinInput: React.FC<PinInputProps> = ({ value, onChange, disabled = false }) => {
  const [showPin, setShowPin] = useState(false);
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const digits = [
    value[0] || '',
    value[1] || '',
    value[2] || '',
    value[3] || '',
  ];

  const handleDigitChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    // Extract only digits
    const cleaned = rawVal.replace(/\D/g, '');

    if (!cleaned) {
      // Empty input
      const newDigits = [...digits];
      newDigits[index] = '';
      onChange(newDigits.join(''));
      return;
    }

    if (cleaned.length > 1) {
      // Pasted multiple digits
      const pasted = cleaned.slice(0, 4);
      onChange(pasted);
      const focusIndex = Math.min(pasted.length, 3);
      inputRefs[focusIndex]?.current?.focus();
      return;
    }

    // Single digit entered
    const digit = cleaned.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    const newPin = newDigits.join('');
    onChange(newPin);

    // Auto-focus next box
    if (index < 3 && digit) {
      inputRefs[index + 1]?.current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Move to previous and clear it
        inputRefs[index - 1]?.current?.focus();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        onChange(newDigits.join(''));
      } else {
        const newDigits = [...digits];
        newDigits[index] = '';
        onChange(newDigits.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs[index - 1]?.current?.focus();
    } else if (e.key === 'ArrowRight' && index < 3) {
      inputRefs[index + 1]?.current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pastedData) {
      onChange(pastedData);
      const focusIdx = Math.min(pastedData.length, 3);
      inputRefs[focusIdx]?.current?.focus();
    }
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="grid grid-cols-4 gap-2.5" onPaste={handlePaste}>
        {[0, 1, 2, 3].map((index) => {
          const hasVal = Boolean(digits[index]);
          return (
            <div key={index} className="relative">
              <input
                ref={inputRefs[index]}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                disabled={disabled}
                value={digits[index]}
                onChange={(e) => handleDigitChange(index, e)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onFocus={(e) => e.target.select()}
                className={`w-full h-12 rounded-lg text-center font-bold text-lg text-primary transition-all duration-150 border focus:outline-none focus:scale-[1.03] ${
                  hasVal
                    ? 'bg-secondary-fixed/50 text-secondary border-secondary-container shadow-sm'
                    : 'bg-surface-container-low border-outline-variant/50 text-on-surface'
                } focus:ring-2 focus:ring-primary focus:border-transparent`}
                aria-label={`Dígito ${index + 1} del PIN`}
              />
              {!digits[index] && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-outline/60 text-base">
                  •
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-on-surface-variant pt-0.5 px-0.5">
        <span className="text-[11px] text-outline">Usa tu teclado numérico</span>
        <button
          type="button"
          onClick={() => setShowPin(!showPin)}
          className="text-secondary hover:text-on-secondary-container font-medium flex items-center gap-1 transition-colors select-none"
        >
          <span className="material-symbols-outlined text-[14px]">
            {showPin ? 'visibility_off' : 'visibility'}
          </span>
          <span>{showPin ? 'Ocultar' : 'Ver PIN'}</span>
        </button>
      </div>
    </div>
  );
};
