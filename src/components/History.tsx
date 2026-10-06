"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  formatDate,
  formatSet,
  groupByExercise,
  MODE_SHORT,
  type ExerciseView,
  type SessionView,
  type SetView,
} from "@/lib/client.ts";
import { IconPencil } from "./icons.tsx";
import { missingFields, SetFields, toPayload, type SetDraft } from "./SetFields.tsx";
import { TabBar } from "./TabBar.tsx";

const draftFromSet = (set: SetView): SetDraft => ({
  key: set.id,
  exerciseName: set.exerciseName,
  weightKg: set.weightKg?.replace(".", ",") ?? "",
  weightMode: set.weightMode,
  reps: String(set.reps),
  sourceText: set.sourceText,
});

type SessionForm = { id: string; localDate: string; label: string };

export function History() {
  const [exercises, setExercises] = useState<ExerciseView[]>([]);
  const [exerciseId, setExerciseId] = useState("");
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingSet, setEditingSet] = useState<SetDraft | null>(null);
  const [confirmDeleteSet, setConfirmDeleteSet] = useState(false);
  const [sessionForm, setSessionForm] = useState<SessionForm | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);

  const load = useCallback(async () => {
    const query = exerciseId ? `?exercise=${encodeURIComponent(exerciseId)}` : "";
    try {
      const [h, e] = await Promise.all([
        api<{ sessions: SessionView[] }>(`/api/history${query}`),
        api<{ exercises: ExerciseView[] }>("/api/exercises"),
      ]);
      setSessions(h.sessions);
      setExercises(e.exercises);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    }
  }, [exerciseId]);

  useEffect(() => {
    setSessions(null);
    void load();
  }, [load]);

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await action();
      setEditingSet(null);
      setConfirmDeleteSet(false);
      setSessionForm(null);
      setConfirmDeleteSession(false);
      setNotice(done);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha guardado.");
    } finally {
      setBusy(false);
    }
  }

  const saveSet = () => {
    if (!editingSet) return;
    const missing = missingFields(editingSet);
    if (missing.length) {
      setError(`Falta: ${missing.join(", ")}.`);
      return;
    }
    void act(() => api(`/api/sets/${editingSet.key}`, { method: "PATCH", body: toPayload(editingSet) }), "Serie corregida.");
  };

  const selected = exercises.find((e) => e.id === exerciseId);
  const last = selected && sessions?.[0];

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1 className="large-title">Historial</h1>
          <p className="subtitle">Toca ✎ para corregir cualquier cosa.</p>
        </div>
      </header>

      <label className="field">
        <span className="field-label">Ejercicio</span>
        <select className="input" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
          <option value="">Todos los ejercicios</option>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p className="notice notice-error" style={{ marginTop: 12 }} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice notice-ok" style={{ marginTop: 12 }} role="status">
          {notice}
        </p>
      )}

      {last && (
        <section className="card" style={{ marginTop: 16 }} aria-label="Última vez">
          <span className="field-label">La última vez · {formatDate(last.localDate)}</span>
          <strong style={{ fontSize: 20 }} className="set-value">
            {last.sets.map((s) => formatSet(s)).join(" · ")}
          </strong>
        </section>
      )}

      {sessions === null && !error && <p className="empty">Cargando…</p>}
      {sessions?.length === 0 && <p className="empty">Todavía no hay entrenamientos guardados.</p>}

      {sessions?.map((session) => (
        <section key={session.id} aria-label={formatDate(session.localDate)}>
          {sessionForm?.id === session.id ? (
            <div className="card" style={{ marginTop: 24 }}>
              <div className="fields-row">
                <label className="field">
                  <span className="field-label">Fecha</span>
                  <input
                    className="input"
                    type="date"
                    value={sessionForm.localDate}
                    onChange={(e) => setSessionForm({ ...sessionForm, localDate: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Etiqueta</span>
                  <input
                    className="input"
                    value={sessionForm.label}
                    maxLength={60}
                    placeholder="Opcional"
                    onChange={(e) => setSessionForm({ ...sessionForm, label: e.target.value })}
                  />
                </label>
              </div>
              <div className="actions">
                <button className="btn" onClick={() => setSessionForm(null)} disabled={busy}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || !sessionForm.localDate}
                  onClick={() =>
                    void act(
                      () =>
                        api(`/api/sessions/${session.id}`, {
                          method: "PATCH",
                          body: { localDate: sessionForm.localDate, label: sessionForm.label || null },
                        }),
                      "Sesión actualizada.",
                    )
                  }
                >
                  Guardar
                </button>
              </div>
              {session.status === "closed" && (
                <button
                  className="btn btn-tinted"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await api(`/api/sessions/${session.id}`, { method: "PATCH", body: { status: "open" } });
                      window.location.href = "/";
                    }, "Sesión reabierta.")
                  }
                >
                  Reabrir para añadir series
                </button>
              )}
              {confirmDeleteSession ? (
                <div className="actions">
                  <button className="btn btn-plain" onClick={() => setConfirmDeleteSession(false)}>
                    No
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() =>
                      void act(() => api(`/api/sessions/${session.id}`, { method: "DELETE" }), "Sesión borrada.")
                    }
                  >
                    Sí, borrar sesión y {session.sets.length} series
                  </button>
                </div>
              ) : (
                <button className="btn btn-danger" onClick={() => setConfirmDeleteSession(true)}>
                  Borrar sesión
                </button>
              )}
            </div>
          ) : (
            <div className="session-head">
              <h2 className="section-title" style={{ margin: 0 }}>
                {formatDate(session.localDate, { year: "numeric" })}
                {session.label ? ` · ${session.label}` : ""}
                {session.status === "open" ? " · en curso" : ""}
              </h2>
              <button
                className="icon-btn"
                aria-label={`Editar la sesión del ${formatDate(session.localDate)}`}
                onClick={() => {
                  setEditingSet(null);
                  setConfirmDeleteSession(false);
                  setSessionForm({ id: session.id, localDate: session.localDate, label: session.label ?? "" });
                }}
              >
                <IconPencil size={18} />
              </button>
            </div>
          )}

          <div className="group">
            {session.sets.length === 0 && <p className="empty">Sin series.</p>}
            {groupByExercise(session.sets).map((group, gi) => (
              <div key={`${group.name}-${gi}`}>
                <div className="row">
                  <div className="row-main row-title" style={{ fontWeight: 500 }}>
                    {group.name}
                  </div>
                </div>
                {group.sets.map((set) =>
                  editingSet?.key === set.id ? (
                    <div className="row" key={set.id} style={{ display: "block" }}>
                      <div className="draft-item">
                        <SetFields value={editingSet} onChange={setEditingSet} showErrors idPrefix={`h-${set.id}`} />
                        <div className="actions">
                          <button className="btn" onClick={() => setEditingSet(null)} disabled={busy}>
                            Cancelar
                          </button>
                          <button className="btn btn-primary" onClick={saveSet} disabled={busy}>
                            Guardar
                          </button>
                        </div>
                        {confirmDeleteSet ? (
                          <div className="actions">
                            <button className="btn btn-plain" onClick={() => setConfirmDeleteSet(false)}>
                              No
                            </button>
                            <button
                              className="btn btn-danger"
                              disabled={busy}
                              onClick={() => void act(() => api(`/api/sets/${set.id}`, { method: "DELETE" }), "Serie borrada.")}
                            >
                              Sí, borrar esta serie
                            </button>
                          </div>
                        ) : (
                          <button className="btn btn-danger" onClick={() => setConfirmDeleteSet(true)}>
                            Borrar serie
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="row" key={set.id}>
                      <div className="row-main">
                        <span className="set-value">{formatSet(set)}</span>{" "}
                        <span className="mode-tag">{MODE_SHORT[set.weightMode]}</span>
                        {set.sourceText && (
                          <span className="mode-tag" style={{ display: "block" }}>
                            «{set.sourceText}»
                          </span>
                        )}
                      </div>
                      <button
                        className="icon-btn"
                        aria-label={`Editar ${formatSet(set)} de ${set.exerciseName}`}
                        onClick={() => {
                          setSessionForm(null);
                          setConfirmDeleteSet(false);
                          setError(null);
                          setEditingSet(draftFromSet(set));
                        }}
                      >
                        <IconPencil size={18} />
                      </button>
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <TabBar current="history" />
    </main>
  );
}
