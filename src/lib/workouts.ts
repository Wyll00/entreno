// Acceso a datos de entrenamientos. Todas las funciones reciben el userId y
// filtran por él: ningún registro de otro propietario es visible ni editable.
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { localDate as todayIn } from "./dates.ts";
import { transaction } from "./db.ts";
import { AppError, badRequest, notFound } from "./errors.ts";
import { cleanExerciseName, type SetData } from "./schemas.ts";
import { phraseKey } from "./text.ts";
import { gramsToKg, type WeightMode } from "./units.ts";

export type SetView = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  position: number;
  weightKg: string | null;
  weightMode: WeightMode;
  reps: number;
  sourceText: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionView = {
  id: string;
  localDate: string;
  timeZone: string;
  label: string | null;
  status: "open" | "closed";
  activeExercise: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  sets: SetView[];
};

export type ExerciseView = {
  id: string;
  name: string;
  lastDate: string | null;
  setCount: number;
  /** Modalidad de peso usada en la última serie confirmada: es la convención por defecto. */
  lastWeightMode: WeightMode | null;
};

type SessionRow = {
  id: string;
  local_date: string;
  time_zone: string;
  label: string | null;
  status: "open" | "closed";
  active_exercise_id: string | null;
  active_exercise_name: string | null;
  created_at: string;
  updated_at: string;
};

type SetRow = {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  position: number;
  weight_grams: number | null;
  weight_mode: WeightMode;
  reps: number;
  source_text: string | null;
  created_at: string;
  updated_at: string;
};

const now = () => new Date().toISOString();

