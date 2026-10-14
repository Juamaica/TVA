"use client";
import { useEffect, useRef, useState } from "react";
import { useTVA } from "@/store/useTVA";
import { TimelineEngine, webglSupported } from "@/three/engine";
import { branchPoints, descendantsOf } from "@/lib/simulation";
import { Branch, BranchStatus } from "@/lib/types";
import { Chip, Meter, statusColor, statusLabel, Modal } from "./ui";
import { sfx } from "@/lib/audio";
import { SECTORS, EPOCHS } from "@/lib/seed";

export default function MapView({ embedded = false }: { embedded?: boolean }) {
  const world = useTVA((s) => s.world!);
  const { selectedBranchId, selectBranch, focusBranchId, focusBranch, prune, setPrunePhase, finishPrune, startPrune, inspectBranch, stabilizeBranch, createBranch, webglOk, setWebgl, setView, showToast } = useTVA();
  const ref = useRef<HTMLDivElement>(null);
  const eng = useRef<TimelineEngine | null>(null);
  const [filter, setFilter] = useState<BranchStatus | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const s = world.settings;

  // ── motor 3D ──
  useEffect(() => {
    if (!ref.current) return;
    if (!webglSupported()) { setWebgl(false); return; }
    try {
      eng.current = new TimelineEngine(ref.current, s, {
        onSelect: (id) => { selectBranch(id); if (id) { sfx.tick(); setInfoOpen(true); } },
        onPulseDone: () => { if (useTVA.getState().prune?.phase === "pulse") setPrunePhase("disintegrate"); },
        onPruneDone: () => { const p = useTVA.getState().prune; if (!p) return; p.replay ? setPrunePhase("report") : finishPrune(); },
      });
    } catch { setWebgl(false); }
    return () => { eng.current?.dispose(); eng.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.lowPower, s.particles]);

  useEffect(() => { eng.current?.syncBranches(filter === "all" ? world.branches : world.branches.filter((b) => b.kind === "main" || b.status === filter)); }, [world.branches, filter]);
  useEffect(() => { if (eng.current) { eng.current.settings = s; } }, [s]);
  useEffect(() => { eng.current?.setCrisis(world.crisis); }, [world.crisis]);
  useEffect(() => { eng.current?.setSelected(selectedBranchId, !!prune && prune.phase !== "report"); }, [selectedBranchId, prune]);
  useEffect(() => { if (focusBranchId) { eng.current?.focusOn(focusBranchId); focusBranch(null); } }, [focusBranchId, focusBranch]);

  // ── fases de poda ligadas al motor ──
  const lastPhase = useRef<string>("");
  useEffect(() => {
    const e = eng.current; const key = prune ? `${prune.branchId}:${prune.phase}:${prune.startedAt}` : "none";
    if (key === lastPhase.current) return; lastPhase.current = key;
    if (!prune) { e?.abortPrune(); e?.setSelected(null); return; }
    if (prune.phase === "select") { e?.focusOn(prune.branchId); }
    if (prune.phase === "pulse") { if (e) e.startPulse(prune.branchId, prune.replayBranch, world.branches); else setTimeout(() => setPrunePhase("disintegrate"), 1400); }
    if (prune.phase === "disintegrate") { if (e) e.startDisintegrate(prune.branchId, prune.durationMs); else setTimeout(() => { const p = useTVA.getState().prune; if (!p) return; p.replay ? setPrunePhase("report") : finishPrune(); }, prune.durationMs); }
    if (prune.phase === "report") { e?.setSelected(null); }
  }, [prune, world.branches, setPrunePhase, finishPrune]);

  const sel = world.branches.find((b) => b.id === selectedBranchId && b.status !== "pruned") ?? null;
  const desc = sel ? descendantsOf(sel.id, world.branches) : [];
  const vars = sel ? world.variants.filter((v) => v.branchId === sel.id) : [];
  const busy = !!prune && prune.phase !== "report";

  return (
    <div className={`relative ${embedded ? "h-full" : "h-[calc(100dvh-104px)]"} w-full overflow-hidden`}>
      {webglOk ? <div ref={ref} className="absolute inset-0" /> : <Map2D onSelect={(id) => selectBranch(id)} filter={filter} />}

      {/* HUD superior */}
      <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2 pointer-events-none">
        <div className="panel px-2 py-1 text-[10px] text-tva-metal pointer-events-auto">
          <div><span className="text-tva-amber">MAPA TEMPORAL</span> · {webglOk ? "WebGL" : "2D"} · {world.branches.filter((b) => b.status !== "pruned").length - 1} ramas</div>
          <div>INTEGRIDAD <span style={{ color: world.integrity < s.crisisThreshold ? "#ff3b3b" : "#9cff57" }}>{world.integrity}%</span> · {world.crisis ? <span className="text-tva-orange blink">CRISIS</span> : "NOMINAL"}</div>
        </div>
        <div className="flex flex-col gap-1 pointer-events-auto">
          <select className="input !py-1 !text-[10px] w-28" value={filter} onChange={(e) => setFilter(e.target.value as BranchStatus | "all")} disabled={busy}>
            <option value="all">Todas</option><option value="stable">Estables</option><option value="unstable">Inestables</option><option value="critical">Críticas</option>
          </select>
          <button className="btn !py-1 !min-h-0 !text-[10px]" onClick={() => { eng.current?.overview(); }} disabled={busy}>Vista general</button>
          <button className="btn !py-1 !min-h-0 !text-[10px]" onClick={() => setShowCreate(true)} disabled={busy}>+ Rama</button>
        </div>
      </div>

      {/* Panel flotante de rama seleccionada */}
      {sel && !busy && infoOpen && (
        <div className="absolute left-2 right-2 bottom-2 sm:right-auto sm:w-80 panel fade-up max-h-[55%] overflow-y-auto">
          <div className="panel-title"><span>{sel.id}</span><div className="flex gap-2 items-center"><Chip text={statusLabel[sel.status]} color={statusColor[sel.status]} /><button onClick={() => setInfoOpen(false)} className="text-tva-metal">✕</button></div></div>
          <div className="p-3 space-y-2 text-xs">
            <div className="text-tva-cream text-sm">{sel.label}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <span className="label">Tipo</span><span>{sel.kind}</span>
              <span className="label">Sector</span><span>{sel.sector}</span>
              <span className="label">Época</span><span className="truncate">{sel.epoch}</span>
              <span className="label">Origen</span><span>{sel.parentId ?? "—"} @ T={sel.originT}</span>
              <span className="label">Coordenadas</span><span className="value">{(() => { const p = branchPoints(sel, world.branches, 2)[0]; return p ? `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}` : "0, 0, 0"; })()}</span>
              <span className="label">Dependientes</span><span>{desc.length}</span>
              <span className="label">Variantes</span><span>{vars.map((v) => v.id).join(", ") || "—"}</span>
            </div>
            {sel.kind !== "main" && (<>
              <div><div className="flex justify-between text-[10px]"><span className="label">Divergencia</span><span>{sel.divergence}%</span></div><Meter value={sel.divergence} color="#ff6a1a" /></div>
              <div><div className="flex justify-between text-[10px]"><span className="label">Estabilidad</span><span>{sel.stability}%</span></div><Meter value={sel.stability} color="#9cff57" /></div>
            </>)}
            <div className="flex flex-wrap gap-1 pt-1">
              {sel.kind !== "main" && !sel.inspected && <button className="btn !text-[10px] !py-1" onClick={() => { inspectBranch(sel.id); sfx.confirm(); showToast(`Inspección de ${sel.id} registrada`); }}>Inspeccionar</button>}
              {sel.kind !== "main" && <button className="btn !text-[10px] !py-1" onClick={() => stabilizeBranch(sel.id)}>Estabilizar</button>}
              {vars.length > 0 && <button className="btn !text-[10px] !py-1" onClick={() => setView("variants")}>Expedientes</button>}
              <button className="btn !text-[10px] !py-1" onClick={() => setShowCreate(true)}>Ramificar</button>
              {sel.kind !== "main" ? <button className="btn btn-danger !text-[10px] !py-1" onClick={() => startPrune(sel.id)}>⚠ Podar</button> : <span className="chip text-tva-cream border-tva-cream/40">LÍNEA PROTEGIDA</span>}
            </div>
          </div>
        </div>
      )}
      {sel && !busy && !infoOpen && <button className="absolute left-2 bottom-2 btn !text-[10px]" onClick={() => setInfoOpen(true)}>{sel.id} ▸</button>}

      {showCreate && <CreateBranch parentId={sel?.id ?? "SACRED-TIMELINE"} onClose={() => setShowCreate(false)} onCreate={(pid, d) => { const b = createBranch(pid, d); if (b) { sfx.confirm(); showToast(`Rama ${b.id} registrada`); selectBranch(b.id); focusBranch(b.id); } setShowCreate(false); }} />}
    </div>
  );
}

function CreateBranch({ parentId, onClose, onCreate }: { parentId: string; onClose: () => void; onCreate: (pid: string, d: Partial<Branch>) => void }) {
  const world = useTVA((s) => s.world!);
  const [pid, setPid] = useState(parentId); const [label, setLabel] = useState(""); const [div, setDiv] = useState(45); const [originT, setOriginT] = useState(0); const [sector, setSector] = useState(SECTORS[2]); const [epoch, setEpoch] = useState(EPOCHS[7]);
  const parents = world.branches.filter((b) => b.status !== "pruned");
  return (
    <Modal title="Registrar ramificación" onClose={onClose}>
      <div className="space-y-2 text-xs">
        <label className="label">Rama de origen</label>
        <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>{parents.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.label}</option>)}</select>
        <input className="input" placeholder="Etiqueta" value={label} onChange={(e) => setLabel(e.target.value)} />
        <label className="label">Punto de divergencia T = {originT}</label>
        <input type="range" min={-60} max={60} value={originT} onChange={(e) => setOriginT(+e.target.value)} className="w-full accent-amber-500" />
        <label className="label">Divergencia {div}%</label>
        <input type="range" min={5} max={99} value={div} onChange={(e) => setDiv(+e.target.value)} className="w-full accent-amber-500" />
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={sector} onChange={(e) => setSector(e.target.value)}>{SECTORS.map((x) => <option key={x}>{x}</option>)}</select>
          <select className="input" value={epoch} onChange={(e) => setEpoch(e.target.value)}>{EPOCHS.map((x) => <option key={x}>{x}</option>)}</select>
        </div>
        <div className="flex gap-2 justify-end pt-2"><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-amber" onClick={() => onCreate(pid, { label: label || undefined, divergence: div, originT, sector, epoch })}>Crear</button></div>
      </div>
    </Modal>
  );
}

