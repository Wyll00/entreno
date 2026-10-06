"use client";

import { useEffect, useState } from "react";
import { api, MODE_SHORT, WEIGHT_MODE_LABELS, WEIGHT_MODES, type WeightMode } from "@/lib/client.ts";
import type { CatalogExercise } from "@/lib/exercises.ts";
import { MUSCLE_GROUPS } from "@/lib/muscle-groups.ts";
import { IconPencil, IconPlus } from "./icons.tsx";
import { TabBar } from "./TabBar.tsx";

type Form = { id: string | null; name: string; muscleGroup: string; mode: WeightMode | null; aliases: string };

const emptyForm = (): Form => ({ id: null, name: "", muscleGroup: "Otros", mode: null, aliases: "" });

function ExerciseForm({
  form,
  setForm,
  onSave,
  onCancel,
  onDelete,
  busy,
  error,
}: {
  form: Form;
  setForm: (f: Form) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Solo si el ejercicio existe y no tiene series. */
  onDelete?: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="draft-item">
      <label className="field">
        <span className="field-label">Nombre</span>
        <input className="input" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label className="field">
        <span className="field-label">Grupo muscular</span>
        <select className="input" value={form.muscleGroup} onChange={(e) => setForm({ ...form, muscleGroup: e.target.value })}>
          {MUSCLE_GROUPS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </label>
      <div className="field">
        <span className="field-label">Peso por defecto al decir «60 kilos»</span>
        <div className="segmented" role="group">
          {WEIGHT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className="segment"
              aria-pressed={form.mode === mode}
              title={WEIGHT_MODE_LABELS[mode]}
              onClick={() => setForm({ ...form, mode: form.mode === mode ? null : mode })}
            >
              {mode === "total" ? "Total" : mode === "per_dumbbell" ? "Mancuerna" : "Corporal"}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span className="field-label">Otras formas de decirlo (separadas por comas)</span>
        <textarea
          className="input"
          rows={2}
          value={form.aliases}
          placeholder="banca, press plano"
          onChange={(e) => setForm({ ...form, aliases: e.target.value })}
        />
      </label>
      {error && <p className="notice notice-error">{error}</p>}
      <div className="actions">
        <button className="btn" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={onSave} disabled={busy || !form.name.trim()}>
          Guardar
        </button>
      </div>
      {onDelete &&
        (confirm ? (
          <div className="actions">
            <button className="btn btn-plain" onClick={() => setConfirm(false)}>
              No
            </button>
            <button className="btn btn-danger" onClick={onDelete} disabled={busy}>
              Sí, borrar ejercicio
            </button>
          </div>
        ) : (
          <button className="btn btn-danger" onClick={() => setConfirm(true)}>
            Borrar ejercicio
          </button>
        ))}
    </div>
  );
}

export function Exercises() {
  const [query, setQuery] = useState("");
  const [list, setList] = useState<CatalogExercise[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      api<{ exercises: CatalogExercise[] }>(`/api/exercises?scope=catalog&q=${encodeURIComponent(query)}`)
        .then((r) => {
          setList(r.exercises);
          setLoadError(null);
        })
        .catch((e: Error) => setLoadError(e.message));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, refresh]);

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        muscleGroup: form.muscleGroup,
        defaultWeightMode: form.mode,
        aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean),
      };
      if (form.id) await api(`/api/exercises/${form.id}`, { method: "PATCH", body });
      else await api("/api/exercises", { method: "POST", body });
      setForm(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha guardado.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/exercises/${id}`, { method: "DELETE" });
      setForm(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha borrado.");
    } finally {
      setBusy(false);
    }
  }

  const edit = (e: CatalogExercise) => {
    setError(null);
    setForm({
      id: e.id,
      name: e.name,
      muscleGroup: e.muscleGroup ?? "Otros",
      mode: e.defaultWeightMode,
      aliases: e.aliases.join(", "),
    });
  };

  const groups = MUSCLE_GROUPS.map((g) => ({ group: g, items: (list ?? []).filter((e) => (e.muscleGroup ?? "Otros") === g) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1 className="large-title">Ejercicios</h1>
          <p className="subtitle">Así los reconoce la voz.</p>
        </div>
        {!form && (
          <button
            className="btn btn-tinted"
            onClick={() => {
              setError(null);
              setForm(emptyForm());
            }}
          >
            <IconPlus /> Nuevo
          </button>
        )}
      </header>

      {form && form.id === null && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Nuevo ejercicio</h2>
          <ExerciseForm form={form} setForm={setForm} onSave={save} onCancel={() => setForm(null)} busy={busy} error={error} />
        </section>
      )}

      <input
        className="input"
        type="search"
        placeholder="Buscar entre más de 800 ejercicios"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Buscar ejercicio"
      />
      <p className="hint" style={{ margin: "8px 4px 0" }}>
        {query ? "Resultados de la búsqueda." : "Habituales, tuyos y los que ya has usado. Busca para ver el resto."}
      </p>

      {loadError && <p className="notice notice-error">{loadError}</p>}
      {list === null && !loadError && <p className="empty">Cargando…</p>}
      {list?.length === 0 && <p className="empty">Nada con ese nombre. Puedes crearlo con «Nuevo».</p>}

      {groups.map(({ group, items }) => (
        <section key={group} aria-label={group}>
          <h2 className="section-title">{group}</h2>
          <div className="group">
            {items.map((e) =>
              form?.id === e.id ? (
                <div className="row" key={e.id} style={{ display: "block" }}>
                  <ExerciseForm
                    form={form}
                    setForm={setForm}
                    onSave={save}
                    onCancel={() => setForm(null)}
                    onDelete={e.setCount === 0 ? () => void remove(e.id) : undefined}
                    busy={busy}
                    error={error}
                  />
                  {e.setCount > 0 && (
                    <p className="hint" style={{ marginTop: 8 }}>
                      Tiene {e.setCount} series: para conservarlas no se puede borrar, pero sí renombrar.
                    </p>
                  )}
                </div>
              ) : (
                <div className="row" key={e.id}>
                  <div className="row-main">
                    <div className="row-title" style={{ fontWeight: 500 }}>
                      {e.name}
                    </div>
                    <div className="row-detail">
                      {e.defaultWeightMode ? MODE_SHORT[e.defaultWeightMode] : "tipo de peso sin definir"}
                      {e.setCount > 0 ? ` · ${e.setCount} series` : ""}
                      {e.source === "custom" ? " · tuyo" : ""}
                    </div>
                    {e.aliases.length > 0 && <div className="mode-tag">También: {e.aliases.join(", ")}</div>}
                  </div>
                  <button className="icon-btn" aria-label={`Editar ${e.name}`} onClick={() => edit(e)}>
                    <IconPencil />
                  </button>
                </div>
              ),
            )}
          </div>
        </section>
      ))}

      <TabBar current="exercises" />
    </main>
  );
}
