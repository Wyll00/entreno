"use client";

import { useEffect, useRef, useState } from "react";
import { api, type WeightMode } from "@/lib/client.ts";

type Suggestion = { id: string; name: string; weightMode: WeightMode | null };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Campo «Ejercicio» con sugerencias del catálogo mientras escribes: los que
 * contienen lo escrito y, si no, los parecidos. Si el nombre no existe, avisa
 * de que se creará un ejercicio nuevo (nada se crea a escondidas).
 */
export function ExerciseInput({
  id,
  value,
  invalid,
  onType,
  onPick,
}: {
  id: string;
  value: string;
  invalid: boolean;
  onType: (text: string) => void;
  onPick: (s: Suggestion) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused && suggestions !== null && value.trim() === "") return;
    const timer = setTimeout(() => {
      api<{ suggestions: Suggestion[] }>(`/api/exercises?scope=suggest&q=${encodeURIComponent(value)}`)
        .then((r) => setSuggestions(r.suggestions))
        .catch(() => setSuggestions([]));
    }, 180);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  const exact = suggestions?.some((s) => norm(s.name) === norm(value)) ?? false;
  const isNew = value.trim() !== "" && suggestions !== null && !exact;
  const visible = (suggestions ?? []).filter((s) => norm(s.name) !== norm(value));
  const show = focused || isNew;

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        Ejercicio
      </label>
      <input
        id={id}
        className="input"
        value={value}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          // deja tiempo a que el toque en una sugerencia llegue antes de ocultarlas
          blurTimer.current = setTimeout(() => setFocused(false), 200);
        }}
        placeholder="Escribe y elige, p. ej. «press banca»"
        autoComplete="off"
        autoCapitalize="sentences"
        aria-invalid={invalid}
      />
      {show && visible.length > 0 && (
        <div className="chips" role="listbox" aria-label="Sugerencias de ejercicio" style={{ marginTop: 6 }}>
          {visible.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={false}
              className="chip-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(s)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {isNew && (
        <p className="hint" style={{ marginTop: 4 }}>
          «{value.trim()}» no está en el catálogo{visible.length ? ": elige uno de arriba o " : ": "}
          se guardará como ejercicio nuevo.
        </p>
      )}
    </div>
  );
}
