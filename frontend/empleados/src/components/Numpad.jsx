import React from 'react';

export default function Numpad({ onInput }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Backspace', '0', 'Enter'];

  return (
    <div className="keypad-grid">
      {keys.map((k) => {
        if (k === 'Backspace') {
          return (
            <button
              key={k}
              type="button"
              className="numpad-key key-special key-backspace"
              onClick={() => onInput('Backspace')}
              title="Borrar dígito"
              aria-label="Borrar dígito"
            >
              ⌫
            </button>
          );
        }
        if (k === 'Enter') {
          return (
            <button
              key={k}
              type="button"
              className="numpad-key key-special key-enter"
              onClick={() => onInput('Enter')}
              title="Aceptar"
              aria-label="Aceptar"
            >
              ✓
            </button>
          );
        }
        return (
          <button
            key={k}
            type="button"
            className="numpad-key"
            onClick={() => onInput(k)}
            aria-label={`Número ${k}`}
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}
