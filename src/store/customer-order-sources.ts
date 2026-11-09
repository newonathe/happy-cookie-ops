import type { OrderClient } from '@/lib/data/orders';
import type { OrderFlow } from '@/lib/data/order-flow';

/** Visit-only source isolation; an unanswered order stays with the client that sent it. */
export class CustomerOrderSources<TFields> {
  private sessions = new Map<
    OrderClient,
    { flow: OrderFlow; fields: TFields; backend: string | null }
  >();
  private client: OrderClient | null = null;
  private backend: string | null = null;
  private fieldsClient: OrderClient | null = null;
  private started = false;
  private generation = 0;
  flow: OrderFlow | undefined;

  constructor(
    private readonly deps: {
      snapshot: () => TFields;
      empty: () => TFields;
      apply: (fields: TFields, current: () => boolean, applied: () => void) => void;
      make: (client: OrderClient, current: () => boolean, backend: string | null) => OrderFlow;
    }
  ) {}

  scope(): () => boolean {
    const generation = this.generation;
    return () => generation === this.generation;
  }

  bind(
    client: OrderClient | null,
    backend: string | null = null
  ): { flow: OrderFlow | undefined; first: boolean } {
    const first = !this.started;
    if (!first && client === this.client && backend === this.backend)
      return { flow: this.flow, first: false };
    if (this.client && this.flow && this.fieldsClient === this.client) {
      this.sessions.set(this.client, {
        flow: this.flow,
        backend: this.backend,
        fields: structuredClone(this.deps.snapshot())
      });
    }
    this.started = true;
    this.generation++;
    this.client = client;
    this.backend = backend;
    const saved = client ? this.sessions.get(client) : undefined;
    const compatible = !saved || saved.backend === backend;
    this.flow = compatible ? saved?.flow : undefined;
    if (client && !this.flow && compatible) {
      const flow: OrderFlow = this.deps.make(
        client,
        () => this.flow === flow && this.client === client && this.backend === backend,
        backend
      );
      this.flow = flow;
      this.sessions.set(client, { flow, fields: this.deps.empty(), backend });
    }
    if (!first || saved) {
      const current = this.scope();
      this.deps.apply(
        structuredClone((compatible ? saved?.fields : undefined) ?? this.deps.empty()),
        current,
        () => {
          if (current()) this.fieldsClient = client;
        }
      );
    } else this.fieldsClient = client;
    return { flow: this.flow, first };
  }
}
