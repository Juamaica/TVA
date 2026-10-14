"use client";
import { useEffect, useState } from "react";
import { useTVA } from "@/store/useTVA";
import { assertBiometric, biometricAvailable, createCredentials, generateRecoveryCode, registerBiometric, verifyRecovery, verifySecret } from "@/lib/auth";
import { sfx, unlockAudio, vibrate } from "@/lib/audio";
import { AgentProfile } from "@/lib/types";
import { Typewriter } from "./ui";

const DIVISIONS = ["Analistas", "Cazadores", "Archivo Temporal", "Minutemen", "Juzgado Temporal"];
const TERMINAL_ID = "TN-" + (typeof navigator !== "undefined" ? Math.abs(hash(navigator.userAgent)).toString(16).toUpperCase().slice(0, 6) : "000000");
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

export function TVALogo({ size = 96, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={spin ? "spin" : ""}>
      <defs><radialGradient id="g"><stop offset="0" stopColor="#f5a524" /><stop offset="1" stopColor="#7a4e0e" /></radialGradient></defs>
      <circle cx="50" cy="50" r="46" fill="none" stroke="#5c6b3a" strokeWidth="2" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="#f5a524" strokeWidth="1" strokeDasharray="4 3" />
      <path d="M50 12 L60 40 L50 34 L40 40 Z" fill="url(#g)" />
      <path d="M50 88 L60 60 L50 66 L40 60 Z" fill="url(#g)" />
      <path d="M12 50 L40 40 L34 50 L40 60 Z" fill="url(#g)" />
      <path d="M88 50 L60 40 L66 50 L60 60 Z" fill="url(#g)" />
      <circle cx="50" cy="50" r="8" fill="#0a0b08" stroke="#9cff57" strokeWidth="2" />
      <circle cx="50" cy="50" r="3" fill="#9cff57" />
    </svg>
  );
}

const BOOT_LINES = [
  "INICIANDO NÚCLEO TEMPORAL ............ OK",
  `TERMINAL ${TERMINAL_ID} .................. OK`,
  "VERIFICANDO ALMACÉN CIFRADO .......... OK",
  "SINCRONIZANDO RELOJ DEL NEXO ......... OK",
  "ESTADO DE SEGURIDAD .............. SELLADO",
];

