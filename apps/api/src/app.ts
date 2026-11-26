import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import { chainEnabled, getDeployment, isDemo, isDeployed, type AppEnv } from "./env";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { merchantRoutes } from "./routes/merchants";
import { publicRoutes } from "./routes/public";

/**
 * Rate limit por IP con el binding nativo de Cloudflare (sin escrituras a KV).
 * Si el binding no existe (tests) o falla, deja pasar: nunca tumba la API.
 */
const rateLimit = (binding: "RL_AUTH" | "RL_PUBLIC") =>
  async (c: Context<AppEnv>, next: () => Promise<void>) => {
    const limiter = c.env[binding];
    if (limiter) {
      const ip = c.req.header("cf-connecting-ip") ?? "local";
      const ok = await limiter.limit({ key: ip }).then((r) => r.success, () => true);
      if (!ok) return c.json({ error: "Demasiadas solicitudes, intenta en un minuto" }, 429);
    }
    await next();
  };

export const app = new Hono<AppEnv>().basePath("/api");

app.use("*", secureHeaders());
app.use("*", async (c, next) => cors({ origin: c.env.APP_URL, credentials: true })(c, next));
app.use("/auth/*", rateLimit("RL_AUTH"));
app.use("/p/*", rateLimit("RL_PUBLIC"));
app.use("/faucet", rateLimit("RL_AUTH"));

app.get("/health", (c) => {
  const d = getDeployment(c.env.NETWORK);
  return c.json({ ok: true, network: d.network, deployed: isDeployed(d), chain: chainEnabled(c.env), contracts: d.contracts });
});

/** Config pública para el front (red, contratos, tokens). */
app.get("/config", (c) => {
  const d = getDeployment(c.env.NETWORK);
  return c.json({ ...d, demo: isDemo(c.env) });
});

app.route("/auth", authRoutes);
app.route("/merchants", merchantRoutes);
app.route("/admin", adminRoutes);
app.route("/", publicRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof ZodError) return c.json({ error: err.issues[0]?.message ?? "Datos inválidos" }, 400);
  console.error(err);
  return c.json({ error: "Algo salió mal, intenta de nuevo" }, 500);
});
