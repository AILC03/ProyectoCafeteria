import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ProtectedTicket } from './ProtectedTicket';

const token = 'a'.repeat(43);
describe('ProtectedTicket registration QR', () => {
  test('renders only a valid registration QR without exposing its payload', () => {
    render(<ProtectedTicket ticket={{ saleId: '1', saleNumber: 'V000001', orderFolio: 'A000001', soldAt: '2099-01-01T00:00:00.000Z', currency: 'MXN', totalCents: '100', cashReceivedCents: '100', changeCents: '0', items: [], registration: { token, qrPayload: `cafeteria:register:${token}`, expiresAt: '2099-01-02T00:00:00.000Z' } }} />);
    expect(screen.getByRole('img', { name: /código qr para registrar/i })).toBeInTheDocument();
    expect(screen.queryByText(token, { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText(/cafeteria:register/i)).not.toBeInTheDocument();
  });
  test('renders a STRIPE ticket with nullable cash amounts but no cash labels', () => {
    render(<ProtectedTicket ticket={{ saleId: '2', saleNumber: 'V000002', orderFolio: 'A000002', soldAt: '2099-01-01T00:00:00.000Z', currency: 'MXN', totalCents: '3500', cashReceivedCents: null, changeCents: null, items: [], registration: null }} />);
    expect(screen.getByText(/Total:/)).toHaveTextContent('$35.00');
    expect(screen.queryByText(/Recibido:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cambio:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /código qr para registrar/i })).not.toBeInTheDocument();
  });
  test('does not render a QR without registration', () => {
    render(<ProtectedTicket ticket={{ saleId: '1', saleNumber: 'V000001', orderFolio: 'A000001', soldAt: '2099-01-01T00:00:00.000Z', currency: 'MXN', totalCents: '100', cashReceivedCents: '100', changeCents: '0', items: [], registration: null }} />);
    expect(screen.queryByRole('img', { name: /código qr para registrar/i })).not.toBeInTheDocument();
  });
});
