// Prueba de restauración: copia un backup a una ruta temporal (nunca sobre la
// base activa), lo abre y muestra lo que contiene.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("Uso: npm run restore:check -- <ruta-del-backup.sqlite>");
  process.exit(1);
}
const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "entrenos-restore-")), "workouts.sqlite");
fs.copyFileSync(file, target);

const db = new DatabaseSync(target, { readOnly: true });
const check = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const latestSets = db
  .prepare(
    `SELECT s.local_date, e.name, w.weight_grams, w.weight_mode, w.reps
     FROM workout_set w
     JOIN workout_session s ON s.id = w.session_id
     JOIN exercise e ON e.id = w.exercise_id
     ORDER BY w.created_at DESC LIMIT 3`,
  )
  .all();
console.log({
  restoredTo: target,
  integrity: check.integrity_check,
  users: count('"user"'),
  sessions: count("workout_session"),
  sets: count("workout_set"),
  latestSets,
});
db.close();
if (check.integrity_check !== "ok") process.exit(1);
