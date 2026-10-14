"use client";
import { create } from "zustand";
import {
  AgentProfile, Anomaly, Branch, Credentials, Mission, Operation, Settings, TVAEvent, Variant, VariantStatus, WorldState, MAIN_BRANCH_ID, rankFor, TemPadState,
} from "@/lib/types";
import { seedWorld, uid } from "@/lib/seed";
import { storage } from "@/lib/storage";
import { activeBranches, computeIntegrity, descendantsOf, generateEvent, runScanRules } from "@/lib/simulation";
import { configureAudio, notify, sfx, vibrate } from "@/lib/audio";

export type View = "control" | "map" | "scanner" | "variants" | "tempad" | "events" | "missions" | "archive" | "assistant" | "settings" | "profile";
export type PrunePhase = "idle" | "select" | "authorize" | "prepare" | "pulse" | "disintegrate" | "report";

export interface PruneSession {
  branchId: string;
  phase: PrunePhase;
  startedAt: number;
  durationMs: number;
  replay?: boolean;
  replayBranch?: Branch;
  report?: Operation;
}

interface TVAState {
  booted: boolean;
  hasCreds: boolean;
  creds: Credentials | null;
  unlocked: boolean;
  biometricId: string | null;
  world: WorldState | null;
  view: View;
  selectedBranchId: string | null;
  focusBranchId: string | null;
  prune: PruneSession | null;
  toast: { text: string; kind: "ok" | "warn" | "err" } | null;
  webglOk: boolean;

  boot: () => Promise<void>;
  setCreds: (c: Credentials, profile?: AgentProfile) => Promise<void>;
  setUnlocked: (v: boolean) => void;
  setBiometricId: (id: string | null) => void;
  setView: (v: View) => void;
  selectBranch: (id: string | null) => void;
  focusBranch: (id: string | null) => void;
  setWebgl: (ok: boolean) => void;
  showToast: (text: string, kind?: "ok" | "warn" | "err") => void;

  patchWorld: (fn: (w: WorldState) => Partial<WorldState>) => void;
  updateSettings: (s: Partial<Settings>) => void;
  updateProfile: (p: Partial<AgentProfile>) => void;
  log: (op: Omit<Operation, "id" | "at">) => void;
  pushEvent: (e: Omit<TVAEvent, "id" | "at" | "read">) => void;
  progressMission: (trigger: string, n?: number) => void;

  runScan: () => Anomaly[];
  resolveAnomaly: (id: string) => void;
  inspectBranch: (id: string) => void;
  createBranch: (parentId: string, data: Partial<Branch>) => Branch | null;
  stabilizeBranch: (id: string) => void;
  createVariant: (v: Partial<Variant>) => Variant;
  updateVariant: (id: string, patch: Partial<Variant>) => void;
  setVariantStatus: (id: string, s: VariantStatus) => void;
  toggleTrack: (id: string) => void;

  startPrune: (branchId: string) => void;
  setPrunePhase: (p: PrunePhase) => void;
  cancelPrune: () => void;
  finishPrune: () => void;
  replayPrune: (op: Operation) => void;
  closePrune: () => void;

  setTempad: (patch: Partial<TemPadState>) => void;
  tickEvents: () => void;
  markEventsRead: () => void;
  importWorld: (w: WorldState) => void;
  resetAll: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(w: WorldState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void storage.saveWorld(w), 250);
}

