import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { PosOrder } from '../pos/posApi';
import { formatCashQrError, scanCashQr, type ScannedCashOrder } from './cashQrApi';
import { CashQrScanner } from './CashQrScanner';
import { CashPaymentPanel } from './CashPaymentPanel';
import { targetFromPosOrder, targetFromScannedOrder } from './cashPaymentTarget';

function usableOrder(value: unknown): value is PosOrder {
  return value !== null && typeof value === 'object' && (value as PosOrder).source === 'CASHIER' && (value as PosOrder).paymentMethod === 'CASH' && (value as PosOrder).status === 'PENDIENTE_PAGO' && (value as PosOrder).paidAt === null;
}

export function CashPaymentPage() {
  const location = useLocation();
  const posOrder = usableOrder(location.state) ? location.state : null;
  const [scanned, setScanned] = useState<ScannedCashOrder | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const target = scanned !== null
    ? targetFromScannedOrder(scanned)
    : posOrder !== null ? targetFromPosOrder(posOrder) : null;

  async function loadScanned(token: string): Promise<void> {
    if (scanBusy) return;
    setScanBusy(true);
    setScanError(null);
    try {
      setScanned(await scanCashQr(token));
    } catch (error) {
      setScanError(formatCashQrError(error));
    } finally {
      setScanBusy(false);
    }
  }

  if (target === null) {
    return <section className="terminal-payment" aria-labelledby="payment-title">
      <header className="payment-header"><h1 id="payment-title">Cobro en efectivo</h1><p>Sin orden seleccionada en POS</p></header>
      {scanError !== null && <p role="alert" className="payment-notice payment-notice-error">{scanError}</p>}
      <CashQrScanner onToken={(token) => { void loadScanned(token); }} busy={scanBusy} />
      <p className="field-hint"><Link to="/terminal/pos">Volver a POS</Link></p>
    </section>;
  }

  return <section className="terminal-payment" aria-labelledby="payment-title">
    <header className="payment-header"><h1 id="payment-title">Cobro en efectivo</h1><p>Orden {target.folio}</p></header>
    <CashPaymentPanel
      target={target}
      presentation="page"
      resetLabel="Escanear otro pedido"
      {...(scanned !== null ? {
        onResetTarget: () => {
          setScanned(null);
          setScanError(null);
        },
      } : {})}
    />
    {scanned === null && <p className="field-hint"><Link to="/terminal/pos">Volver a POS</Link></p>}
  </section>;
}
