"use client";
import { ReactNode, useEffect, useState } from "react";
import { BranchStatus, Severity, VariantStatus } from "@/lib/types";

export function Panel({ title, right, children, className = "" }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {title && <div className="panel-title"><span>{title}</span>{right}</div>}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Meter({ value, color = "#9cff57", className = "" }: { value: number; color?: string; className?: string }) {
  return <div className={`meter ${className}`}><i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color, boxShadow: `0 0 8px ${color}` }} /></div>;
}

export function Stat({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className="value text-lg font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}

export const sevColor: Record<Severity, string> = { low: "#8a8f85", medium: "#f5a524", high: "#ff6a1a", critical: "#ff3b3b" };
export const sevLabel: Record<Severity, string> = { low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" };
export const statusColor: Record<BranchStatus, string> = { stable: "#9cff57", unstable: "#f5a524", critical: "#ff3b3b", nexus: "#ff6a1a", pruned: "#555" };
export const statusLabel: Record<BranchStatus, string> = { stable: "Estable", unstable: "Inestable", critical: "Crítica", nexus: "Nexus", pruned: "Podada" };
export const vStatusLabel: Record<VariantStatus, string> = { detected: "Detectado", investigating: "Bajo investigación", located: "Localizado", contained: "Contenido", archived: "Archivado" };
export const vStatusColor: Record<VariantStatus, string> = { detected: "#ff6a1a", investigating: "#f5a524", located: "#9cff57", contained: "#5bc0eb", archived: "#8a8f85" };

export function Chip({ text, color }: { text: string; color: string }) {
  return <span className="chip" style={{ color, borderColor: color, background: `${color}14` }}>{text}</span>;
}

export function Typewriter({ text, speed = 18, className = "" }: { text: string; speed?: number; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => { setN(0); const id = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(id), x) : x + 1)), speed); return () => clearInterval(id); }, [text, speed]);
  return <span className={className}>{text.slice(0, n)}{n < text.length && <span className="blink">▌</span>}</span>;
}

export function fmtTime(t: number) {
  const d = new Date(t);
  return d.toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function fmtTC(t: number) {
  // "código temporal" ficticio
  const s = Math.floor(t / 1000);
  return `TC ${(s % 100000).toString().padStart(5, "0")}.${Math.floor((t % 1000) / 10).toString().padStart(2, "0")}`;
}

export function Avatar({ seed, size = 48, dataUrl }: { seed: number; size?: number; dataUrl?: string }) {
  if (dataUrl) return <img src={dataUrl} alt="" width={size} height={size} className="object-cover border border-tva-olive" style={{ width: size, height: size }} />;
  const h = (seed * 137.5) % 360;
  const cells: boolean[] = [];
  let x = seed * 9301 + 49297;
  for (let i = 0; i < 15; i++) { x = (x * 233 + 101) % 233280; cells.push((x / 233280) > 0.45); }
  return (
    <svg width={size} height={size} viewBox="0 0 5 5" className="border border-tva-olive" style={{ background: "#0b0d08" }}>
      {Array.from({ length: 25 }).map((_, i) => {
        const r = Math.floor(i / 5), c = i % 5; const mc = c > 2 ? 4 - c : c;
        return cells[r * 3 + mc] ? <rect key={i} x={c} y={r} width={1} height={1} fill={`hsl(${h} 70% 55%)`} /> : null;
      })}
    </svg>
  );
}

export function Modal({ children, onClose, title, wide }: { children: ReactNode; onClose?: () => void; title?: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-2" onClick={onClose}>
      <div className={`panel w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[92vh] overflow-y-auto fade-up`} onClick={(e) => e.stopPropagation()}>
        {title && <div className="panel-title"><span>{title}</span>{onClose && <button onClick={onClose} className="text-tva-metal hover:text-tva-amber">✕</button>}</div>}
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({ title, text, onYes, onNo, danger }: { title: string; text: ReactNode; onYes: () => void; onNo: () => void; danger?: boolean }) {
  return (
    <Modal title={title} onClose={onNo}>
      <div className="text-sm mb-4 text-tva-cream/90">{text}</div>
      <div className="flex gap-2 justify-end">
        <button className="btn btn-ghost" onClick={onNo}>Cancelar</button>
        <button className={`btn ${danger ? "btn-danger" : "btn-amber"}`} onClick={onYes}>Confirmar</button>
      </div>
    </Modal>
  );
}
