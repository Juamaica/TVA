import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { backups } from "@/db/schema";

// Sincronización de copias de seguridad bajo demanda (opt-in explícito).
// POST { world }  -> { code }   | GET ?code=XXXX -> { world }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const w = body?.world;
    if (!w || !Array.isArray(w.branches) || !w.profile?.code) return NextResponse.json({ error: "Copia inválida" }, { status: 400 });
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
    await db.insert(backups).values({ code, agentCode: String(w.profile.code), version: Number(w.version ?? 1), world: w });
    return NextResponse.json({ code });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code")?.toUpperCase();
  if (!code) return NextResponse.json({ error: "Falta código" }, { status: 400 });
  const row = await db.select().from(backups).where(eq(backups.code, code)).limit(1);
  if (!row[0]) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ world: row[0].world, createdAt: row[0].createdAt });
}
