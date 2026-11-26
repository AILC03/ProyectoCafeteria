import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../../shared/api/client';
import { downloadCsv, type CsvExportRequest } from './csvDownload';

export type CsvDownloadButtonProps = {
  request: CsvExportRequest;
  buttonLabel: string;
  panelLabel: string;
  formatError: (error: unknown) => string;
  disabled?: boolean;
};

type DownloadState =
  | { status: 'idle'; message: '' }
  | { status: 'busy'; message: string }
  | { status: 'success'; message: string }
  | { status: 'cancelled'; message: string }
  | { status: 'error'; message: string };

const IDLE: DownloadState = { status: 'idle', message: '' };

const CANCELLED_MESSAGE = 'Descarga cancelada; no se guardó ningún archivo.';

function formatDownloadError(error: unknown, fallback: (reason: unknown) => string): string {
  if (error instanceof ApiError) {
    if (error.code === 'UNEXPECTED_CONTENT_TYPE') {
      return 'La respuesta no es un CSV verificable; no se descargó ningún archivo.';
    }
    if (error.code === 'EXPORT_LIMIT_EXCEEDED') {
      return 'El conjunto supera el límite de exportación; no se descargó ningún archivo.';
    }
    if (error.status === 413) {
      return 'La solicitud de exportación es demasiado grande; no se descargó ningún archivo.';
    }
  }
  return fallback(error);
}

export function CsvDownloadButton({
  request,
  buttonLabel,
  panelLabel,
  formatError,
  disabled = false,
}: CsvDownloadButtonProps) {
  const [state, setState] = useState<DownloadState>(IDLE);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const primaryButton = useRef<HTMLButtonElement | null>(null);
  const requestKey = `${request.kind}|${request.endpoint}|${request.query}`;

  // A filter change or unmount invalidates the in-flight file and clears its
  // announced state; no retry is started automatically.
  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    pending.current = false;
    setState(IDLE);
    return () => {
      controller.current?.abort();
      controller.current = null;
      pending.current = false;
    };
  }, [requestKey]);

  async function startDownload(): Promise<void> {
    if (disabled || pending.current) return;
    pending.current = true;
    const localController = new AbortController();
    controller.current?.abort();
    controller.current = localController;
    setState({ status: 'busy', message: `Descargando ${panelLabel}.` });

    try {
      const result = await downloadCsv(request, localController.signal);
      if (localController.signal.aborted) return;
      setState({ status: 'success', message: `Descarga iniciada: ${result.filename}.` });
    } catch (reason) {
      if (
        localController.signal.aborted ||
        (reason instanceof DOMException && reason.name === 'AbortError')
      ) {
        return;
      }
      setState({ status: 'error', message: formatDownloadError(reason, formatError) });
    } finally {
      if (controller.current === localController) {
        controller.current = null;
        pending.current = false;
      }
    }
  }

  function cancelDownload(): void {
    const active = controller.current;
    if (active === null) return;
    active.abort();
    controller.current = null;
    pending.current = false;
    setState({ status: 'cancelled', message: CANCELLED_MESSAGE });
    // The cancel button unmounts when the state leaves `busy`; move focus back
    // to the stable primary button so keyboard users do not lose their place.
    primaryButton.current?.focus();
  }

  const busy = state.status === 'busy';
  const unavailable = disabled || busy;
  // The polite live region is always mounted so screen readers keep a stable
  // target; only its text changes with the download state.
  const statusMessage = state.status === 'error' ? '' : state.message;

  return (
    <div className="dashboard-download">
      <button
        ref={primaryButton}
        type="button"
        className="secondary-button dashboard-download-button"
        onClick={() => {
          void startDownload();
        }}
        aria-disabled={unavailable}
        aria-busy={busy}
      >
        {busy ? 'Descargando…' : buttonLabel}
      </button>
      {busy && (
        <button
          type="button"
          className="secondary-button dashboard-download-cancel"
          onClick={cancelDownload}
        >
          Cancelar descarga
        </button>
      )}
      <p className="dashboard-download-status" role="status" aria-live="polite">
        {statusMessage}
      </p>
      {state.status === 'error' && (
        <p className="dashboard-download-status" role="alert" aria-live="assertive">
          {state.message}
        </p>
      )}
    </div>
  );
}
