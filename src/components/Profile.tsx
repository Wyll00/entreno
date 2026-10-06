"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client.ts";
import { api, formatDate, MODE_SHORT } from "@/lib/client.ts";
import type { ExerciseRecord, Profile as ProfileData } from "@/lib/profile.ts";
import { HorizontalBars, ProgressLine, WeeklyColumns } from "./charts.tsx";
import { IconPencil } from "./icons.tsx";
import { TabBar } from "./TabBar.tsx";

const kgText = (kg: string | null) => (kg === null ? "" : `${kg.replace(".", ",")} kg`);
const setText = (s: { weightKg: string | null; reps: number }) =>
  s.weightKg === null ? `${s.reps} repeticiones` : `${kgText(s.weightKg)} × ${s.reps}`;
const shortDate = (d: string) => formatDate(d, { weekday: undefined, month: "short" }).replace(".", "");

function Delta({ record }: { record: ExerciseRecord }) {
  if (record.first.date === record.latest.date) return null;
  const bodyweight = record.weightMode === "bodyweight";
  const from = bodyweight ? record.first.reps : Number(record.first.weightKg);
  const to = bodyweight ? record.latest.reps : Number(record.latest.weightKg);
  const diff = Math.round((to - from) * 100) / 100;
  const unit = bodyweight ? " reps" : " kg";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  return (
    <span className={diff > 0 ? "delta-up" : "delta-flat"}>
      {sign}
      {Math.abs(diff).toLocaleString("es-ES")}
      {unit} desde el {shortDate(record.first.date)}
    </span>
  );
}

