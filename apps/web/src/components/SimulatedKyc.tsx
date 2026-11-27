/**
 * Verificación de identidad simulada (sin Pollar): INE → selfie → verificando.
 * Las imágenes no salen del navegador. Al terminar llama a onDone(), que pide al servidor
 * sincronizar el KYC (testnet: se aprueba y se escribe on-chain; mainnet: queda en revisión).
 */
import { Camera, Check, IdCard, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "./ui";

type Step = "ine" | "selfie" | "checking";

function Upload({ label, capture, onPick, sampleLabel }: { label: string; capture?: "user" | "environment"; onPick: (url: string | "sample") => void; sampleLabel: string }) {
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPick(URL.createObjectURL(f));
  };
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-linea bg-white px-4 py-6 text-sm font-semibold hover:border-oro">
        <Camera className="size-5 text-oro-dark" /> {label}
        <input type="file" accept="image/*" capture={capture} className="sr-only" onChange={onFile} />
      </label>
      <button type="button" className="w-full text-center text-sm font-semibold text-oro-dark underline" onClick={() => onPick("sample")}>
        {sampleLabel}
      </button>
    </div>
  );
}

function Preview({ src, kind }: { src: string; kind: "ine" | "selfie" }) {
  if (src !== "sample") return <img src={src} alt="" className="h-28 w-full rounded-xl object-cover" />;
  return kind === "ine" ? (
    <div className="flex h-28 items-center gap-3 rounded-xl bg-gradient-to-br from-oro-soft to-white p-3 ring-1 ring-linea">
      <div className="h-20 w-16 rounded-lg bg-oro/40" />
      <div className="flex-1 space-y-2">
        <div className="h-2.5 w-3/4 rounded bg-tinta/70" />
        <div className="h-2 w-1/2 rounded bg-gris/40" />
        <div className="h-2 w-2/3 rounded bg-gris/40" />
        <p className="text-[10px] font-semibold tracking-widest text-gris">INE · EJEMPLO</p>
      </div>
    </div>
  ) : (
    <div className="grid h-28 place-items-center rounded-xl bg-oro-soft ring-1 ring-linea">
      <div className="size-16 rounded-full bg-oro/50 ring-4 ring-white" />
    </div>
  );
}

const CHECKS = ["Documento legible", "El rostro coincide con la INE", "Sin alertas en listas de riesgo"];

export function SimulatedKyc({ onDone, busy }: { onDone: () => void; busy: boolean }) {
  const [step, setStep] = useState<Step>("ine");
  const [ine, setIne] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const fired = useRef(false);

  useEffect(() => {
    if (step !== "checking") return;
    if (done < CHECKS.length) {
      const t = setTimeout(() => setDone((d) => d + 1), 700);
      return () => clearTimeout(t);
    }
    if (!fired.current) {
      fired.current = true;
      onDone();
    }
  }, [step, done, onDone]);

  const dots = (
    <ol className="flex gap-2 text-xs font-semibold">
      {(["ine", "selfie", "checking"] as Step[]).map((s, i) => (
        <li key={s} className={`flex-1 rounded-full py-1 text-center ${step === s ? "bg-tinta text-white" : i < ["ine", "selfie", "checking"].indexOf(step) ? "bg-nopal-soft text-nopal" : "bg-black/5 text-gris"}`}>
          {["INE", "Selfie", "Verificación"][i]}
        </li>
      ))}
    </ol>
  );

  if (step === "ine")
    return (
      <div className="space-y-4">
        {dots}
        <p className="flex items-center gap-2 font-semibold"><IdCard className="size-5 text-oro-dark" /> Sube el frente de tu INE</p>
        {ine ? <Preview src={ine} kind="ine" /> : <Upload label="Tomar o subir foto de tu INE" capture="environment" onPick={setIne} sampleLabel="Usar INE de ejemplo" />}
        <Button size="lg" className="w-full" disabled={!ine} onClick={() => setStep("selfie")}>Continuar</Button>
      </div>
    );

  if (step === "selfie")
    return (
      <div className="space-y-4">
        {dots}
        <p className="flex items-center gap-2 font-semibold"><Camera className="size-5 text-oro-dark" /> Tómate una selfie</p>
        {selfie ? <Preview src={selfie} kind="selfie" /> : <Upload label="Tomar selfie" capture="user" onPick={setSelfie} sampleLabel="Usar selfie de ejemplo" />}
        <Button size="lg" className="w-full" disabled={!selfie} onClick={() => setStep("checking")}>Verificar mi identidad</Button>
      </div>
    );

  return (
    <div className="space-y-4">
      {dots}
      <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-oro-dark" /> Verificando tu identidad…</p>
      <ul className="space-y-2 text-sm">
        {CHECKS.map((c, i) => (
          <li key={c} className="flex items-center gap-2">
            {i < done ? <Check className="size-4 text-nopal" /> : <Loader2 className="size-4 animate-spin text-gris" />}
            <span className={i < done ? "" : "text-gris"}>{c}</span>
          </li>
        ))}
      </ul>
      {busy && <p className="text-xs text-gris">Registrando tu verificación…</p>}
      <p className="text-xs text-gris">Tus fotos no salen de este dispositivo.</p>
    </div>
  );
}
