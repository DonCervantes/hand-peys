import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import { getDeployment, isDeployed, type AppEnv } from "./env";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { merchantRoutes } from "./routes/merchants";
import { publicRoutes } from "./routes/public";

/** Rate limit simple por IP con KV (ventana de 1 minuto). */
const rateLimit = (max: number) =>
  async (c: any, next: () => Promise<void>) => {
    const ip = c.req.header("cf-connecting-ip") ?? "local";
    const key = `rl:${ip}:${Math.floor(Date.now() / 60_000)}`;
    const n = Number((await c.env.KV.get(key)) ?? 0);
    if (n >= max) return c.json({ error: "Demasiadas solicitudes, intenta en un minuto" }, 429);
    await c.env.KV.put(key, String(n + 1), { expirationTtl: 120 });
    await next();
  };

export const app = new Hono<AppEnv>().basePath("/api");

app.use("*", secureHeaders());
app.use("*", async (c, next) => cors({ origin: c.env.APP_URL, credentials: true })(c, next));
app.use("/auth/*", rateLimit(30));
app.use("/p/*", rateLimit(120));

app.get("/health", (c) => {
  const d = getDeployment(c.env.NETWORK);
  return c.json({ ok: true, network: d.network, deployed: isDeployed(d), contracts: d.contracts });
});

/** Config pública para el front (red, contratos, tokens). */
app.get("/config", (c) => {
  const d = getDeployment(c.env.NETWORK);
  return c.json({ ...d, demo: !isDeployed(d) && c.env.ENVIRONMENT === "local" });
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
