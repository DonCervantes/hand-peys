#!/usr/bin/env node
// Graba una demo de ~80 s de handle con subtítulos y marquesina (Playwright).
// Requiere la app local en modo demo: `pnpm --filter @hand-peys/api exec wrangler dev --port 8787`
// (DEMO_MODE=true en apps/api/.dev.vars y la web compilada con `pnpm --filter @hand-peys/web build`).
// Uso: node scripts/demo-video.mjs [url] [--shipit]
// Salida: demo/handle-demo(.webm|.srt), o demo/handle-demo-shipit.* con --shipit
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Playwright está instalado en apps/web.
const webDir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web");
const pw = await import(pathToFileURL(createRequire(join(webDir, "package.json")).resolve("@playwright/test")).href);
const chromium = pw.chromium ?? pw.default.chromium;

const args = process.argv.slice(2);
const SHIPIT = args.includes("--shipit"); // abre con la página de Ship It y su flyer
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:8787";
const NAME = SHIPIT ? "handle-demo-shipit" : "handle-demo";
const SHIPIT_URL = "https://www.thebafnetwork.com/hackathons/mx/ship-it";
const SHIPIT_FLYER = "https://www.thebafnetwork.com/hackathons/mx/ship-it/flyer.jpg";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "demo");
const RAW = join(OUT, "raw");
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const MARQUEE =
  "handle  ·  Cobra con un link  ·  0.9% por cobro  ·  Pesos digitales (MXNe) y dólares digitales (USDC)  ·  Sobre la red Stellar  ·  Sin terminal  ·  Dinero en segundos  ·  Pago con garantía  ·  ";
const MARK =
  '<svg viewBox="0 0 242 215" style="height:1em;width:auto"><path d="M0 0H150A150 150 0 0 1 0 150Z" fill="#212121"/><path d="M92 215A150 150 0 0 1 242 65V215Z" fill="#c4a47a"/></svg>';