export const useTVA = create<TVAState>((set, get) => {
  const mutate = (fn: (w: WorldState) => Partial<WorldState>) => {
    const w = get().world; if (!w) return;
    const next = { ...w, ...fn(w) };
    next.integrity = computeIntegrity(next);
    // ── Modo crisis: entrada/salida con histéresis ──
    const threshold = next.settings.crisisThreshold;
    if (!next.crisis && next.integrity < threshold) {
      next.crisis = true;
      next.events = [{ id: uid("EV"), at: Date.now(), read: false, priority: "critical", kind: "crisis", title: "MODO CRISIS ACTIVADO", detail: `Integridad ${next.integrity}% < ${threshold}%. Estabiliza o poda ramas críticas.` }, ...next.events];
      next.missions = next.missions.map((m) => m.id === "M-STABLE" ? m : m);
      sfx.crisis(); vibrate([200, 100, 200, 100, 400], next.settings.vibration);
      if (next.settings.notifications) notify("TVA · MODO CRISIS", `Integridad de la línea temporal al ${next.integrity}%.`, "crisis");
    } else if (next.crisis && next.integrity >= threshold + 8) {
      next.crisis = false;
      next.events = [{ id: uid("EV"), at: Date.now(), read: false, priority: "medium", kind: "crisis", title: "Estabilidad recuperada", detail: `Integridad ${next.integrity}%. La terminal vuelve a operación normal.` }, ...next.events];
      next.operations = [{ id: uid("OP"), at: Date.now(), type: "crisis", title: "Crisis resuelta", summary: `Integridad restaurada al ${next.integrity}%.`, result: "success" }, ...next.operations];
      const r = bump(next, "crisis_resolved");
      Object.assign(next, r);
      sfx.complete();
    }
    set({ world: next });
    persist(next);
  };

  // progreso de misiones: sólo cuando ocurren acciones reales
  const bump = (w: WorldState, trigger: string, n = 1): Partial<WorldState> => {
    let xp = 0; const badges = [...w.profile.badges]; let done = 0; const newEvents: TVAEvent[] = []; const newOps: Operation[] = [];
    const missions: Mission[] = w.missions.map((m) => {
      if (m.completed || m.trigger !== trigger) return m;
      const progress = Math.min(m.target, m.progress + n);
      if (progress >= m.target) {
        xp += m.rewardXp; done++;
        if (m.badge && !badges.includes(m.badge)) badges.push(m.badge);
        newEvents.push({ id: uid("EV"), at: Date.now(), read: false, priority: "low", kind: "mission", title: `Misión completada: ${m.title}`, detail: `+${m.rewardXp} XP${m.badge ? ` · Insignia "${m.badge}"` : ""}` });
        newOps.push({ id: uid("OP"), at: Date.now(), type: "mission", title: `Misión: ${m.title}`, summary: m.objective, result: "success" });
        return { ...m, progress, completed: true, completedAt: Date.now() };
      }
      return { ...m, progress };
    });
    const before = rankFor(w.profile.xp).name, after = rankFor(w.profile.xp + xp).name;
    if (before !== after) newEvents.push({ id: uid("EV"), at: Date.now(), read: false, priority: "medium", kind: "rank", title: `ASCENSO: ${after}`, detail: `Nuevo nivel de autorización ${rankFor(w.profile.xp + xp).clearance}.` });
    if (done) sfx.complete();
    return { missions, profile: { ...w.profile, xp: w.profile.xp + xp, badges, missionsCompleted: w.profile.missionsCompleted + done }, events: [...newEvents, ...w.events], operations: [...newOps, ...w.operations] };
  };

  return {
    booted: false, hasCreds: false, creds: null, unlocked: false, biometricId: null, world: null, view: "control",
    selectedBranchId: null, focusBranchId: null, prune: null, toast: null, webglOk: true,

    boot: async () => {
      const [creds, world] = await Promise.all([storage.loadCreds(), storage.loadWorld()]);
      let bio: string | null = null;
      try { bio = localStorage.getItem("tva-nexus:bio"); } catch { /* */ }
      if (world) configureAudio(world.settings.sound, world.settings.volume);
      set({ booted: true, hasCreds: !!creds, creds, world, biometricId: bio });
    },
    setCreds: async (c, profile) => {
      await storage.saveCreds(c);
      let world = get().world;
      if (!world && profile) { world = seedWorld(profile); await storage.saveWorld(world); }
      set({ creds: c, hasCreds: true, world });
    },
    setUnlocked: (v) => set({ unlocked: v, prune: v ? get().prune : null }),
    setBiometricId: (id) => { try { id ? localStorage.setItem("tva-nexus:bio", id) : localStorage.removeItem("tva-nexus:bio"); } catch { /* */ } set({ biometricId: id }); },
    setView: (v) => set({ view: v }),
    selectBranch: (id) => set({ selectedBranchId: id }),
    focusBranch: (id) => set({ focusBranchId: id, selectedBranchId: id ?? get().selectedBranchId, view: id ? "map" : get().view }),
    setWebgl: (ok) => set({ webglOk: ok }),
    showToast: (text, kind = "ok") => { set({ toast: { text, kind } }); setTimeout(() => set((s) => (s.toast?.text === text ? { toast: null } : {})), 3200); },

    patchWorld: (fn) => mutate(fn),
    updateSettings: (s) => mutate((w) => { const settings = { ...w.settings, ...s }; configureAudio(settings.sound, settings.volume); return { settings }; }),
    updateProfile: (p) => mutate((w) => ({ profile: { ...w.profile, ...p } })),
    log: (op) => mutate((w) => ({ operations: [{ ...op, id: uid("OP"), at: Date.now() }, ...w.operations] })),
    pushEvent: (e) => mutate((w) => ({ events: [{ ...e, id: uid("EV"), at: Date.now(), read: false }, ...w.events] })),
    progressMission: (t, n) => mutate((w) => bump(w, t, n)),

    runScan: () => {
      const w = get().world; if (!w) return [];
      const found = runScanRules(w);
      mutate((w) => {
        const events: TVAEvent[] = found.filter((a) => a.severity !== "low").map((a) => ({ id: uid("EV"), at: Date.now(), read: false, priority: a.severity, kind: "anomaly", title: a.title, detail: a.detail, branchId: a.branchId ?? undefined, variantId: a.variantId ?? undefined }));
        const op: Operation = { id: uid("OP"), at: Date.now(), type: "scan", title: "Escaneo temporal", summary: `${found.length} anomalías nuevas · ${activeBranches(w).length - 1} ramas analizadas · integridad ${w.integrity}%`, result: "success", payload: { found: found.map((f) => f.id) } };
        const r = bump({ ...w, anomalies: [...found, ...w.anomalies], events: [...events, ...w.events], operations: [op, ...w.operations], lastScanAt: Date.now(), profile: { ...w.profile, opsCompleted: w.profile.opsCompleted + 1 } }, "scan");
        return { anomalies: [...found, ...w.anomalies], lastScanAt: Date.now(), ...r };
      });
      return found;
    },
    resolveAnomaly: (id) => mutate((w) => {
      const a = w.anomalies.find((x) => x.id === id); if (!a || a.resolved) return {};
      const anomalies = w.anomalies.map((x) => x.id === id ? { ...x, resolved: true, resolvedAt: Date.now() } : x);
      const branches = w.branches.map((b) => b.id === a.branchId ? { ...b, stability: Math.min(100, b.stability + 12), divergence: Math.max(0, b.divergence - 8) } : b);
      const op: Operation = { id: uid("OP"), at: Date.now(), type: "investigation", title: `Anomalía resuelta: ${a.title}`, summary: a.detail, result: "success", branchId: a.branchId ?? undefined, variantId: a.variantId ?? undefined };
      return { anomalies, branches, ...bump({ ...w, anomalies, branches, operations: [op, ...w.operations] }, "resolve") };
    }),
    inspectBranch: (id) => mutate((w) => {
      const b = w.branches.find((x) => x.id === id); if (!b || b.inspected) return {};
      const branches = w.branches.map((x) => x.id === id ? { ...x, inspected: true } : x);
      const op: Operation = { id: uid("OP"), at: Date.now(), type: "investigation", title: `Inspección de ${id}`, summary: `${b.label} · div ${b.divergence}% · est ${b.stability}% · ${b.sector}`, result: "info", branchId: id };
      return { branches, ...bump({ ...w, branches, operations: [op, ...w.operations] }, "inspect") };
    }),
    createBranch: (parentId, data) => {
      const w = get().world; if (!w) return null;
      const parent = w.branches.find((b) => b.id === parentId && b.status !== "pruned"); if (!parent) return null;
      const divergence = data.divergence ?? 40;
      const b: Branch = {
        id: uid("BR"), label: data.label || "Rama manual", kind: divergence > 85 ? "nexus" : divergence < 30 ? "echo" : "divergence",
        status: divergence > 85 ? "critical" : divergence > 55 ? "unstable" : "stable", parentId, originT: data.originT ?? 0,
        length: data.length ?? 10, direction: data.direction ?? { x: 0.8, y: Math.random() - 0.5, z: Math.random() - 0.5 }, curve: 0.3,
        divergence, stability: Math.round(100 - divergence * 0.8), sector: data.sector ?? "SECTOR 7", epoch: data.epoch ?? "2012 EC · Nueva York",
        variantIds: [], createdAt: Date.now(), inspected: true, notes: data.notes ?? "",
      };
      mutate((w) => {
        const op: Operation = { id: uid("OP"), at: Date.now(), type: "branch_created", title: `Rama creada ${b.id}`, summary: `${b.label} desde ${parentId} (div ${b.divergence}%)`, result: "success", branchId: b.id };
        return { branches: [...w.branches, b], ...bump({ ...w, branches: [...w.branches, b], operations: [op, ...w.operations] }, "branch") };
      });
      return b;
    },
    stabilizeBranch: (id) => mutate((w) => {
      const b = w.branches.find((x) => x.id === id); if (!b || b.kind === "main") return {};
      const nb = { ...b, stability: Math.min(100, b.stability + 20), divergence: Math.max(0, b.divergence - 15) };
      nb.status = nb.divergence > 85 ? "critical" : nb.divergence > 55 || nb.stability < 50 ? "unstable" : "stable";
      if (nb.kind === "nexus" && nb.divergence <= 85) nb.kind = "divergence";
      const branches = w.branches.map((x) => x.id === id ? nb : x);
      const op: Operation = { id: uid("OP"), at: Date.now(), type: "investigation", title: `Estabilización de ${id}`, summary: `Estabilidad ${b.stability}% → ${nb.stability}%`, result: "success", branchId: id };
      sfx.confirm();
      return { branches, operations: [op, ...w.operations], profile: { ...w.profile, opsCompleted: w.profile.opsCompleted + 1 } };
    }),
    createVariant: (data) => {
      const v: Variant = {
        id: data.id ?? uid("VR"), name: data.name ?? "Variante sin nombre", alias: data.alias ?? "—", avatarSeed: Math.floor(Math.random() * 999), signature: data.signature ?? `Σ-${Math.random().toString(16).slice(2, 6).toUpperCase()}-ΔT`,
        universe: data.universe ?? "Tierra-616", epoch: data.epoch ?? "2012 EC · Nueva York", coords: data.coords ?? { x: 0, y: 0, z: 0 }, divergencePoint: data.divergencePoint ?? "Desconocido",
        branchId: data.branchId ?? null, threat: data.threat ?? 50, status: "detected", discoveredAt: Date.now(), history: [{ at: Date.now(), text: "Expediente creado manualmente" }], notes: data.notes ?? "", relatedVariantIds: [], tracked: false,
      };
      mutate((w) => ({
        variants: [...w.variants, v],
        branches: w.branches.map((b) => b.id === v.branchId ? { ...b, variantIds: [...b.variantIds, v.id] } : b),
        operations: [{ id: uid("OP"), at: Date.now(), type: "variant_created", title: `Expediente ${v.id}`, summary: `${v.name} registrado`, result: "success", variantId: v.id }, ...w.operations],
      }));
      return v;
    },
    updateVariant: (id, patch) => mutate((w) => ({ variants: w.variants.map((v) => v.id === id ? { ...v, ...patch } : v) })),
    setVariantStatus: (id, s) => mutate((w) => {
      const v = w.variants.find((x) => x.id === id); if (!v || v.status === s) return {};
      const variants = w.variants.map((x) => x.id === id ? { ...x, status: s, history: [...x.history, { at: Date.now(), text: `Estado → ${s}` }] } : x);
      const op: Operation = { id: uid("OP"), at: Date.now(), type: "variant_update", title: `${id} → ${s}`, summary: `${v.name} cambia de ${v.status} a ${s}`, result: "success", variantId: id };
      let r: Partial<WorldState> = { operations: [op, ...w.operations] };
      if (s === "investigating") r = { ...r, ...bump({ ...w, variants, operations: r.operations! }, "investigate") };
      if (s === "contained") r = { ...r, ...bump({ ...w, variants, operations: r.operations! }, "contain") };
      return { variants, ...r };
    }),
    toggleTrack: (id) => mutate((w) => {
      const v = w.variants.find((x) => x.id === id); if (!v) return {};
      const variants = w.variants.map((x) => x.id === id ? { ...x, tracked: !x.tracked, history: [...x.history, { at: Date.now(), text: x.tracked ? "Rastreo desactivado" : "Rastreo de firma activado" }] } : x);
      return v.tracked ? { variants } : { variants, ...bump({ ...w, variants }, "track") };
    }),

    startPrune: (branchId) => {
      const w = get().world; if (!w) return;
      const b = w.branches.find((x) => x.id === branchId);
      if (!b || b.kind === "main" || b.status === "pruned") { get().showToast("La Sagrada Línea Temporal está protegida.", "err"); sfx.deny(); return; }
      set({ prune: { branchId, phase: "select", startedAt: Date.now(), durationMs: w.settings.pruneDurationSec * 1000 }, selectedBranchId: branchId, focusBranchId: branchId, view: "map" });
      setTimeout(() => { if (get().prune?.phase === "select") set((s) => ({ prune: s.prune ? { ...s.prune, phase: "authorize" } : null })); }, 1400);
    },
    setPrunePhase: (p) => set((s) => (s.prune ? { prune: { ...s.prune, phase: p, startedAt: Date.now() } } : {})),
    cancelPrune: () => {
      // Política: cancelar antes de la fase de pulso no modifica nada; durante la
      // animación se aborta la secuencia y la rama se conserva intacta.
      const p = get().prune; if (!p) return;
      if (!p.replay) {
        get().log({ type: "prune", title: `Poda cancelada: ${p.branchId}`, summary: `Secuencia abortada en fase "${p.phase}". Sin cambios en los datos.`, result: "cancelled", branchId: p.branchId });
        mutate((w) => ({ missions: w.missions.map((m) => m.id === "M-CLEAN" ? { ...m, progress: 0 } : m) }));
      }
      set({ prune: null });
    },
    finishPrune: () => {
      const p = get().prune; if (!p || p.replay) { set({ prune: null }); return; }
      mutate((w) => {
        const b = w.branches.find((x) => x.id === p.branchId); if (!b) return {};
        const desc = descendantsOf(b.id, w.branches);
        const ids = new Set([b.id, ...desc.map((d) => d.id)]);
        const vars = w.variants.filter((v) => v.branchId && ids.has(v.branchId));
        const branches = w.branches.map((x) => ids.has(x.id) ? { ...x, status: "pruned" as const } : x);
        const variants = w.variants.map((v) => v.branchId && ids.has(v.branchId) ? { ...v, status: "archived" as const, branchId: null, history: [...v.history, { at: Date.now(), text: `Rama ${v.branchId} podada. Expediente archivado.` }] } : v);
        const anomalies = w.anomalies.map((a) => a.branchId && ids.has(a.branchId) && !a.resolved ? { ...a, resolved: true, resolvedAt: Date.now() } : a);
        const report: Operation = {
          id: uid("OP"), at: Date.now(), type: "prune", title: `Poda ejecutada: ${b.id}`, result: "success", branchId: b.id,
          summary: `${b.label} eliminada (div ${b.divergence}%). ${desc.length} dependientes, ${vars.length} variantes archivados. Duración ${(p.durationMs / 1000).toFixed(1)}s.`,
          pruneSnapshot: { branch: b, descendants: desc, variants: vars, durationMs: p.durationMs },
        };
        const next = { ...w, branches, variants, anomalies, operations: [report, ...w.operations], profile: { ...w.profile, opsCompleted: w.profile.opsCompleted + 1 } };
        const r1 = bump(next, "prune");
        const r2 = bump({ ...next, ...r1 }, "prune_clean");
        set({ prune: { ...p, phase: "report", report }, selectedBranchId: null, focusBranchId: null });
        return { branches, variants, anomalies, ...r1, ...r2, events: [{ id: uid("EV"), at: Date.now(), read: false, priority: "medium", kind: "operation", title: `Operación completada: poda de ${b.id}`, detail: report.summary }, ...(r2.events ?? r1.events ?? w.events)] };
      });
    },
    replayPrune: (op) => {
      if (!op.pruneSnapshot) return;
      set({ prune: { branchId: op.branchId!, phase: "prepare", startedAt: Date.now(), durationMs: op.pruneSnapshot.durationMs, replay: true, replayBranch: op.pruneSnapshot.branch, report: op }, view: "map", selectedBranchId: null, focusBranchId: null });
    },
    closePrune: () => set({ prune: null }),

    setTempad: (patch) => mutate((w) => ({ tempad: { ...w.tempad, ...patch } })),

    tickEvents: () => {
      const w = get().world; if (!w || w.paused || !w.settings.eventsEnabled || get().prune) return;
      const out = generateEvent(w); if (!out) return;
      mutate((w) => {
        let branches = w.branches, variants = w.variants;
        if (out.branch) branches = branches.some((b) => b.id === out.branch!.id) ? branches.map((b) => b.id === out.branch!.id ? out.branch! : b) : [...branches, out.branch];
        if (out.variant) { variants = [...variants, out.variant]; branches = branches.map((b) => b.id === out.variant!.branchId ? { ...b, variantIds: [...b.variantIds, out.variant!.id] } : b); }
        const integrity = Math.max(0, Math.min(100, w.integrity + (out.integrityDelta ?? 0)));
        return { branches, variants, integrity, events: [out.event, ...w.events].slice(0, 300) };
      });
      if (out.event.priority === "critical" || out.event.priority === "high") { sfx.alert(); vibrate([80, 40, 80], w.settings.vibration); }
      if (out.notify && w.settings.notifications) notify(out.notify.title, out.notify.body, out.event.kind);
    },
    markEventsRead: () => mutate((w) => ({ events: w.events.map((e) => e.read ? e : { ...e, read: true }) })),
    importWorld: (w) => { set({ world: w }); configureAudio(w.settings.sound, w.settings.volume); void storage.saveWorld(w); },
    resetAll: async () => { await storage.wipe(); try { localStorage.removeItem("tva-nexus:bio"); } catch { /* */ } set({ world: null, creds: null, hasCreds: false, unlocked: false, prune: null, biometricId: null, view: "control" }); },
  };
});

export const useWorld = () => useTVA((s) => s.world!);
export { MAIN_BRANCH_ID };
