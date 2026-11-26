import { describe, expect, test } from 'vitest';
import { checkedPreview, type Preview } from './accountApi';

const preview: Preview = { sourceOrderId: '9223372036854775807', canCreateOrder: true, totalCents: '2000', items: [{ productId: '9223372036854775807', productName: 'Agua', quantity: 1, optionValueIds: ['22'], currentUnitPriceCents: '2000', currentLineTotalCents: '2000' }], warnings: [] };

describe('repeat selection', () => {
  test('copies only contract input fields, retaining opaque decimal IDs', () => {
    expect(checkedPreview(preview, preview.sourceOrderId)).toEqual([{ productId: '9223372036854775807', quantity: 1, optionValueIds: ['22'] }]);
  });
  test('rejects a foreign source, blocking warnings and incomplete prices', () => {
    expect(() => checkedPreview(preview, '1')).toThrow();
    expect(() => checkedPreview({ ...preview, warnings: [{ line: 1, code: 'PRICE_CHANGED', blocking: true, optionValueId: null }] }, preview.sourceOrderId)).toThrow();
    expect(() => checkedPreview({ ...preview, items: [{ ...preview.items[0], currentLineTotalCents: null }] }, preview.sourceOrderId)).toThrow();
    expect(() => checkedPreview({ ...preview, canCreateOrder: false }, preview.sourceOrderId)).toThrow();
  });
});
