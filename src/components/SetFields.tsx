"use client";

import { ExerciseInput } from "./ExerciseInput.tsx";
import { WEIGHT_MODE_LABELS, WEIGHT_MODES, type WeightMode } from "@/lib/client.ts";

/** Serie en edición: los campos son texto para no inventar ceros ni redondear. */
export type SetDraft = {
  key: string;
  exerciseName: string;
  weightKg: string;
  weightMode: WeightMode | null;
  reps: string;
  sourceText: string | null;
};

export function missingFields(d: SetDraft): string[] {
  const missing: string[] = [];
  if (!d.exerciseName.trim()) missing.push("ejercicio");
  if (!d.weightMode) missing.push("tipo de peso");
  if (d.weightMode && d.weightMode !== "bodyweight" && !/^\d{1,4}([.,]\d{1,3})?$/.test(d.weightKg.trim())) {
    missing.push("peso");
  }
  if (!/^\d{1,4}$/.test(d.reps.trim()) || Number(d.reps) < 1) missing.push("repeticiones");
  return missing;
}

export function toPayload(d: SetDraft) {
  return {
    exerciseName: d.exerciseName.trim(),
    weightKg: d.weightMode === "bodyweight" ? null : d.weightKg.trim().replace(",", "."),
    weightMode: d.weightMode,
    reps: Number(d.reps),
    sourceText: d.sourceText,
  };
}

const MODE_BUTTON: Record<WeightMode, string> = {
  total: "Total",
  per_dumbbell: "Mancuerna",
  bodyweight: "Corporal",
};

export function SetFields({
  value,
  onChange,
  showErrors,
  idPrefix,
}: {
  value: SetDraft;
  onChange: (next: SetDraft) => void;
  showErrors: boolean;
  idPrefix: string;
}) {
  const missing = showErrors ? missingFields(value) : [];
  const set = (patch: Partial<SetDraft>) => onChange({ ...value, ...patch });

  return (
    <>
      <ExerciseInput
        id={`${idPrefix}-exercise`}
        value={value.exerciseName}
        invalid={missing.includes("ejercicio")}
        onType={(exerciseName) => set({ exerciseName })}
        onPick={(s) => set({ exerciseName: s.name, weightMode: value.weightMode ?? s.weightMode })}
      />

      <div className="field">
        <span className="field-label" id={`${idPrefix}-mode`}>
          Tipo de peso{value.weightMode ? `: ${WEIGHT_MODE_LABELS[value.weightMode].toLowerCase()}` : ""}
        </span>
        <div
          className="segmented"
          role="group"
          aria-labelledby={`${idPrefix}-mode`}
          aria-invalid={missing.includes("tipo de peso")}
        >
          {WEIGHT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className="segment"
              aria-pressed={value.weightMode === mode}
              title={WEIGHT_MODE_LABELS[mode]}
              onClick={() => set({ weightMode: mode, weightKg: mode === "bodyweight" ? "" : value.weightKg })}
            >
              {MODE_BUTTON[mode]}
            </button>
          ))}
        </div>
      </div>

      <div className="fields-row">
        <label className="field">
          <span className="field-label">{value.weightMode === "per_dumbbell" ? "Kg por mancuerna" : "Kg"}</span>
          <input
            className="input set-value"
            inputMode="decimal"
            value={value.weightMode === "bodyweight" ? "" : value.weightKg}
            disabled={value.weightMode === "bodyweight"}
            placeholder={value.weightMode === "bodyweight" ? "Sin carga" : "kg"}
            onChange={(e) => set({ weightKg: e.target.value })}
            aria-invalid={missing.includes("peso")}
          />
        </label>
        <label className="field">
          <span className="field-label">Repeticiones</span>
          <input
            className="input set-value"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value.reps}
            placeholder="reps"
            onChange={(e) => set({ reps: e.target.value })}
            aria-invalid={missing.includes("repeticiones")}
          />
        </label>
      </div>

      {missing.length > 0 && <p className="notice">Falta: {missing.join(", ")}.</p>}
    </>
  );
}
