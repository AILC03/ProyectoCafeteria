import { useEffect, useRef, useState } from 'react';
import { cashQrToken } from './cashQrApi';

type ScannerControls = { stop: () => void };
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function CashQrScanner({ onToken, busy }: { onToken: (token: string) => void; busy: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const lastToken = useRef<string | null>(null);
  const mounted = useRef(true);
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  function stopCamera(): void {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera(false);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controlsRef.current?.stop();
      const stream = videoRef.current?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startCamera(): Promise<void> {
    setCameraError(null);
    if (!window.isSecureContext || navigator.mediaDevices?.getUserMedia === undefined) {
      setCameraError('La cámara requiere HTTPS o localhost. Usa la entrada manual con el código del cliente.');
      return;
    }
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader();
      setCamera(true);
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current!,
        (result) => {
          if (!result) return;
          const token = cashQrToken(result.getText());
          if (token === null || token === lastToken.current) return;
          lastToken.current = token;
          controlsRef.current?.stop();
          controlsRef.current = null;
          if (mounted.current) {
            setCamera(false);
            onToken(token);
          }
        },
      );
      if (!mounted.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
    } catch {
      setCamera(false);
      setCameraError('No se pudo abrir la cámara. Revisa el permiso o usa la entrada manual.');
      stopCamera();
    }
  }

  function submitManual(): void {
    const token = cashQrToken(manual);
    if (token === null) {
      setManualError('Pega el código QR completo o el token de 43 caracteres.');
      return;
    }
    setManualError(null);
    onToken(token);
  }

  return (
    <section className="cash-qr-scanner" aria-labelledby="cash-qr-scanner-title">
      <h2 id="cash-qr-scanner-title">Cobrar pedido con QR</h2>
      <p className="field-hint">Escanea el QR del cliente o pega el código. Escanear no cobra ni envía el pedido a preparación.</p>
      <div className="cash-qr-camera">
        <video ref={videoRef} muted playsInline aria-label="Vista de la cámara para leer el QR" />
        {!camera
          ? <button type="button" className="secondary-button" disabled={busy} onClick={() => { void startCamera(); }}>Abrir cámara</button>
          : <button type="button" className="secondary-button" onClick={stopCamera}>Detener cámara</button>}
      </div>
      {cameraError !== null && <p role="alert" className="payment-notice payment-notice-error">{cameraError}</p>}
      <div className="cash-qr-manual">
        <label className="field-label" htmlFor="cash-qr-manual-input">Código QR o token</label>
        <input
          id="cash-qr-manual-input"
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={`cafeteria:cash:${'A'.repeat(10)}…`}
        />
        <button type="button" disabled={busy || !TOKEN.test(cashQrToken(manual) ?? '')} onClick={submitManual}>
          {busy ? 'Cargando…' : 'Cargar pedido'}
        </button>
        {manualError !== null && <p role="alert" className="payment-notice payment-notice-error">{manualError}</p>}
      </div>
    </section>
  );
}
