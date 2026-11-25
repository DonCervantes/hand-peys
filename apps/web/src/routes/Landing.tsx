import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Clock, Link2, QrCode, ShieldCheck, Smartphone, Store, Wallet as WalletIcon } from "lucide-react";
import { useState } from "react";
import { LoginButton } from "../components/Layout";
import { Card } from "../components/ui";
import { useSession } from "../lib/session";

const HP_FEE = 0.009;
/** Referencia aproximada de una terminal: 3.5% + IVA (16%) sobre la comisión. Fuente por documentar en BUSINESS.md. */
const TERMINAL_FEE = 0.035 * 1.16;
const mxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

function PhoneMock() {
  return (
    <div className="relative mx-auto w-[280px] rotate-2 rounded-[2.5rem] border-[10px] border-tinta bg-white p-5 shadow-2xl">
      <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-black/10" />
      <p className="text-xs text-gris">Tamales Doña Lupe · Coyoacán</p>
      <p className="mt-1 font-display text-4xl font-extrabold">$350.00</p>
      <p className="text-sm text-gris">10 tamales verdes y de rajas</p>
      <div className="my-5 grid place-items-center rounded-2xl bg-crema p-4">
        <QrCode className="size-28 text-tinta" strokeWidth={1.2} />
      </div>
      <div className="rounded-xl bg-rosa py-3 text-center font-semibold text-white">Pagar con Google</div>
      <p className="mt-3 flex items-center justify-center gap-1 text-xs text-nopal">
        <ShieldCheck className="size-3.5" /> Comercio verificado
      </p>
      <div className="absolute -bottom-6 -left-6 -rotate-6 rounded-2xl bg-nopal px-4 py-3 text-sm font-semibold text-white shadow-lg">
        ¡Te pagaron $350! 🎉
      </div>
    </div>
  );
}

function Calculator() {
  const [amount, setAmount] = useState(350);
  const terminal = amount * TERMINAL_FEE;
  const hp = amount * HP_FEE;
  return (
    <Card className="p-6">
      <label className="text-sm font-medium" htmlFor="calc">
        Si vendes…
      </label>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-display text-3xl font-extrabold">$</span>
        <input
          id="calc"
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
          className="w-full bg-transparent font-display text-3xl font-extrabold outline-none"
        />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-black/5 p-4">
          <p className="text-sm text-gris">Terminal típica (aprox. 3.5% + IVA)</p>
          <p className="mt-1 text-2xl font-bold text-red-700">−{mxn(terminal)}</p>
          <p className="text-xs text-gris">y esperas días el depósito</p>
        </div>
        <div className="rounded-xl bg-nopal-soft p-4">
          <p className="text-sm text-nopal">Hand Peys (0.9%)</p>
          <p className="mt-1 text-2xl font-bold text-nopal">−{mxn(hp)}</p>
          <p className="text-xs text-nopal">y te llega en segundos</p>
        </div>
      </div>
      <p className="mt-4 text-center font-semibold">
        Te ahorras <span className="text-rosa">{mxn(terminal - hp)}</span> en esta venta.
      </p>
    </Card>
  );
}

const faqs = [
  ["¿Necesito terminal o cuenta especial?", "No. Solo tu celular. Entras con Google o tu correo y en minutos ya puedes cobrar."],
  ["¿Qué son los “pesos digitales”?", "Son MXNe: pesos mexicanos digitales respaldados 1 a 1. También puedes cobrar en dólares digitales (USDC)."],
  ["¿Cuánto cobran?", "0.9% por cobro pagado. Sin renta, sin plazo forzoso, sin letras chiquitas. Si reembolsas, no te cobramos."],
  ["¿Por qué me piden identificación?", "Para cuidar a tus clientes y cumplir la ley, verificamos a cada comercio una sola vez (INE + selfie). Tus datos no se publican."],
  ["¿Qué es el modo “Con garantía”?", "Para ventas por encargo: el dinero queda apartado hasta que tu cliente confirma que recibió. Da confianza a los dos."],
  [
    "¿Cómo funciona por dentro?",
    "Los pagos viajan por la red Stellar, que liquida en unos 5 segundos con costos de fracción de centavo. Las reglas (comisión, garantía, verificación) viven en contratos inteligentes Soroban públicos y auditables. La wallet la gestiona Pollar: sin frases semilla.",
  ],
] as const;

