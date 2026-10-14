"use client";
import { useEffect, useRef, useState } from "react";
import { useTVA } from "@/store/useTVA";
import { Anomaly, AnomalyType, Severity } from "@/lib/types";
import { Chip, Panel, sevColor, sevLabel, fmtTime } from "./ui";
import { sfx, unlockAudio, vibrate } from "@/lib/audio";
import { activeBranches } from "@/lib/simulation";

const TYPE_LABEL: Record<AnomalyType, string> = { divergence: "Divergencia", signature: "Firma", instability: "Inestabilidad", integrity: "Integridad", nexus: "Nexus" };

export default function Scanner() {
  const world = useTVA((s) => s.world!);
  const { runScan, resolveAnomaly, focusBranch, setView, showToast } = useTVA();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [sev, setSev] = useState<Severity | "all">("all");
  const [type, setType] = useState<AnomalyType | "all">("all");
  const [sector, setSector] = useState("all");
  const [state, setState] = useState<"open" | "resolved" | "all">("open");
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo(0, 1e6); }, [log]);

  async function start() {
    if (running) return; unlockAudio(); setRunning(true); setLog([]); setProgress(0); sfx.scan();
    const push = (s: string) => setLog((l) => [...l, s]);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms / world.settings.animSpeed));
    push("▸ Inicializando matriz de escaneo temporal…"); await wait(500);
    push("▸ Calibrando sensores de divergencia… OK"); await wait(400);
    const branches = activeBranches(world).filter((b) => b.kind !== "main");
    for (let i = 0; i < branches.length; i++) {
      const b = branches[i];
      push(`  ◦ Nodo ${b.id} [${b.sector}] div=${b.divergence}% est=${b.stability}% coord=(${(b.originT).toFixed(0)}, ${b.direction.y.toFixed(2)}, ${b.direction.z.toFixed(2)})`);
      setProgress(((i + 1) / (branches.length + 2)) * 100); sfx.tick(); await wait(220);
    }
    push(`▸ Analizando ${world.variants.length} firmas registradas…`); await wait(500);
    push("▸ Aplicando reglas de detección (divergencia ≥50, estabilidad <35, amenaza ≥60, nexus ≥85)…"); await wait(500);
    const found = runScan();
    setProgress(100);
    if (found.length) { push(`▸ ${found.length} ANOMALÍA(S) NUEVA(S) DETECTADA(S):`); found.forEach((a) => push(`  ⚠ [${sevLabel[a.severity].toUpperCase()}] ${a.title}`)); sfx.alert(); vibrate([40, 30, 40], world.settings.vibration); }
    else push("▸ Sin anomalías nuevas. Las existentes permanecen en seguimiento.");
    push("▸ Escaneo completado. Registros y alertas generados.");
    setRunning(false); showToast(`Escaneo completado: ${found.length} hallazgos`);
  }

  const sectors = Array.from(new Set(world.anomalies.map((a) => a.sector)));
  const list = world.anomalies.filter((a) => (sev === "all" || a.severity === sev) && (type === "all" || a.type === type) && (sector === "all" || a.sector === sector) && (state === "all" || (state === "open" ? !a.resolved : a.resolved)));

  return (
    <div className="p-2 space-y-2 safe-b">
      <Panel title="Escáner temporal" right={<span className="text-tva-metal">{world.lastScanAt ? `último: ${fmtTime(world.lastScanAt)}` : "sin escaneos"}</span>}>
        <div className="relative overflow-hidden border border-tva-olive bg-black/50 h-44 grid-bg">
          {running && <div className="sweep-line" />}
          <div ref={logRef} className="absolute inset-0 p-2 text-[10px] leading-relaxed overflow-y-auto text-tva-green/90 whitespace-pre-wrap">
            {log.length === 0 && <span className="text-tva-metal">Listo. Pulsa INICIAR ESCANEO para recorrer los nodos del mapa y analizar las divergencias guardadas.</span>}
            {log.map((l, i) => <div key={i} className={l.includes("⚠") ? "text-tva-orange" : ""}>{l}</div>)}
          </div>
          <div className="absolute bottom-0 left-0 h-1 bg-tva-amber transition-all" style={{ width: `${progress}%` }} />
        </div>
        <button className="btn btn-amber w-full mt-2" onClick={start} disabled={running}>{running ? <span className="blink">ESCANEANDO…</span> : "▶ INICIAR ESCANEO"}</button>
      </Panel>

      <Panel title={`Anomalías (${list.length})`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 mb-2">
          <select className="input !py-1 !text-[10px]" value={sev} onChange={(e) => setSev(e.target.value as Severity | "all")}><option value="all">Gravedad: todas</option>{(Object.keys(sevLabel) as Severity[]).map((k) => <option key={k} value={k}>{sevLabel[k]}</option>)}</select>
          <select className="input !py-1 !text-[10px]" value={type} onChange={(e) => setType(e.target.value as AnomalyType | "all")}><option value="all">Tipo: todos</option>{(Object.keys(TYPE_LABEL) as AnomalyType[]).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}</select>
          <select className="input !py-1 !text-[10px]" value={sector} onChange={(e) => setSector(e.target.value)}><option value="all">Sector: todos</option>{sectors.map((k) => <option key={k}>{k}</option>)}</select>
          <select className="input !py-1 !text-[10px]" value={state} onChange={(e) => setState(e.target.value as "open" | "resolved" | "all")}><option value="open">Abiertas</option><option value="resolved">Resueltas</option><option value="all">Todas</option></select>
        </div>
        <div className="space-y-1">
          {list.length === 0 && <div className="text-tva-metal text-xs">Sin anomalías con esos filtros.</div>}
          {list.map((a) => <AnomalyRow key={a.id} a={a} onResolve={() => { resolveAnomaly(a.id); sfx.confirm(); }} onFocus={() => a.branchId && focusBranch(a.branchId)} onVariant={() => setView("variants")} />)}
        </div>
      </Panel>
    </div>
  );
}

function AnomalyRow({ a, onResolve, onFocus, onVariant }: { a: Anomaly; onResolve: () => void; onFocus: () => void; onVariant: () => void }) {
  return (
    <div className="border border-tva-olive-dark bg-black/30 p-2 text-xs flex flex-col gap-1" style={{ borderLeft: `3px solid ${sevColor[a.severity]}`, opacity: a.resolved ? 0.55 : 1 }}>
      <div className="flex items-center justify-between gap-2"><span className="text-tva-cream truncate">{a.title}</span><Chip text={sevLabel[a.severity]} color={sevColor[a.severity]} /></div>
      <div className="text-[10px] text-tva-metal">{TYPE_LABEL[a.type]} · {a.sector} · {fmtTime(a.detectedAt)} {a.resolved && "· RESUELTA"}</div>
      <div className="text-[11px] text-tva-cream/80">{a.detail}</div>
      {!a.resolved && <div className="flex gap-1 flex-wrap">
        {a.branchId && <button className="btn !py-1 !text-[10px]" onClick={onFocus}>Centrar en mapa</button>}
        {a.variantId && <button className="btn !py-1 !text-[10px]" onClick={onVariant}>Expediente</button>}
        <button className="btn btn-amber !py-1 !text-[10px]" onClick={onResolve}>Resolver</button>
      </div>}
    </div>
  );
}
