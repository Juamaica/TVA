"use client";
import { useEffect, useRef, useState } from "react";
import { useTVA, View } from "@/store/useTVA";
import AuthGate, { TVALogo } from "./AuthGate";
import ControlRoom from "./ControlRoom";
import MapView from "./MapView";
import Scanner from "./Scanner";
import Variants from "./Variants";
import TemPad from "./TemPad";
import PruneFlow from "./PruneFlow";
import SettingsView from "./SettingsView";
import { Archive, Assistant, Events, Missions, Profile } from "./Modules";
import { rankFor } from "@/lib/types";
import { sfx, unlockAudio } from "@/lib/audio";
import { Typewriter } from "./ui";

const NAV: { v: View; icon: string; label: string }[] = [
  { v: "control", icon: "▦", label: "Sala" }, { v: "map", icon: "⟁", label: "Mapa" }, { v: "scanner", icon: "⌖", label: "Escáner" },
  { v: "variants", icon: "◫", label: "Variantes" }, { v: "tempad", icon: "◎", label: "TemPad" }, { v: "events", icon: "⚠", label: "Eventos" },
  { v: "missions", icon: "★", label: "Misiones" }, { v: "archive", icon: "≡", label: "Archivo" }, { v: "assistant", icon: "◈", label: "Asistente" },
  { v: "profile", icon: "⬡", label: "Perfil" }, { v: "settings", icon: "⚙", label: "Ajustes" },
];

