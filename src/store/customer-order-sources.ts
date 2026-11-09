import type { OrderClient } from '@/lib/data/orders';
import type { OrderFlow } from '@/lib/data/order-flow';

/** Visit-only source isolation; an unanswered order stays with the client that sent it. */
export class CustomerOrderSources<TFields> {
  private sessions = new Map<OrderClient, { flow: OrderFlow; fields: TFields }>();
  private client: OrderClient | null = null;
  private fieldsClient: OrderClient | null = null;
  private started = false;
  private generation = 0;
  flow: OrderFlow | undefined;

  constructor(
    private readonly deps: {
      snapshot: () => TFields;
      empty: () => TFields;
      apply: (fields: TFields, current: () => boolean, applied: () => void) => void;
      make: (client: OrderClient, current: () => boolean) => OrderFlow;
    }
  ) {}

  scope(): () => boolean {
    const generation = this.generation;
    return () => generation === this.generation;
  }

  bind(client: OrderClient | null): { flow: OrderFlow | undefined; first: boolean } {
    const first = !this.started;
    if (!first && client === this.client) return { flow: this.flow, first: false };
    if (this.client && this.flow && this.fieldsClient === this.client) {
      this.sessions.set(this.client, {
        flow: this.flow,
        fields: structuredClone(this.deps.snapshot())
      });
    }
    this.started = true;
    this.generation++;
    this.client = client;
    const saved = client ? this.sessions.get(client) : undefined;
    this.flow = saved?.flow;
    if (client && !this.flow) {
      const flow: OrderFlow = this.deps.make(
        client,
        () => this.flow === flow && this.client === client
      );
      this.flow = flow;
      this.sessions.set(client, { flow, fields: this.deps.empty() });
    }
    if (!first || saved) {
      const current = this.scope();
      this.deps.apply(structuredClone(saved?.fields ?? this.deps.empty()), current, () => {
        if (current()) this.fieldsClient = client;
      });
    } else this.fieldsClient = client;
    return { flow: this.flow, first };
  }
}
