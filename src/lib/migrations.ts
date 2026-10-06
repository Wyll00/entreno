import type { DatabaseSync } from "node:sqlite";
import { transaction } from "./db.ts";

// Migraciones de las tablas propias. Solo se añaden entradas nuevas al final;
// nunca se edita una ya aplicada en el servidor.
const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "esquema inicial",
    sql: `
      CREATE TABLE exercise (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (user_id, normalized_name)
      );

      CREATE TABLE workout_session (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        local_date TEXT NOT NULL CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        time_zone TEXT NOT NULL,
        label TEXT,
        status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
        active_exercise_id TEXT REFERENCES exercise (id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX workout_session_one_open ON workout_session (user_id) WHERE status = 'open';
      CREATE INDEX workout_session_user_date ON workout_session (user_id, local_date);

      CREATE TABLE save_request (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- El peso se guarda en gramos enteros para no perder decimales (62,5 kg = 62500).
      -- NULL solo cuando la modalidad es peso corporal.
      CREATE TABLE workout_set (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES workout_session (id) ON DELETE CASCADE,
        exercise_id TEXT NOT NULL REFERENCES exercise (id),
        position INTEGER NOT NULL,
        weight_grams INTEGER CHECK (weight_grams IS NULL OR weight_grams >= 0),
        weight_mode TEXT NOT NULL CHECK (weight_mode IN ('total', 'per_dumbbell', 'bodyweight')),
        reps INTEGER NOT NULL CHECK (reps > 0),
        source_text TEXT,
        save_request_id TEXT REFERENCES save_request (id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK ((weight_mode = 'bodyweight') = (weight_grams IS NULL))
      );
      CREATE INDEX workout_set_session ON workout_set (session_id, position);
      CREATE INDEX workout_set_exercise ON workout_set (exercise_id);
    `,
  },
  {
    id: 2,
    name: "catálogo de ejercicios y alias para la voz",
    sql: `
      ALTER TABLE exercise ADD COLUMN muscle_group TEXT;
      ALTER TABLE exercise ADD COLUMN default_weight_mode TEXT
        CHECK (default_weight_mode IS NULL OR default_weight_mode IN ('total', 'per_dumbbell', 'bodyweight'));
      -- 'catalog' (del catálogo incluido) o 'custom' (creado por la persona).
      ALTER TABLE exercise ADD COLUMN source TEXT NOT NULL DEFAULT 'custom';
      ALTER TABLE exercise ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;

      -- Formas de decir cada ejercicio, ya normalizadas (ver phraseKey).
      -- Un alias pertenece a un único ejercicio por usuario.
      CREATE TABLE exercise_alias (
        user_id TEXT NOT NULL,
        alias TEXT NOT NULL,
        exercise_id TEXT NOT NULL REFERENCES exercise (id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, alias)
      );
      CREATE INDEX exercise_alias_exercise ON exercise_alias (exercise_id);

      CREATE TABLE app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    id: 3,
    name: "forma legible de los alias",
    sql: `ALTER TABLE exercise_alias ADD COLUMN phrase TEXT;`,
  },
];

export function migrateApp(db: DatabaseSync): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS app_migration (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare("SELECT id FROM app_migration").all() as { id: number }[]).map((r) => r.id),
  );
  const done: number[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    transaction(db, () => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO app_migration (id, name, applied_at) VALUES (?, ?, ?)").run(
        migration.id,
        migration.name,
        new Date().toISOString(),
      );
    });
    done.push(migration.id);
  }
  return done;
}
