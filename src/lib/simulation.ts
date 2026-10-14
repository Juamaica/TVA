import { Anomaly, Branch, Severity, TVAEvent, Variant, WorldState, MAIN_BRANCH_ID, Vec3 } from "./types";
import { EPOCHS, SECTORS, UNIVERSES, makeSignature, uid } from "./seed";

// ── Geometría: cada rama se calcula a partir de su modelo de datos ────────
export function branchPoints(b: Branch, all: Branch[], segments = 32): Vec3[] {
  if (b.kind === "main") return [];
  const parent = all.find((p) => p.id === b.parentId);
  const origin = parent ? pointOnBranch(parent, all, b.originT) : { x: b.originT, y: 0, z: 0 };
  const pts: Vec3[] = [];
  const d = b.direction;
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  const nx = d.x / len, ny = d.y / len, nz = d.z / len;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const s = t * b.length;
    const bend = b.curve * s * s * 0.08;
    pts.push({
      x: origin.x + nx * s + Math.sin(t * Math.PI * 1.5) * b.curve * 0.6,
      y: origin.y + ny * s + bend * 0.5,
      z: origin.z + nz * s - bend,
    });
  }
  return pts;
}

export function pointOnBranch(b: Branch, all: Branch[], t: number): Vec3 {
  if (b.kind === "main") return { x: t, y: 0, z: 0 };
  const pts = branchPoints(b, all);
  const f = Math.max(0, Math.min(1, t / Math.max(1, b.length)));
  const idx = Math.min(pts.length - 1, Math.floor(f * (pts.length - 1)));
  return pts[idx];
}

export function descendantsOf(id: string, all: Branch[]): Branch[] {
  const out: Branch[] = [];
  const walk = (pid: string) => {
    for (const b of all) if (b.parentId === pid && b.status !== "pruned") { out.push(b); walk(b.id); }
  };
  walk(id);
  return out;
}

export const activeBranches = (w: WorldState) => w.branches.filter((b) => b.status !== "pruned");