// ── Alternativa 2D interactiva (sin WebGL) ──────────────────────────────
function Map2D({ onSelect, filter }: { onSelect: (id: string | null) => void; filter: BranchStatus | "all" }) {
  const world = useTVA((s) => s.world!);
  const selected = useTVA((s) => s.selectedBranchId);
  const prune = useTVA((s) => s.prune);
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useRef({ x: 0, y: 0, k: 6, drag: false, lx: 0, ly: 0, moved: 0 });
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!; let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const W = c.clientWidth, H = c.clientHeight; if (c.width !== W * 2 || c.height !== H * 2) { c.width = W * 2; c.height = H * 2; }
      ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.fillStyle = "#07080a"; ctx.fillRect(0, 0, W, H);
      const v = view.current; const P = (x: number, y: number, z: number) => [W / 2 + (x + v.x) * v.k, H / 2 - (y + z * 0.4 + v.y) * v.k] as const;
      const t = performance.now() / 1000;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.shadowColor = "#fff"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(0, P(0, 0, 0)[1]); ctx.lineTo(W, P(0, 0, 0)[1]); ctx.stroke();
      for (const b of world.branches) {
        if (b.kind === "main" || b.status === "pruned" || (filter !== "all" && b.status !== filter)) continue;
        const pts = branchPoints(b, world.branches, 20); const col = selected === b.id ? "#f5a524" : statusColor[b.status];
        let prog = 1; if (prune && prune.branchId === b.id && prune.phase === "disintegrate") prog = 1 - Math.min(1, (performance.now() - prune.startedAt) / prune.durationMs);
        ctx.strokeStyle = col; ctx.shadowColor = col; ctx.lineWidth = selected === b.id ? 3 : 2; ctx.globalAlpha = prog; ctx.beginPath();
        pts.slice(Math.floor((1 - prog) * pts.length)).forEach((p, i) => { const [x, y] = P(p.x, p.y, p.z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
        const [nx, ny] = P(pts[0].x, pts[0].y, pts[0].z); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(nx, ny, 4, 0, 7); ctx.fill();
        const pp = pts[Math.floor(((t * 0.3 + b.originT) % 1 + 1) % 1 * (pts.length - 1))]; const [px, py] = P(pp.x, pp.y, pp.z); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, 2.5, 0, 7); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = "#8a8f85"; ctx.font = "10px monospace"; ctx.fillText(b.id, nx + 6, ny - 6);
      }
      ctx.shadowBlur = 0;
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [world.branches, selected, filter, prune]);
  const pick = (cx: number, cy: number) => {
    const c = ref.current!; const r = c.getBoundingClientRect(); const W = r.width, H = r.height; const v = view.current;
    const P = (x: number, y: number, z: number) => [W / 2 + (x + v.x) * v.k, H / 2 - (y + z * 0.4 + v.y) * v.k] as const; let best: string | null = null; let bd = 14;
    for (const b of world.branches) { if (b.kind === "main" || b.status === "pruned") continue; for (const p of branchPoints(b, world.branches, 20)) { const [x, y] = P(p.x, p.y, p.z); const d = Math.hypot(x - (cx - r.left), y - (cy - r.top)); if (d < bd) { bd = d; best = b.id; } } }
    if (!best && Math.abs(cy - r.top - P(0, 0, 0)[1]) < 10) best = "SACRED-TIMELINE";
    onSelect(best);
  };
  return <canvas ref={ref} className="absolute inset-0 w-full h-full touch-none"
    onPointerDown={(e) => { const v = view.current; v.drag = true; v.lx = e.clientX; v.ly = e.clientY; v.moved = 0; }}
    onPointerMove={(e) => { const v = view.current; if (!v.drag) return; v.x += (e.clientX - v.lx) / v.k; v.y -= (e.clientY - v.ly) / v.k; v.moved += Math.abs(e.clientX - v.lx) + Math.abs(e.clientY - v.ly); v.lx = e.clientX; v.ly = e.clientY; }}
    onPointerUp={(e) => { const v = view.current; v.drag = false; if (v.moved < 6) pick(e.clientX, e.clientY); }}
    onWheel={(e) => { view.current.k = Math.max(2, Math.min(20, view.current.k * (e.deltaY > 0 ? 0.9 : 1.1))); }} />;
}
