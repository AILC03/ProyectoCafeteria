import { formatMxnCents, splitIncludedIva } from '../../../shared/utils/money';

type PosTotalsProps = {
  totalCents: string;
  source: 'estimate' | 'server';
};

/** Informative tax-inclusive breakdown. The API total remains the source of truth. */
export function PosTotals({ totalCents, source }: PosTotalsProps) {
  const { subtotalCents, ivaCents } = splitIncludedIva(totalCents);
  return (
    <div className="pos-totals">
      <dl className="pos-totals-list">
        <div className="pos-totals-row">
          <dt>Subtotal</dt>
          <dd>{formatMxnCents(subtotalCents)}</dd>
        </div>
        <div className="pos-totals-row">
          <dt>IVA incluido (16%)</dt>
          <dd>{formatMxnCents(ivaCents)}</dd>
        </div>
        <div className="pos-totals-row pos-totals-total">
          <dt>{source === 'server' ? 'Total confirmado' : 'Total estimado'}</dt>
          <dd>{formatMxnCents(totalCents)}</dd>
        </div>
      </dl>
      <p className="field-hint">
        {source === 'server'
          ? 'Desglose informativo de IVA incluido. El total confirmado por el servidor es la fuente de verdad.'
          : 'Estimado informativo. Los precios ya incluyen IVA; el servidor confirma el total.'}
      </p>
    </div>
  );
}
