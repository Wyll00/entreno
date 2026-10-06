"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  formatDate,
  formatSet,
  groupByExercise,
  MODE_SHORT,
  newId,
  type SessionView,
  type SetView,
  type WeightMode,
} from "@/lib/client.ts";
import type { Interpretation, InterpretedItem } from "@/lib/interpret.ts";
import { IconCopy, IconPencil, IconPlus, IconTrash } from "./icons.tsx";
import { missingFields, SetFields, toPayload, type SetDraft } from "./SetFields.tsx";
import { TabBar } from "./TabBar.tsx";
import { VoiceCapture } from "./VoiceCapture.tsx";

type DraftItem = SetDraft & { candidates: InterpretedItem["candidates"] };
type Draft = { requestId: string; items: DraftItem[]; questions: string[]; heard: string | null };
type Status = { kind: "ok" | "error" | "warn"; text: string } | null;
type Saved = { setIds: string[]; lines: string[]; heard: string };
type CatalogName = { name: string; defaultWeightMode: WeightMode | null };
type LogResponse = { saved: boolean; setIds?: string[]; interpretation: Interpretation; session: SessionView };

function draftFromSet(set: SetView): SetDraft {
  return {
    key: set.id,
    exerciseName: set.exerciseName,
    weightKg: set.weightKg?.replace(".", ",") ?? "",
    weightMode: set.weightMode,
    reps: String(set.reps),
    sourceText: set.sourceText,
  };
}

function draftFromInterpretation(item: InterpretedItem, sourceText: string): DraftItem {
  return {
    key: newId(),
    exerciseName: item.exerciseName ?? "",
    weightKg: item.weightKg?.replace(".", ",") ?? "",
    weightMode: item.weightMode,
    reps: item.reps === null ? "" : String(item.reps),
    sourceText,
    candidates: item.candidates,
  };
}

function savedLine(item: InterpretedItem): string {
  const set = formatSet({ weightKg: item.weightKg, weightMode: item.weightMode ?? "total", reps: item.reps ?? 0 });
  const mode = item.weightMode && item.weightMode !== "bodyweight" ? ` (${MODE_SHORT[item.weightMode]})` : "";
  return `${item.exerciseName} · ${set}${mode}`;
}

/** Junta las series iguales: «Press · 60 kg × 8 (total)» ×3. */
function collapse(lines: string[]): string[] {
  const out: { line: string; n: number }[] = [];
  for (const line of lines) {
    const last = out.at(-1);
    if (last?.line === line) last.n++;
    else out.push({ line, n: 1 });
  }
  return out.map((o) => (o.n > 1 ? `${o.n} × ${o.line}` : o.line));
}