export default function AuthGate() {
  const { hasCreds, creds, setCreds, setUnlocked, biometricId, setBiometricId, world } = useTVA();
  const [bootStep, setBootStep] = useState(0);
  const [mode, setMode] = useState<"login" | "setup" | "recover">(hasCreds ? "login" : "setup");
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "denied">("idle");
  const [bioOk, setBioOk] = useState(false);
  const [err, setErr] = useState("");

  // setup
  const [kind, setKind] = useState<"pin" | "password">("pin");
  const [name, setName] = useState("");
  const [division, setDivision] = useState(DIVISIONS[0]);
  const [confirm, setConfirm] = useState("");
  const [recovery, setRecovery] = useState<string | null>(null);
  const [recoverCode, setRecoverCode] = useState("");
  const [newSecret, setNewSecret] = useState("");

  useEffect(() => { const id = setInterval(() => setBootStep((s) => (s >= BOOT_LINES.length ? (clearInterval(id), s) : s + 1)), 260); return () => clearInterval(id); }, []);
  useEffect(() => { biometricAvailable().then(setBioOk); }, []);
  useEffect(() => { setMode(hasCreds ? "login" : "setup"); }, [hasCreds]);

  const grant = () => { setStatus("ok"); sfx.confirm(); vibrate(40, true); setTimeout(() => setUnlocked(true), 900); };
  const deny = () => { setStatus("denied"); sfx.deny(); vibrate([60, 40, 60], true); setTimeout(() => setStatus("idle"), 900); };

  async function login() {
    if (!creds || !secret) return;
    unlockAudio(); setStatus("checking");
    await new Promise((r) => setTimeout(r, 600));
    (await verifySecret(creds, secret)) ? grant() : deny();
    setSecret("");
  }
  async function loginBio() {
    if (!biometricId) return;
    unlockAudio(); setStatus("checking");
    (await assertBiometric(biometricId)) ? grant() : deny();
  }
  async function setup() {
    unlockAudio(); setErr("");
    if (!name.trim()) return setErr("Introduce el nombre del agente.");
    if (kind === "pin" && !/^\d{4,8}$/.test(secret)) return setErr("El PIN debe tener entre 4 y 8 dígitos.");
    if (kind === "password" && secret.length < 8) return setErr("La contraseña debe tener al menos 8 caracteres.");
    if (secret !== confirm) return setErr("Las credenciales no coinciden.");
    setStatus("checking");
    const code = generateRecoveryCode();
    const c = await createCredentials(kind, secret, code);
    const profile: AgentProfile = {
      name: name.trim(), code: `A-${Math.floor(1000 + Math.random() * 9000)}${name.trim()[0]?.toUpperCase() ?? "X"}`, division, avatarSeed: Math.floor(Math.random() * 999),
      xp: 0, opsCompleted: 0, missionsCompleted: 0, badges: [], createdAt: Date.now(), introSeen: false,
    };
    await setCreds(c, world?.profile ?? profile);
    setRecovery(code); setStatus("idle"); sfx.confirm();
  }
  async function enrollBio() {
    const id = await registerBiometric(world?.profile.name ?? name);
    if (id) { setBiometricId(id); sfx.confirm(); } else { setErr("No se pudo registrar la biometría en este dispositivo/origen."); sfx.deny(); }
  }
  async function recover() {
    if (!creds) return; setErr("");
    if (!(await verifyRecovery(creds, recoverCode))) { deny(); return setErr("Código de recuperación incorrecto."); }
    if (newSecret.length < 4) return setErr("Nueva credencial demasiado corta.");
    const code = generateRecoveryCode();
    const c = await createCredentials(/^\d+$/.test(newSecret) ? "pin" : "password", newSecret, code);
    await setCreds(c);
    setRecovery(code); setMode("login"); sfx.confirm();
  }

  const booted = bootStep >= BOOT_LINES.length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 grid-bg relative overflow-hidden">
      <div className="sweep-line" />
      <div className="w-full max-w-sm fade-up">
        <div className="flex flex-col items-center gap-2 mb-5">
          <TVALogo size={88} spin={!booted} />
          <div className="text-tva-amber tracking-[.35em] text-xs">TIME VARIANCE AUTHORITY</div>
          <div className="text-tva-green text-lg tracking-[.25em] glow">TVA NEXUS // SECURE ACCESS</div>
        </div>

        <div className="panel p-3 mb-3 text-[10px] text-tva-metal leading-relaxed min-h-[96px]">
          {BOOT_LINES.slice(0, bootStep).map((l, i) => <div key={i} className={i === BOOT_LINES.length - 1 ? "text-tva-green" : ""}>{l}</div>)}
          {!booted && <span className="blink text-tva-green">▌</span>}
        </div>

        {booted && status === "ok" && (
          <div className="panel p-6 text-center text-tva-green tracking-[.3em] text-base glow">ACCESO AUTORIZADO</div>
        )}
        {booted && status === "denied" && (
          <div className="panel p-6 text-center text-tva-orange tracking-[.3em] text-base shake">ACCESO DENEGADO</div>
        )}
        {booted && status !== "ok" && status !== "denied" && recovery && (
          <div className="panel p-4 space-y-3">
            <div className="label text-tva-amber">Código de recuperación — guárdalo fuera del dispositivo</div>
            <div className="text-2xl text-center tracking-[.2em] text-tva-green py-2 border border-tva-olive bg-black/40">{recovery}</div>
            <p className="text-[11px] text-tva-metal">Es la única forma de restablecer tu PIN si lo olvidas. No se puede volver a mostrar.</p>
            {bioOk && !biometricId && <button className="btn w-full" onClick={enrollBio}>Activar desbloqueo biométrico (huella / rostro)</button>}
            {biometricId && <div className="text-tva-green text-xs text-center">✓ Biometría del dispositivo registrada</div>}
            {err && <div className="text-tva-orange text-xs">{err}</div>}
            <button className="btn btn-amber w-full" onClick={() => { setRecovery(null); setSecret(""); setConfirm(""); setMode("login"); }}>Continuar al acceso</button>
          </div>
        )}

        {booted && status !== "ok" && status !== "denied" && !recovery && mode === "login" && (
          <form className="panel p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void login(); }}>
            <div className="label">{creds?.kind === "pin" ? "PIN de agente" : "Contraseña de agente"}</div>
            <input className="input text-center text-xl tracking-[.5em]" type="password" inputMode={creds?.kind === "pin" ? "numeric" : "text"} autoFocus value={secret} onChange={(e) => { setSecret(e.target.value); sfx.key(); }} placeholder="••••" />
            <button className="btn btn-amber w-full" disabled={status === "checking" || !secret}>{status === "checking" ? <span className="blink">VERIFICANDO…</span> : "AUTENTICAR"}</button>
            {biometricId && <button type="button" className="btn w-full" onClick={loginBio}>⬡ Desbloqueo biométrico</button>}
            <div className="flex justify-between text-[10px] text-tva-metal">
              <button type="button" className="underline" onClick={() => setMode("recover")}>Olvidé mi credencial</button>
              <span>{TERMINAL_ID}</span>
            </div>
          </form>
        )}

        {booted && status !== "ok" && status !== "denied" && !recovery && mode === "recover" && (
          <form className="panel p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void recover(); }}>
            <div className="label text-tva-amber">Recuperación segura</div>
            <input className="input" placeholder="Código de recuperación XXXXX-XXXXX" value={recoverCode} onChange={(e) => setRecoverCode(e.target.value.toUpperCase())} />
            <input className="input" type="password" placeholder="Nuevo PIN o contraseña" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} />
            {err && <div className="text-tva-orange text-xs">{err}</div>}
            <div className="flex gap-2"><button type="button" className="btn btn-ghost flex-1" onClick={() => setMode("login")}>Volver</button><button className="btn btn-amber flex-1">Restablecer</button></div>
          </form>
        )}

        {booted && status !== "ok" && status !== "denied" && !recovery && mode === "setup" && (
          <form className="panel p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void setup(); }}>
            <div className="label text-tva-amber"><Typewriter text="Configuración del propietario de la terminal" /></div>
            <input className="input" placeholder="Nombre del agente" value={name} onChange={(e) => setName(e.target.value)} />
            <select className="input" value={division} onChange={(e) => setDivision(e.target.value)}>{DIVISIONS.map((d) => <option key={d}>{d}</option>)}</select>
            <div className="flex gap-2">
              {(["pin", "password"] as const).map((k) => <button type="button" key={k} className={`btn flex-1 ${kind === k ? "btn-amber" : "btn-ghost"}`} onClick={() => setKind(k)}>{k === "pin" ? "PIN" : "Contraseña"}</button>)}
            </div>
            <input className="input" type="password" inputMode={kind === "pin" ? "numeric" : "text"} placeholder={kind === "pin" ? "PIN (4-8 dígitos)" : "Contraseña (≥ 8)"} value={secret} onChange={(e) => setSecret(e.target.value)} />
            <input className="input" type="password" inputMode={kind === "pin" ? "numeric" : "text"} placeholder="Confirmar" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {err && <div className="text-tva-orange text-xs">{err}</div>}
            <button className="btn btn-amber w-full" disabled={status === "checking"}>{status === "checking" ? <span className="blink">DERIVANDO CLAVE (PBKDF2)…</span> : "SELLAR TERMINAL"}</button>
            <p className="text-[10px] text-tva-metal leading-relaxed">
              Las credenciales se almacenan sólo en este dispositivo como hash PBKDF2-SHA256 con sal única (210 000 iteraciones). {bioOk ? "Este dispositivo admite biometría real vía WebAuthn; podrás activarla tras el registro." : "Biometría WebAuthn no disponible en este origen/dispositivo; se usará el PIN."}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
