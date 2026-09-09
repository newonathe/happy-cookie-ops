export interface RouteObservation { requested: string; actual: string; labels: string[] }
export function assertRoute(observation: RouteObservation, label: string): void {
  if (observation.actual !== observation.requested) throw new Error(`Route changed: ${observation.requested} -> ${observation.actual}`);
  if (!observation.labels.includes(label)) throw new Error(`Expected screen ${label}; saw ${observation.labels.join(', ')}`);
  if (label !== 'Home' && observation.labels.includes('Home')) throw new Error('Unexpected Home screen');
}

export interface SaleEvidence { clientId: string; saleId: string; total: number; items: Record<string, number>; state: string }
export function assertRecordedSale(rows: SaleEvidence[]): SaleEvidence {
  if (rows.length !== 1) throw new Error(`Expected exactly one synthetic sale, got ${rows.length}`);
  const sale = rows[0];
  if (!sale.clientId || !sale.saleId || !(sale.total > 0) || !Object.values(sale.items).some((qty) => qty > 0)) {
    throw new Error('Missing sale identity, money or items');
  }
  return sale;
}
export function assertDurableSale(before: SaleEvidence[], after: SaleEvidence[]): void {
  const sale = assertRecordedSale(before);
  const restored = assertRecordedSale(after);
  if (JSON.stringify(restored) !== JSON.stringify(sale)) throw new Error('Sale changed or lost across reload');
}
export function assertAcknowledgedSale(sale: SaleEvidence, accepted: string[]): void {
  if (sale.state !== 'sent' || !accepted.includes(sale.clientId)) throw new Error('Sale lacks matching acknowledgment');
}