export function Today({ greeting }: { greeting: string }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [today, setToday] = useState("");
  const [catalog, setCatalog] = useState<CatalogName[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showDraftErrors, setShowDraftErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [editing, setEditing] = useState<SetDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editRequest, setEditRequest] = useState<{ text: string; n: number } | null>(null);

  const loadCatalog = useCallback(() => {
    void api<{ exercises: CatalogName[] }>("/api/exercises?scope=catalog").then((r) => setCatalog(r.exercises));
  }, []);

  const reload = useCallback(async () => {
    try {
      const s = await api<{ session: SessionView | null; today: string }>("/api/sessions");
      setSession(s.session);
      setToday(s.today);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No se pudo cargar.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    loadCatalog();
  }, [reload, loadCatalog]);

  const modeFor = useCallback(
    (name: string) =>
      catalog.find((e) => e.name.toLowerCase() === name.trim().toLowerCase())?.defaultWeightMode ?? null,
    [catalog],
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setStatus(null);
    try {
      await action();
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "Algo ha fallado." });
    } finally {
      setBusy(false);
    }
  }

  // ——— Voz / texto ———
  const logPhrase = async (text: string) => {
    setBusy(true);
    setStatus(null);
    setSaved(null);
    setDraft(null);
    setShowDraftErrors(false);
    const requestId = newId();
    const send = () => api<LogResponse>("/api/log", { method: "POST", body: { requestId, text } });
    try {
      let r: LogResponse;
      try {
        r = await send();
      } catch (error) {
        // Un corte de red: se reintenta una vez con el mismo requestId (no duplica).
        if (error instanceof ApiError && error.status === 0) r = await send();
        else throw error;
      }
      setSession(r.session);
      const { interpretation } = r;
      if (r.saved && r.setIds) {
        setSaved({ setIds: r.setIds, lines: collapse(interpretation.items.map(savedLine)), heard: text });
        loadCatalog();
      } else if (interpretation.status === "needs_clarification" && interpretation.items.length > 0) {
        setDraft({
          requestId,
          items: interpretation.items.map((item) => draftFromInterpretation(item, text)),
          questions: interpretation.questions,
          heard: text,
        });
      } else {
        const label = interpretation.label ? `Sesión: ${interpretation.label}. ` : "";
        const message = interpretation.questions.join(" ") || "Dime ejercicio, peso y repeticiones.";
        setStatus({ kind: interpretation.label ? "ok" : "warn", text: `${label}${message}`.trim() });
      }
    } catch (error) {
      setStatus({
        kind: "error",
        text: `${error instanceof Error ? error.message : "Algo ha fallado."} No se ha apuntado nada: «${text}».`,
      });
    } finally {
      setBusy(false);
    }
  };

  const undo = (thenEdit = false) =>
    run(async () => {
      if (!saved) return;
      const r = await api<{ session: SessionView }>("/api/sets/undo", { method: "POST", body: { setIds: saved.setIds } });
      setSession(r.session);
      setSaved(null);
      if (thenEdit) {
        setEditRequest({ text: saved.heard, n: Date.now() });
        setStatus({ kind: "ok", text: "Deshecho. Corrige la frase y vuelve a enviarla." });
      } else {
        setStatus({ kind: "ok", text: "Deshecho." });
      }
    });

  // ——— Sesión ———
  const patchSession = (patch: Record<string, unknown>) =>
    run(async () => {
      if (!session) return;
      const r = await api<{ session: SessionView }>(`/api/sessions/${session.id}`, { method: "PATCH", body: patch });
      setSession(r.session.status === "open" ? r.session : null);
      if (r.session.status === "closed") {
        setDraft(null);
        setSaved(null);
        setStatus({ kind: "ok", text: "Sesión cerrada. Queda en el historial." });
      }
    });

  const startToday = () =>
    run(async () => {
      const r = await api<{ session: SessionView }>("/api/sessions", { method: "POST", body: {} });
      setSession(r.session);
      setDraft(null);
      setSaved(null);
    });

  // ——— Borrador (a mano o para completar lo dictado) ———
  const blankItem = (): DraftItem => {
    const name = session?.activeExercise?.name ?? "";
    return { key: newId(), exerciseName: name, weightKg: "", weightMode: modeFor(name), reps: "", sourceText: null, candidates: [] };
  };

  const addItem = () => {
    setStatus(null);
    setSaved(null);
    setDraft((d) =>
      d ? { ...d, items: [...d.items, blankItem()] } : { requestId: newId(), items: [blankItem()], questions: [], heard: null },
    );
  };

  const updateItem = (key: string, next: DraftItem) => {
    // Al elegir un ejercicio del catálogo se propone su tipo de peso (visible y editable).
    const withMode = next.weightMode === null ? { ...next, weightMode: modeFor(next.exerciseName) } : next;
    setDraft((d) => d && { ...d, items: d.items.map((i) => (i.key === key ? withMode : i)) });
  };

  const pickCandidate = (key: string, candidate: InterpretedItem["candidates"][number]) =>
    setDraft(
      (d) =>
        d && {
          ...d,
          items: d.items.map((i) =>
            i.key === key ? { ...i, exerciseName: candidate.name, weightMode: i.weightMode ?? candidate.weightMode } : i,
          ),
        },
    );

  const duplicateItem = (key: string) =>
    setDraft((d) => {
      if (!d) return d;
      const index = d.items.findIndex((i) => i.key === key);
      const copy = { ...d.items[index], key: newId() };
      return { ...d, items: [...d.items.slice(0, index + 1), copy, ...d.items.slice(index + 1)] };
    });

  const removeItem = (key: string) =>
    setDraft((d) => {
      if (!d) return d;
      const items = d.items.filter((i) => i.key !== key);
      return items.length ? { ...d, items } : null;
    });

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.items.every((i) => missingFields(i).length === 0)) {
      setShowDraftErrors(true);
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      let target = session;
      if (!target) {
        target = (await api<{ session: SessionView }>("/api/sessions", { method: "POST", body: {} })).session;
      }
      const r = await api<{ session: SessionView; setIds: string[] }>("/api/sets", {
        method: "POST",
        body: { requestId: draft.requestId, sessionId: target.id, items: draft.items.map(toPayload) },
      });
      setSession(r.session);
      setDraft(null);
      setShowDraftErrors(false);
      const n = r.setIds.length;
      setStatus({ kind: "ok", text: `Guardado: ${n} ${n === 1 ? "serie" : "series"}.` });
      loadCatalog();
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        setStatus({
          kind: "warn",
          text: "No se pudo confirmar el guardado. Pulsa Guardar de nuevo: si ya se guardó, no se duplicará.",
        });
      } else {
        setStatus({ kind: "error", text: error instanceof Error ? error.message : "No se ha guardado." });
      }
    } finally {
      setBusy(false);
    }
  };

  // ——— Series guardadas ———
  const saveEdit = () =>
    run(async () => {
      if (!editing) return;
      if (missingFields(editing).length) throw new Error(`Falta: ${missingFields(editing).join(", ")}.`);
      await api(`/api/sets/${editing.key}`, { method: "PATCH", body: toPayload(editing) });
      setEditing(null);
      setSaved(null);
      await reload();
      setStatus({ kind: "ok", text: "Serie actualizada." });
    });

  const deleteSet = (id: string) =>
    run(async () => {
      await api(`/api/sets/${id}`, { method: "DELETE" });
      setConfirmDelete(null);
      setSaved(null);
      await reload();
      setStatus({ kind: "ok", text: "Serie borrada." });
    });

  if (!loaded) {
    return (
      <main className="page">
        <p className="empty">Cargando…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page">
        <p className="notice notice-error">{loadError}</p>
        <button className="btn btn-tinted btn-block" onClick={() => void reload()} style={{ marginTop: 12 }}>
          Reintentar
        </button>
      </main>
    );
  }

  const sessionExercises = session ? [...new Map(session.sets.map((s) => [s.exerciseId, s.exerciseName]))] : [];
  const staleSession = session && today && session.localDate !== today;
  const hint = session?.activeExercise
    ? `Ejercicio activo: ${session.activeExercise.name}. Puedes decir «otra con 60 y 8».`
    : "Di el ejercicio, el peso y las repeticiones. Ej.: «sentadilla 100 kilos 5 repeticiones».";

  return (
    <main className="page">
      <header className="header">
        <div>
          <p className="greeting">{greeting}</p>
          <h1 className="large-title">Hoy</h1>
          <p className="subtitle">{formatDate(session?.localDate ?? today)}</p>
        </div>
        {session?.label && <span className="chip">{session.label}</span>}
      </header>

      {staleSession && (
        <p className="notice" style={{ marginBottom: 12 }}>
          La sesión abierta es del {formatDate(session.localDate)}.{" "}
          <button className="btn btn-plain" onClick={startToday} disabled={busy}>
            Empezar una nueva hoy
          </button>
        </p>
      )}

      <VoiceCapture onSubmit={logPhrase} busy={busy} hint={draft ? null : hint} editRequest={editRequest} />

      {status && (
        <p
          className={`notice ${status.kind === "ok" ? "notice-ok" : status.kind === "error" ? "notice-error" : ""}`}
          role="status"
          style={{ marginTop: 12 }}
        >
          {status.text}
        </p>
      )}

      {saved && (
        <section className="card saved-card" role="status" style={{ marginTop: 12 }}>
          <strong>Apuntado</strong>
          {saved.lines.map((line) => (
            <span className="saved-line" key={line}>
              {line}
            </span>
          ))}
          <span className="hint">He entendido: «{saved.heard}»</span>
          <div className="actions">
            <button className="btn" onClick={() => undo(true)} disabled={busy}>
              Corregir texto
            </button>
            <button className="btn btn-tinted" onClick={() => undo()} disabled={busy}>
              Deshacer
            </button>
          </div>
        </section>
      )}

      {draft && (
        <section className="card" aria-labelledby="draft-title" style={{ marginTop: 12 }}>
          <h2 id="draft-title" style={{ margin: 0, fontSize: 17 }}>
            {draft.heard ? "Me falta algo" : "Serie a mano"}
          </h2>
          {draft.heard && (
            <p className="transcript">
              «{draft.heard}»{" "}
              <button
                type="button"
                className="btn btn-plain"
                style={{ minHeight: 32, fontStyle: "normal" }}
                onClick={() => {
                  const heard = draft.heard ?? "";
                  setDraft(null);
                  setEditRequest({ text: heard, n: Date.now() });
                }}
              >
                Corregir texto
              </button>
            </p>
          )}
          {draft.questions.map((q) => (
            <p className="question" key={q}>
              {q}
            </p>
          ))}
          {draft.items.map((item, index) => (
            <div className="draft-item" key={item.key}>
              <div className="draft-item-head">
                <span>Serie {index + 1}</span>
                <span>
                  <button className="icon-btn" aria-label="Duplicar serie" onClick={() => duplicateItem(item.key)}>
                    <IconCopy size={18} />
                  </button>
                  <button className="icon-btn" aria-label="Quitar del borrador" onClick={() => removeItem(item.key)}>
                    <IconTrash size={18} />
                  </button>
                </span>
              </div>
              {item.candidates.length > 0 && (
                <div className="chips" role="group" aria-label="¿Qué ejercicio?">
                  {item.candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="chip-btn"
                      aria-pressed={item.exerciseName === c.name}
                      onClick={() => pickCandidate(item.key, c)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              <SetFields
                value={item}
                onChange={(next) => updateItem(item.key, { ...item, ...next })}
                showErrors={showDraftErrors || draft.heard !== null}
                idPrefix={`draft-${item.key}`}
              />
            </div>
          ))}
          <button className="btn btn-tinted" onClick={addItem} disabled={busy}>
            <IconPlus /> Otra serie
          </button>
          <div className="actions">
            <button
              className="btn"
              onClick={() => {
                setDraft(null);
                setShowDraftErrors(false);
              }}
              disabled={busy}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={saveDraft} disabled={busy}>
              {busy ? "Guardando…" : `Guardar ${draft.items.length} ${draft.items.length === 1 ? "serie" : "series"}`}
            </button>
          </div>
        </section>
      )}

      <h2 className="section-title">Series</h2>
      <div className="group">
        {(!session || session.sets.length === 0) && <p className="empty">Aún no hay series hoy.</p>}
        {session &&
          groupByExercise(session.sets).map((group, gi) => (
            <div key={`${group.name}-${gi}`}>
              <div className="row">
                <div className="row-main row-title">{group.name}</div>
              </div>
              {group.sets.map((set, i) =>
                editing?.key === set.id ? (
                  <div className="row" key={set.id} style={{ display: "block" }}>
                    <div className="draft-item">
                      <SetFields
                        value={editing}
                        onChange={setEditing}
                                showErrors
                        idPrefix={`edit-${set.id}`}
                      />
                      <div className="actions">
                        <button className="btn" onClick={() => setEditing(null)} disabled={busy}>
                          Cancelar
                        </button>
                        <button className="btn btn-primary" onClick={saveEdit} disabled={busy}>
                          Guardar cambios
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="row" key={set.id}>
                    <div className="row-main">
                      <span className="row-detail">Serie {i + 1} · </span>
                      <span className="set-value">{formatSet(set)}</span>{" "}
                      <span className="mode-tag">{MODE_SHORT[set.weightMode]}</span>
                    </div>
                    {confirmDelete === set.id ? (
                      <>
                        <button className="btn btn-danger" onClick={() => deleteSet(set.id)} disabled={busy}>
                          Borrar
                        </button>
                        <button className="btn btn-plain" onClick={() => setConfirmDelete(null)}>
                          No
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="icon-btn"
                          aria-label={`Editar serie ${i + 1} de ${set.exerciseName}`}
                          onClick={() => {
                            setConfirmDelete(null);
                            setEditing(draftFromSet(set));
                          }}
                        >
                          <IconPencil />
                        </button>
                        <button
                          className="icon-btn"
                          aria-label={`Borrar serie ${i + 1} de ${set.exerciseName}`}
                          onClick={() => setConfirmDelete(set.id)}
                        >
                          <IconTrash />
                        </button>
                      </>
                    )}
                  </div>
                ),
              )}
            </div>
          ))}
      </div>

      {!draft && (
        <button className="btn btn-plain btn-block" style={{ marginTop: 8 }} onClick={addItem}>
          <IconPlus /> Añadir serie a mano
        </button>
      )}

      {session && (
        <>
          <h2 className="section-title">Sesión</h2>
          <div className="group">
            <label className="row">
              <span className="row-main">Fecha</span>
              <input
                className="input"
                style={{ width: "auto" }}
                type="date"
                value={session.localDate}
                onChange={(e) => e.target.value && patchSession({ localDate: e.target.value })}
              />
            </label>
            <label className="row">
              <span className="row-main">Etiqueta</span>
              <input
                className="input"
                style={{ width: "50%" }}
                defaultValue={session.label ?? ""}
                key={session.label ?? ""}
                maxLength={60}
                placeholder="Opcional"
                onBlur={(e) =>
                  e.target.value !== (session.label ?? "") && patchSession({ label: e.target.value || null })
                }
              />
            </label>
            <label className="row">
              <span className="row-main">Ejercicio activo</span>
              <select
                className="input"
                style={{ width: "50%" }}
                value={session.activeExercise?.id ?? ""}
                onChange={(e) => patchSession({ activeExerciseId: e.target.value || null })}
              >
                <option value="">Ninguno</option>
                {sessionExercises.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            <button
              className="btn btn-tinted"
              disabled={busy}
              onClick={() => {
                if (window.confirm("¿Terminar este entrenamiento? Sus series quedan en el historial.")) {
                  void patchSession({ status: "closed" });
                }
              }}
            >
              Terminar entrenamiento
            </button>
          </div>
        </>
      )}

      <TabBar current="today" />
    </main>
  );
}
