import { z } from 'zod';
import type { StaffIdentity } from '@/lib/auth/staff-name';

const requestSchema = z.strictObject({
  clientId: z.uuid(),
  orderNo: z.string().regex(/^HC-\d+$/),
  category: z.string().min(1).max(60),
  amountCents: z.number().int().min(1).max(100_000_000),
  note: z.string().max(120)
});

export type PendingCafeExpense = z.infer<typeof requestSchema>;

export class CafeExpenseRecovery {
  private readonly key: string;

  constructor(
    scope: StaffIdentity,
    private readonly orderNo: string
  ) {
    this.key = 'hc-cafe-expense-v1:' + JSON.stringify([scope.business, scope.userId, orderNo]);
  }

  read(): PendingCafeExpense | null {
    const raw = localStorage.getItem(this.key);
    if (raw === null) return null;
    if (raw.length > 2048) throw new Error('Invalid pending expense');
    const pending = requestSchema.parse(JSON.parse(raw));
    if (pending.orderNo !== this.orderNo) throw new Error('Invalid pending expense');
    return pending;
  }

  keep(request: PendingCafeExpense): void {
    localStorage.setItem(this.key, JSON.stringify(requestSchema.parse(request)));
  }

  clear(): void {
    localStorage.removeItem(this.key);
  }

  async withWriter(write: () => Promise<void>): Promise<boolean> {
    if (!navigator.locks) return false;
    return navigator.locks.request(this.key, { ifAvailable: true }, async (lock) => {
      if (!lock) return false;
      await write();
      return true;
    });
  }
}
