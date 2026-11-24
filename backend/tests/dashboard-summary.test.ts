import { describe, expect, it } from 'vitest';
import { SalesService } from '../src/modules/sales/sales.service.js';
import type { SalesRepository } from '../src/modules/sales/sales.read.repository.js';
import type { Principal } from '../src/modules/auth/auth.types.js';

const actor = {} as Principal;
const repository = (aggregate: {
  ticketCount: string;
  totalCents: string;
  cashCents: string;
  stripeCents: string;
  unitsSold: string;
  previousTicketCount: string;
  previousTotalCents: string;
  previousUnitsSold: string;
}) => ({ administrativeSummary: async () => aggregate }) as unknown as SalesRepository;

describe('DA-001: resumen administrativo', () => {
  it('calcula promedio y comparación exactos en backend', async () => {
    const service = new SalesService(
      repository({
        ticketCount: '42',
        totalCents: '1234500',
        cashCents: '800000',
        stripeCents: '434500',
        unitsSold: '87',
        previousTicketCount: '38',
        previousTotalCents: '1000000',
        previousUnitsSold: '80',
      }),
      () => new Date('2026-11-24T18:30:00.000Z'),
    );
    const result = await service.administrativeSummary(actor, {
      from: '2026-11-24T08:00:00.000Z',
      to: '2026-11-25T08:00:00.000Z',
    });
    expect(result.data).toMatchObject({
      generatedAt: '2026-11-24T18:30:00.000Z',
      currency: 'MXN',
      period: {
        from: '2026-11-24T08:00:00.000Z',
        to: '2026-11-25T08:00:00.000Z',
        timeZone: 'America/Tijuana',
        previousFrom: '2026-11-23T08:00:00.000Z',
        previousTo: '2026-11-24T08:00:00.000Z',
      },
      totalCents: '1234500',
      ticketCount: '42',
      averageTicketCents: '29393',
      unitsSold: '87',
      paymentMix: { cashCents: '800000', stripeCents: '434500' },
      comparison: {
        totalCents: { previous: '1000000', change: '234500', changePercent: '23.45' },
        ticketCount: { previous: '38', change: '4', changePercent: '10.53' },
        averageTicketCents: { previous: '26316', change: '3077', changePercent: '11.69' },
        unitsSold: { previous: '80', change: '7', changePercent: '8.75' },
      },
    });
  });

  it('usa cero y «Sin comparación» cuando no hay tickets o base anterior', async () => {
    const service = new SalesService(
      repository({
        ticketCount: '0',
        totalCents: '0',
        cashCents: '0',
        stripeCents: '0',
        unitsSold: '0',
        previousTicketCount: '0',
        previousTotalCents: '0',
        previousUnitsSold: '0',
      }),
    );
    const result = await service.administrativeSummary(actor, {
      from: '2026-11-24T08:00:00.000Z',
      to: '2026-11-25T08:00:00.000Z',
    });
    expect(result.data.averageTicketCents).toBe('0');
    expect(result.data.comparison.totalCents).toEqual({
      previous: '0',
      change: '0',
      changePercent: null,
    });
    expect(result.data.comparison.averageTicketCents.changePercent).toBeNull();
  });

  it('representa variaciones pequeñas, cero y negativas con dos decimales', async () => {
    const service = new SalesService(
      repository({
        ticketCount: '100',
        totalCents: '10000',
        cashCents: '10000',
        stripeCents: '0',
        unitsSold: '100',
        previousTicketCount: '100',
        previousTotalCents: '10000',
        previousUnitsSold: '100',
      }),
    );
    const unchanged = await service.administrativeSummary(actor, {
      from: '2026-11-24T08:00:00.000Z',
      to: '2026-11-25T08:00:00.000Z',
    });
    expect(unchanged.data.comparison.totalCents.changePercent).toBe('0.00');

    const up = new SalesService(
      repository({
        ticketCount: '201',
        totalCents: '20100',
        cashCents: '20100',
        stripeCents: '0',
        unitsSold: '201',
        previousTicketCount: '200',
        previousTotalCents: '20000',
        previousUnitsSold: '200',
      }),
    );
    expect(
      (
        await up.administrativeSummary(actor, {
          from: '2026-11-24T08:00:00.000Z',
          to: '2026-11-25T08:00:00.000Z',
        })
      ).data.comparison.ticketCount.changePercent,
    ).toBe('0.50');

    const down = new SalesService(
      repository({
        ticketCount: '199',
        totalCents: '19900',
        cashCents: '19900',
        stripeCents: '0',
        unitsSold: '199',
        previousTicketCount: '200',
        previousTotalCents: '20000',
        previousUnitsSold: '200',
      }),
    );
    expect(
      (
        await down.administrativeSummary(actor, {
          from: '2026-11-24T08:00:00.000Z',
          to: '2026-11-25T08:00:00.000Z',
        })
      ).data.comparison.ticketCount.changePercent,
    ).toBe('-0.50');

    const tinyDown = new SalesService(
      repository({
        ticketCount: '1',
        totalCents: '999999',
        cashCents: '999999',
        stripeCents: '0',
        unitsSold: '1',
        previousTicketCount: '1',
        previousTotalCents: '1000000',
        previousUnitsSold: '1',
      }),
    );
    expect(
      (
        await tinyDown.administrativeSummary(actor, {
          from: '2026-11-24T08:00:00.000Z',
          to: '2026-11-25T08:00:00.000Z',
        })
      ).data.comparison.totalCents.changePercent,
    ).toBe('0.00');
  });

  it('usa la duración absoluta del periodo anterior en un cambio DST', async () => {
    const service = new SalesService(
      repository({
        ticketCount: '0',
        totalCents: '0',
        cashCents: '0',
        stripeCents: '0',
        unitsSold: '0',
        previousTicketCount: '0',
        previousTotalCents: '0',
        previousUnitsSold: '0',
      }),
    );
    const result = await service.administrativeSummary(actor, {
      from: '2026-03-08T10:00:00.000Z',
      to: '2026-03-09T09:00:00.000Z',
    });
    expect(result.data.period).toMatchObject({
      from: '2026-03-08T10:00:00.000Z',
      to: '2026-03-09T09:00:00.000Z',
      previousFrom: '2026-03-07T11:00:00.000Z',
      previousTo: '2026-03-08T10:00:00.000Z',
    });
  });

  it('conserva importes grandes y calcula una caída total', async () => {
    const service = new SalesService(
      repository({
        ticketCount: '1',
        totalCents: '0',
        cashCents: '0',
        stripeCents: '0',
        unitsSold: '0',
        previousTicketCount: '3',
        previousTotalCents: '9007199254740993',
        previousUnitsSold: '9',
      }),
    );
    const result = await service.administrativeSummary(actor, {
      from: '2026-11-24T08:00:00.000Z',
      to: '2026-11-25T08:00:00.000Z',
    });
    expect(result.data.comparison.totalCents.previous).toBe('9007199254740993');
    expect(result.data.comparison.totalCents.change).toBe('-9007199254740993');
    expect(result.data.comparison.totalCents.changePercent).toBe('-100.00');
    expect(result.data.comparison.unitsSold.changePercent).toBe('-100.00');
  });
});
