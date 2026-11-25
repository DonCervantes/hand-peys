import { app } from "./app";
import type { Env, SerializedEvent } from "./env";
import { applySerialized, expireLinks, reconcileKyc, runIndexer } from "./services/indexer";

export default {
  fetch: app.fetch,

  /** Cron cada minuto: indexer + expiración de links; KYC cada 5 minutos. */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        try {
          const r = await runIndexer(env);
          console.log("indexer", JSON.stringify(r));
        } catch (err) {
          console.error("indexer error", err);
        }
        await expireLinks(env);
        if (new Date(event.scheduledTime).getUTCMinutes() % 5 === 0) await reconcileKyc(env);
      })()
    );
  },

  /** Consumer de Cloudflare Queues (si está habilitado). Idempotente. */
  async queue(batch: MessageBatch<SerializedEvent>, env: Env) {
    for (const msg of batch.messages) {
      try {
        await applySerialized(env, msg.body);
        msg.ack();
      } catch (err) {
        console.error("queue apply", msg.body.id, err);
        msg.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, SerializedEvent>;
