import {
  Branch, Mission, Settings, Variant, WorldState, SCHEMA_VERSION, MAIN_BRANCH_ID, TemPadState, AgentProfile,
} from "./types";

export const uid = (p: string) =>
  `${p}-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString(36).slice(-2).toUpperCase()}`;

export const SECTORS = ["SECTOR 1", "SECTOR 3", "SECTOR 7", "SECTOR 12", "SECTOR 19", "SECTOR 42", "SECTOR 88"];
export const EPOCHS = [
  "3100 AEC · Mesopotamia", "44 AEC · Roma", "1348 EC · Europa", "1536 EC · Tenochtitlan",
  "1893 EC · Chicago", "1945 EC · Berlín", "1969 EC · Luna", "2012 EC · Nueva York",
  "2048 EC · Órbita", "2301 EC · Marte", "3012 EC · Nexo Ω", "7120 EC · Fin del Tiempo",
];
export const UNIVERSES = ["Tierra-616", "Tierra-838", "Tierra-199999", "Tierra-1610", "Tierra-9999", "Tierra-X"];

export function makeSignature() {
  const h = () => Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
  return `Σ-${h()}-${h()}-ΔT`;
}

export const defaultSettings: Settings = {
  sound: true, volume: 0.5, effects: 0.8, particles: 0.7, animSpeed: 1, vibration: true,
  reducedMotion: false, lowPower: false, pruneDurationSec: 6, eventsEnabled: true, eventIntervalSec: 45,
  crisisThreshold: 55, lockAfterMin: 5, notifications: true, immersive: false,
};

export const defaultTempad: TemPadState = {
  status: "idle", energy: 100, sync: 0, epoch: EPOCHS[7], sector: SECTORS[2],
  coords: { x: 12.4, y: -3.1, z: 88.2 }, history: [],
};

export function defaultMissions(): Mission[] {
  return [
    { id: "M-SCAN", title: "Primer barrido", objective: "Completa tu primer escaneo temporal", target: 1, progress: 0, completed: false, rewardXp: 80, badge: "Ojo del Nexo", trigger: "scan" },
    { id: "M-IDENT", title: "Identificación", objective: "Marca un variante como 'Bajo investigación'", target: 1, progress: 0, completed: false, rewardXp: 60, trigger: "investigate" },
    { id: "M-TRACK", title: "Rastreo de firma", objective: "Rastrea la firma de 2 variantes", target: 2, progress: 0, completed: false, rewardXp: 90, badge: "Sabueso Temporal", trigger: "track" },
    { id: "M-INSPECT", title: "Inspección de rama", objective: "Inspecciona 3 ramas en el mapa", target: 3, progress: 0, completed: false, rewardXp: 70, trigger: "inspect" },
    { id: "M-RESOLVE", title: "Anomalía resuelta", objective: "Resuelve 2 anomalías", target: 2, progress: 0, completed: false, rewardXp: 120, trigger: "resolve" },
    { id: "M-CONTAIN", title: "Contención", objective: "Contén un variante", target: 1, progress: 0, completed: false, rewardXp: 150, badge: "Cazador", trigger: "contain" },
    { id: "M-PRUNE", title: "Poda autorizada", objective: "Ejecuta una poda simulada completa", target: 1, progress: 0, completed: false, rewardXp: 200, badge: "Vara de Poda", trigger: "prune" },
    { id: "M-STABLE", title: "Recuperación", objective: "Recupera la estabilidad tras un modo crisis", target: 1, progress: 0, completed: false, rewardXp: 250, badge: "Guardián de la Línea", trigger: "crisis_resolved" },
    { id: "M-CLEAN", title: "Operación limpia", objective: "Completa 3 podas sin cancelar", target: 3, progress: 0, completed: false, rewardXp: 300, badge: "Mano Firme", trigger: "prune_clean" },
    { id: "M-BRANCH", title: "Cartógrafo", objective: "Registra una ramificación nueva", target: 1, progress: 0, completed: false, rewardXp: 50, trigger: "branch" },
    { id: "M-TEMPAD", title: "Puerta Temporal", objective: "Abre y cierra un portal del TemPad", target: 1, progress: 0, completed: false, rewardXp: 60, trigger: "tempad" },
  ];
}

const dir = (x: number, y: number, z: number) => ({ x, y, z });

