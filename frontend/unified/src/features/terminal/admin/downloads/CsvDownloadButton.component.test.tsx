import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../test/server';
import { buildSalesCsvRequest } from './csvDownload';
import { CsvDownloadButton } from './CsvDownloadButton';
import { formatSalesError } from '../../sales/salesApi';

const from = '2026-11-24T08:00:00.000Z';
const to = '2026-11-25T08:00:00.000Z';
const endpoint = '**/api/v1/admin/dashboard/sales-export.csv';

let createObjectURL: (blob: Blob) => string;
let revokeObjectURL: (url: string) => void;
let originalCreate: typeof URL.createObjectURL;
let originalRevoke: typeof URL.revokeObjectURL;

beforeEach(() => {
  originalCreate = URL.createObjectURL;
  originalRevoke = URL.revokeObjectURL;
  createObjectURL = vi.fn(() => 'blob:csv-download');
  revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function renderButton(queryFrom = from) {
  const request = buildSalesCsvRequest({ from: queryFrom, to, method: 'ALL' });
  const view = render(
    <CsvDownloadButton
      request={request}
      buttonLabel="Descargar ventas (CSV)"
      panelLabel="las ventas del periodo"
      formatError={formatSalesError}
    />,
  );
  return { view, request };
}

function csvResponse(filename = 'dashboard-sales.csv') {
  return new HttpResponse('#meta,export,sales-export\r\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}

describe('CsvDownloadButton', () => {
  it('keeps one persistent status region and saves exactly one file with the backend name', async () => {
    const response = deferred<Response>();
    let requests = 0;
    server.use(
      http.get(endpoint, async () => {
        requests += 1;
        return response.promise;
      }),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    renderButton();
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');

    const button = screen.getByRole('button', { name: 'Descargar ventas (CSV)' });
    button.focus();
    expect(button).toHaveFocus();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('Descargando las ventas del periodo.');
    expect(button).toHaveFocus();

    // A second activation while busy must not start another request/file.
    fireEvent.click(button);

    response.resolve(csvResponse('dashboard-sales-20261124.csv'));

    await waitFor(() =>
      expect(status).toHaveTextContent('Descarga iniciada: dashboard-sales-20261124.csv.'),
    );
    expect(screen.getByRole('status')).toBe(status);
    expect(button).toHaveAttribute('aria-busy', 'false');
    expect(requests).toBe(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv-download'));
  });

  it('does not save a Problem Details response and announces a sanitized error', async () => {
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json(
          {
            title: 'Limit exceeded',
            status: 400,
            code: 'EXPORT_LIMIT_EXCEEDED',
            detail: 'internal detail must not be shown',
          },
          { status: 400 },
        ),
      ),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar ventas (CSV)' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'El conjunto supera el límite de exportación; no se descargó ningún archivo.',
    );
    expect(alert).not.toHaveTextContent('internal detail');
    expect(screen.getByRole('status').textContent).toBe('');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('aborts the in-flight file when filters change and the next action uses the new filters', async () => {
    const first = deferred<Response>();
    const requested: string[] = [];
    let aborted = false;
    server.use(
      http.get(endpoint, async ({ request }) => {
        requested.push(new URL(request.url).searchParams.get('from') ?? '');
        if (requested.length === 1) {
          request.signal.addEventListener('abort', () => {
            aborted = true;
          });
          return first.promise;
        }
        return csvResponse(`from-${requested.length}.csv`);
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const { view, request } = renderButton();
    const status = screen.getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Descargar ventas (CSV)' }));
    await waitFor(() => expect(requested).toEqual([from]));
    expect(status).toHaveTextContent('Descargando las ventas del periodo.');

    view.rerender(
      <CsvDownloadButton
        request={{
          ...request,
          query: buildSalesCsvRequest({ from: '2026-11-20T08:00:00.000Z', to, method: 'ALL' })
            .query,
        }}
        buttonLabel="Descargar ventas (CSV)"
        panelLabel="las ventas del periodo"
        formatError={formatSalesError}
      />,
    );

    // The in-flight request observes the abort signal and the UI returns to rest.
    await waitFor(() => expect(aborted).toBe(true));
    await waitFor(() => expect(status.textContent).toBe(''));
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Descargar ventas (CSV)' });
    expect(button).toHaveAttribute('aria-busy', 'false');
    fireEvent.click(button);
    await waitFor(() =>
      expect(status).toHaveTextContent('Descarga iniciada: from-2.csv.'),
    );
    expect(requested).toEqual([from, '2026-11-20T08:00:00.000Z']);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('cancels the in-flight download without saving, announces it and allows retry', async () => {
    const first = deferred<Response>();
    const requested: string[] = [];
    let aborted = false;
    server.use(
      http.get(endpoint, async ({ request }) => {
        requested.push(new URL(request.url).searchParams.get('from') ?? '');
        if (requested.length === 1) {
          request.signal.addEventListener('abort', () => {
            aborted = true;
          });
          return first.promise;
        }
        return csvResponse('after-cancel.csv');
      }),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    renderButton();
    const status = screen.getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Descargar ventas (CSV)' }));
    await waitFor(() => expect(status).toHaveTextContent('Descargando las ventas del periodo.'));

    const cancel = screen.getByRole('button', { name: 'Cancelar descarga' });
    cancel.focus();
    expect(cancel).toHaveFocus();
    fireEvent.click(cancel);

    await waitFor(() =>
      expect(status).toHaveTextContent('Descarga cancelada; no se guardó ningún archivo.'),
    );
    await waitFor(() => expect(aborted).toBe(true));
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cancelar descarga' })).not.toBeInTheDocument();
    // Focus returns to the stable primary action instead of falling to the document.
    expect(screen.getByRole('button', { name: 'Descargar ventas (CSV)' })).toHaveFocus();

    // The cancelled state is not an error and the user can retry immediately.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Descargar ventas (CSV)' });
    expect(retry).toHaveAttribute('aria-busy', 'false');
    fireEvent.click(retry);

    await waitFor(() => expect(status).toHaveTextContent('Descarga iniciada: after-cancel.csv.'));
    expect(requested).toEqual([from, from]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});