// Capa de la demo: marquesina inferior + subtítulos. Se reinyecta en cada carga de página.
const overlay = ({ marquee, mark, flyer }) => {
  const install = () => {
    if (document.getElementById("__demo")) return;
    const css = document.createElement("style");
    css.textContent = `
      [class*="bg-maiz/25"]{display:none!important}
      #__demo-marquee{position:fixed;left:0;right:0;bottom:0;height:38px;background:#212121;color:#c4a47a;z-index:2147483646;
        overflow:hidden;display:flex;align-items:center;font:600 15px/1 Inter,system-ui,sans-serif;letter-spacing:.02em}
      #__demo-marquee .track{display:flex;width:max-content;animation:__mq 40s linear infinite}
      #__demo-marquee .track span{white-space:pre;padding-right:0}
      @keyframes __mq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
      #__demo-cap{position:fixed;left:50%;bottom:58px;transform:translateX(-50%);max-width:min(980px,92vw);z-index:2147483647;
        background:rgba(33,33,33,.92);color:#fff;font:500 24px/1.35 Inter,system-ui,sans-serif;padding:12px 22px;border-radius:14px;
        text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.18);transition:opacity .25s}
      #__demo-cap:empty{opacity:0}
      #__demo-end{position:fixed;inset:0;z-index:2147483645;background:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;
        font-family:Jost,Inter,system-ui,sans-serif;color:#212121}
      #__demo-end .logo{display:flex;align-items:center;gap:22px;font-size:96px;line-height:1}
      #__demo-end .tag{font-size:30px;color:#6e6a64}
      #__demo-end .url{font:600 20px Inter,system-ui,sans-serif;color:#7a5f3a}
      #__demo-end .note{font:400 14px Inter,system-ui,sans-serif;color:#6e6a64;margin-top:8px}
      .__demo-hl{outline:4px solid #c4a47a!important;outline-offset:3px;border-radius:12px}
      #__demo-flyer{position:fixed;inset:0 0 38px 0;z-index:2147483644;background:rgba(17,17,17,.88);display:none;align-items:center;justify-content:center;gap:48px}
      #__demo-flyer img{height:560px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
      #__demo-flyer .txt{color:#fff;font-family:Jost,Inter,system-ui,sans-serif;max-width:380px}
      #__demo-flyer .txt b{display:block;font-size:44px;line-height:1.05;font-weight:700}
      #__demo-flyer .txt span{display:block;margin-top:14px;font:500 20px/1.4 Inter,system-ui,sans-serif;color:#c4a47a}
      #__demo-end .ship{display:flex;align-items:center;gap:14px;margin-top:6px;font:500 16px Inter,system-ui,sans-serif;color:#6e6a64}
      #__demo-end .ship img{height:84px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.15)}`;
    const root = document.createElement("div");
    root.id = "__demo";
    root.innerHTML = `<div id="__demo-end"><div class="logo">${mark}<span>handle</span></div>
        <div class="tag">Cobra con un link. Recibe pesos digitales en segundos.</div>
        <div class="url">hand-peys.cruzcervantesdanieladrianelias.workers.dev</div>
        ${flyer ? `<div class="ship"><img src="${flyer}" alt="Ship It: Builder Challenge"><span>Hecho para <b>Ship It: Builder Challenge</b><br>BAF × Stellar México · 23–27 nov 2026</span></div>` : ""}
        <div class="note">Demo grabada en entorno de prueba</div></div>
      ${flyer ? `<div id="__demo-flyer"><img src="${flyer}" alt="Ship It: Builder Challenge"><div class="txt"><b>Ship It:<br>Builder Challenge</b><span>BAF × Stellar México<br>23–27 de noviembre de 2026<br>Cinco días para construir y lanzar en mainnet.</span></div></div>` : ""}
      <div id="__demo-cap"></div><div id="__demo-marquee"><div class="track"><span>${marquee.repeat(2)}</span><span>${marquee.repeat(2)}</span></div></div>`;
    document.head.appendChild(css);
    document.body.appendChild(root);
    const cap = sessionStorage.getItem("__cap");
    if (cap) document.getElementById("__demo-cap").textContent = cap;
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
};

const browser = await chromium.launch();
// Calentamiento: carga la app una vez sin grabar para que el video no empiece con segundos en blanco.
{
  const warm = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await warm.newPage();
  await p.goto(BASE + "/");
  await p.getByRole("heading", { name: /Cobra con un link/ }).waitFor({ timeout: 60000 });
  await p.goto(BASE + "/app/cobrar");
  await p.waitForTimeout(1500);
  await warm.close();
}
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  locale: "es-MX",
  recordVideo: { dir: RAW, size: { width: 1280, height: 720 } },
});
await context.addInitScript(overlay, { marquee: MARQUEE, mark: MARK, flyer: SHIPIT ? SHIPIT_FLYER : null });
const page = await context.newPage();
const t0 = Date.now();
const cues = [];

const wait = (ms) => page.waitForTimeout(ms);
async function say(text) {
  const now = (Date.now() - t0) / 1000;
  if (cues.length) cues[cues.length - 1].end = now;
  cues.push({ start: now, end: null, text });
  await page.evaluate((t) => {
    sessionStorage.setItem("__cap", t);
    const el = document.getElementById("__demo-cap");
    if (el) el.textContent = t;
  }, text);
}
async function click(locator, pause = 600) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((el) => el.classList.add("__demo-hl"));
  await wait(pause);
  await locator.evaluate((el) => el.classList.remove("__demo-hl"));
  await locator.click();
}
async function type(locator, text) {
  await locator.click();
  await locator.pressSequentially(text, { delay: 70 });
}
const scrollTo = (sel) =>
  page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ behavior: "smooth", block: "center" }), sel);

// 0. Ship It (opcional)
if (SHIPIT) {
  await page.goto(SHIPIT_URL, { waitUntil: "load" });
  await say("Estamos construyendo Hand Peys para Ship It: Builder Challenge, de BAF × Stellar México.");
  await wait(4500);
  await page.mouse.wheel(0, 650);
  await wait(2500);
  await page.evaluate(() => (document.getElementById("__demo-flyer").style.display = "flex"));
  await say("Cinco días para construir y lanzar en mainnet. Esto es lo que construimos:");
  await wait(5500);
}

// 1. Landing
await page.goto(BASE + "/");
await page.evaluate(() => localStorage.clear());
await page.reload();
await say("Esto es handle: cobra con un link y recibe pesos digitales en segundos.");
await wait(6500);

