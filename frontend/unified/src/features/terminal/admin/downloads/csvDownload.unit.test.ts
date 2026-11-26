import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../../shared/api/client';
import { buildNoMovementExportQuery } from '../analytics/noMovementApi';
import {
  buildCategoryCsvRequest,
  buildNoMovementCsvRequest,
  buildRankingCsvRequest,
  buildSalesCsvRequest,
  buildSeriesCsvRequest,
  canExportRange,
  downloadCsv,
  parseContentDispositionFilename,
  resolveCsvFilename,
  saveCsvToBrowser,
} from './csvDownload';

const from = '2026-11-24T08:00:00.000Z';
const to = '2026-11-25T08:00:00.000Z';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CSV export request builders', () => {
  it('sends the visible sales filters without cursor or page', () => {
    const request = buildSalesCsvRequest({ from, to, method: 'ALL' });
    const query = new URLSearchParams(request.query);
    expect(request.endpoint).toBe('/admin/dashboard/sales-export.csv');
    expect(query.get('from')).toBe(from);
    expect(query.get('to')).toBe(to);
    expect(query.has('method')).toBe(false);
    expect(query.has('cursor')).toBe(false);
    expect(query.has('limit')).toBe(false);
    expect(request.fallbackFilename).toBe(
      'dashboard-sales-20261124T080000Z-20261125T080000Z-all.csv',
    );
  });

  it('keeps the selected granularity and method for series', () => {
    const request = buildSeriesCsvRequest({
      from,
      to,
      granularity: 'day',
      method: 'CASH',
    });
    const query = new URLSearchParams(request.query);
    expect(request.endpoint).toBe('/admin/dashboard/sales-series-export.csv');
    expect(query.get('granularity')).toBe('day');
    expect(query.get('method')).toBe('CASH');
    expect(query.has('metric')).toBe(false);
    expect(request.fallbackFilename).toContain('-day-cash.csv');
  });

  it('mirrors metric, direction and top for ranking', () => {
    const request = buildRankingCsvRequest({
      from,
      to,
      metric: 'amount',
      direction: 'bottom',
      top: '10',
      method: 'STRIPE',
    });
    const query = new URLSearchParams(request.query);
    expect(request.endpoint).toBe('/admin/dashboard/product-ranking-export.csv');
    expect(query.get('metric')).toBe('amount');
    expect(query.get('direction')).toBe('bottom');
    expect(query.get('top')).toBe('10');
    expect(query.get('method')).toBe('STRIPE');
    expect(request.fallbackFilename).toContain('-amount-bottom10-stripe.csv');
  });

  it('never sends pagination or top for no-movement exports', () => {
    const request = buildNoMovementCsvRequest({ from, to, method: 'CASH' });
    const query = new URLSearchParams(request.query);
    expect(request.endpoint).toBe('/admin/dashboard/no-movement-products-export.csv');
    expect(query.get('method')).toBe('CASH');
    expect(query.has('limit')).toBe(false);
    expect(query.has('cursor')).toBe(false);
    expect(query.has('top')).toBe(false);
  });

  it('rejects pagination or top keys explicitly instead of ignoring them', () => {
    expect(() => buildNoMovementExportQuery({ from, to, limit: '20' } as never)).toThrow(
      /no es válido/,
    );
    expect(() => buildNoMovementExportQuery({ from, to, cursor: 'cursor-1' } as never)).toThrow(
      /no es válido/,
    );
    expect(() => buildNoMovementExportQuery({ from, to, top: '10' } as never)).toThrow(
      /no es válido/,
    );
  });

  it('sends the category metric and omits all when no method is selected', () => {
    const request = buildCategoryCsvRequest({ from, to, metric: 'amount', method: 'ALL' });
    const query = new URLSearchParams(request.query);
    expect(request.endpoint).toBe('/admin/dashboard/category-participation-export.csv');
    expect(query.get('metric')).toBe('amount');
    expect(query.has('method')).toBe(false);
    expect(request.fallbackFilename).toContain('-amount-all.csv');
  });
});

describe('canExportRange', () => {
  it('accepts the exact 2000 minimum boundary and a 366-day leap range', () => {
    expect(
      canExportRange('2000-01-01T08:00:00.000Z', '2000-01-02T08:00:00.000Z'),
    ).toBe(true);
    expect(
      canExportRange('2000-01-01T08:00:00.000Z', '2001-01-01T08:00:00.000Z'),
    ).toBe(true);
  });

  it('rejects one millisecond before the minimum', () => {
    expect(
      canExportRange('2000-01-01T07:59:59.999Z', '2000-01-02T08:00:00.000Z'),
    ).toBe(false);
  });

  it('rejects malformed, non-increasing and overlong ranges', () => {
    expect(canExportRange('not-a-date', '2000-01-02T08:00:00.000Z')).toBe(false);
    expect(canExportRange('2000-01-02T08:00:00.000Z', '2000-01-01T08:00:00.000Z')).toBe(false);
    expect(canExportRange('2000-01-01T08:00:00.000Z', '2000-01-01T08:00:00.000Z')).toBe(false);
    expect(canExportRange('2000-01-01T08:00:00.000Z', '2000-01-02')).toBe(false);
    expect(
      canExportRange('2000-01-01T08:00:00.000Z', '2001-01-02T08:00:00.001Z'),
    ).toBe(false);
  });
});

