import { seedWorld } from "@/lib/seed";
import { runScanRules, computeIntegrity, descendantsOf, generateEvent, branchPoints } from "@/lib/simulation";
import { exportBackup, validateBackup, migrate } from "@/lib/storage";
const profile = { name: "Mobius", code: "A-1130M", division: "Analistas", avatarSeed: 1, xp: 0, opsCompleted: 0, missionsCompleted: 0, badges: [], createdAt: Date.now(), introSeen: false };
const w = seedWorld(profile);
let pass = 0, fail = 0; const t = (n: string, c: boolean) => { c ? pass++ : fail++; console.log((c ? "✓ " : "✗ ") + n); };
w.integrity = computeIntegrity(w);
t("integridad calculada en rango", w.integrity > 0 && w.integrity < 100);
const found = runScanRules(w);
t("escáner detecta Nexus BR-9E01", found.some(a => a.type === "nexus" && a.branchId === "BR-9E01"));
t("escáner detecta firma K-404", found.some(a => a.type === "signature" && a.variantId === "VR-K404"));
t("escáner detecta inestabilidad BR-9E01", found.some(a => a.type === "instability" && a.branchId === "BR-9E01"));
t("escáner no detecta estable BR-2A7F", !found.some(a => a.branchId === "BR-2A7F"));
w.anomalies = found; const again = runScanRules(w);
t("segundo escaneo no duplica", again.filter(a => a.type !== "integrity").length === 0);
t("dependientes de BR-9E01 = 1", descendantsOf("BR-9E01", w.branches).length === 1);
t("geometría de rama tiene puntos", branchPoints(w.branches[1], w.branches).length === 33);
const sub = branchPoints(w.branches[4], w.branches)[0], par = branchPoints(w.branches[3], w.branches);
t("subrama nace sobre su padre", par.some(p => Math.hypot(p.x-sub.x,p.y-sub.y,p.z-sub.z) < 1.5));
// poda simulada
const before = computeIntegrity(w);
const ids = new Set(["BR-9E01", ...descendantsOf("BR-9E01", w.branches).map(b=>b.id)]);
const pruned = { ...w, branches: w.branches.map(b => ids.has(b.id) ? { ...b, status: "pruned" as const } : b), variants: w.variants.map(v => v.branchId && ids.has(v.branchId) ? { ...v, status: "archived" as const, branchId: null } : v), anomalies: w.anomalies.map(a => a.branchId && ids.has(a.branchId) ? { ...a, resolved: true } : a) };
t("integridad sube tras poda", computeIntegrity(pruned) > before);
t("variantes de rama podada archivados", pruned.variants.filter(v => v.status === "archived").length === 2);
// eventos
let branchEvents = 0; for (let i = 0; i < 50; i++) { const e = generateEvent(w); if (e?.branch && !w.branches.some(b => b.id === e.branch!.id)) { branchEvents++; t("evento rama tiene padre válido", w.branches.some(b => b.id === e.branch!.parentId)); break; } }
t("se generan eventos de ramificación", branchEvents > 0);
// backup
const json = exportBackup(w); const r = validateBackup(json);
t("backup válido se importa", r.ok && r.world.branches.length === w.branches.length);
t("backup corrupto se rechaza", !validateBackup("{\"app\":\"otro\"}").ok && !validateBackup("xx").ok);
t("migración repara referencias rotas", migrate({ ...w, variants: [{ ...w.variants[0], branchId: "NO-EXISTE" }] })!.variants[0].branchId === null);
console.log(`\n${pass} pasadas, ${fail} fallidas`); process.exit(fail ? 1 : 0);