export function Landing() {
  const { loggedIn } = useSession();
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 md:grid-cols-2 md:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-rosa-soft px-3 py-1 text-sm font-semibold text-rosa-dark">
            🇲🇽 Hecho para changarros, freelancers y PyMEs
          </span>
          <h1 className="mt-5 text-5xl font-extrabold leading-[1.05] md:text-6xl">
            Cobra con un link.
            <br />
            <span className="text-rosa">Recibe tu lana</span> en segundos.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-gris">
            Comparte un link o un QR por WhatsApp y recibe pesos digitales al instante. Sin terminal y con solo 0.9% de comisión. Al chile, sin letras chiquitas.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {loggedIn ? (
              <Link to="/app" className="inline-flex h-13 items-center gap-2 rounded-xl bg-rosa px-6 font-semibold text-white">
                Ir a mi changarro <ArrowRight className="size-4" />
              </Link>
            ) : (
              <LoginButton size="lg">
                Empieza a cobrar gratis <ArrowRight className="size-4" />
              </LoginButton>
            )}
            <a href="#como-funciona" className="inline-flex h-13 items-center rounded-xl border border-linea bg-white px-6 font-semibold">
              ¿Cómo funciona?
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gris">
            {["Sin terminal", "Dinero en segundos", "0.9% por cobro"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-4 text-nopal" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="py-8">
          <PhoneMock />
        </div>
      </section>
      <div className="papel-picado opacity-80" />

      {/* Cómo funciona */}
      <section id="como-funciona" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-4xl font-extrabold">Cobrar es así de fácil</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: Link2, t: "1. Escribe el monto", d: "“$350 – 10 tamales”. En pesos, como siempre." },
              { icon: Smartphone, t: "2. Comparte el link o QR", d: "Por WhatsApp, imprímelo o enséñalo en tu cel." },
              { icon: WalletIcon, t: "3. Te pagan en segundos", d: "Tu cliente paga con Google o su correo y la lana llega al momento." },
            ].map(({ icon: Icon, t, d }) => (
              <Card key={t} className="p-6">
                <Icon className="size-8 text-rosa" />
                <h3 className="mt-4 text-xl font-bold">{t}</h3>
                <p className="mt-1 text-gris">{d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Comparativa */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-2">
        <div>
          <h2 className="text-4xl font-extrabold">Deja de regalar tu ganancia</h2>
          <p className="mt-4 text-lg text-gris">
            Una terminal te cobra cerca de 3.5% más IVA y tarda días en depositarte. Con Hand Peys pagas 0.9% y el dinero es tuyo en segundos.
          </p>
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="text-left text-gris">
                <th className="py-2"></th>
                <th>Terminal</th>
                <th>Transferencia</th>
                <th className="text-rosa">Hand Peys</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-t [&_td]:border-linea [&_td]:py-2">
              <tr><td>Comisión</td><td>~3.5% + IVA</td><td>$0</td><td className="font-semibold">0.9%</td></tr>
              <tr><td>Llega en</td><td>1–3 días</td><td>Minutos</td><td className="font-semibold">Segundos</td></tr>
              <tr><td>Conciliación</td><td>Manual</td><td>Manual</td><td className="font-semibold">Automática</td></tr>
              <tr><td>Garantía de entrega</td><td>No</td><td>No</td><td className="font-semibold">Sí</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gris">Cifras de referencia, por confirmar con fuentes públicas (ver BUSINESS.md).</p>
        </div>
        <Calculator />
      </section>

      {/* Para quién */}
      <section className="bg-tinta py-20 text-crema">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-4xl font-extrabold">Para el que vende de verdad</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl bg-white/5 p-6">
              <Store className="size-8 text-maiz" />
              <h3 className="mt-3 text-2xl font-bold">Changarros</h3>
              <p className="mt-2 text-crema/70">Imprime tu QR, pégalo en el mostrador y deja de perder ventas por “¿aceptas tarjeta?”.</p>
            </div>
            <div className="rounded-2xl bg-white/5 p-6">
              <Clock className="size-8 text-maiz" />
              <h3 className="mt-3 text-2xl font-bold">Freelancers</h3>
              <p className="mt-2 text-crema/70">Manda un link por proyecto. Cada cobro queda registrado: adiós a conciliar transferencias por WhatsApp.</p>
            </div>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {[
              ["“Antes perdía como una de cada cinco ventas por no tener terminal. Ahora pego mi QR y listo.”", "Lupe, tamales en Coyoacán"],
              ["“Mando el link con la cotización y el cliente paga ese mismo día. Ya no persigo a nadie.”", "Beto, diseñador en Guadalajara"],
            ].map(([q, a]) => (
              <figure key={a} className="rounded-2xl border border-white/10 p-6">
                <blockquote className="text-lg">{q}</blockquote>
                <figcaption className="mt-3 text-sm text-crema/60">
                  {a} · <em>testimonio ilustrativo (ejemplo)</em>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-20">
        <h2 className="text-center text-4xl font-extrabold">Preguntas frecuentes</h2>
        <div className="mt-10 space-y-3">
          {faqs.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-linea bg-white p-5">
              <summary className="cursor-pointer list-none font-semibold">{q}</summary>
              <p className="mt-2 text-gris">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20">
        <div className="mx-auto max-w-4xl rounded-3xl bg-rosa px-6 py-14 text-center text-white">
          <h2 className="text-4xl font-extrabold">Tu primer cobro en 5 minutos</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">Entra con Google, verifica tu identidad una vez y empieza a mandar links.</p>
          <div className="mt-8 flex justify-center">
            {loggedIn ? (
              <Link to="/app/cobrar" className="inline-flex h-13 items-center rounded-xl bg-white px-6 font-semibold text-rosa">
                Crear un cobro
              </Link>
            ) : (
              <LoginButton size="lg">Crear mi cuenta</LoginButton>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-linea py-8 text-center text-sm text-gris">
        Hand Peys · Hecho en México para el Ship It Builder Challenge · Pagos sobre Stellar
      </footer>
    </div>
  );
}
