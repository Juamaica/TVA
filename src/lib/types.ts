// ─── TVA NEXUS · Modelo de datos compartido ───────────────────────────────
export type BranchStatus = "stable" | "unstable" | "critical" | "nexus" | "pruned";
export type BranchKind = "main" | "divergence" | "nexus" | "echo";
export type VariantStatus = "detected" | "investigating" | "located" | "contained" | "archived";
export type Severity = "low" | "medium" | "high" | "critical";
export type AnomalyType = "divergence" | "signature" | "instability" | "integrity" | "nexus";
export type OpType =
  | "scan" | "prune" | "branch_created" | "variant_created" | "variant_update"
  | "investigation" | "mission" | "event" | "tempad" | "crisis" | "system";

export interface Vec3 { x: number; y: number; z: number }

export interface Branch {
  id: string;            // ej. BR-7F3A
  label: string;
  kind: BranchKind;
  status: BranchStatus;
  parentId: string | null;   // rama de origen (null para la Sagrada Línea)
  originT: number;           // posición sobre la rama padre donde diverge (coordenada temporal)
  length: number;            // longitud de la rama
  direction: Vec3;           // dirección de crecimiento
  curve: number;             // curvatura
  divergence: number;        // 0-100 nivel de divergencia
  stability: number;         // 0-100
  sector: string;            // ej. "SECTOR 7"
  epoch: string;             // ej. "2048 ES"
  variantIds: string[];
  createdAt: number;
  inspected: boolean;
  notes: string;
}

export interface TimelineEvent { at: number; text: string }

export interface Variant {
  id: string;            // VR-L1130
  name: string;
  alias: string;
  avatarSeed: number;
  signature: string;     // firma temporal, ej. Σ-4A9F-ΔT
  universe: string;
  epoch: string;
  coords: Vec3;
  divergencePoint: string;
  branchId: string | null;
  threat: number;        // 0-100
  status: VariantStatus;
  discoveredAt: number;
  history: TimelineEvent[];
  notes: string;
  relatedVariantIds: string[];
  tracked: boolean;
}

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: Severity;
  branchId: string | null;
  variantId: string | null;
  sector: string;
  title: string;
  detail: string;
  detectedAt: number;
  resolved: boolean;
  resolvedAt?: number;
}

export interface TVAEvent {
  id: string;
  at: number;
  priority: Severity;
  kind: string;
  title: string;
  detail: string;
  read: boolean;
  branchId?: string;
  variantId?: string;
}

export interface PruneSnapshot {
  branch: Branch;
  descendants: Branch[];
  variants: Variant[];
  durationMs: number;
}

export interface Operation {
  id: string;
  type: OpType;
  at: number;
  title: string;
  summary: string;
  result: "success" | "cancelled" | "info" | "failed";
  branchId?: string;
  variantId?: string;
  payload?: Record<string, unknown>;
  pruneSnapshot?: PruneSnapshot;
}

export interface Mission {
  id: string;
  title: string;
  objective: string;
  target: number;
  progress: number;
  completed: boolean;
  completedAt?: number;
  rewardXp: number;
  badge?: string;
  trigger: string;        // clave de acción que incrementa el progreso
}

export interface AgentProfile {
  name: string;
  code: string;
  division: string;
  avatarSeed: number;
  avatarDataUrl?: string;
  xp: number;
  opsCompleted: number;
  missionsCompleted: number;
  badges: string[];
  createdAt: number;
  introSeen: boolean;
}

export interface Settings {
  sound: boolean;
  volume: number;          // 0-1
  effects: number;         // 0-1 intensidad
  particles: number;       // 0-1 cantidad
  animSpeed: number;       // 0.5-2
  vibration: boolean;
  reducedMotion: boolean;
  lowPower: boolean;
  pruneDurationSec: number; // 3-10
  eventsEnabled: boolean;
  eventIntervalSec: number; // 15-300
  crisisThreshold: number;  // 0-100
  lockAfterMin: number;     // minutos de inactividad
  notifications: boolean;
  immersive: boolean;
}

export interface TemPadState {
  status: "idle" | "init" | "ready" | "open" | "closing";
  energy: number;
  sync: number;
  epoch: string;
  sector: string;
  coords: Vec3;
  history: { at: number; epoch: string; sector: string; coords: Vec3 }[];
}

export interface Credentials {
  kind: "pin" | "password";
  saltB64: string;
  hashB64: string;
  iterations: number;
  recoverySaltB64: string;
  recoveryHashB64: string;
}

export interface WorldState {
  version: number;
  branches: Branch[];
  variants: Variant[];
  anomalies: Anomaly[];
  events: TVAEvent[];
  operations: Operation[];
  missions: Mission[];
  profile: AgentProfile;
  settings: Settings;
  tempad: TemPadState;
  integrity: number;       // 0-100
  crisis: boolean;
  paused: boolean;
  lastScanAt: number | null;
}

export const SCHEMA_VERSION = 2;
export const MAIN_BRANCH_ID = "SACRED-TIMELINE";

export const RANKS = [
  { min: 0, name: "Analista Junior", clearance: 1 },
  { min: 150, name: "Analista", clearance: 2 },
  { min: 400, name: "Cazador Nivel D", clearance: 3 },
  { min: 800, name: "Cazador Nivel B", clearance: 4 },
  { min: 1400, name: "Supervisor de Sector", clearance: 5 },
  { min: 2200, name: "Juez de Campo", clearance: 6 },
  { min: 3500, name: "Director de Operaciones", clearance: 7 },
];

export function rankFor(xp: number) {
  let r = RANKS[0];
  for (const rk of RANKS) if (xp >= rk.min) r = rk;
  const next = RANKS.find((k) => k.min > xp);
  return { ...r, next };
}
