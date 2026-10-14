import { pgTable, serial, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

// Copias de seguridad opcionales (el usuario las sube explícitamente; los datos
// principales viven en IndexedDB del dispositivo).
export const backups = pgTable("backups", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),      // código de recuperación de la copia
  agentCode: text("agent_code").notNull(),
  version: integer("version").notNull(),
  world: jsonb("world").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
