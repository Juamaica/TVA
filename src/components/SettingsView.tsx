"use client";
import { useEffect, useRef, useState } from "react";
import { useTVA } from "@/store/useTVA";
import { Panel, Confirm } from "./ui";
import { exportBackup, validateBackup } from "@/lib/storage";
import { biometricAvailable, createCredentials, generateRecoveryCode, registerBiometric, verifySecret } from "@/lib/auth";
import { requestNotifications, sfx, unlockAudio, vibrate } from "@/lib/audio";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-1.5 border-b border-tva-olive-dark text-xs"><span className="text-tva-cream/85">{label}</span><div className="flex items-center gap-2">{children}</div></div>;
}
function Toggle({ v, on }: { v: boolean; on: (x: boolean) => void }) {
  return <button onClick={() => { on(!v); sfx.tick(); }} className={`w-11 h-6 border relative transition ${v ? "border-tva-green bg-tva-green/20" : "border-tva-metal bg-black/40"}`}><span className={`absolute top-0.5 w-4 h-4 transition-all ${v ? "left-6 bg-tva-green" : "left-0.5 bg-tva-metal"}`} /></button>;
}
function Range({ v, min, max, step = 1, on }: { v: number; min: number; max: number; step?: number; on: (x: number) => void }) {
  return <><input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(+e.target.value)} className="w-28 accent-amber-500" /><span className="value w-10 text-right">{v}</span></>;
}

