"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client.ts";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email: email.trim(), password });
    if (error) {
      setError(
        error.status === 429
          ? "Demasiados intentos. Espera un minuto."
          : error.status === 401
            ? "Correo o contraseña incorrectos."
            : (error.message ?? "No se pudo iniciar sesión."),
      );
      setBusy(false);
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="page" style={{ paddingTop: "calc(env(safe-area-inset-top) + 15vh)" }}>
      <h1 className="large-title">Entrenos</h1>
      <p className="subtitle" style={{ marginBottom: 24 }}>
        Tu registro personal de series.
      </p>
      <form className="card" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Correo</span>
          <input
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Contraseña</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-large btn-block" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
