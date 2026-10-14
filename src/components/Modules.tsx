"use client";
import { useEffect, useRef, useState } from "react";
import { useTVA } from "@/store/useTVA";
import { OpType, Operation, rankFor, RANKS, Severity } from "@/lib/types";
import { Avatar, Chip, Meter, Panel, Typewriter, fmtTime, sevColor, sevLabel, Confirm } from "./ui";
import { assistantAnswer } from "@/lib/simulation";
import { sfx } from "@/lib/audio";

// ── EVENTOS ──────────────────────────────────────────────────────────────
export function Events() {
  const world = useTVA((s) => s.world!);
  const { markEventsRead, focusBranch, setView, patchWorld, updateSettings, tickEvents } = useTVA();
  const [pri, setPri] = useState<Severity | "all">("all");
  useEffect(() => { const t = setTimeout(markEventsRead, 1500); return () => clearTimeout(t); }, [markEventsRead, world.events.length]);
  const list = world.events.filter((e) => pri === "all" || e.priority === pri);
  return (
    <div className="p-2 space-y-2 safe-b">
      <Panel title="Control de simulación">
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <button className={`btn !py-1 ${world.paused ? "btn-amber" : ""}`} onClick={() => patchWorld((w) => ({ paused: !w.paused }))}>{world.paused ? "▶ Reanudar" : "❚❚ Pausar"}</button>
          <button className={`btn !py-1 ${!world.settings.eventsEnabled ? "btn-danger" : ""}`} onClick={() => updateSettings({ eventsEnabled: !world.settings.eventsEnabled })}>{world.settings.eventsEnabled ? "Eventos aleatorios: ON" : "Eventos aleatorios: OFF"}</button>
          <button className="btn !py-1" onClick={tickEvents}>Forzar evento</button>
          <label className="flex items-center gap-2 flex-1 min-w-[180px]"><span className="label">Cada {world.settings.eventIntervalSec}s</span><input type="range" min={15} max={300} step={15} value={world.settings.eventIntervalSec} onChange={(e) => updateSettings({ eventIntervalSec: +e.target.value })} className="flex-1 accent-amber-500" /></label>
        </div>
      </Panel>
      <Panel title={`Cronología de eventos (${list.length})`} right={<select className="input !py-0.5 !text-[10px] w-24" value={pri} onChange={(e) => setPri(e.target.value as Severity | "all")}><option value="all">Todas</option>{(Object.keys(sevLabel) as Severity[]).map((k) => <option key={k} value={k}>{sevLabel[k]}</option>)}</select>}>
        <div className="space-y-1">
          {list.slice(0, 120).map((e) => (
            <div key={e.id} className={`border border-tva-olive-dark bg-black/30 p-2 text-xs ${!e.read ? "fade-up" : ""}`} style={{ borderLeft: `3px solid ${sevColor[e.priority]}` }}>
              <div className="flex justify-between gap-2"><span className={e.priority === "critical" ? "text-tva-orange" : "text-tva-cream"}>{e.title}</span><span className="text-[10px] text-tva-metal whitespace-nowrap">{fmtTime(e.at)}</span></div>
              <div className="text-[11px] text-tva-cream/75">{e.detail}</div>
              <div className="flex gap-1 mt-1">{e.branchId && <button className="btn !py-0.5 !min-h-0 !text-[10px]" onClick={() => focusBranch(e.branchId!)}>Mapa</button>}{e.variantId && <button className="btn !py-0.5 !min-h-0 !text-[10px]" onClick={() => setView("variants")}>Expediente</button>}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ── MISIONES ─────────────────────────────────────────────────────────────
export function Missions() {
  const world = useTVA((s) => s.world!);
  const rank = rankFor(world.profile.xp);
  return (
    <div className="p-2 space-y-2 safe-b">
      <Panel title="Progresión del agente">
        <div className="flex justify-between items-end"><div><div className="label">Rango</div><div className="text-tva-amber text-lg">{rank.name}</div></div><div className="text-right"><div className="label">XP</div><div className="value text-lg">{world.profile.xp}{rank.next && <span className="text-tva-metal text-xs"> / {rank.next.min}</span>}</div></div></div>
        <Meter value={rank.next ? ((world.profile.xp - rank.min) / (rank.next.min - rank.min)) * 100 : 100} color="#f5a524" className="mt-2" />
        <div className="grid grid-cols-7 gap-1 mt-2">{RANKS.map((r) => <div key={r.name} className="h-1.5" style={{ background: world.profile.xp >= r.min ? "#f5a524" : "#2f3722" }} title={r.name} />)}</div>
        <div className="text-[10px] text-tva-metal mt-1">Permisos desbloqueados: poda {rank.clearance >= 3 ? "Nexus y todas las ramas" : rank.clearance >= 2 ? "hasta divergencia alta" : "de divergencia baja (≤55%)"} · autorización {rank.clearance}</div>
        {world.profile.badges.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{world.profile.badges.map((b) => <Chip key={b} text={`★ ${b}`} color="#f5a524" />)}</div>}
      </Panel>
      <Panel title="Misiones">
        <div className="space-y-1">
          {[...world.missions].sort((a, b) => Number(a.completed) - Number(b.completed)).map((m) => (
            <div key={m.id} className="border border-tva-olive-dark bg-black/30 p-2 text-xs" style={{ opacity: m.completed ? 0.6 : 1 }}>
              <div className="flex justify-between"><span className={m.completed ? "text-tva-green" : "text-tva-cream"}>{m.completed ? "✓ " : ""}{m.title}</span><span className="text-tva-amber">+{m.rewardXp} XP</span></div>
              <div className="text-[11px] text-tva-metal">{m.objective}{m.badge && ` · Insignia: ${m.badge}`}</div>
              <div className="flex items-center gap-2 mt-1"><Meter value={(m.progress / m.target) * 100} color={m.completed ? "#9cff57" : "#f5a524"} className="flex-1" /><span className="text-[10px] value">{m.progress}/{m.target}</span></div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ── ARCHIVO ──────────────────────────────────────────────────────────────
const OP_LABEL: Record<OpType, string> = { scan: "Escaneo", prune: "Poda", branch_created: "Rama", variant_created: "Variante", variant_update: "Variante", investigation: "Investigación", mission: "Misión", event: "Evento", tempad: "TemPad", crisis: "Crisis", system: "Sistema" };
export function Archive() {
  const world = useTVA((s) => s.world!);
  const { replayPrune, focusBranch } = useTVA();
  const [type, setType] = useState<OpType | "all">("all"); const [res, setRes] = useState<Operation["result"] | "all">("all"); const [since, setSince] = useState("");
  const list = world.operations.filter((o) => (type === "all" || o.type === type) && (res === "all" || o.result === res) && (!since || o.at >= new Date(since).getTime()));
  return (
    <div className="p-2 space-y-2 safe-b">
      <Panel title={`Archivo de operaciones (${list.length})`}>
        <div className="grid grid-cols-3 gap-1 mb-2">
          <select className="input !py-1 !text-[10px]" value={type} onChange={(e) => setType(e.target.value as OpType | "all")}><option value="all">Tipo: todos</option>{(Object.keys(OP_LABEL) as OpType[]).map((k) => <option key={k} value={k}>{OP_LABEL[k]}</option>)}</select>
          <select className="input !py-1 !text-[10px]" value={res} onChange={(e) => setRes(e.target.value as Operation["result"] | "all")}><option value="all">Resultado</option><option value="success">Éxito</option><option value="cancelled">Cancelada</option><option value="info">Info</option></select>
          <input type="date" className="input !py-1 !text-[10px]" value={since} onChange={(e) => setSince(e.target.value)} />
        </div>
        <div className="relative pl-4 space-y-1 before:absolute before:left-1 before:top-0 before:bottom-0 before:w-px before:bg-tva-olive">
          {list.map((o) => (
            <div key={o.id} className="relative border border-tva-olive-dark bg-black/30 p-2 text-xs">
              <span className="absolute -left-[13px] top-3 w-2 h-2 rounded-full" style={{ background: o.result === "success" ? "#9cff57" : o.result === "cancelled" ? "#ff6a1a" : "#8a8f85" }} />
              <div className="flex justify-between gap-2"><span className="text-tva-cream">{o.title}</span><span className="text-[10px] text-tva-metal whitespace-nowrap">{fmtTime(o.at)}</span></div>
              <div className="text-[11px] text-tva-cream/75">{o.summary}</div>
              <div className="flex gap-1 mt-1 items-center"><Chip text={OP_LABEL[o.type]} color="#8a8f85" />
                {o.pruneSnapshot && <button className="btn !py-0.5 !min-h-0 !text-[10px] btn-amber" onClick={() => replayPrune(o)}>▶ Reproducir poda</button>}
                {o.branchId && !o.pruneSnapshot && world.branches.some((b) => b.id === o.branchId && b.status !== "pruned") && <button className="btn !py-0.5 !min-h-0 !text-[10px]" onClick={() => focusBranch(o.branchId!)}>Mapa</button>}
              </div>
              {o.pruneSnapshot && <div className="text-[10px] text-tva-metal mt-1">Instantánea: {o.pruneSnapshot.branch.label} · {o.pruneSnapshot.descendants.length} dependientes · {o.pruneSnapshot.variants.map((v) => v.id).join(", ") || "sin variantes"}</div>}
            </div>
          ))}
          {list.length === 0 && <div className="text-tva-metal text-xs">Sin operaciones.</div>}
        </div>
      </Panel>
    </div>
  );
}

// ── ASISTENTE ────────────────────────────────────────────────────────────
export function Assistant() {
  const world = useTVA((s) => s.world!);
  const [msgs, setMsgs] = useState<{ me: boolean; text: string }[]>([{ me: false, text: assistantAnswer(world, "resumen") }]);
  const [q, setQ] = useState(""); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollTo(0, 1e6), [msgs]);
  const ask = (t: string) => { if (!t.trim()) return; sfx.key(); setMsgs((m) => [...m, { me: true, text: t }]); setTimeout(() => setMsgs((m) => [...m, { me: false, text: assistantAnswer(useTVA.getState().world!, t) }]), 400); setQ(""); };
  return (
    <div className="p-2 space-y-2 safe-b">
      <Panel title="Asistente de inteligencia temporal" right={<Chip text="Simulado · reglas locales" color="#8a8f85" />}>
        <p className="text-[10px] text-tva-metal mb-2">Este asistente analiza únicamente los datos locales de tu simulación con un sistema de reglas. No hay ninguna IA remota conectada ni se envían datos a servicios externos.</p>
        <div ref={ref} className="h-64 overflow-y-auto border border-tva-olive-dark bg-black/40 p-2 space-y-2 text-xs">
          {msgs.map((m, i) => <div key={i} className={`whitespace-pre-wrap ${m.me ? "text-tva-amber text-right" : "text-tva-green"}`}>{m.me ? `> ${m.text}` : i === msgs.length - 1 ? <Typewriter text={m.text} speed={8} /> : m.text}</div>)}
        </div>
        <form className="flex gap-1 mt-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}><input className="input" placeholder="Pregunta al asistente…" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn btn-amber">▶</button></form>
        <div className="flex flex-wrap gap-1 mt-2">{["resumen", "variantes", "divergencia", "recomendaciones", "informe de poda"].map((s) => <button key={s} className="chip text-tva-metal border-tva-olive hover:text-tva-amber" onClick={() => ask(s)}>{s}</button>)}</div>
      </Panel>
    </div>
  );
}

// ── PERFIL / CREDENCIAL ──────────────────────────────────────────────────
export function Profile() {
  const world = useTVA((s) => s.world!);
  const { updateProfile, showToast } = useTVA();
  const p = world.profile; const rank = rankFor(p.xp);
  const [name, setName] = useState(p.name);
  const file = (f: File | null) => { if (!f) return; const r = new FileReader(); r.onload = () => updateProfile({ avatarDataUrl: String(r.result) }); r.readAsDataURL(f); };
  return (
    <div className="p-2 space-y-2 safe-b">
      <div className="panel p-0 overflow-hidden" style={{ background: "linear-gradient(135deg,#3b4430 0%,#1b1f15 60%,#0a0b08 100%)" }}>
        <div className="flex justify-between items-center px-3 py-2 border-b border-tva-amber/40 text-[10px] tracking-[.3em] text-tva-amber"><span>TIME VARIANCE AUTHORITY</span><span>CREDENCIAL · NIVEL {rank.clearance}</span></div>
        <div className="p-3 flex gap-3">
          <div className="relative"><Avatar seed={p.avatarSeed} size={88} dataUrl={p.avatarDataUrl} /><div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full border-2 border-tva-orange text-tva-orange text-[7px] flex items-center justify-center rotate-[-12deg] bg-black/70 text-center leading-tight">AUTO<br />RIZADO</div></div>
          <div className="flex-1 text-xs space-y-1">
            <div className="text-xl text-tva-cream tracking-wide">{p.name}</div>
            <div className="grid grid-cols-2 gap-x-2 text-[11px]">
              <span className="label">Código</span><span className="value text-tva-green">{p.code}</span>
              <span className="label">División</span><span>{p.division}</span>
              <span className="label">Rango</span><span className="text-tva-amber">{rank.name}</span>
              <span className="label">Alta</span><span>{fmtTime(p.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="px-3 pb-3 flex gap-px">{Array.from({ length: 40 }).map((_, i) => <div key={i} className="h-5 bg-tva-cream" style={{ width: (i * 7919) % 3 + 1, opacity: 0.85 }} />)}</div>
        <div className="grid grid-cols-3 border-t border-tva-olive text-center text-xs">
          <div className="p-2 border-r border-tva-olive"><div className="label">Operaciones</div><div className="value text-lg">{p.opsCompleted}</div></div>
          <div className="p-2 border-r border-tva-olive"><div className="label">Misiones</div><div className="value text-lg">{p.missionsCompleted}</div></div>
          <div className="p-2"><div className="label">XP</div><div className="value text-lg">{p.xp}</div></div>
        </div>
      </div>
      <Panel title="Editar identidad">
        <div className="space-y-2 text-xs">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name !== p.name) { updateProfile({ name: name.trim() }); showToast("Nombre actualizado"); } }} />
          <select className="input" value={p.division} onChange={(e) => updateProfile({ division: e.target.value })}>{["Analistas", "Cazadores", "Archivo Temporal", "Minutemen", "Juzgado Temporal"].map((d) => <option key={d}>{d}</option>)}</select>
          <div className="flex gap-2"><label className="btn flex-1 cursor-pointer">Subir avatar<input type="file" accept="image/*" className="hidden" onChange={(e) => file(e.target.files?.[0] ?? null)} /></label><button className="btn" onClick={() => updateProfile({ avatarSeed: Math.floor(Math.random() * 999), avatarDataUrl: undefined })}>Avatar aleatorio</button></div>
        </div>
      </Panel>
      <Panel title="Historial de actividad">
        <div className="space-y-0.5 max-h-60 overflow-y-auto">{world.operations.slice(0, 40).map((o) => <div key={o.id} className="text-[11px] flex justify-between gap-2 border-b border-tva-olive-dark py-1"><span className="truncate">{o.title}</span><span className="text-tva-metal whitespace-nowrap">{fmtTime(o.at)}</span></div>)}</div>
      </Panel>
    </div>
  );
}

export { Confirm };
