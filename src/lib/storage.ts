import { Credentials, WorldState, SCHEMA_VERSION } from "./types";
import { defaultMissions, defaultSettings, defaultTempad } from "./seed";

const DB_NAME = "tva-nexus";
const STORE = "kv";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB no disponible"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve((r.result as T) ?? null);
      r.onerror = () => reject(r.error);
    });
  } catch {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(`${DB_NAME}:${key}`) : null;
    return raw ? (JSON.parse(raw) as T) : null;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try { localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
  }
}

async function idbDel(key: string) {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
  try { localStorage.removeItem(`${DB_NAME}:${key}`); } catch { /* ignore */ }
}

// ── Migraciones ───────────────────────────────────────────────────────────
export function migrate(raw: unknown): WorldState | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Partial<WorldState> & { version?: number };
  if (!Array.isArray(w.branches) || !Array.isArray(w.variants) || !w.profile) return null;
  const out: WorldState = {
    version: SCHEMA_VERSION,
    branches: w.branches,
    variants: w.variants,
    anomalies: w.anomalies ?? [],
    events: w.events ?? [],
    operations: w.operations ?? [],
    missions: w.missions ?? defaultMissions(),
    profile: { badges: [], xp: 0, opsCompleted: 0, missionsCompleted: 0, introSeen: false, ...(w.profile as Partial<WorldState["profile"]>) } as WorldState["profile"],
    settings: { ...defaultSettings, ...(w.settings ?? {}) },
    tempad: { ...defaultTempad, ...(w.tempad ?? {}) },
    integrity: typeof w.integrity === "number" ? w.integrity : 78,
    crisis: !!w.crisis,
    paused: !!w.paused,
    lastScanAt: w.lastScanAt ?? null,
  };
  // v1 → v2: añade misiones nuevas que falten
  if ((w.version ?? 1) < 2) {
    const have = new Set(out.missions.map((m) => m.id));
    for (const m of defaultMissions()) if (!have.has(m.id)) out.missions.push(m);
  }
  // Integridad referencial
  const branchIds = new Set(out.branches.map((b) => b.id));
  out.variants = out.variants.map((v) => ({ ...v, branchId: v.branchId && branchIds.has(v.branchId) ? v.branchId : null }));
  const variantIds = new Set(out.variants.map((v) => v.id));
  out.branches = out.branches.map((b) => ({ ...b, variantIds: (b.variantIds ?? []).filter((id) => variantIds.has(id)) }));
  return out;
}

export const storage = {
  loadWorld: () => idbGet<WorldState>("world").then(migrate),
  saveWorld: (w: WorldState) => idbSet("world", w),
  loadCreds: () => idbGet<Credentials>("creds"),
  saveCreds: (c: Credentials) => idbSet("creds", c),
  wipe: async () => { await idbDel("world"); await idbDel("creds"); },
};

// ── Export / Import ───────────────────────────────────────────────────────
export function exportBackup(world: WorldState) {
  return JSON.stringify({ app: "tva-nexus", exportedAt: Date.now(), version: SCHEMA_VERSION, world }, null, 2);
}

export function validateBackup(json: string): { ok: true; world: WorldState } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json);
    if (parsed?.app !== "tva-nexus") return { ok: false, error: "El archivo no es una copia de TVA NEXUS." };
    const world = migrate(parsed.world);
    if (!world) return { ok: false, error: "Estructura de datos inválida o incompleta." };
    if (!world.branches.some((b) => b.kind === "main")) return { ok: false, error: "Falta la Sagrada Línea Temporal." };
    return { ok: true, world };
  } catch {
    return { ok: false, error: "JSON no válido." };
  }
}
