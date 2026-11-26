import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetchFile, subscribeToApiAuthEvents } from './client';
import { server } from '../../test/server';

const api = '/api/v1';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiFetchFile', () => {
  it('returns the CSV body and Content-Disposition without parsing it as JSON', async () => {
    server.use(
      http.get(`${api}/admin/dashboard/sales-export.csv`, ({ request }) => {
        expect(request.headers.get('accept')).toContain('text/csv');
        return new HttpResponse('#meta,export,sales-export\r\n', {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="dashboard-sales.csv"',
          },
        });
      }),
    );

    const result = await apiFetchFile('/admin/dashboard/sales-export.csv');
    expect(result.contentDisposition).toBe('attachment; filename="dashboard-sales.csv"');
    await expect(result.blob.text()).resolves.toContain('#meta,export,sales-export');
  });

  it('rejects an OK response that is not text/csv and never exposes a blob to save', async () => {
    server.use(
      http.get(`${api}/admin/dashboard/sales-export.csv`, () =>
        HttpResponse.json(
          { title: 'Unexpected', status: 200, code: 'VALIDATION_ERROR' },
          { status: 200 },
        ),
      ),
    );

    await expect(apiFetchFile('/admin/dashboard/sales-export.csv')).rejects.toMatchObject({
      status: 200,
      code: 'VALIDATION_ERROR',
    });
  });

  it('marks an unrelated OK response as an unexpected content type', async () => {
    server.use(
      http.get(`${api}/admin/dashboard/sales-export.csv`, () =>
        new HttpResponse('<html></html>', { headers: { 'content-type': 'text/html' } }),
      ),
    );

    await expect(apiFetchFile('/admin/dashboard/sales-export.csv')).rejects.toMatchObject({
      status: 200,
      code: 'UNEXPECTED_CONTENT_TYPE',
    });
  });

  it('publishes session-expired on 401 and does not retry', async () => {
    let requests = 0;
    const events: string[] = [];
    const unsubscribe = subscribeToApiAuthEvents((event) => events.push(event.type));
    server.use(
      http.get(`${api}/admin/dashboard/sales-export.csv`, () => {
        requests += 1;
        return HttpResponse.json(
          { title: 'Unauthenticated', status: 401, code: 'UNAUTHENTICATED' },
          { status: 401 },
        );
      }),
    );

    await expect(apiFetchFile('/admin/dashboard/sales-export.csv')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(requests).toBe(1);
    expect(events).toEqual(['session-expired']);
    unsubscribe();
  });

  it('publishes pin-change-required on the matching 403', async () => {
    const events: string[] = [];
    const unsubscribe = subscribeToApiAuthEvents((event) => events.push(event.type));
    server.use(
      http.get(`${api}/admin/dashboard/sales-export.csv`, () =>
        HttpResponse.json(
          { title: 'PIN required', status: 403, code: 'PIN_CHANGE_REQUIRED' },
          { status: 403 },
        ),
      ),
    );

    await expect(apiFetchFile('/admin/dashboard/sales-export.csv')).rejects.toMatchObject({
      status: 403,
      code: 'PIN_CHANGE_REQUIRED',
    });
    expect(events).toEqual(['pin-change-required']);
    unsubscribe();
  });

  it('propagates 403 and 429 Problem Details without downloading', async () => {
    server.use(
      http.get(`${api}/admin/dashboard/sales-export.csv`, () =>
        HttpResponse.json({ title: 'Forbidden', status: 403, code: 'FORBIDDEN' }, { status: 403 }),
      ),
    );
    await expect(apiFetchFile('/admin/dashboard/sales-export.csv')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });

    server.use(
      http.get(`${api}/admin/dashboard/sales-export.csv`, () =>
        HttpResponse.json({ title: 'Limited', status: 429, code: 'RATE_LIMITED' }, { status: 429 }),
      ),
    );
    await expect(apiFetchFile('/admin/dashboard/sales-export.csv')).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('maps network failures to status 0', async () => {
    server.use(http.get(`${api}/admin/dashboard/sales-export.csv`, () => HttpResponse.error()));
    await expect(apiFetchFile('/admin/dashboard/sales-export.csv')).rejects.toMatchObject({
      status: 0,
    });
  });

  it('surfaces an already-aborted signal as AbortError', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      apiFetchFile('/admin/dashboard/sales-export.csv', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
