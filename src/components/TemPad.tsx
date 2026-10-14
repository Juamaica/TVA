"use client";
import { useEffect, useRef, useState } from "react";
import { useTVA } from "@/store/useTVA";
import { EPOCHS, SECTORS } from "@/lib/seed";
import { Meter, Panel, fmtTime } from "./ui";
import { sfx, unlockAudio, vibrate } from "@/lib/audio";

export default function TemPad() {
  const world = useTVA((s) => s.world!);
  const { setTempad, log, progressMission, showToast } = useTVA();
  const t = world.tempad;
  const [confirm, setConfirm] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms / world.settings.animSpeed));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Estados reales: idle → init → ready → open → closing → idle
  function initialize() {
    unlockAudio(); setLines(["▸ Encendiendo TemPad…"]); setTempad({ status: "init", sync: 0 }); sfx.charge();
    [20, 45, 70, 100].forEach((s, i) => later(() => { setTempad({ sync: s }); setLines((l) => [...l, `▸ Sincronización ${s}%${s === 100 ? " — LISTO" : ""}`]); if (s === 100) { setTempad({ status: "ready" }); sfx.confirm(); } }, 500 * (i + 1)));
  }
  function openPortal() {
    if (t.energy < 15) { showToast("Energía insuficiente", "err"); sfx.deny(); return; }
    setConfirm(false); setTempad({ status: "open", energy: Math.max(0, t.energy - 15), history: [{ at: Date.now(), epoch: t.epoch, sector: t.sector, coords: t.coords }, ...t.history].slice(0, 30) });
    setLines((l) => [...l, `▸ Portal abierto → ${t.epoch} · ${t.sector}`, "▸ (Simulación: no se produce ningún viaje real)"]);
    sfx.portalOpen(); vibrate([40, 40, 160], world.settings.vibration);
    log({ type: "tempad", title: `Portal TemPad → ${t.sector}`, summary: `${t.epoch} · coord (${t.coords.x}, ${t.coords.y}, ${t.coords.z})`, result: "success" });
  }
  function closePortal() {
    setTempad({ status: "closing" }); sfx.portalClose(); setLines((l) => [...l, "▸ Cerrando portal…"]);
    later(() => { setTempad({ status: "ready" }); setLines((l) => [...l, "▸ Portal cerrado. TemPad listo."]); progressMission("tempad"); }, 900);
  }
  function shutdown() { setTempad({ status: "idle", sync: 0 }); setLines([]); }
  const recharge = () => { setTempad({ energy: Math.min(100, t.energy + 25) }); sfx.tick(); };

  const statusText = { idle: "INACTIVO", init: "INICIALIZANDO", ready: "LISTO", open: "PORTAL ABIERTO", closing: "CERRANDO" }[t.status];
  const statusColor = { idle: "#8a8f85", init: "#f5a524", ready: "#9cff57", open: "#ff6a1a", closing: "#f5a524" }[t.status];

  return (
    <div className="p-2 space-y-2 safe-b">
      <div className="panel p-3 bg-gradient-to-b from-[#2a2f21] to-[#101309] border-2 border-[#5c6b3a]" style={{ borderRadius: 14 }}>
        <div className="flex justify-between items-center mb-2 text-[10px] tracking-[.25em]"><span className="text-tva-amber">TEMPAD · MK-VII</span><span style={{ color: statusColor }} className={t.status === "init" || t.status === "closing" ? "blink" : ""}>{statusText}</span></div>
        {/* pantalla del dispositivo */}
        <div className="relative h-56 border border-tva-olive bg-black overflow-hidden grid-bg flex items-center justify-center">
          {t.status === "open" && <div className="portal-open absolute w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, #fff6d0 0%, #f5a524 30%, #ff6a1a 55%, transparent 70%)", boxShadow: "0 0 60px #f5a524, inset 0 0 40px #ff6a1a", filter: "blur(.5px)" }} />}
          {t.status === "closing" && <div className="portal-close absolute w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, #fff6d0 0%, #f5a524 30%, #ff6a1a 55%, transparent 70%)", boxShadow: "0 0 60px #f5a524" }} />}
          {t.status === "open" && <div className="absolute w-40 h-40 rounded-full border-2 border-tva-amber spin" style={{ borderStyle: "dashed" }} />}
          {t.status === "idle" && <div className="text-tva-metal text-xs tracking-[.3em]">— SIN ENERGÍA DE PORTAL —</div>}
          {t.status === "init" && <div className="w-2/3"><div className="label text-center mb-1">Sincronizando con el Nexo</div><Meter value={t.sync} color="#f5a524" /></div>}
          {t.status === "ready" && <div className="text-center"><div className="text-tva-green text-xs tracking-[.3em] glow">DESTINO FIJADO</div><div className="text-tva-cream text-sm mt-1">{t.epoch}</div><div className="text-tva-metal text-[10px]">{t.sector} · ({t.coords.x}, {t.coords.y}, {t.coords.z})</div></div>}
          <div className="absolute top-1 left-2 text-[9px] text-tva-metal">E {t.energy}% · S {t.sync}%</div>
          <div className="absolute bottom-1 right-2 text-[9px] text-tva-metal value">{new Date().toLocaleTimeString("es")}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
          <div><div className="label mb-1">Energía</div><Meter value={t.energy} color={t.energy < 30 ? "#ff3b3b" : "#9cff57"} /></div>
          <div><div className="label mb-1">Sincronización</div><Meter value={t.sync} color="#f5a524" /></div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <select className="input !text-xs" value={t.epoch} onChange={(e) => setTempad({ epoch: e.target.value })} disabled={t.status === "open" || t.status === "closing"}>{EPOCHS.map((e) => <option key={e}>{e}</option>)}</select>
          <select className="input !text-xs" value={t.sector} onChange={(e) => setTempad({ sector: e.target.value })} disabled={t.status === "open" || t.status === "closing"}>{SECTORS.map((e) => <option key={e}>{e}</option>)}</select>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {(["x", "y", "z"] as const).map((k) => <label key={k} className="text-[10px] text-tva-metal">{k.toUpperCase()}<input type="number" step="0.1" className="input !py-1 !text-xs" value={t.coords[k]} onChange={(e) => setTempad({ coords: { ...t.coords, [k]: +e.target.value } })} disabled={t.status === "open"} /></label>)}
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {t.status === "idle" && <button className="btn btn-amber flex-1" onClick={initialize}>⏻ Inicializar</button>}
          {t.status === "ready" && <><button className="btn btn-amber flex-1" onClick={() => setConfirm(true)}>◎ Abrir portal</button><button className="btn btn-ghost" onClick={shutdown}>Apagar</button></>}
          {t.status === "open" && <button className="btn btn-danger flex-1" onClick={closePortal}>✕ Cerrar portal</button>}
          <button className="btn" onClick={recharge} disabled={t.energy >= 100}>⚡ Recargar</button>
        </div>
        {confirm && <div className="mt-2 border border-tva-amber bg-tva-amber/10 p-2 text-xs fade-up">
          <div className="text-tva-amber mb-1">Confirmar destino ficticio:</div>
          <div>{t.epoch} · {t.sector} · ({t.coords.x}, {t.coords.y}, {t.coords.z})</div>
          <div className="flex gap-2 mt-2 justify-end"><button className="btn btn-ghost !py-1" onClick={() => setConfirm(false)}>Cancelar</button><button className="btn btn-amber !py-1" onClick={openPortal}>Confirmar</button></div>
        </div>}
        <div className="mt-2 h-20 overflow-y-auto text-[10px] text-tva-green/80 border border-tva-olive-dark bg-black/40 p-1">{lines.map((l, i) => <div key={i}>{l}</div>)}{lines.length === 0 && <span className="text-tva-metal">Registro del dispositivo</span>}</div>
      </div>
      <Panel title="Historial de destinos">
        {t.history.length === 0 && <div className="text-tva-metal text-xs">Sin destinos registrados.</div>}
        {t.history.map((h, i) => <div key={i} className="text-[11px] flex justify-between border-b border-tva-olive-dark py-1"><span>{h.epoch} · {h.sector}</span><span className="text-tva-metal">{fmtTime(h.at)}</span></div>)}
      </Panel>
    </div>
  );
}
