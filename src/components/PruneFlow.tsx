"use client";
import { useEffect, useState } from "react";
import { useTVA } from "@/store/useTVA";
import { descendantsOf } from "@/lib/simulation";
import { rankFor } from "@/lib/types";
import { Chip, Meter, Modal, statusColor, statusLabel } from "./ui";
import { sfx, unlockAudio, vibrate } from "@/lib/audio";
import { verifySecret } from "@/lib/auth";

export default function PruneFlow() {
  const { prune, world, creds, setPrunePhase, cancelPrune, closePrune, setView } = useTVA();
  const [count, setCount] = useState(3);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [ack, setAck] = useState(false);
  const [lines, setLines] = useState<string[]>([]);

  const branch = prune ? (prune.replayBranch ?? world?.branches.find((b) => b.id === prune.branchId)) : null;

  // Fase C: preparación → cuenta regresiva y mensajes técnicos
  useEffect(() => {
    if (!prune || prune.phase !== "prepare") return;
    setCount(3); setLines([]); unlockAudio(); sfx.charge(); vibrate(60, world?.settings.vibration ?? false);
    const msgs = ["Cargando vara de poda ............ 34%", "Alineando colimador temporal ....... OK", "Coordenadas confirmadas ............ OK", "Energía al 100% — PULSO LISTO"];
    msgs.forEach((m, i) => setTimeout(() => setLines((l) => [...l, m]), i * 650));
    const t1 = setTimeout(() => setCount(2), 1000), t2 = setTimeout(() => setCount(1), 2000), t3 = setTimeout(() => { if (useTVA.getState().prune?.phase === "prepare") { sfx.pulse(); vibrate([30, 30, 120], world?.settings.vibration ?? false); setPrunePhase("pulse"); } }, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [prune?.phase, prune?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (prune?.phase === "disintegrate") sfx.disintegrate(); if (prune?.phase === "report") { sfx.complete(); vibrate([50, 50, 50, 50, 200], world?.settings.vibration ?? false); } }, [prune?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!prune || !world || !branch) return null;
  const desc = prune.replay ? (prune.report?.pruneSnapshot?.descendants ?? []) : descendantsOf(branch.id, world.branches);
  const vars = prune.replay ? (prune.report?.pruneSnapshot?.variants ?? []) : world.variants.filter((v) => v.branchId === branch.id);
  const required = branch.divergence > 85 ? 3 : branch.divergence > 55 ? 2 : 1;
  const clearance = rankFor(world.profile.xp).clearance;
  const authorized = clearance >= required;

  async function authorize() {
    if (!creds) return; setPinErr("");
    if (!(await verifySecret(creds, pin))) { setPinErr("Credencial incorrecta. Autorización denegada."); sfx.deny(); setPin(""); return; }
    setPin(""); sfx.confirm(); setPrunePhase("prepare");
  }

  // Fase A: selección (sin modal, sólo indicador)
  if (prune.phase === "select") return <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[65] panel px-4 py-2 text-tva-amber text-xs tracking-[.2em] fade-up">◎ FIJANDO OBJETIVO {branch.id}…</div>;

  // Fase B: autorización
  if (prune.phase === "authorize") return (
    <Modal title="Autorización de poda temporal" wide>
      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-lg text-tva-amber">{branch.id}</span><Chip text={statusLabel[branch.status]} color={statusColor[branch.status]} /></div>
          <div className="text-tva-cream">{branch.label}</div>
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            <span className="label">Variante(s)</span><span>{vars.length ? vars.map((v) => `${v.id} (${v.alias})`).join(", ") : "ninguno"}</span>
            <span className="label">Sector / Época</span><span>{branch.sector} · {branch.epoch}</span>
            <span className="label">Origen</span><span>{branch.parentId} @ T={branch.originT}</span>
            <span className="label">Nivel requerido</span><span style={{ color: authorized ? "#9cff57" : "#ff3b3b" }}>Autorización {required} (tienes {clearance})</span>
          </div>
          <div><div className="flex justify-between text-[10px]"><span className="label">Nivel de divergencia</span><span>{branch.divergence}%</span></div><Meter value={branch.divergence} color="#ff6a1a" /></div>
        </div>
        <div className="space-y-2">
          <div className="label text-tva-amber">Consecuencias simuladas</div>
          <ul className="text-[11px] space-y-1 text-tva-cream/85 list-disc pl-4">
            <li>La rama y sus {desc.length} dependientes serán retiradas del mapa activo.</li>
            <li>{vars.length} expediente(s) de variante pasarán a estado «Archivado».</li>
            <li>Integridad estimada tras la poda: <span className="text-tva-green">+{Math.round(4 + branch.divergence * 0.08 + desc.length * 3)}%</span>.</li>
            <li>La operación quedará registrada de forma permanente en el archivo.</li>
          </ul>
          {desc.length > 0 && (
            <div className="border border-tva-orange/60 bg-tva-orange/10 p-2">
              <div className="label text-tva-orange mb-1">⚠ Dependencias detectadas</div>
              <div className="text-[11px]">{desc.map((d) => <div key={d.id}>{d.id} · {d.label} · div {d.divergence}%</div>)}</div>
              <label className="flex items-center gap-2 mt-2 text-[11px]"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Autorizo la poda en cascada de las {desc.length} ramas dependientes.</label>
            </div>
          )}
          <div className="label">Confirma tu credencial de agente</div>
          <input className="input" type="password" inputMode={creds?.kind === "pin" ? "numeric" : "text"} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN / contraseña" />
          {pinErr && <div className="text-tva-orange text-[11px]">{pinErr}</div>}
          {!authorized && <div className="text-tva-orange text-[11px]">Tu rango no alcanza el nivel requerido. Completa misiones para ascender.</div>}
        </div>
      </div>
      <div className="flex gap-2 justify-end mt-4">
        <button className="btn btn-ghost" onClick={cancelPrune}>Cancelar (sin cambios)</button>
        <button className="btn btn-danger" disabled={!authorized || !pin || (desc.length > 0 && !ack)} onClick={authorize}>AUTORIZAR PODA</button>
      </div>
    </Modal>
  );

  // Fase C/D/E: HUD de operación (sobre el mapa)
  if (prune.phase === "prepare" || prune.phase === "pulse" || prune.phase === "disintegrate") {
    const elapsed = prune.phase === "disintegrate" ? Math.min(100, ((Date.now() - prune.startedAt) / prune.durationMs) * 100) : 0;
    return (
      <>
        <div className="fixed top-14 left-2 right-2 z-[65] pointer-events-none flex justify-between gap-2">
          <div className="panel px-3 py-2 text-[10px] text-tva-metal w-full sm:w-72">
            <div className="text-tva-amber tracking-[.2em] mb-1">{prune.replay ? "REPRODUCCIÓN DE ARCHIVO" : "MODO OPERACIÓN"} · {branch.id}</div>
            {prune.phase === "prepare" && <>
              <div className="text-4xl text-tva-cream text-center my-1 value">{count}</div>
              {lines.map((l, i) => <div key={i} className={i === lines.length - 1 ? "text-tva-green" : ""}>{l}</div>)}
            </>}
            {prune.phase === "pulse" && <div className="text-tva-green glow">PULSO DE ENERGÍA EN TRÁNSITO ▸▸▸</div>}
            {prune.phase === "disintegrate" && <><div className="text-tva-orange blink">DESINTEGRACIÓN PROGRESIVA</div><DisProgress start={prune.startedAt} dur={prune.durationMs} /></>}
            <div className="mt-1">COORD {branch.sector} · T={branch.originT} · DISPOSITIVO: {prune.phase === "prepare" ? "CARGANDO" : "ACTIVO"} · {elapsed.toFixed(0)}%</div>
          </div>
        </div>
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[65]">
          <button className="btn btn-ghost !text-[10px]" onClick={() => { cancelPrune(); }}>Abortar secuencia{prune.replay ? "" : " (la rama se conserva)"}</button>
        </div>
      </>
    );
  }

  // Fase F: informe
  const rep = prune.report;
  return (
    <Modal title={prune.replay ? "Reproducción finalizada" : "Informe final de poda"} onClose={closePrune}>
      <div className="space-y-3 text-xs">
        <div className="text-tva-green text-base tracking-[.2em] glow text-center py-2">{prune.replay ? "SECUENCIA ARCHIVADA REPRODUCIDA" : "RAMA PODADA CON ÉXITO"}</div>
        <div className="grid grid-cols-2 gap-1 text-[11px]">
          <span className="label">Rama</span><span>{branch.id} · {branch.label}</span>
          <span className="label">Dependientes retiradas</span><span>{desc.length}</span>
          <span className="label">Variantes archivados</span><span>{vars.length}</span>
          <span className="label">Duración</span><span>{(prune.durationMs / 1000).toFixed(1)} s</span>
          <span className="label">Integridad actual</span><span className="text-tva-green">{world.integrity}%</span>
          {rep && <><span className="label">Registro</span><span>{rep.id}</span></>}
        </div>
        {rep && <div className="text-[11px] text-tva-cream/80 border-l-2 border-tva-amber pl-2">{rep.summary}</div>}
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={() => { closePrune(); setView("archive"); }}>Ver archivo</button>
          <button className="btn btn-amber" onClick={closePrune}>Cerrar</button>
        </div>
      </div>
    </Modal>
  );
}

function DisProgress({ start, dur }: { start: number; dur: number }) {
  const [p, setP] = useState(0);
  useEffect(() => { const id = setInterval(() => setP(Math.min(100, ((Date.now() - start) / dur) * 100)), 100); return () => clearInterval(id); }, [start, dur]);
  return <Meter value={p} color="#ff6a1a" className="mt-1" />;
}
