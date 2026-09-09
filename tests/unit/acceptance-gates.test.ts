import { describe, expect, it } from 'vitest';
import { assertRoute, assertRecordedSale, assertDurableSale, assertAcknowledgedSale } from '../fixtures/acceptance';
import { routeCases } from '../fixtures/route-cases';
const sale = { clientId: 'synthetic-device:S1:123', saleId: 'S1', total: 100, items: { dcf: 1 }, state: 'pending' };
describe('release assertions reject false positives', () => {
  it.each(routeCases.filter(([path]) => path !== '/'))('rejects Home for %s', (path, label) => {
    expect(() => assertRoute({ requested: path, actual: '/', labels: ['Home'] }, label)).toThrow();
    expect(() => assertRoute({ requested: path, actual: path, labels: ['Home'] }, label)).toThrow();
  });
  it('accepts the actual requested screen', () => {
    expect(() => assertRoute({ requested: '/orders', actual: '/orders', labels: ['Orders'] }, 'Orders')).not.toThrow();
  });
  it('rejects empty, missing, changed and unacknowledged sales', () => {
    expect(() => assertRecordedSale([])).toThrow();
    expect(() => assertRecordedSale([{ ...sale, items: {} }])).toThrow();
    expect(() => assertDurableSale([sale], [])).toThrow();
    expect(() => assertDurableSale([sale], [{ ...sale, clientId: 'different' }])).toThrow();
    expect(() => assertAcknowledgedSale({ ...sale, state: 'sent' }, [])).toThrow();
    expect(() => assertAcknowledgedSale({ ...sale, state: 'sent' }, ['another-id'])).toThrow();
    expect(() => assertDurableSale([sale], [sale])).not.toThrow();
    expect(() => assertAcknowledgedSale({ ...sale, state: 'sent' }, [sale.clientId])).not.toThrow();
  });
});
