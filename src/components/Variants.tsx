"use client";
import { useEffect, useState } from "react";
import { useTVA } from "@/store/useTVA";
import { Variant, VariantStatus } from "@/lib/types";
import { Avatar, Chip, Meter, Modal, Panel, Typewriter, vStatusColor, vStatusLabel, fmtTime } from "./ui";
import { sfx } from "@/lib/audio";
import { EPOCHS, UNIVERSES, makeSignature } from "@/lib/seed";

export default function Variants() {
  const world = useTVA((s) => s.world!);
  const { createVariant, showToast } = useTVA();
  const [q, setQ] = useState(""); const [st, setSt] = useState<VariantStatus | "all">("all"); const [sort, setSort] = useState<"threat" | "date" | "name">("threat");
  const [open, setOpen] = useState<string | null>(null); const [creating, setCreating] = useState(false);
  const list = world.variants
    .filter((v) => (st === "all" || v.status === st) && (q === "" || [v.id, v.name, v.alias, v.signature, v.universe, v.branchId ?? ""].join(" ").toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sort === "threat" ? b.threat - a.threat : sort === "date" ? b.discoveredAt - a.discoveredAt : a.name.localeCompare(b.name));
  return (
    <div className="p-2 space-y-2 safe-b">
      <Panel title={`Expedientes de variantes (${world.variants.length})`} right={<button className="btn !py-0.5 !min-h-0 !text-[10px]" onClick={() => setCreating(true)}>+ Nuevo</button>}>
        <input className="input mb-2" placeholder="Buscar por id, nombre, alias, firma, rama…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid grid-cols-2 gap-1 mb-2">
          <select className="input !py-1 !text-[10px]" value={st} onChange={(e) => setSt(e.target.value as VariantStatus | "all")}><option value="all">Estado: todos</option>{(Object.keys(vStatusLabel) as VariantStatus[]).map((k) => <option key={k} value={k}>{vStatusLabel[k]}</option>)}</select>
          <select className="input !py-1 !text-[10px]" value={sort} onChange={(e) => setSort(e.target.value as "threat" | "date" | "name")}><option value="threat">Orden: amenaza</option><option value="date">Orden: fecha</option><option value="name">Orden: nombre</option></select>
        </div>
        <div className="grid sm:grid-cols-2 gap-1">
          {list.map((v) => (
            <button key={v.id} onClick={() => { setOpen(v.id); sfx.tick(); }} className="text-left border border-tva-olive-dark bg-black/30 p-2 flex gap-2 items-center hover:border-tva-amber transition">
              <Avatar seed={v.avatarSeed} size={40} />
              <div className="flex-1 min-w-0 text-xs">
                <div className="flex justify-between gap-1"><span className="text-tva-cream truncate">{v.name}</span><span className="value" style={{ color: v.threat > 70 ? "#ff3b3b" : v.threat > 40 ? "#f5a524" : "#9cff57" }}>{v.threat}</span></div>
                <div className="text-[10px] text-tva-metal truncate">«{v.alias}» · {v.signature}</div>
                <div className="flex gap-1 mt-1"><Chip text={vStatusLabel[v.status]} color={vStatusColor[v.status]} />{v.tracked && <Chip text="Rastreo" color="#9cff57" />}{v.branchId ? <span className="text-[9px] text-tva-metal">{v.branchId}</span> : <span className="text-[9px] text-tva-orange">sin rama</span>}</div>
              </div>
            </button>
          ))}
          {list.length === 0 && <div className="text-tva-metal text-xs">Ningún expediente coincide.</div>}
        </div>
      </Panel>
      {open && <Dossier id={open} onClose={() => setOpen(null)} />}
      {creating && <CreateVariant onClose={() => setCreating(false)} onCreate={(d) => { const v = createVariant(d); setCreating(false); setOpen(v.id); sfx.confirm(); showToast(`Expediente ${v.id} creado`); }} />}
    </div>
  );
}

function Dossier({ id, onClose }: { id: string; onClose: () => void }) {
  const world = useTVA((s) => s.world!);
  const { setVariantStatus, toggleTrack, updateVariant, focusBranch, showToast } = useTVA();
  const v = world.variants.find((x) => x.id === id)!;
  const [stage, setStage] = useState(0);
  const [notes, setNotes] = useState(v.notes);
  useEffect(() => { setStage(0); sfx.scan(); const ids = [300, 700, 1100, 1500, 1900].map((t, i) => setTimeout(() => setStage(i + 1), t / world.settings.animSpeed)); return () => ids.forEach(clearTimeout); }, [id, world.settings.animSpeed]);
  if (!v) return null;
  const related = world.variants.filter((x) => v.relatedVariantIds.includes(x.id));
  const anomalies = world.anomalies.filter((a) => a.variantId === v.id && !a.resolved);
  const branch = world.branches.find((b) => b.id === v.branchId);
  return (
    <Modal title={`Expediente ${v.id}`} onClose={onClose} wide>
      <div className="grid sm:grid-cols-[140px_1fr] gap-3 text-xs">
        <div className="flex sm:flex-col gap-2 items-center sm:items-stretch">
          <div className="relative"><Avatar seed={v.avatarSeed} size={110} />{stage < 2 && <div className="absolute inset-0 overflow-hidden"><div className="sweep-line !animate-[sweep_.8s_linear_infinite]" /></div>}</div>
          <div className="flex-1 space-y-1">
            <div className="label">Firma temporal</div>
            <div className="text-tva-green value">{stage >= 1 ? <Typewriter text={v.signature} speed={40} /> : <span className="blink">ANALIZANDO…</span>}</div>
            <div className="label mt-1">Índice de amenaza</div>
            <div className="value text-2xl" style={{ color: v.threat > 70 ? "#ff3b3b" : v.threat > 40 ? "#f5a524" : "#9cff57" }}>{stage >= 2 ? v.threat : "--"}</div>
            <Meter value={stage >= 2 ? v.threat : 0} color={v.threat > 70 ? "#ff3b3b" : "#f5a524"} />
          </div>
        </div>
        <div className="space-y-2">
          <div><div className="text-base text-tva-cream">{v.name}</div><div className="text-tva-metal">«{v.alias}»</div></div>
          {stage >= 2 && <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] fade-up">
            <span className="label">Universo</span><span>{v.universe}</span>
            <span className="label">Época</span><span>{v.epoch}</span>
            <span className="label">Coordenadas</span><span className="value">{v.coords.x}, {v.coords.y}, {v.coords.z}</span>
            <span className="label">Divergencia</span><span>{v.divergencePoint}</span>
            <span className="label">Rama</span><span>{branch ? <button className="underline text-tva-amber" onClick={() => { focusBranch(branch.id); onClose(); }}>{branch.id} ↗</button> : "— (sin rama activa)"}</span>
            <span className="label">Descubierto</span><span>{fmtTime(v.discoveredAt)}</span>
          </div>}
          {stage >= 3 && <div className="fade-up">
            <div className="label mb-1">Estado de investigación</div>
            <div className="flex flex-wrap gap-1">{(Object.keys(vStatusLabel) as VariantStatus[]).map((s) => <button key={s} className={`chip ${v.status === s ? "" : "opacity-50"}`} style={{ color: vStatusColor[s], borderColor: vStatusColor[s], background: v.status === s ? `${vStatusColor[s]}22` : "transparent" }} onClick={() => { setVariantStatus(v.id, s); sfx.confirm(); }}>{vStatusLabel[s]}</button>)}</div>
            <div className="flex gap-1 mt-2 flex-wrap">
              <button className={`btn !py-1 !text-[10px] ${v.tracked ? "btn-amber" : ""}`} onClick={() => { toggleTrack(v.id); sfx.confirm(); }}>{v.tracked ? "◉ Rastreo activo" : "○ Rastrear firma"}</button>
            </div>
          </div>}
          {stage >= 4 && <div className="fade-up grid sm:grid-cols-2 gap-2">
            <div><div className="label mb-1">Relaciones</div>{related.length ? related.map((r) => <div key={r.id} className="text-[11px]">↔ {r.id} «{r.alias}»</div>) : <div className="text-[11px] text-tva-metal">Sin relaciones</div>}{anomalies.map((a) => <div key={a.id} className="text-[11px] text-tva-orange">⚠ {a.title}</div>)}</div>
            <div><div className="label mb-1">Historial</div><div className="max-h-24 overflow-y-auto space-y-0.5">{[...v.history].reverse().map((h, i) => <div key={i} className="text-[10px]"><span className="text-tva-metal">{fmtTime(h.at)}</span> {h.text}</div>)}</div></div>
          </div>}
          {stage >= 5 && <div className="fade-up">
            <div className="label mb-1">Observaciones del agente</div>
            <textarea className="input h-16 text-xs" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (notes !== v.notes) { updateVariant(v.id, { notes }); showToast("Observaciones guardadas"); } }} />
          </div>}
        </div>
      </div>
    </Modal>
  );
}