// ── Métricas ──────────────────────────────────────────────────────────────
export function computeIntegrity(w: WorldState): number {
  const act = activeBranches(w).filter((b) => b.kind !== "main");
  let score = 96;
  for (const b of act) {
    if (b.status === "critical" || b.kind === "nexus") score -= 11;
    else if (b.status === "unstable") score -= 6;
    else score -= 2;
    score -= b.divergence * 0.04;
  }
  for (const a of w.anomalies) if (!a.resolved) score -= a.severity === "critical" ? 5 : a.severity === "high" ? 3 : 1;
  for (const v of w.variants) if (v.status !== "contained" && v.status !== "archived") score -= v.threat * 0.03;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export const sevRank: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

// ── Escáner: encuentra anomalías REALES del modelo según reglas ───────────
export function runScanRules(w: WorldState): Anomaly[] {
  const now = Date.now();
  const found: Anomaly[] = [];
  const existing = new Set(w.anomalies.filter((a) => !a.resolved).map((a) => `${a.type}:${a.branchId ?? ""}:${a.variantId ?? ""}`));
  const push = (a: Omit<Anomaly, "id" | "detectedAt" | "resolved">) => {
    const key = `${a.type}:${a.branchId ?? ""}:${a.variantId ?? ""}`;
    if (existing.has(key)) return;
    existing.add(key);
    found.push({ ...a, id: uid("AN"), detectedAt: now, resolved: false });
  };
  for (const b of activeBranches(w)) {
    if (b.kind === "main") continue;
    if (b.kind === "nexus" || b.divergence >= 85)
      push({ type: "nexus", severity: "critical", branchId: b.id, variantId: null, sector: b.sector, title: `Evento Nexus en ${b.id}`, detail: `Divergencia ${b.divergence}% supera el umbral de línea roja. Requiere poda o estabilización inmediata.` });
    else if (b.divergence >= 50)
      push({ type: "divergence", severity: b.divergence >= 70 ? "high" : "medium", branchId: b.id, variantId: null, sector: b.sector, title: `Divergencia elevada en ${b.id}`, detail: `${b.label}: divergencia ${b.divergence}%, estabilidad ${b.stability}%.` });
    if (b.stability < 35)
      push({ type: "instability", severity: b.stability < 20 ? "critical" : "high", branchId: b.id, variantId: null, sector: b.sector, title: `Rama inestable ${b.id}`, detail: `Estabilidad ${b.stability}%. Riesgo de colapso en cascada sobre ${descendantsOf(b.id, w.branches).length} dependientes.` });
  }
  for (const v of w.variants) {
    if (v.status === "detected" && v.threat >= 60)
      push({ type: "signature", severity: v.threat >= 85 ? "critical" : "high", branchId: v.branchId, variantId: v.id, sector: w.branches.find((b) => b.id === v.branchId)?.sector ?? "DESCONOCIDO", title: `Firma activa ${v.signature}`, detail: `${v.name} (${v.alias}) con índice de amenaza ${v.threat} sin investigar.` });
    if (v.branchId === null && v.status !== "archived" && v.status !== "contained")
      push({ type: "integrity", severity: "medium", branchId: null, variantId: v.id, sector: "SIN ANCLAJE", title: `Variante sin rama: ${v.id}`, detail: `${v.name} perdió su rama de origen. Reasignar o archivar.` });
  }
  const integ = computeIntegrity(w);
  if (integ < w.settings.crisisThreshold)
    push({ type: "integrity", severity: "critical", branchId: null, variantId: null, sector: "NEXO CENTRAL", title: "Integridad de la Sagrada Línea comprometida", detail: `Integridad ${integ}% por debajo del umbral ${w.settings.crisisThreshold}%.` });
  return found;
}

// ── Eventos dinámicos ─────────────────────────────────────────────────────
export interface EventOutcome { event: TVAEvent; branch?: Branch; variant?: Variant; integrityDelta?: number; notify?: { title: string; body: string } }

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function newBranchFrom(parent: Branch, all: Branch[], opts?: Partial<Branch>): Branch {
  const id = uid("BR");
  const mainActive = all.filter((b) => b.kind !== "main" && b.status !== "pruned");
  const originT = parent.kind === "main" ? Math.round(rnd(-40, 40) + (mainActive.length > 6 ? rnd(-30, 30) : 0)) : Math.round(rnd(2, parent.length - 1));
  const divergence = Math.round(rnd(20, 95));
  return {
    id, label: pick(["Fractura", "Eco", "Bifurcación", "Deriva", "Fisura", "Resonancia"]) + " " + pick(["Delta", "Omega", "Sigma", "Kappa", "Theta", "Zeta"]),
    kind: divergence > 85 ? "nexus" : divergence < 30 ? "echo" : "divergence",
    status: divergence > 85 ? "critical" : divergence > 55 ? "unstable" : "stable",
    parentId: parent.id, originT, length: Math.round(rnd(6, 16)),
    direction: { x: rnd(0.4, 1), y: rnd(-0.9, 0.9), z: rnd(-0.9, 0.9) }, curve: rnd(0.1, 0.7),
    divergence, stability: Math.round(100 - divergence * rnd(0.6, 1)), sector: pick(SECTORS), epoch: pick(EPOCHS),
    variantIds: [], createdAt: Date.now(), inspected: false, notes: "", ...opts,
  };
}

export function newVariantFor(branch: Branch | null): Variant {
  const n = Math.floor(rnd(100, 999));
  const letter = pick(["A", "D", "G", "K", "L", "R", "T", "V", "Z"]);
  return {
    id: `VR-${letter}${n}`, name: `Variante ${letter}-${n}`, alias: pick(["El Cartógrafo", "La Centinela", "El Relojero", "La Sombra", "El Heraldo", "La Viajera", "El Ingeniero", "La Oráculo"]),
    avatarSeed: Math.floor(rnd(1, 999)), signature: makeSignature(), universe: pick(UNIVERSES), epoch: branch?.epoch ?? pick(EPOCHS),
    coords: { x: +rnd(-99, 99).toFixed(1), y: +rnd(-99, 99).toFixed(1), z: +rnd(-99, 99).toFixed(1) },
    divergencePoint: pick(["Decisión alterada", "Artefacto fuera de época", "Muerte evitada", "Mensaje interceptado", "Tecnología prematura"]),
    branchId: branch?.id ?? null, threat: Math.round(rnd(10, 98)), status: "detected", discoveredAt: Date.now(),
    history: [{ at: Date.now(), text: `Firma registrada${branch ? ` en ${branch.id}` : ""}` }], notes: "", relatedVariantIds: [], tracked: false,
  };
}

export function generateEvent(w: WorldState): EventOutcome | null {
  const act = activeBranches(w);
  const main = act.find((b) => b.id === MAIN_BRANCH_ID || b.kind === "main")!;
  const nonMain = act.filter((b) => b.kind !== "main");
  const roll = Math.random();
  const now = Date.now();
  const base = { id: uid("EV"), at: now, read: false } as const;

  if (roll < 0.3 || nonMain.length < 2) {
    const parent = Math.random() < 0.75 || nonMain.length === 0 ? main : pick(nonMain);
    const b = newBranchFrom(parent, w.branches);
    const isNexus = b.kind === "nexus";
    return {
      branch: b, integrityDelta: isNexus ? -8 : -3,
      event: { ...base, priority: isNexus ? "critical" : "high", kind: isNexus ? "nexus" : "divergence", title: isNexus ? `⚠ EVENTO NEXUS: ${b.id}` : `Nueva divergencia ${b.id}`, detail: `${b.label} se ramifica desde ${parent.id} en ${b.sector} (${b.epoch}). Divergencia ${b.divergence}%.`, branchId: b.id },
      notify: { title: isNexus ? "TVA · EVENTO NEXUS" : "TVA · Nueva ramificación", body: `${b.id} está saliendo de la línea temporal (${b.divergence}% divergencia). Requiere poda.` },
    };
  }
  if (roll < 0.5) {
    const b = pick(nonMain);
    const v = newVariantFor(b);
    return {
      variant: v, integrityDelta: -2,
      event: { ...base, priority: v.threat > 70 ? "high" : "medium", kind: "signature", title: `Firma desconocida ${v.signature}`, detail: `${v.name} detectado en ${b.id}. Amenaza ${v.threat}.`, branchId: b.id, variantId: v.id },
      notify: v.threat > 70 ? { title: "TVA · Señal de variante", body: `${v.name} (amenaza ${v.threat}) en ${b.id}.` } : undefined,
    };
  }
  if (roll < 0.7) {
    const b = pick(nonMain);
    const nb: Branch = { ...b, stability: Math.max(5, b.stability - Math.round(rnd(10, 25))), divergence: Math.min(100, b.divergence + Math.round(rnd(5, 15))) };
    nb.status = nb.stability < 25 ? "critical" : nb.stability < 55 ? "unstable" : nb.status;
    return {
      branch: nb, integrityDelta: -4,
      event: { ...base, priority: nb.status === "critical" ? "critical" : "high", kind: "instability", title: `Rama inestable ${b.id}`, detail: `Estabilidad cae a ${nb.stability}%. ${nb.status === "critical" ? "Colapso inminente." : "Vigilar."}`, branchId: b.id },
      notify: nb.status === "critical" ? { title: "TVA · Alerta de integridad", body: `${b.id} entra en estado crítico.` } : undefined,
    };
  }
  if (roll < 0.85) {
    const v = pick(w.variants.filter((x) => x.status !== "archived"));
    if (!v) return null;
    return { event: { ...base, priority: "medium", kind: "request", title: `Solicitud de investigación: ${v.id}`, detail: `El Consejo solicita actualizar el expediente de ${v.name}.`, variantId: v.id } };
  }
  return { event: { ...base, priority: "low", kind: "mission", title: "Informe de rutina", detail: `Integridad actual ${w.integrity}%. ${nonMain.length} ramas activas monitorizadas.` }, integrityDelta: +1 };
}

// ── Asistente simulado (reglas locales; no hay IA remota) ─────────────────
export function assistantAnswer(w: WorldState, query: string): string {
  const q = query.toLowerCase();
  const act = activeBranches(w).filter((b) => b.kind !== "main");
  const open = w.anomalies.filter((a) => !a.resolved);
  const lines: string[] = [];
  if (/anomal|resumen|estado|situaci/.test(q) || q.trim() === "") {
    lines.push(`▸ ESTADO: integridad ${w.integrity}% ${w.crisis ? "(MODO CRISIS ACTIVO)" : ""}. ${act.length} ramas activas, ${open.length} anomalías abiertas.`);
    const crit = act.filter((b) => b.status === "critical");
    if (crit.length) lines.push(`▸ Ramas críticas: ${crit.map((b) => `${b.id} (div ${b.divergence}%)`).join(", ")}. Recomendación: autorizar poda.`);
    const sev = open.filter((a) => a.severity === "critical");
    if (sev.length) lines.push(`▸ ${sev.length} anomalías críticas pendientes: ${sev.slice(0, 3).map((a) => a.title).join("; ")}.`);
  }
  if (/variante|relaci|vincul/.test(q)) {
    const rel = w.variants.filter((v) => v.relatedVariantIds.length);
    lines.push(rel.length ? `▸ RELACIONES: ${rel.map((v) => `${v.id} ↔ ${v.relatedVariantIds.join(", ")}`).join(" | ")}.` : "▸ No hay relaciones registradas entre variantes.");
    const top = [...w.variants].sort((a, b) => b.threat - a.threat)[0];
    if (top) lines.push(`▸ Mayor amenaza: ${top.name} "${top.alias}" (${top.threat}) en ${top.branchId ?? "sin rama"}, estado ${top.status}.`);
  }
  if (/diverg|explica|por qu/.test(q)) {
    const b = [...act].sort((a, c) => c.divergence - a.divergence)[0];
    if (b) lines.push(`▸ DIVERGENCIA: ${b.id} "${b.label}" nace en T=${b.originT} de ${b.parentId}. Con ${b.divergence}% la rama ya no converge con la Sagrada Línea; cada hora simulada añade entropía y arrastra ${descendantsOf(b.id, w.branches).length} dependientes.`);
  }
  if (/recomend|qué hago|que hago|siguiente|misi/.test(q)) {
    const m = w.missions.find((x) => !x.completed);
    if (m) lines.push(`▸ MISIÓN SUGERIDA: "${m.title}" — ${m.objective} (${m.progress}/${m.target}).`);
    const v = w.variants.find((x) => x.status === "detected");
    if (v) lines.push(`▸ Abre el expediente de ${v.id} y márcalo "Bajo investigación".`);
    const u = act.find((b) => !b.inspected);
    if (u) lines.push(`▸ Inspecciona ${u.id} en el mapa para obtener telemetría.`);
  }
  if (/poda|informe/.test(q)) {
    const p = [...w.operations].reverse().find((o) => o.type === "prune" && o.result === "success");
    lines.push(p ? `▸ ÚLTIMA PODA: ${p.title}. ${p.summary}` : "▸ Aún no se ha ejecutado ninguna poda.");
  }
  if (!lines.length) lines.push("▸ Consulta no reconocida. Prueba: 'resumen', 'variantes', 'divergencia', 'recomendaciones', 'poda'.");
  return lines.join("\n");
}
