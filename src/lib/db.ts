import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.ts";

declare global {
  // Una sola conexión por proceso, también con la recarga en caliente de `next dev`.
  var __entrenosDb: DatabaseSync | undefined;
}

export function openDatabase(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA synchronous = NORMAL;");
  return db;
}

export function getDb(): DatabaseSync {
  globalThis.__entrenosDb ??= openDatabase(config.databasePath);
  return globalThis.__entrenosDb;
}

/** Ejecuta `fn` dentro de una transacción con bloqueo de escritura inmediato. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