export function seedWorld(profile: AgentProfile): WorldState {
  const now = Date.now();
  const main: Branch = {
    id: MAIN_BRANCH_ID, label: "Sagrada Línea Temporal", kind: "main", status: "stable", parentId: null,
    originT: 0, length: 0, direction: dir(1, 0, 0), curve: 0, divergence: 0, stability: 92,
    sector: "NEXO CENTRAL", epoch: "∞", variantIds: [], createdAt: now - 1e9, inspected: true, notes: "Protegida. No se puede podar.",
  };
  const branches: Branch[] = [
    main,
    { id: "BR-1130", label: "Divergencia Asgardiana", kind: "divergence", status: "unstable", parentId: MAIN_BRANCH_ID, originT: -18, length: 14, direction: dir(0.9, 0.5, 0.2), curve: 0.4, divergence: 68, stability: 44, sector: "SECTOR 7", epoch: EPOCHS[7], variantIds: ["VR-L1130"], createdAt: now - 86400e3 * 6, inspected: false, notes: "" },
    { id: "BR-2A7F", label: "Eco de Chicago", kind: "echo", status: "stable", parentId: MAIN_BRANCH_ID, originT: -6, length: 9, direction: dir(0.8, -0.4, 0.4), curve: 0.2, divergence: 22, stability: 81, sector: "SECTOR 3", epoch: EPOCHS[4], variantIds: ["VR-S002"], createdAt: now - 86400e3 * 4, inspected: false, notes: "" },
    { id: "BR-9E01", label: "Nexo Órbita", kind: "nexus", status: "critical", parentId: MAIN_BRANCH_ID, originT: 7, length: 17, direction: dir(0.7, 0.3, -0.6), curve: 0.6, divergence: 91, stability: 18, sector: "SECTOR 42", epoch: EPOCHS[8], variantIds: ["VR-K404", "VR-X777"], createdAt: now - 86400e3 * 2, inspected: false, notes: "" },
    { id: "BR-9E01-B", label: "Subrama Marte", kind: "divergence", status: "unstable", parentId: "BR-9E01", originT: 9, length: 8, direction: dir(0.4, 0.8, -0.2), curve: 0.3, divergence: 55, stability: 39, sector: "SECTOR 42", epoch: EPOCHS[9], variantIds: [], createdAt: now - 86400e3, inspected: false, notes: "" },
    { id: "BR-4C22", label: "Bifurcación Lunar", kind: "divergence", status: "stable", parentId: MAIN_BRANCH_ID, originT: 20, length: 11, direction: dir(0.85, -0.5, -0.2), curve: 0.25, divergence: 31, stability: 74, sector: "SECTOR 19", epoch: EPOCHS[6], variantIds: ["VR-M019"], createdAt: now - 86400e3 * 3, inspected: false, notes: "" },
  ];
  const variants: Variant[] = [
    { id: "VR-L1130", name: "Variante L-1130", alias: "El Embaucador", avatarSeed: 11, signature: "Σ-4A9F-11C0-ΔT", universe: UNIVERSES[0], epoch: EPOCHS[7], coords: dir(12.4, -3.1, 88.2), divergencePoint: "Fuga con el Teseracto", branchId: "BR-1130", threat: 78, status: "detected", discoveredAt: now - 86400e3 * 6, history: [{ at: now - 86400e3 * 6, text: "Firma detectada en Sector 7" }], notes: "", relatedVariantIds: ["VR-X777"], tracked: false },
    { id: "VR-S002", name: "Variante S-002", alias: "La Arquitecta", avatarSeed: 23, signature: "Σ-0B21-77E3-ΔT", universe: UNIVERSES[2], epoch: EPOCHS[4], coords: dir(-41.2, 8.7, 12.0), divergencePoint: "Exposición Universal alterada", branchId: "BR-2A7F", threat: 34, status: "investigating", discoveredAt: now - 86400e3 * 4, history: [{ at: now - 86400e3 * 4, text: "Eco estructural identificado" }], notes: "", relatedVariantIds: [], tracked: false },
    { id: "VR-K404", name: "Variante K-404", alias: "El Que Permanece (eco)", avatarSeed: 40, signature: "Σ-FFFF-0404-ΔT", universe: UNIVERSES[5], epoch: EPOCHS[8], coords: dir(99.1, 44.0, -7.3), divergencePoint: "Colapso del Nexo Órbita", branchId: "BR-9E01", threat: 96, status: "detected", discoveredAt: now - 86400e3 * 2, history: [{ at: now - 86400e3 * 2, text: "Firma de nivel Nexo registrada" }], notes: "", relatedVariantIds: ["VR-X777", "VR-L1130"], tracked: false },
    { id: "VR-X777", name: "Variante X-777", alias: "Sylvie (eco)", avatarSeed: 77, signature: "Σ-7777-A1B2-ΔT", universe: UNIVERSES[1], epoch: EPOCHS[8], coords: dir(97.4, 41.8, -9.9), divergencePoint: "Encantamiento del guardián", branchId: "BR-9E01", threat: 83, status: "located", discoveredAt: now - 86400e3 * 2, history: [{ at: now - 86400e3 * 2, text: "Localizada en el Nexo Órbita" }], notes: "", relatedVariantIds: ["VR-K404"], tracked: true },
    { id: "VR-M019", name: "Variante M-019", alias: "El Astronauta", avatarSeed: 19, signature: "Σ-1969-0720-ΔT", universe: UNIVERSES[3], epoch: EPOCHS[6], coords: dir(3.3, -60.1, 14.5), divergencePoint: "Alunizaje adelantado", branchId: "BR-4C22", threat: 21, status: "contained", discoveredAt: now - 86400e3 * 3, history: [{ at: now - 86400e3 * 3, text: "Contenido en celda temporal" }], notes: "", relatedVariantIds: [], tracked: false },
  ];
  return {
    version: SCHEMA_VERSION,
    branches, variants,
    anomalies: [],
    events: [{ id: uid("EV"), at: now, priority: "low", kind: "system", title: "Terminal inicializada", detail: "TVA NEXUS en línea. Simulación local activa.", read: false }],
    operations: [{ id: uid("OP"), type: "system", at: now, title: "Alta de terminal", summary: `Agente ${profile.name} registrado con código ${profile.code}.`, result: "info" }],
    missions: defaultMissions(),
    profile, settings: defaultSettings, tempad: defaultTempad,
    integrity: 78, crisis: false, paused: false, lastScanAt: null,
  };
}