// 2. Ahorro vs terminal
await scrollTo("#calc");
await say("Una terminal cobra cerca de 3.5% + IVA. Con handle pagas solo 0.9% por cobro.");
await wait(SHIPIT ? 5000 : 6500);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await wait(1200);

// 3. Entrar y registrar el negocio
await say("Doña Lupe entra con su correo o con Google. Sin terminal y sin frases semilla.");
await wait(2500);
await click(page.getByRole("button", { name: /Empieza a cobrar gratis/ }));
const goApp = page.getByRole("link", { name: /Ir a mi changarro/ });
await goApp.waitFor({ timeout: 15000 });
await wait(800);
await click(goApp);
await page.waitForURL(/\/app\/registro/, { timeout: 15000 });
await wait(800);
await say("Registra su negocio en segundos.");
await type(page.getByPlaceholder("Tamales Doña Lupe"), "Tamales Doña Lupe");
await type(page.getByPlaceholder("Coyoacán, CDMX"), "Coyoacán, CDMX");
await wait(500);
await click(page.getByRole("button", { name: "Continuar" }));

// 4. Verificación
await page.getByRole("button", { name: /Verificar mi identidad/ }).waitFor();
await say("Verifica su identidad una sola vez. On-chain solo queda que ya está verificada.");
await wait(2500);
await click(page.getByRole("button", { name: /Verificar mi identidad/ }));
await page.getByText(/Comercio verificado/).waitFor({ timeout: 20000 });
await say("Listo: su panel muestra cobros, comisiones y links activos.");
await wait(4000);

// 5. Nuevo cobro
await click(page.getByRole("link", { name: /Nuevo cobro/ }).first());
await page.getByPlaceholder("350").waitFor();
await say("Escribe el monto en pesos y el concepto.");
await type(page.getByPlaceholder("350"), "350");
await type(page.getByPlaceholder("10 tamales verdes"), "10 tamales verdes y de rajas");
await wait(800);
await click(page.getByRole("button", { name: "Crear link de cobro" }));
await page.waitForURL(/\/app\/links\/[0-9a-f]{32}/);
const id = page.url().split("/").pop();

// 6. Link y QR
await say("Recibe un link y un QR para mandarlo por WhatsApp o imprimirlo.");
await wait(SHIPIT ? 5000 : 6500);

// 7. El cliente paga
await page.goto(`${BASE}/p/${id}`);
await say("Su cliente abre el link desde su celular y paga en segundos.");
await wait(3500);
await click(page.getByRole("button", { name: /Pagar \$350\.00 MXN/ }));
await page.getByText("¡Pago completado!").waitFor({ timeout: 20000 });
await say("Pago confirmado, con comprobante descargable.");
await wait(4500);

// 8. Dinero en el panel
await page.goto(`${BASE}/app`);
await page.getByText("$346.85 MXN").waitFor({ timeout: 20000 });
await say("El dinero llega al instante: $346.85 netos. La comisión de 0.9% fue de $3.15.");
await wait(7000);

// 9. Garantía
await click(page.getByRole("banner").getByRole("link", { name: "Cobrar" }), 400);
const escrowBtn = page.getByRole("main").getByRole("button", { name: /Con garantía/ });
await escrowBtn.waitFor();
await click(escrowBtn, 400);
await say("¿Vende por internet? Cobra con garantía: el dinero se libera cuando el cliente confirma.");
await wait(6500);

// 10. Cierre
await page.evaluate(() => {
  document.getElementById("__demo-end").style.display = "flex";
});
await say(SHIPIT ? "Hand Peys, hecho para Ship It. Cobra hoy, sin terminal y por solo 0.9%." : "handle: cobra hoy, sin terminal y por solo 0.9%.");
await wait(7000);
cues[cues.length - 1].end = (Date.now() - t0) / 1000;

const video = page.video();
await context.close();
await browser.close();
const raw = await video.path();
renameSync(raw, join(OUT, `${NAME}.webm`));
for (const f of readdirSync(RAW)) rmSync(join(RAW, f), { force: true });
rmSync(RAW, { recursive: true, force: true });

const ts = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, "0")}`;
};
writeFileSync(
  join(OUT, `${NAME}.srt`),
  cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n")
);
console.log(`✅ ${join(OUT, `${NAME}.webm`)} (${((Date.now() - t0) / 1000).toFixed(1)} s) y ${NAME}.srt`);