export default function Shell() {
  const { booted, boot, unlocked, setUnlocked, world, view, setView, toast, tickEvents, updateProfile, prune } = useTVA();
  const [intro, setIntro] = useState(false);
  const lastActivity = useRef(Date.now());

  useEffect(() => { void boot(); }, [boot]);
  // Service worker (PWA / offline)
  useEffect(() => { if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);
  // Bloqueo por inactividad + al volver de segundo plano tras el tiempo configurado
  useEffect(() => {
    if (!unlocked || !world) return;
    const touch = () => { lastActivity.current = Date.now(); };
    const evs = ["pointerdown", "keydown", "touchstart", "scroll"]; evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const id = setInterval(() => { if (Date.now() - lastActivity.current > world.settings.lockAfterMin * 60_000 && !useTVA.getState().prune) setUnlocked(false); }, 5000);
    const vis = () => { if (document.visibilityState === "visible" && Date.now() - lastActivity.current > world.settings.lockAfterMin * 60_000) setUnlocked(false); };
    document.addEventListener("visibilitychange", vis);
    return () => { evs.forEach((e) => window.removeEventListener(e, touch)); clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [unlocked, world, setUnlocked]);
  // Temporizador de eventos dinámicos
  useEffect(() => {
    if (!unlocked || !world) return;
    const id = setInterval(tickEvents, world.settings.eventIntervalSec * 1000);
    return () => clearInterval(id);
  }, [unlocked, world?.settings.eventIntervalSec, tickEvents, world]);
  // Secuencia de presentación del agente (primera entrada)
  useEffect(() => { if (unlocked && world && !world.profile.introSeen) { setIntro(true); } }, [unlocked, world]);
  useEffect(() => { document.body.classList.toggle("reduced-motion", !!world?.settings.reducedMotion); }, [world?.settings.reducedMotion]);

  if (!booted) return <div className="min-h-screen flex items-center justify-center"><TVALogo spin size={72} /></div>;
  if (!unlocked || !world) return <AuthGate />;

  const rank = rankFor(world.profile.xp);
  const unread = world.events.filter((e) => !e.read).length;
  const immersive = world.settings.immersive && view === "control";

  return (
    <div className={`min-h-dvh scanlines vignette ${world.crisis ? "crisis-overlay" : ""}`} onPointerDown={unlockAudio}>
      {intro && <Intro name={world.profile.name} code={world.profile.code} division={world.profile.division} onDone={() => { setIntro(false); updateProfile({ introSeen: true }); }} />}
      {!immersive && (
        <header className="sticky top-0 z-50 border-b border-tva-olive bg-tva-bg/90 backdrop-blur px-3 h-12 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0"><TVALogo size={26} /><div className="leading-tight min-w-0"><div className="text-[10px] tracking-[.3em] text-tva-amber">TVA NEXUS</div><div className="text-[9px] text-tva-metal truncate">{world.profile.code} · {rank.name}</div></div></div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className={`hidden sm:inline ${world.crisis ? "text-tva-orange blink" : "text-tva-green"}`}>{world.crisis ? "◉ CRISIS" : "◉ NOMINAL"} {world.integrity}%</span>
            <button className="relative btn !py-1 !px-2 !min-h-0" onClick={() => setView("events")}>⚠{unread > 0 && <span className="absolute -top-1 -right-1 bg-tva-orange text-black text-[9px] px-1 rounded-full">{unread}</span>}</button>
            <button className="btn !py-1 !px-2 !min-h-0" onClick={() => { sfx.tick(); setUnlocked(false); }} title="Bloquear">🔒</button>
          </div>
        </header>
      )}

      <main className="max-w-5xl mx-auto">
        {view === "control" && <ControlRoom />}
        {view === "map" && <MapView />}
        {view === "scanner" && <Scanner />}
        {view === "variants" && <Variants />}
        {view === "tempad" && <TemPad />}
        {view === "events" && <Events />}
        {view === "missions" && <Missions />}
        {view === "archive" && <Archive />}
        {view === "assistant" && <Assistant />}
        {view === "profile" && <Profile />}
        {view === "settings" && <SettingsView />}
      </main>

      <PruneFlow />

      {!immersive && !prune && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-tva-olive bg-tva-bg/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="flex overflow-x-auto max-w-5xl mx-auto">
            {NAV.map((n) => <button key={n.v} onClick={() => { setView(n.v); sfx.tick(); }} className={`flex-none w-[64px] py-2 flex flex-col items-center gap-0.5 text-[9px] tracking-wider border-t-2 transition ${view === n.v ? "border-tva-amber text-tva-amber" : "border-transparent text-tva-metal"}`}><span className="text-base leading-none">{n.icon}</span>{n.label}</button>)}
          </div>
        </nav>
      )}

      {toast && <div className={`fixed top-14 left-1/2 -translate-x-1/2 z-[80] panel px-4 py-2 text-xs fade-up ${toast.kind === "err" ? "text-tva-orange" : toast.kind === "warn" ? "text-tva-amber" : "text-tva-green"}`}>{toast.text}</div>}
    </div>
  );
}

function Intro({ name, code, division, onDone }: { name: string; code: string; division: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => { const ids = [800, 1800, 2800, 3800].map((t, i) => setTimeout(() => setStep(i + 1), t)); return () => ids.forEach(clearTimeout); }, []);
  return (
    <div className="fixed inset-0 z-[90] bg-black/95 flex flex-col items-center justify-center p-6 text-center grid-bg">
      <TVALogo size={100} spin={step < 4} />
      <div className="mt-6 text-tva-amber tracking-[.3em] text-xs">PRESENTACIÓN DE AGENTE</div>
      <div className="mt-3 text-2xl text-tva-cream min-h-[2rem]">{step >= 1 && <Typewriter text={name} speed={60} />}</div>
      <div className="mt-1 text-tva-green value">{step >= 2 && <Typewriter text={`CÓDIGO ${code}`} speed={40} />}</div>
      <div className="mt-1 text-tva-metal text-xs">{step >= 3 && <Typewriter text={`DIVISIÓN: ${division.toUpperCase()} · AUTORIZACIÓN NIVEL 1`} speed={25} />}</div>
      {step >= 4 && <div className="mt-6 fade-up"><p className="text-xs text-tva-cream/80 max-w-sm mb-4">"Para todos los tiempos. Siempre." Bienvenido a tu terminal de la Autoridad de Variación Temporal. Vigila la Sagrada Línea, investiga variantes y autoriza podas.</p><button className="btn btn-amber" onClick={onDone}>ENTRAR EN LA TERMINAL</button></div>}
    </div>
  );
}