describe('CSV filename resolution', () => {
  it('reads a quoted Content-Disposition filename', () => {
    expect(
      parseContentDispositionFilename('attachment; filename="dashboard-sales-safe.csv"'),
    ).toBe('dashboard-sales-safe.csv');
  });

  it('reads an unquoted filename', () => {
    expect(parseContentDispositionFilename('attachment; filename=dashboard-ranking.csv')).toBe(
      'dashboard-ranking.csv',
    );
  });

  it('prefers the RFC 5987 extended filename', () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename=\"fallback.csv\"; filename*=UTF-8''dashboard-categor%C3%ADa.csv",
      ),
    ).toBe('dashboard-categoría.csv');
  });

  it('falls back to the local name when the header is missing', () => {
    expect(resolveCsvFilename(null, 'dashboard-sales-fallback.csv')).toBe(
      'dashboard-sales-fallback.csv',
    );
  });

  it('sanitizes path, control characters and forces the csv extension', () => {
    const resolved = resolveCsvFilename(
      'attachment; filename="../../evil\\name\r\nX.txt"',
      'dashboard-safe.csv',
    );
    expect(resolved).toBe('evilname_X.csv');
    expect(resolved).not.toContain('/');
    expect(resolved).not.toContain('\\');
    expect(resolved).not.toContain('\r');
  });

  it('ignores a header without a filename parameter', () => {
    expect(resolveCsvFilename('attachment', 'dashboard-series.csv')).toBe('dashboard-series.csv');
  });
});

describe('downloadCsv', () => {
  it('saves the fetched blob with the backend filename', async () => {
    const blob = new Blob(['#meta,export,sales-export\r\n'], { type: 'text/csv' });
    const save = vi.fn();
    const fetchFile = vi.fn().mockResolvedValue({
      blob,
      contentDisposition: 'attachment; filename="dashboard-sales-real.csv"',
    });

    const result = await downloadCsv(buildSalesCsvRequest({ from, to }), undefined, {
      fetchFile,
      save,
    });

    expect(fetchFile).toHaveBeenCalledWith(
      `/admin/dashboard/sales-export.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { signal: undefined },
    );
    expect(save).toHaveBeenCalledWith(blob, 'dashboard-sales-real.csv');
    expect(result).toEqual({ filename: 'dashboard-sales-real.csv' });
  });

  it('uses the deterministic fallback when Content-Disposition is absent', async () => {
    const save = vi.fn();
    const fetchFile = vi.fn().mockResolvedValue({ blob: new Blob(['x']), contentDisposition: null });

    const result = await downloadCsv(
      buildCategoryCsvRequest({ from, to, metric: 'units' }),
      undefined,
      { fetchFile, save },
    );

    expect(result.filename).toBe(
      'dashboard-category-participation-20261124T080000Z-20261125T080000Z-units-all.csv',
    );
    expect(save).toHaveBeenCalledWith(expect.any(Blob), result.filename);
  });

  it('never saves a Problem Details response as CSV', async () => {
    const save = vi.fn();
    const fetchFile = vi.fn().mockRejectedValue(
      new ApiError(400, 'Validation failed', {
        title: 'Validation failed',
        status: 400,
        code: 'VALIDATION_ERROR',
      }),
    );

    await expect(
      downloadCsv(buildNoMovementCsvRequest({ from, to }), undefined, { fetchFile, save }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(save).not.toHaveBeenCalled();
  });

  it('does not save when the download is aborted', async () => {
    const save = vi.fn();
    const fetchFile = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await expect(
      downloadCsv(buildSeriesCsvRequest({ from, to, granularity: 'hour' }), undefined, {
        fetchFile,
        save,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(save).not.toHaveBeenCalled();
  });

  it('releases the object URL after the click is consumed', () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:csv-test');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    vi.useFakeTimers();
    try {
      saveCsvToBrowser(new Blob(['data']), 'dashboard-safe.csv');
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      // The URL survives the click and is released on the next macrotask.
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv-test');
    } finally {
      vi.useRealTimers();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it('still releases the object URL once when the click throws', () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:csv-throw');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('click failed');
    });

    vi.useFakeTimers();
    try {
      expect(() => saveCsvToBrowser(new Blob(['data']), 'dashboard-safe.csv')).toThrow(
        'click failed',
      );
      expect(click).toHaveBeenCalledTimes(1);
      // The release is scheduled in `finally`, so a failed click cannot leak it.
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv-throw');
    } finally {
      vi.useRealTimers();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it('still releases the object URL once when remove throws', () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:csv-remove-throw');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const remove = vi.spyOn(HTMLAnchorElement.prototype, 'remove').mockImplementation(() => {
      throw new Error('remove failed');
    });

    vi.useFakeTimers();
    try {
      expect(() => saveCsvToBrowser(new Blob(['data']), 'dashboard-safe.csv')).toThrow(
        'remove failed',
      );
      expect(click).toHaveBeenCalledTimes(1);
      // The revocation does not depend on the DOM detach succeeding.
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv-remove-throw');
    } finally {
      remove.mockRestore();
      vi.useRealTimers();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it('keeps the click failure and still releases once when remove also throws', () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:csv-both-throw');
    URL.revokeObjectURL = revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('click failed');
    });
    const remove = vi.spyOn(HTMLAnchorElement.prototype, 'remove').mockImplementation(() => {
      throw new Error('remove failed');
    });

    vi.useFakeTimers();
    try {
      expect(() => saveCsvToBrowser(new Blob(['data']), 'dashboard-safe.csv')).toThrow(
        'click failed',
      );
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv-both-throw');
    } finally {
      remove.mockRestore();
      vi.useRealTimers();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