export function Profile() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [exerciseId, setExerciseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nameForm, setNameForm] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  async function saveName() {
    const name = nameForm?.trim();
    if (!name) return;
    setSavingName(true);
    const { error } = await authClient.updateUser({ name });
    setSavingName(false);
    if (error) {
      setError(error.message ?? "No se pudo cambiar el nombre.");
      return;
    }
    setNameForm(null);
    setData((d) => d && { ...d, name });
  }

  useEffect(() => {
    const query = exerciseId ? `?exercise=${encodeURIComponent(exerciseId)}` : "";
    api<ProfileData>(`/api/profile${query}`)
      .then((p) => {
        setData(p);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [exerciseId]);

  const firstName = data?.name.trim().split(/\s+/)[0] ?? "";
  const progress = data?.progress;
  const bodyweight = progress?.weightMode === "bodyweight";

  return (
    <main className="page">
      <header className="header">
        <div style={{ flex: 1 }}>
          {nameForm !== null ? (
            <form
              className="name-form"
              onSubmit={(e) => {
                e.preventDefault();
                void saveName();
              }}
            >
              <input
                className="input"
                value={nameForm}
                maxLength={60}
                autoFocus
                aria-label="Tu nombre"
                onChange={(e) => setNameForm(e.target.value)}
              />
              <button className="btn btn-primary" disabled={savingName || !nameForm.trim()}>
                Guardar
              </button>
            </form>
          ) : (
            <h1 className="large-title" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {firstName || "Perfil"}
              {data && (
                <button className="icon-btn" aria-label="Cambiar tu nombre" onClick={() => setNameForm(data.name)}>
                  <IconPencil size={18} />
                </button>
              )}
            </h1>
          )}
          <p className="subtitle">
            {data?.since ? `Entrenando desde el ${formatDate(data.since, { weekday: undefined, year: "numeric" })}` : "Tu progreso"}
          </p>
        </div>
      </header>

      {error && <p className="notice notice-error">{error}</p>}
      {!data && !error && <p className="empty">Cargando…</p>}

      {data && data.totals.sessions === 0 && (
        <p className="empty">Cuando apuntes tus primeras series, aquí verás cómo vas.</p>
      )}

      {data && data.totals.sessions > 0 && (
        <>
          <section className="tiles" aria-label="Resumen">
            <div className="tile">
              <span className="tile-label">Entrenos</span>
              <span className="tile-value">{data.totals.sessions}</span>
            </div>
            <div className="tile">
              <span className="tile-label">Este mes</span>
              <span className="tile-value">{data.thisMonth.sessions}</span>
            </div>
            <div className="tile">
              <span className="tile-label">Racha</span>
              <span className="tile-value">
                {data.streakWeeks} <small>{data.streakWeeks === 1 ? "semana" : "semanas"}</small>
              </span>
            </div>
            <div className="tile">
              <span className="tile-label">Series</span>
              <span className="tile-value">{data.totals.sets.toLocaleString("es-ES")}</span>
            </div>
          </section>

          {progress && (
            <section className="card" style={{ marginTop: 16 }} aria-labelledby="progress-title">
              <div>
                <h2 id="progress-title" className="card-title">
                  Progreso
                </h2>
                <p className="hint">
                  {bodyweight ? "Repeticiones de tu mejor serie en cada entreno" : "Peso de tu mejor serie en cada entreno"}
                  {progress.weightMode === "per_dumbbell" ? " (por mancuerna)" : ""}
                </p>
              </div>
              <select
                className="input"
                value={progress.exerciseId}
                onChange={(e) => setExerciseId(e.target.value)}
                aria-label="Ejercicio"
              >
                {data.records.map((r) => (
                  <option key={r.exerciseId} value={r.exerciseId}>
                    {r.name}
                  </option>
                ))}
              </select>
              <ProgressLine
                label={`Progreso en ${progress.name}`}
                unit={bodyweight ? "reps" : "kg"}
                points={progress.points.map((p, i) => ({
                  key: `${p.date}-${i}`,
                  short: shortDate(p.date),
                  long: formatDate(p.date),
                  value: bodyweight ? p.reps : Number(p.weightKg),
                  detail: setText(p),
                }))}
              />
            </section>
          )}

          <section className="card" style={{ marginTop: 16 }} aria-labelledby="weekly-title">
            <div>
              <h2 id="weekly-title" className="card-title">
                Series por semana
              </h2>
              <p className="hint">Últimas 8 semanas, de lunes a domingo</p>
            </div>
            <WeeklyColumns
              label="Series por semana en las últimas 8 semanas"
              data={data.weekly.map((w) => ({
                key: w.weekStart,
                short: shortDate(w.weekStart).split(" ")[0],
                long: `Semana del ${shortDate(w.weekStart)}`,
                value: w.sets,
                detail: `${w.sets} ${w.sets === 1 ? "serie" : "series"} · ${w.sessions} ${w.sessions === 1 ? "entreno" : "entrenos"}`,
              }))}
            />
          </section>

          {data.muscles.length > 0 && (
            <section className="card" style={{ marginTop: 16 }} aria-labelledby="muscles-title">
              <div>
                <h2 id="muscles-title" className="card-title">
                  Músculos
                </h2>
                <p className="hint">Series de los últimos 30 días</p>
              </div>
              <HorizontalBars data={data.muscles.map((m) => ({ label: m.group, value: m.sets }))} />
            </section>
          )}

          <h2 className="section-title">Récords</h2>
          <div className="group">
            {data.records.map((r) => (
              <button
                type="button"
                className="row row-button"
                key={r.exerciseId}
                onClick={() => {
                  setExerciseId(r.exerciseId);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <span className="row-main">
                  <span className="row-title" style={{ display: "block", fontWeight: 500 }}>
                    {r.name}
                  </span>
                  <span className="row-detail" style={{ display: "block" }}>
                    Mejor: <span className="set-value">{setText(r.best)}</span>
                    {r.weightMode === "per_dumbbell" ? ` ${MODE_SHORT.per_dumbbell}` : ""}
                    {r.estimated1rmKg ? ` · 1RM est. ${kgText(r.estimated1rmKg)}` : ""}
                  </span>
                  <span className="mode-tag" style={{ display: "block" }}>
                    <Delta record={r} />
                    {r.first.date !== r.latest.date ? " · " : ""}
                    {r.setCount} series
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <button
        className="btn btn-plain btn-block"
        style={{ marginTop: 24 }}
        onClick={async () => {
          await authClient.signOut();
          window.location.href = "/login";
        }}
      >
        Cerrar sesión
      </button>

      <TabBar current="profile" />
    </main>
  );
}
