import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import App from './App';

test('renders the application heading without a network request', () => {
  render(<App />);

  expect(
    screen.getByRole('heading', { name: 'Aplicación unificada de cafetería' }),
  ).toBeInTheDocument();
});