export function normalizeExerciseName(name: string): string {
  return cleanExerciseName(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const SESSION_SELECT = `
  SELECT s.id, s.local_date, s.time_zone, s.label, s.status, s.active_exercise_id,
         e.name AS active_exercise_name, s.created_at, s.updated_at
  FROM workout_session s
  LEFT JOIN exercise e ON e.id = s.active_exercise_id`;

const SET_SELECT = `
  SELECT w.id, w.session_id, w.exercise_id, e.name AS exercise_name, w.position,
         w.weight_grams, w.weight_mode, w.reps, w.source_text, w.created_at, w.updated_at
  FROM workout_set w
  JOIN exercise e ON e.id = w.exercise_id`;

function toSetView(row: SetRow): SetView {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    position: row.position,
    weightKg: row.weight_grams === null ? null : gramsToKg(row.weight_grams),
    weightMode: row.weight_mode,
    reps: row.reps,
    sourceText: row.source_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSessionView(row: SessionRow, sets: SetView[]): SessionView {
  return {
    id: row.id,
    localDate: row.local_date,
    timeZone: row.time_zone,
    label: row.label,
    status: row.status,
    activeExercise:
      row.active_exercise_id && row.active_exercise_name
        ? { id: row.active_exercise_id, name: row.active_exercise_name }
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sets,
  };
}

function setsForSessions(db: DatabaseSync, sessionIds: string[], exerciseId?: string): Map<string, SetView[]> {
  const bySession = new Map<string, SetView[]>(sessionIds.map((id) => [id, []]));
  if (sessionIds.length === 0) return bySession;
  const placeholders = sessionIds.map(() => "?").join(",");
  const filter = exerciseId ? " AND w.exercise_id = ?" : "";
  const params = exerciseId ? [...sessionIds, exerciseId] : sessionIds;
  const rows = db
    .prepare(`${SET_SELECT} WHERE w.session_id IN (${placeholders})${filter} ORDER BY w.position`)
    .all(...params) as SetRow[];
  for (const row of rows) bySession.get(row.session_id)?.push(toSetView(row));
  return bySession;
}

function ownedSessionRow(db: DatabaseSync, userId: string, sessionId: string): SessionRow {
  const row = db.prepare(`${SESSION_SELECT} WHERE s.id = ? AND s.user_id = ?`).get(sessionId, userId) as
    | SessionRow
    | undefined;
  if (!row) throw notFound("Sesión");
  return row;
}

export function getSession(db: DatabaseSync, userId: string, sessionId: string): SessionView {
  const row = ownedSessionRow(db, userId, sessionId);
  return toSessionView(row, setsForSessions(db, [row.id]).get(row.id) ?? []);
}

export function getOpenSession(db: DatabaseSync, userId: string): SessionView | null {
  const row = db.prepare(`${SESSION_SELECT} WHERE s.user_id = ? AND s.status = 'open'`).get(userId) as
    | SessionRow
    | undefined;
  return row ? toSessionView(row, setsForSessions(db, [row.id]).get(row.id) ?? []) : null;
}

const CLOSE_OPEN_SESSIONS = `
  UPDATE workout_session SET status = 'closed', active_exercise_id = NULL, updated_at = ?
  WHERE user_id = ? AND status = 'open'`;

/** Crea una sesión nueva y cierra la abierta, si la hay. Es siempre una acción explícita. */
export function createSession(
  db: DatabaseSync,
  userId: string,
  input: { localDate?: string; label?: string | null; timeZone: string },
): SessionView {
  const id = randomUUID();
  const stamp = now();
  transaction(db, () => {
    db.prepare(CLOSE_OPEN_SESSIONS).run(stamp, userId);
    db.prepare(
      `INSERT INTO workout_session (id, user_id, local_date, time_zone, label, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
    ).run(
      id,
      userId,
      input.localDate ?? todayIn(input.timeZone),
      input.timeZone,
      input.label?.trim() || null,
      stamp,
      stamp,
    );
  });
  return getSession(db, userId, id);
}

export function updateSession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  patch: { localDate?: string; label?: string | null; status?: "open" | "closed"; activeExerciseId?: string | null },
): SessionView {
  transaction(db, () => {
    const current = ownedSessionRow(db, userId, sessionId);
    const stamp = now();
    if (patch.localDate !== undefined) {
      db.prepare("UPDATE workout_session SET local_date = ?, updated_at = ? WHERE id = ?").run(
        patch.localDate,
        stamp,
        sessionId,
      );
    }
    if (patch.label !== undefined) {
      db.prepare("UPDATE workout_session SET label = ?, updated_at = ? WHERE id = ?").run(
        patch.label?.trim() || null,
        stamp,
        sessionId,
      );
    }
    if (patch.status === "open" && current.status !== "open") {
      // Reabrir una sesión cierra la que estuviera abierta: solo hay una activa.
      db.prepare(CLOSE_OPEN_SESSIONS).run(stamp, userId);
      db.prepare("UPDATE workout_session SET status = 'open', updated_at = ? WHERE id = ?").run(stamp, sessionId);
    }
    if (patch.status === "closed") {
      // Cerrar limpia el contexto: la siguiente frase no hereda ejercicio.
      db.prepare(
        "UPDATE workout_session SET status = 'closed', active_exercise_id = NULL, updated_at = ? WHERE id = ?",
      ).run(stamp, sessionId);
    }
    if (patch.activeExerciseId !== undefined && patch.status !== "closed") {
      if (patch.activeExerciseId !== null) {
        const owned = db
          .prepare("SELECT 1 FROM exercise WHERE id = ? AND user_id = ?")
          .get(patch.activeExerciseId, userId);
        if (!owned) throw notFound("Ejercicio");
      }
      db.prepare("UPDATE workout_session SET active_exercise_id = ?, updated_at = ? WHERE id = ?").run(
        patch.activeExerciseId,
        stamp,
        sessionId,
      );
    }
  });
  return getSession(db, userId, sessionId);
}

/** Borra una sesión y todas sus series (p. ej. creada por error). */
export function deleteSession(db: DatabaseSync, userId: string, sessionId: string): void {
  transaction(db, () => {
    ownedSessionRow(db, userId, sessionId);
    db.prepare("DELETE FROM workout_session WHERE id = ? AND user_id = ?").run(sessionId, userId);
  });
}

function findOrCreateExercise(db: DatabaseSync, userId: string, name: string): string {
  const normalized = normalizeExerciseName(name);
  const existing = db
    .prepare("SELECT id FROM exercise WHERE user_id = ? AND normalized_name = ?")
    .get(userId, normalized) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare("INSERT INTO exercise (id, user_id, name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    userId,
    cleanExerciseName(name),
    normalized,
    now(),
  );
  // Un ejercicio nuevo se reconoce por voz desde ya, si su nombre está libre.
  const key = phraseKey(name);
  if (key) {
    db.prepare("INSERT OR IGNORE INTO exercise_alias (user_id, alias, exercise_id, phrase) VALUES (?, ?, ?, ?)").run(
      userId,
      key,
      id,
      cleanExerciseName(name),
    );
  }
  return id;
}

export function contentHash(sessionId: string, items: SetData[]): string {
  const canonical = JSON.stringify({
    sessionId,
    items: items.map((i) => [
      normalizeExerciseName(i.exerciseName),
      i.weightGrams,
      i.weightMode,
      i.reps,
      i.sourceText,
    ]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export type SaveResult = { requestId: string; sessionId: string; setIds: string[]; replayed: boolean };

/**
 * Guarda todas las series de un borrador en una única transacción.
 * El mismo requestId con el mismo contenido devuelve el resultado original sin
 * duplicar; con contenido distinto es un conflicto. La solicitud se conserva
 * aunque luego se editen o borren las series, para que un reintento antiguo
 * no las recree.
 */
export function saveDraft(
  db: DatabaseSync,
  userId: string,
  input: { requestId: string; sessionId: string; items: SetData[] },
): SaveResult {
  const hash = contentHash(input.sessionId, input.items);
  return transaction(db, () => {
    const previous = db
      .prepare("SELECT user_id, content_hash, result_json FROM save_request WHERE id = ?")
      .get(input.requestId) as { user_id: string; content_hash: string; result_json: string } | undefined;
    if (previous) {
      if (previous.user_id !== userId || previous.content_hash !== hash) {
        throw new AppError(
          409,
          "conflict",
          "Este borrador ya se guardó con otro contenido. Recarga y revisa las series.",
        );
      }
      return { ...(JSON.parse(previous.result_json) as Omit<SaveResult, "replayed">), replayed: true };
    }

    ownedSessionRow(db, userId, input.sessionId);
    const stamp = now();
    db.prepare(
      "INSERT INTO save_request (id, user_id, content_hash, result_json, created_at) VALUES (?, ?, ?, '', ?)",
    ).run(input.requestId, userId, hash, stamp);
    const { next } = db
      .prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM workout_set WHERE session_id = ?")
      .get(input.sessionId) as { next: number };
    const insert = db.prepare(
      `INSERT INTO workout_set (id, session_id, exercise_id, position, weight_grams, weight_mode, reps,
                                source_text, save_request_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const setIds: string[] = [];
    let lastExerciseId = "";
    input.items.forEach((item, index) => {
      const id = randomUUID();
      lastExerciseId = findOrCreateExercise(db, userId, item.exerciseName);
      insert.run(
        id,
        input.sessionId,
        lastExerciseId,
        next + index,
        item.weightGrams,
        item.weightMode,
        item.reps,
        item.sourceText,
        input.requestId,
        stamp,
        stamp,
      );
      setIds.push(id);
    });
    // El último ejercicio confirmado pasa a ser el contexto de la sesión abierta.
    db.prepare(
      "UPDATE workout_session SET active_exercise_id = ?, updated_at = ? WHERE id = ? AND status = 'open'",
    ).run(lastExerciseId, stamp, input.sessionId);

    const result = { requestId: input.requestId, sessionId: input.sessionId, setIds };
    db.prepare("UPDATE save_request SET result_json = ? WHERE id = ?").run(JSON.stringify(result), input.requestId);
    return { ...result, replayed: false };
  });
}

function ownedSetRow(db: DatabaseSync, userId: string, setId: string): SetRow {
  const row = db
    .prepare(`${SET_SELECT} JOIN workout_session s ON s.id = w.session_id WHERE w.id = ? AND s.user_id = ?`)
    .get(setId, userId) as SetRow | undefined;
  if (!row) throw notFound("Serie");
  return row;
}

export function updateSet(db: DatabaseSync, userId: string, setId: string, data: SetData): SetView {
  return transaction(db, () => {
    const row = ownedSetRow(db, userId, setId);
    const exerciseId = findOrCreateExercise(db, userId, data.exerciseName);
    db.prepare(
      `UPDATE workout_set SET exercise_id = ?, weight_grams = ?, weight_mode = ?, reps = ?, updated_at = ?
       WHERE id = ?`,
    ).run(exerciseId, data.weightGrams, data.weightMode, data.reps, now(), row.id);
    return toSetView(ownedSetRow(db, userId, setId));
  });
}

export function deleteSet(db: DatabaseSync, userId: string, setId: string): void {
  transaction(db, () => {
    const row = ownedSetRow(db, userId, setId);
    db.prepare("DELETE FROM workout_set WHERE id = ?").run(row.id);
  });
}

/**
 * Deshace un apunte: borra esas series y el ejercicio activo vuelve a ser el
 * de la última serie que quede en la sesión.
 */
export function undoSets(db: DatabaseSync, userId: string, setIds: string[]): SessionView {
  const sessionId = transaction(db, () => {
    const rows = setIds.map((id) => ownedSetRow(db, userId, id));
    const sessionIds = new Set(rows.map((r) => r.session_id));
    if (sessionIds.size !== 1) throw badRequest("Solo se puede deshacer un apunte de una sesión.");
    const [session] = sessionIds;
    const remove = db.prepare("DELETE FROM workout_set WHERE id = ?");
    for (const row of rows) remove.run(row.id);
    const last = db
      .prepare("SELECT exercise_id FROM workout_set WHERE session_id = ? ORDER BY position DESC LIMIT 1")
      .get(session) as { exercise_id: string } | undefined;
    db.prepare(
      "UPDATE workout_session SET active_exercise_id = ?, updated_at = ? WHERE id = ? AND status = 'open'",
    ).run(last?.exercise_id ?? null, now(), session);
    return session;
  });
  return getSession(db, userId, sessionId);
}

export function listExercises(db: DatabaseSync, userId: string): ExerciseView[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.name, MAX(s.local_date) AS last_date, COUNT(w.id) AS set_count,
              (SELECT w2.weight_mode FROM workout_set w2
               JOIN workout_session s2 ON s2.id = w2.session_id
               WHERE w2.exercise_id = e.id
               ORDER BY s2.local_date DESC, w2.created_at DESC, w2.position DESC LIMIT 1) AS last_mode
       FROM exercise e
       LEFT JOIN workout_set w ON w.exercise_id = e.id
       LEFT JOIN workout_session s ON s.id = w.session_id
       WHERE e.user_id = ?
       GROUP BY e.id
       HAVING set_count > 0
       ORDER BY e.name COLLATE NOCASE`,
    )
    .all(userId) as {
    id: string;
    name: string;
    last_date: string | null;
    set_count: number;
    last_mode: WeightMode | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    lastDate: r.last_date,
    setCount: r.set_count,
    lastWeightMode: r.last_mode,
  }));
}

/** Historial por fecha, opcionalmente limitado a las sesiones y series de un ejercicio. */
export function listHistory(
  db: DatabaseSync,
  userId: string,
  options: { exerciseId?: string; limit?: number } = {},
): SessionView[] {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 200);
  const rows = (
    options.exerciseId
      ? db
          .prepare(
            `${SESSION_SELECT}
             WHERE s.user_id = ? AND EXISTS (
               SELECT 1 FROM workout_set w WHERE w.session_id = s.id AND w.exercise_id = ?)
             ORDER BY s.local_date DESC, s.created_at DESC LIMIT ?`,
          )
          .all(userId, options.exerciseId, limit)
      : db
          .prepare(`${SESSION_SELECT} WHERE s.user_id = ? ORDER BY s.local_date DESC, s.created_at DESC LIMIT ?`)
          .all(userId, limit)
  ) as SessionRow[];
  const sets = setsForSessions(
    db,
    rows.map((r) => r.id),
    options.exerciseId,
  );
  return rows.map((row) => toSessionView(row, sets.get(row.id) ?? []));
}