function CreateVariant({ onClose, onCreate }: { onClose: () => void; onCreate: (d: Partial<Variant>) => void }) {
  const world = useTVA((s) => s.world!);
  const [d, setD] = useState<Partial<Variant>>({ name: "", alias: "", signature: makeSignature(), universe: UNIVERSES[0], epoch: EPOCHS[7], threat: 50, branchId: world.branches.find((b) => b.kind !== "main" && b.status !== "pruned")?.id ?? null, divergencePoint: "" });
  const up = (p: Partial<Variant>) => setD((x) => ({ ...x, ...p }));
  return (
    <Modal title="Nuevo expediente" onClose={onClose}>
      <div className="space-y-2 text-xs">
        <input className="input" placeholder="Nombre" value={d.name} onChange={(e) => up({ name: e.target.value })} />
        <input className="input" placeholder="Alias" value={d.alias} onChange={(e) => up({ alias: e.target.value })} />
        <input className="input" placeholder="Firma" value={d.signature} onChange={(e) => up({ signature: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={d.universe} onChange={(e) => up({ universe: e.target.value })}>{UNIVERSES.map((u) => <option key={u}>{u}</option>)}</select>
          <select className="input" value={d.epoch} onChange={(e) => up({ epoch: e.target.value })}>{EPOCHS.map((u) => <option key={u}>{u}</option>)}</select>
        </div>
        <select className="input" value={d.branchId ?? ""} onChange={(e) => up({ branchId: e.target.value || null })}><option value="">Sin rama</option>{world.branches.filter((b) => b.kind !== "main" && b.status !== "pruned").map((b) => <option key={b.id} value={b.id}>{b.id} · {b.label}</option>)}</select>
        <input className="input" placeholder="Punto de divergencia" value={d.divergencePoint} onChange={(e) => up({ divergencePoint: e.target.value })} />
        <label className="label">Amenaza {d.threat}</label><input type="range" min={1} max={99} value={d.threat} onChange={(e) => up({ threat: +e.target.value })} className="w-full accent-amber-500" />
        <div className="flex gap-2 justify-end"><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-amber" disabled={!d.name} onClick={() => onCreate(d)}>Registrar</button></div>
      </div>
    </Modal>
  );
}