export default function SettingsView() {
  const world = useTVA((s) => s.world!);
  const { updateSettings, importWorld, resetAll, showToast, creds, setCreds, biometricId, setBiometricId, setUnlocked } = useTVA();
  const s = world.settings;
  const [confirmReset, setConfirmReset] = useState(false);
  const [bioOk, setBioOk] = useState(false);
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [rec, setRec] = useState<string | null>(null); const [err, setErr] = useState("");
  const [installEvt, setInstallEvt] = useState<Event & { prompt?: () => Promise<void> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { biometricAvailable().then(setBioOk); const h = (e: Event) => { e.preventDefault(); setInstallEvt(e as Event & { prompt?: () => Promise<void> }); }; window.addEventListener("beforeinstallprompt", h); return () => window.removeEventListener("beforeinstallprompt", h); }, []);

  const doExport = () => { const blob = new Blob([exportBackup(world)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `tva-nexus-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href); showToast("Copia exportada"); };
  const doImport = async (f: File | null) => { if (!f) return; const r = validateBackup(await f.text()); if (!r.ok) { showToast(r.error, "err"); sfx.deny(); return; } importWorld(r.world); showToast("Copia importada y validada"); sfx.confirm(); };
  async function changeCreds() {
    setErr(""); if (!creds) return;
    if (!(await verifySecret(creds, cur))) { setErr("Credencial actual incorrecta"); sfx.deny(); return; }
    if (nw.length < 4) { setErr("Nueva credencial demasiado corta"); return; }
    const code = generateRecoveryCode(); await setCreds(await createCredentials(/^\d+$/.test(nw) ? "pin" : "password", nw, code)); setRec(code); setCur(""); setNw(""); sfx.confirm();
  }

  return (
    <div className="p-2 space-y-2 safe-b">
      <Panel title="Sonido, vibración y efectos">
        <Row label="Sonidos de interfaz"><Toggle v={s.sound} on={(v) => { unlockAudio(); updateSettings({ sound: v }); }} /></Row>
        <Row label="Volumen"><Range v={Math.round(s.volume * 100)} min={0} max={100} on={(v) => updateSettings({ volume: v / 100 })} /></Row>
        <Row label="Intensidad de efectos"><Range v={Math.round(s.effects * 100)} min={0} max={100} on={(v) => updateSettings({ effects: v / 100 })} /></Row>
        <Row label="Cantidad de partículas"><Range v={Math.round(s.particles * 100)} min={0} max={100} on={(v) => updateSettings({ particles: v / 100 })} /></Row>
        <Row label="Velocidad de animación"><Range v={s.animSpeed} min={0.5} max={2} step={0.1} on={(v) => updateSettings({ animSpeed: v })} /></Row>
        <Row label="Duración de la poda (s)"><Range v={s.pruneDurationSec} min={3} max={10} on={(v) => updateSettings({ pruneDurationSec: v })} /></Row>
        <Row label="Vibración"><Toggle v={s.vibration} on={(v) => { updateSettings({ vibration: v }); vibrate(30, v); }} /></Row>
        <Row label="Reducción de movimiento"><Toggle v={s.reducedMotion} on={(v) => updateSettings({ reducedMotion: v })} /></Row>
        <Row label="Modo de bajo consumo (menos geometría, DPR 1)"><Toggle v={s.lowPower} on={(v) => updateSettings({ lowPower: v })} /></Row>
      </Panel>
      <Panel title="Simulación">
        <Row label="Eventos dinámicos"><Toggle v={s.eventsEnabled} on={(v) => updateSettings({ eventsEnabled: v })} /></Row>
        <Row label="Frecuencia de eventos (s)"><Range v={s.eventIntervalSec} min={15} max={300} step={15} on={(v) => updateSettings({ eventIntervalSec: v })} /></Row>
        <Row label="Umbral de crisis (integridad %)"><Range v={s.crisisThreshold} min={20} max={80} step={5} on={(v) => updateSettings({ crisisThreshold: v })} /></Row>
        <Row label="Notificaciones de ramificaciones / Nexus"><Toggle v={s.notifications} on={async (v) => { if (v) { const ok = await requestNotifications(); if (!ok) { showToast("Permiso de notificaciones denegado", "warn"); } updateSettings({ notifications: ok }); } else updateSettings({ notifications: false }); }} /></Row>
        <p className="text-[10px] text-tva-metal mt-1">Las notificaciones sólo describen sucesos de la simulación y se muestran mientras la app está abierta o instalada en segundo plano reciente (limitación de las PWA: sin servidor push no hay notificaciones con la app cerrada).</p>
      </Panel>
      <Panel title="Seguridad">
        <Row label="Bloqueo automático por inactividad (min)"><Range v={s.lockAfterMin} min={1} max={30} on={(v) => updateSettings({ lockAfterMin: v })} /></Row>
        <Row label="Desbloqueo biométrico (WebAuthn)">{bioOk ? (biometricId ? <button className="btn !py-1 !text-[10px]" onClick={() => setBiometricId(null)}>Desactivar</button> : <button className="btn !py-1 !text-[10px]" onClick={async () => { const id = await registerBiometric(world.profile.name); id ? (setBiometricId(id), showToast("Biometría registrada")) : showToast("No disponible en este origen", "err"); }}>Activar</button>) : <span className="text-tva-metal">No disponible</span>}</Row>
        <div className="mt-2 space-y-1">
          <div className="label">Cambiar PIN / contraseña</div>
          <div className="grid grid-cols-2 gap-1"><input className="input !text-xs" type="password" placeholder="Actual" value={cur} onChange={(e) => setCur(e.target.value)} /><input className="input !text-xs" type="password" placeholder="Nueva" value={nw} onChange={(e) => setNw(e.target.value)} /></div>
          {err && <div className="text-tva-orange text-[11px]">{err}</div>}
          {rec && <div className="border border-tva-amber p-2 text-xs">Nuevo código de recuperación: <b className="text-tva-green">{rec}</b> — guárdalo.</div>}
          <div className="flex gap-2"><button className="btn !py-1 !text-[10px]" onClick={changeCreds} disabled={!cur || !nw}>Actualizar credencial</button><button className="btn !py-1 !text-[10px]" onClick={() => setUnlocked(false)}>Bloquear ahora</button></div>
        </div>
        <p className="text-[10px] text-tva-metal mt-2 leading-relaxed">⚠ Limitación honesta: en una PWA los datos viven en el almacenamiento del navegador del dispositivo. El PIN protege el acceso a la interfaz y a las acciones críticas, pero no cifra el almacenamiento frente a alguien con acceso físico/root al dispositivo. Para protección fuerte, usa el bloqueo del sistema Android o un empaquetado nativo (TWA/Capacitor) con Keystore.</p>
      </Panel>
      <Panel title="Datos y copias de seguridad">
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={doExport}>⇩ Exportar JSON</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⇧ Importar JSON</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => doImport(e.target.files?.[0] ?? null)} />
          {installEvt && <button className="btn btn-amber" onClick={async () => { await installEvt.prompt?.(); setInstallEvt(null); }}>⬇ Instalar en Android</button>}
          <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>Reiniciar terminal</button>
        </div>
        <p className="text-[10px] text-tva-metal mt-2">Las importaciones se validan (estructura, versión, integridad referencial) antes de reemplazar el estado.</p>
      </Panel>
      {confirmReset && <Confirm danger title="Reiniciar terminal" text="Se borrarán perfil, credenciales, variantes, ramas, misiones e historial de este dispositivo. Esta acción no se puede deshacer." onNo={() => setConfirmReset(false)} onYes={() => { void resetAll(); }} />}
    </div>
  );
}
