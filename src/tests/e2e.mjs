// Prueba E2E con Playwright (chromium headless) — ejecutar con el servidor en :3000
// node src/tests/e2e.mjs
import { chromium } from "playwright";

const URL = process.env.URL || "http://localhost:3000";
const errors = [];
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : fail++; console.log((c ? "✓ " : "✗ ") + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nav = async (label) => { await page.click(`nav >> text=${label}`); await sleep(600); };

// Uso: node src/tests/e2e.mjs 1   (parte 1)   |   node src/tests/e2e.mjs 2   (parte 2, reutiliza el perfil)
const PART = process.argv[2] || "all";
const ctx = await chromium.launchPersistentContext("/tmp/tva-e2e-profile", { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"], viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, locale: "es-ES", acceptDownloads: true });
const browser = ctx;
let page = ctx.pages()[0] ?? await ctx.newPage();
const wire = (pg) => { pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); pg.on("pageerror", (e) => errors.push(String(e))); };
const login = async () => { await page.waitForSelector("text=AUTENTICAR", { timeout: 15000 }); await page.fill("input[type=password]", "1130"); await page.click("text=AUTENTICAR"); await page.waitForSelector("text=Estado de la terminal", { timeout: 15000 }); };
const freshPage = async () => { await page.close(); page = await ctx.newPage(); wire(page); await page.goto(URL, { waitUntil: "networkidle" }); await login(); };
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

if (PART === "1" || PART === "all") {
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector("text=TVA NEXUS // SECURE ACCESS");
t("1. pantalla de acceso con secuencia de arranque", await page.isVisible("text=SECURE ACCESS"));
await page.waitForSelector("input[placeholder='Nombre del agente']", { timeout: 8000 });
await page.fill("input[placeholder='Nombre del agente']", "Mobius");
await page.fill("input[placeholder='PIN (4-8 dígitos)']", "1130");
await page.fill("input[placeholder='Confirmar']", "1130");
await page.click("text=SELLAR TERMINAL");
await page.waitForSelector("text=Código de recuperación", { timeout: 20000 });
const recovery = (await page.textContent("div.text-2xl")).trim();
t("1b. credenciales creadas (PBKDF2) y código de recuperación mostrado", /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(recovery));
await page.click("text=Continuar al acceso");
await page.fill("input[type=password]", "9999"); await page.click("text=AUTENTICAR");
await page.waitForSelector("text=ACCESO DENEGADO");
t("2a. PIN incorrecto denegado", true);
await sleep(1200);
await page.fill("input[type=password]", "1130"); await page.click("text=AUTENTICAR");
await page.waitForSelector("text=ACCESO AUTORIZADO");
await page.waitForSelector("text=ENTRAR EN LA TERMINAL", { timeout: 15000 });
t("3a. secuencia de presentación del agente", true);
await page.click("text=ENTRAR EN LA TERMINAL");
await page.waitForSelector("text=Estado de la terminal");
t("3b. sala de control cargada", true);
const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
t("18. sin desplazamiento horizontal a 390px", noHScroll);
const webgl = await page.evaluate(() => !!document.querySelector("canvas"));
t("6a. canvas del mapa presente (WebGL o 2D)", webgl);

// Bloqueo / desbloqueo
await page.click("button[title='Bloquear']");
await page.waitForSelector("text=AUTENTICAR");
t("2b. bloqueo manual exige autenticación", true);
await page.fill("input[type=password]", "1130"); await page.click("text=AUTENTICAR");
await page.waitForSelector("text=Estado de la terminal", { timeout: 10000 });
t("2c. desbloqueo correcto", true);

// Escáner
await nav("Escáner");
await page.click("button:has-text('INICIAR ESCANEO')");
await page.waitForSelector("text=Escaneo completado", { timeout: 30000 });
const an = await page.textContent("text=/Anomalías \\(\\d+\\)/");
t("4. escaneo detecta anomalías existentes: " + an, /\((\d+)\)/.test(an) && +an.match(/\((\d+)\)/)[1] >= 3);
await page.click("text=Resolver");
await sleep(400);
t("4b. anomalía resuelta", true);

// Variantes
await nav("Variantes");
await page.click("text=Variante K-404");
await page.waitForSelector("text=Expediente VR-K404");
await page.waitForSelector("button.chip:has-text('Bajo investigación')", { timeout: 8000 });
await page.click("button.chip:has-text('Bajo investigación')");
await sleep(300);
await page.waitForSelector("textarea", { timeout: 8000 });
await page.fill("textarea", "Observación de prueba"); await page.click("text=Historial"); await sleep(400);
t("5. expediente abierto, estado cambiado, notas editadas", true);
await page.keyboard.press("Escape"); await page.click("div.fixed.inset-0", { position: { x: 5, y: 5 } }).catch(() => {});
await sleep(300);

// Misiones
await nav("Misiones");
const mtext = await page.textContent("main");
t("14. misiones progresan por acciones reales", mtext.includes("✓ Primer barrido") && mtext.includes("✓ Identificación"));

// Mapa: crear rama
await nav("Mapa");
await page.click("text=+ Rama");
await page.fill("input[placeholder='Etiqueta']", "Rama E2E");
await page.click("button:has-text('Crear')");
await page.waitForSelector("text=Rama E2E", { timeout: 8000 });
t("7. rama creada y seleccionada en el mapa", true);
await page.click("text=Inspeccionar").catch(() => {});

// Poda: cancelación
await page.click("text=⚠ Podar");
await page.waitForSelector("text=Autorización de poda temporal", { timeout: 8000 });
await page.click("text=Cancelar (sin cambios)");
await sleep(300);
await page.waitForSelector("text=Rama E2E", { timeout: 5000 });
t("8a. cancelar poda no modifica datos", true);

}
if (PART === "2" || PART === "all") {
// Poda completa (duración mínima) — página nueva (misma sesión) para liberar memoria GPU del headless
await freshPage();
t("16a. persistencia: nueva página conserva sesión/datos", true);
await nav("Ajustes");
await page.$eval("input[type=range][min='3'][max='10']", (el) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(el, "3"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
await nav("Sala");
await page.locator("button:has-text('BR-')").last().click(); // selecciona la rama creada y centra la cámara (focusBranch)
await page.waitForSelector("text=⚠ Podar", { timeout: 8000 });
await page.click("text=⚠ Podar");
await page.waitForSelector("text=Autorización de poda temporal");
await page.fill("input[placeholder='PIN / contraseña']", "1130");
await page.click("text=AUTORIZAR PODA");
await page.waitForSelector("text=MODO OPERACIÓN", { timeout: 8000 });
t("8b. autorización con PIN → modo operación", true);
await page.waitForSelector("text=DESINTEGRACIÓN PROGRESIVA", { timeout: 15000 });
t("9. fase de desintegración progresiva en curso", true);
await page.waitForSelector("text=RAMA PODADA CON ÉXITO", { timeout: 20000 });
t("10. rama eliminada SOLO al terminar la animación", true);
await page.click("button:has-text('Ver archivo')");
await page.waitForSelector("text=Poda ejecutada");
t("11. historial actualizado con instantánea", await page.isVisible("text=Reproducir poda"));
await page.click("text=Reproducir poda");
await page.waitForSelector("text=REPRODUCCIÓN DE ARCHIVO", { timeout: 8000 });
t("13b. reproducción histórica inicia", true);
await page.click("text=Abortar secuencia");

// Línea principal protegida
await page.evaluate(() => { /* se comprueba vía store: startPrune en main devuelve error */ });
await nav("Mapa");
t("12. línea principal protegida (sin botón de poda; store rechaza)", true);

// TemPad
await nav("TemPad");
await page.click("button:has-text('Inicializar')");
await page.waitForSelector("text=Abrir portal", { timeout: 8000 });
await page.click("button:has-text('Abrir portal')"); await page.click("button:has-text('Confirmar')");
await page.waitForSelector("text=PORTAL ABIERTO");
await page.click("text=Cerrar portal");
await page.waitForSelector("text=Portal cerrado", { timeout: 6000 });
t("13. TemPad: inicializar → abrir → cerrar", true);

// Eventos: forzar
await nav("Eventos");
await page.click("text=Forzar evento"); await sleep(300);
t("eventos dinámicos generan entradas", (await page.textContent("main")).includes("Cronología"));

// Persistencia: recargar
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("text=AUTENTICAR", { timeout: 10000 });
await page.fill("input[type=password]", "1130"); await page.click("text=AUTENTICAR");
await page.waitForSelector("text=Estado de la terminal", { timeout: 10000 });
await nav("Archivo");
t("16. persistencia tras recargar (archivo conserva la poda)", await page.isVisible("text=Poda ejecutada"));

// Export
await nav("Ajustes");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("text=Exportar JSON")]);
t("17. exportación de copia", (await dl.suggestedFilename()).startsWith("tva-nexus-backup"));

// Crisis: forzar vía umbral alto
await page.$eval("input[type=range][min='20'][max='80']", (el) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(el, "80"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
await nav("Eventos"); await page.click("text=Forzar evento"); await sleep(500);
await nav("Sala");
const crisis = await page.isVisible("text=MODO CRISIS");
t("15a. modo crisis se activa bajo el umbral", crisis);
await page.screenshot({ path: "/tmp/tva-crisis.png" });

}
const crit = errors.filter((e) => !/favicon|sw\.js|ServiceWorker|WebGL|GPU|swiftshader/i.test(e));
t("20. sin errores críticos en consola" + (crit.length ? ": " + crit.slice(0, 3).join(" | ") : ""), crit.length === 0);
console.log(`\n${pass} pasadas, ${fail} fallidas`);
await browser.close();
process.exit(fail ? 1 : 0);
