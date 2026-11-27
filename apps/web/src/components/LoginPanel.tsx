/**
 * Login propio (sin la ventana de Pollar): correo → código de 6 dígitos, o Google.
 * Con la wallet de prueba (sin Pollar) solo muestra el botón "Entrar".
 */
import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { useSession } from "../lib/session";
import { useWallet } from "../lib/wallet";
import { Button, ErrorNote, Input } from "./ui";

const BUSY: Record<string, string> = {
  creating_session: "Conectando…",
  sending_email: "Enviando código…",
  verifying_email_code: "Verificando código…",
  authenticating: "Entrando…",
  opening_oauth: "Abriendo Google…",
};

export function LoginPanel({ cta = "Entrar" }: { cta?: string }) {
  const wallet = useWallet();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  // Wallet ya conectada pero falta la firma de Hand Peys (Pollar o wallet de prueba).
  if (wallet.ready && wallet.address) {
    return (
      <div className="space-y-3">
        <Button size="lg" className="w-full" loading={session.loading} onClick={() => void session.signIn()}>
          Confirmar con mi wallet
        </Button>
        <ErrorNote>{session.error}</ErrorNote>
      </div>
    );
  }

  // Wallet de prueba: un clic crea la wallet local.
  if (!wallet.login) {
    return (
      <Button size="lg" className="w-full" loading={session.loading} onClick={() => wallet.connect()}>
        {cta}
      </Button>
    );
  }

  const login = wallet.login;
  const busy = BUSY[login.step];
  if (login.step === "authenticated") return <p className="text-center text-sm text-gris">Preparando tu wallet…</p>;

  const codeStep = login.step === "entering_code" || login.step === "verifying_email_code";

  if (codeStep) {
    const submitCode = (e: FormEvent) => {
      e.preventDefault();
      if (code.trim().length >= 6) login.verifyCode(code.trim());
    };
    return (
      <form onSubmit={submitCode} className="space-y-3 text-left">
        <p className="text-sm text-gris">
          Te enviamos un código de 6 dígitos a <b className="text-tinta">{login.email ?? email}</b>.
        </p>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="text-center text-2xl tracking-[0.5em]"
          autoFocus
        />
        <Button type="submit" size="lg" className="w-full" loading={Boolean(busy)} disabled={code.length < 6}>
          {busy ?? "Entrar"}
        </Button>
        <div className="flex justify-between text-sm">
          <button type="button" className="text-gris underline" onClick={() => { setCode(""); login.cancel(); }}>
            Cambiar correo
          </button>
          <button type="button" className="font-semibold text-oro-dark underline" onClick={() => login.sendCode(login.email ?? email)}>
            Reenviar código
          </button>
        </div>
        <ErrorNote>{login.error}</ErrorNote>
      </form>
    );
  }

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (/^\S+@\S+\.\S+$/.test(email.trim())) login.sendCode(email.trim().toLowerCase());
  };
  return (
    <div className="space-y-3 text-left">
      <form onSubmit={submitEmail} className="space-y-3">
        <Input
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Correo electrónico"
        />
        <Button type="submit" size="lg" className="w-full" loading={Boolean(busy) && login.step !== "opening_oauth"}>
          <Mail className="size-4" /> {busy && login.step !== "opening_oauth" ? busy : "Recibir código por correo"}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-gris">
        <span className="h-px flex-1 bg-linea" /> o <span className="h-px flex-1 bg-linea" />
      </div>
      <Button variant="secondary" size="lg" className="w-full" loading={login.step === "opening_oauth"} onClick={() => login.google()}>
        Entrar con Google
      </Button>
      <ErrorNote>{login.error ?? session.error}</ErrorNote>
      <p className="text-center text-xs text-gris">Tu wallet la protege Pollar. Sin frases semilla.</p>
    </div>
  );
}
