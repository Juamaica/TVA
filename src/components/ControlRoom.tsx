"use client";
import { useEffect, useState } from "react";
import { useTVA } from "@/store/useTVA";
import { rankFor } from "@/lib/types";
import { activeBranches } from "@/lib/simulation";
import { Avatar, Chip, Meter, Panel, Stat, fmtTime, sevColor, statusColor, statusLabel } from "./ui";
import MapView from "./MapView";

export default function ControlRoom() {
  const world = useTVA((s) => s.world!);
  const { setView, focusBranch, updateSettings, stabilizeBranch, startPrune } = useTVA();
  const rank = rankFor(world.profile.xp);
  const branches = activeBranches(world).filter((b) => b.kind !== "main");
  const critical = branches.filter((b) => b.status === "critical" || b.status === "unstable").sort((a, b) => a.stability - b.stability);
  const openAn = world.anomalies.filter((a) => !a.resolved);
  const unread = world.events.filter((e) => !e.read);
  const [tele, setTele] = useState({ cpu: 42, flux: 1.21, sync: 99.2 });
  useEffect(() => { const id = setInterval(() => setTele({ cpu: 30 + Math.round(Math.random() * 40), flux: +(1 + Math.random() * 0.6).toFixed(2), sync: +(97 + Math.random() * 3).toFixed(1) }), 1500); return () => clearInterval(id); }, []);
  const immersive = world.settings.immersive;

  const Quick = () => (
    <div className="grid grid-cols-4 gap-1">
      {[["scanner", "⌖", "Escaneo"], ["variants", "◫", "Variantes"], ["tempad", "◎", "TemPad"], ["map", "⟁", "Poda"]].map(([v, i, l]) => (
        <button key={v} className="btn flex-col !gap-0 !py-2" onClick={() => setView(v as "scanner")}><span className="text-lg leading-none">{i}</span><span className="text-[9px]">{l}</span></button>
      ))}
    </div>
  );

  if (immersive) return (
    <div className="fixed inset-0 z-40 bg-tva-bg">
      <MapView embedded />
      <div className="absolute top-2 left-1/2 -translate-x-1/2 panel px-3 py-1 text-[10px] tracking-[.2em] text-tva-amber pointer-events-none">SALA DE CONTROL · {world.profile.name.toUpperCase()}</div>
      <button className="absolute top-2 right-2 btn !py-1 !text-[10px] z-50" style={{ marginTop: 70 }} onClick={() => updateSettings({ immersive: false })}>⤡ Modo terminal</button>
      <div className="absolute left-2 top-24 hidden md:flex flex-col gap-2 w-64 pointer-events-none">
        <div className="panel p-2 text-[10px] pointer-events-auto"><div className="label text-tva-amber mb-1">Telemetría</div><div className="grid grid-cols-3 gap-1"><Stat label="Carga" value={`${tele.cpu}%`} /><Stat label="Flujo" value={tele.flux} /><Stat label="Sync" value={`${tele.sync}%`} /></div><div className="label mt-1">Integridad {world.integrity}%</div><Meter value={world.integrity} color={world.crisis ? "#ff3b3b" : "#9cff57"} /></div>
        <div className="panel p-2 text-[10px] pointer-events-auto max-h-48 overflow-y-auto"><div className="label text-tva-amber mb-1">Alertas activas ({openAn.length})</div>{openAn.slice(0, 6).map((a) => <button key={a.id} className="block text-left w-full truncate hover:text-tva-amber" style={{ color: sevColor[a.severity] }} onClick={() => a.branchId && focusBranch(a.branchId)}>▸ {a.title}</button>)}</div>
      </div>
      <div className="absolute right-2 bottom-20 sm:bottom-2 hidden md:block w-64 panel p-2 text-[10px]"><div className="label text-tva-amber mb-1">Actividad reciente</div>{world.events.slice(0, 5).map((e) => <div key={e.id} className="truncate"><span className="text-tva-metal">{fmtTime(e.at).slice(-5)}</span> {e.title}</div>)}</div>
    </div>
  );

  return (
    <div className="p-2 space-y-2 safe-b">
      {world.crisis && <div className="border-2 border-tva-orange bg-tva-orange/15 p-2 text-xs fade-up">
        <div className="text-tva-orange tracking-[.25em] blink">⚠ MODO CRISIS · INTEGRIDAD {world.integrity}%</div>
        <div className="text-[11px] mt-1">Diagnóstico: {critical.length} ramas inestables/críticas y {openAn.length} anomalías abiertas. Estabiliza o poda las ramas críticas y resuelve anomalías para recuperar ≥ {world.settings.crisisThreshold + 8}%.</div>
        <div className="mt-2 space-y-1">{critical.slice(0, 3).map((b) => <div key={b.id} className="flex items-center justify-between gap-1 border border-tva-orange/40 p-1"><span>{b.id} <span className="text-tva-metal">est {b.stability}%</span></span><div className="flex gap-1"><button className="btn !py-0.5 !min-h-0 !text-[10px]" onClick={() => focusBranch(b.id)}>Ver</button><button className="btn !py-0.5 !min-h-0 !text-[10px]" onClick={() => stabilizeBranch(b.id)}>Estabilizar</button><button className="btn btn-danger !py-0.5 !min-h-0 !text-[10px]" onClick={() => startPrune(b.id)}>Podar</button></div></div>)}</div>
      </div>}

      <div className="panel relative h-64 sm:h-80 overflow-hidden"><MapView embedded /><button className="absolute bottom-2 right-2 btn !py-1 !text-[10px] z-10" onClick={() => updateSettings({ immersive: true })}>⤢ Inmersivo</button></div>

      <Quick />

      <div className="grid sm:grid-cols-2 gap-2">
        <Panel title="Estado de la terminal" right={<span className={world.crisis ? "text-tva-orange blink" : "text-tva-green"}>{world.crisis ? "CRISIS" : world.paused ? "PAUSA" : "NOMINAL"}</span>}>
          <div className="grid grid-cols-3 gap-2"><Stat label="Integridad" value={`${world.integrity}%`} color={world.integrity < world.settings.crisisThreshold ? "#ff3b3b" : "#9cff57"} /><Stat label="Ramas" value={branches.length} /><Stat label="Anomalías" value={openAn.length} color={openAn.length ? "#f5a524" : undefined} /></div>
          <Meter value={world.integrity} color={world.crisis ? "#ff3b3b" : "#9cff57"} className="mt-2" />
          <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] text-tva-metal"><span>CARGA {tele.cpu}%</span><span>FLUJO {tele.flux} TΩ</span><span>SYNC {tele.sync}%</span></div>
        </Panel>
        <Panel title="Agente" right={<button className="text-tva-amber" onClick={() => setView("profile")}>credencial ▸</button>}>
          <div className="flex gap-3 items-center"><Avatar seed={world.profile.avatarSeed} size={52} dataUrl={world.profile.avatarDataUrl} /><div className="text-xs"><div className="text-tva-cream text-sm">{world.profile.name}</div><div className="text-tva-metal">{world.profile.code} · {world.profile.division}</div><div className="text-tva-amber">{rank.name} · Aut. {rank.clearance}</div></div></div>
          <div className="grid grid-cols-3 gap-2 mt-2"><Stat label="Ops" value={world.profile.opsCompleted} /><Stat label="Misiones" value={`${world.missions.filter((m) => m.completed).length}/${world.missions.length}`} /><Stat label="XP" value={world.profile.xp} /></div>
        </Panel>
        <Panel title={`Alertas activas (${openAn.length})`} right={<button className="text-tva-amber" onClick={() => setView("scanner")}>escáner ▸</button>}>
          {openAn.length === 0 && <div className="text-tva-metal text-xs">Sin alertas. Ejecuta un escaneo.</div>}
          {openAn.slice(0, 5).map((a) => <button key={a.id} className="block w-full text-left text-xs py-1 border-b border-tva-olive-dark truncate" style={{ color: sevColor[a.severity] }} onClick={() => a.branchId ? focusBranch(a.branchId) : setView("scanner")}>▸ {a.title}</button>)}
        </Panel>
        <Panel title="Ramas monitorizadas" right={<button className="text-tva-amber" onClick={() => setView("map")}>mapa ▸</button>}>
          {branches.slice(0, 6).map((b) => <button key={b.id} className="w-full flex justify-between items-center text-xs py-1 border-b border-tva-olive-dark" onClick={() => focusBranch(b.id)}><span>{b.id} <span className="text-tva-metal">{b.sector}</span></span><Chip text={statusLabel[b.status]} color={statusColor[b.status]} /></button>)}
        </Panel>
        <Panel title={`Actividad reciente${unread.length ? ` · ${unread.length} nuevas` : ""}`} right={<button className="text-tva-amber" onClick={() => setView("events")}>eventos ▸</button>}>
          {world.events.slice(0, 6).map((e) => <div key={e.id} className="text-[11px] py-0.5 flex gap-2"><span className="text-tva-metal whitespace-nowrap">{fmtTime(e.at).slice(-5)}</span><span className="truncate" style={{ color: e.priority === "critical" ? "#ff3b3b" : undefined }}>{e.title}</span></div>)}
        </Panel>
        <Panel title="Misiones" right={<button className="text-tva-amber" onClick={() => setView("missions")}>todas ▸</button>}>
          {world.missions.filter((m) => !m.completed).slice(0, 4).map((m) => <div key={m.id} className="text-[11px] py-1"><div className="flex justify-between"><span>{m.title}</span><span className="text-tva-metal">{m.progress}/{m.target}</span></div><Meter value={(m.progress / m.target) * 100} color="#f5a524" /></div>)}
        </Panel>
      </div>
    </div>
  );
}
