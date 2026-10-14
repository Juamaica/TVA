import { Credentials } from "./types";

// Derivación de claves con PBKDF2-SHA256 (Web Crypto), sal única por credencial
// y comparación en tiempo constante. NUNCA se almacena el PIN/contraseña en claro.
const ITER = 210_000;

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(secret: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function generateRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const s = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${s.slice(0, 5)}-${s.slice(5, 10)}`;
}

export async function createCredentials(kind: "pin" | "password", secret: string, recoveryCode: string): Promise<Credentials> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const rsalt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(secret, salt, ITER);
  const rhash = await derive(recoveryCode.replace(/-/g, "").toUpperCase(), rsalt, ITER);
  return { kind, saltB64: b64(salt.buffer), hashB64: b64(hash), iterations: ITER, recoverySaltB64: b64(rsalt.buffer), recoveryHashB64: b64(rhash) };
}

export async function verifySecret(creds: Credentials, secret: string) {
  const hash = await derive(secret, unb64(creds.saltB64), creds.iterations);
  return constantTimeEqual(new Uint8Array(hash), unb64(creds.hashB64));
}

export async function verifyRecovery(creds: Credentials, code: string) {
  const hash = await derive(code.replace(/-/g, "").toUpperCase(), unb64(creds.recoverySaltB64), creds.iterations);
  return constantTimeEqual(new Uint8Array(hash), unb64(creds.recoveryHashB64));
}

// Biometría: WebAuthn con autenticador de plataforma (huella / rostro en Android).
// Es una verificación real del dispositivo; se usa como "desbloqueo rápido" SOLO
// después de haber verificado el PIN en una sesión previa (gate de usuario presente).
export async function biometricAvailable() {
  try {
    if (typeof PublicKeyCredential === "undefined") return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

export async function registerBiometric(agentName: string): Promise<string | null> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge, rp: { name: "TVA NEXUS", id: location.hostname },
        user: { id: userId, name: agentName, displayName: agentName },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return null;
    return b64(cred.rawId);
  } catch { return null; }
}

export async function assertBiometric(credIdB64: string): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const res = await navigator.credentials.get({
      publicKey: {
        challenge, rpId: location.hostname, userVerification: "required", timeout: 60000,
        allowCredentials: [{ type: "public-key", id: unb64(credIdB64) as BufferSource }],
      },
    });
    return !!res;
  } catch { return false; }
}
