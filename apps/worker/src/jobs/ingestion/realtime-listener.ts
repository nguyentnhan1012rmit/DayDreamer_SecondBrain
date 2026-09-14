import { Client as PgClient } from "pg";
import { calculateReconnectDelayMs } from "./reliability";

export class RealtimeListener {
  private client: PgClient | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private started = false;
  private stopping = false;

  constructor(
    private readonly workerId: string,
    private readonly onNotification: () => void | Promise<void>,
  ) {}

  start() {
    if (this.started) return;
    if (!process.env.DATABASE_URL) {
      console.warn(
        "[Worker - Ingestion] DATABASE_URL missing; realtime listener disabled.",
      );
      return;
    }
    this.started = true;
    this.stopping = false;
    void this.connect();
  }

  async stop() {
    this.stopping = true;
    this.started = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const client = this.client;
    this.client = null;
    if (!client) return;
    client.removeAllListeners();
    await client.query("UNLISTEN indexing_outbox_jobs").catch(() => undefined);
    await client.end().catch(() => undefined);
  }

  private async connect() {
    if (this.stopping || this.client) return;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const client = new PgClient({
      connectionString,
      application_name: `${this.workerId}:indexing-listener`,
      keepAlive: true,
    });
    this.client = client;
    client.on("notification", () => void this.onNotification());
    client.on("error", (error) => this.disconnect(client, error));
    client.on("end", () =>
      this.disconnect(client, new Error("PostgreSQL LISTEN connection ended.")),
    );
    try {
      await client.connect();
      await client.query("LISTEN indexing_outbox_jobs");
      this.reconnectAttempt = 0;
      console.log(
        "[Worker - Ingestion] Listening for indexing_outbox_jobs notifications.",
      );
      await this.onNotification();
    } catch (error) {
      this.disconnect(client, error);
    }
  }

  private disconnect(client: PgClient, error: unknown) {
    if (this.client !== client) return;
    this.client = null;
    client.removeAllListeners();
    void client.end().catch(() => undefined);
    if (this.stopping) return;
    const delay = calculateReconnectDelayMs(this.reconnectAttempt, {
      baseDelayMs: Number(
        process.env.INDEXING_LISTENER_RECONNECT_BASE_MS ?? 1_000,
      ),
      maxDelayMs: Number(
        process.env.INDEXING_LISTENER_RECONNECT_MAX_MS ?? 60_000,
      ),
    });
    this.reconnectAttempt += 1;
    console.warn(
      `[Worker - Ingestion] Realtime listener disconnected; reconnecting in ${delay}ms: ${error instanceof Error ? error.message : String(error)}`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }
}
