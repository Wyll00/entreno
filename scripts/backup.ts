// Copia consistente de la base de datos con la API de backup de SQLite
// (válida aunque la app esté escribiendo). Comprueba la copia y conserva las
// últimas N (BACKUP_KEEP, 7 por defecto).
import fs from "node:fs";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { config } from "../src/lib/config.ts";

const dir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
const keep = Number(process.env.BACKUP_KEEP ?? 7);
const source = config.databasePath;
if (!fs.existsSync(source)) throw new Error(`No existe la base de datos ${source}`);
if (path.resolve(path.dirname(source)) === path.resolve(dir)) {
  throw new Error("BACKUP_DIR debe estar fuera de la carpeta de la base de datos activa.");
}
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(dir, `workouts-${stamp}.sqlite`);
const db = new DatabaseSync(source, { readOnly: true });
await backup(db, target);
db.close();

// La copia hereda el modo WAL; se pasa a un único fichero autocontenido.
const copy = new DatabaseSync(target);
copy.exec("PRAGMA journal_mode = DELETE");
const check = copy.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
const sets = copy.prepare("SELECT COUNT(*) AS n FROM workout_set").get() as { n: number };
copy.close();
if (check.integrity_check !== "ok") throw new Error(`La copia no pasa integrity_check: ${check.integrity_check}`);

const old = fs
  .readdirSync(dir)
  .filter((f) => /^workouts-.*\.sqlite$/.test(f))
  .sort()
  .reverse()
  .slice(keep);
for (const file of old) {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(path.join(dir, file + suffix), { force: true });
}

console.log(`Copia creada: ${target} (${sets.n} series, integridad ok). Eliminadas ${old.length} antiguas.`);
