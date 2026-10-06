import { getMigrations } from "better-auth/db/migration";
import { authOptions } from "./auth-options.ts";
import { getDb } from "./db.ts";
import { ensureCatalogForAllUsers } from "./exercises.ts";
import { migrateApp } from "./migrations.ts";

/** Tablas de Better Auth y después las propias. Idempotente. */
export async function migrateAll(): Promise<{ authTables: string[]; appMigrations: number[]; catalogSynced: number }> {
  const plan = await getMigrations(authOptions);
  if (plan.unsafeChanges.length > 0) {
    throw new Error(`Migración de autenticación no segura: ${plan.unsafeChanges.join("; ")}`);
  }
  await plan.runMigrations();
  const appMigrations = migrateApp(getDb());
  const catalogSynced = ensureCatalogForAllUsers(getDb());
  return {
    authTables: [...plan.toBeCreated, ...plan.toBeAdded].map((t) => t.table),
    appMigrations,
    catalogSynced,
  };
}
