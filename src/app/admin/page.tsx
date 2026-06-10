"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const MERQUE_LOGO =
  "https://www.merquellantas.com/assets/images/logo/Logo-Merquellantas.png";

const TOKEN_KEY = "polla:admin-token";

type AdminUser = {
  email: string;
  nit: string;
  cedula?: string;
  name: string;
  seller?: string;
  attemptsAllowed: number;
  createdAt: string | Date;
};

type LeaderboardRow = {
  email: string;
  name: string;
  attempt: number;
  attemptsAllowed: number;
  totalAttempts: number;
  breakdown: {
    group: {
      exact: number;
      outcomes: number;
      goalDiff: number;
      points: number;
    };
    final: {
      both: boolean;
      champion: boolean;
      runnerUp: boolean;
      points: number;
    };
    total: number;
  };
};

type LeaderboardStats = {
  totalUsers: number;
  totalPredictions: number;
  finishedGroupMatches: number;
  finishedKnockoutMatches: number;
};

type Banner = { kind: "ok" | "err"; text: string } | null;

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const [email, setEmail] = useState("");
  const [nit, setNit] = useState("");
  const [name, setName] = useState("");
  const [attempts, setAttempts] = useState("1");
  const [creating, setCreating] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardStats, setLeaderboardStats] =
    useState<LeaderboardStats | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(TOKEN_KEY) ?? "";
    setToken(saved);
    setSavedToken(saved);
  }, []);

  const loadUsers = useCallback(
    async (t: string) => {
      if (!t) {
        setUsers([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/admin/users", {
          headers: { authorization: `Bearer ${t}` },
        });
        if (res.status === 401) {
          setBanner({ kind: "err", text: "Token rechazado. Revisa ADMIN_TOKEN en Vercel." });
          setUsers([]);
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setBanner({
            kind: "err",
            text: data.detail ?? data.error ?? `Error ${res.status}`,
          });
          setUsers([]);
          return;
        }
        const data = (await res.json()) as { users: AdminUser[] };
        setUsers(data.users);
        setBanner(null);
      } catch (err) {
        setBanner({
          kind: "err",
          text: err instanceof Error ? err.message : "Error desconocido",
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadLeaderboard = useCallback(async (t: string) => {
    if (!t) {
      setLeaderboard([]);
      setLeaderboardStats(null);
      return;
    }
    setLeaderboardLoading(true);
    try {
      const res = await fetch("/api/admin/leaderboard", {
        headers: { authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        setLeaderboard([]);
        setLeaderboardStats(null);
        return;
      }
      const data = (await res.json()) as {
        rows: LeaderboardRow[];
        stats: LeaderboardStats;
      };
      setLeaderboard(data.rows);
      setLeaderboardStats(data.stats);
    } catch {
      setLeaderboard([]);
      setLeaderboardStats(null);
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (savedToken) {
      void loadUsers(savedToken);
      void loadLeaderboard(savedToken);
    }
  }, [savedToken, loadUsers, loadLeaderboard]);

  function handleSaveToken(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    window.localStorage.setItem(TOKEN_KEY, token);
    setSavedToken(token);
  }

  function handleClearToken() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setSavedToken("");
    setUsers([]);
    setLeaderboard([]);
    setLeaderboardStats(null);
    setBanner(null);
  }

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!savedToken) {
      setBanner({ kind: "err", text: "Guarda primero tu token de admin." });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanNit = nit.replace(/\D/g, "");
    const cleanName = name.trim();
    const n = Number(attempts);
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setBanner({ kind: "err", text: "Correo inválido." });
      return;
    }
    if (cleanNit.length < 6) {
      setBanner({
        kind: "err",
        text: "La cédula/NIT debe tener al menos 6 dígitos.",
      });
      return;
    }
    if (!cleanName) {
      setBanner({ kind: "err", text: "El nombre es obligatorio." });
      return;
    }
    if (!Number.isFinite(n) || n < 1 || n > 20) {
      setBanner({ kind: "err", text: "Intentos: entre 1 y 20." });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${savedToken}`,
        },
        body: JSON.stringify({
          email: cleanEmail || undefined,
          nit: cleanNit,
          cedula: nit.trim(),
          name: cleanName,
          attemptsAllowed: n,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({
          kind: "err",
          text: data.detail ?? data.error ?? `Error ${res.status}`,
        });
        return;
      }
      setBanner({
        kind: "ok",
        text: `Usuario "${cleanName}" (${cleanNit}) creado con ${n} intento${n === 1 ? "" : "s"}.`,
      });
      setEmail("");
      setNit("");
      setName("");
      setAttempts("1");
      await loadUsers(savedToken);
    } catch (err) {
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!savedToken) {
      setBanner({ kind: "err", text: "Guarda primero tu token de admin." });
      return;
    }
    if (!importFile) {
      setBanner({ kind: "err", text: "Selecciona un archivo .xlsx primero." });
      return;
    }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await fetch("/api/admin/users/import", {
        method: "POST",
        headers: { authorization: `Bearer ${savedToken}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({
          kind: "err",
          text: data.detail ?? data.error ?? `Error ${res.status}`,
        });
        return;
      }
      setBanner({
        kind: "ok",
        text: `Importados ${data.imported} usuario${data.imported === 1 ? "" : "s"}${
          data.skipped ? ` · ${data.skipped} fila(s) omitida(s) sin cédula válida` : ""
        }.`,
      });
      setImportFile(null);
      await loadUsers(savedToken);
    } catch (err) {
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setImporting(false);
    }
  }

  async function handleRefreshMatches() {
    if (!savedToken) {
      setBanner({ kind: "err", text: "Guarda primero tu token de admin." });
      return;
    }
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/refresh-matches", {
        method: "POST",
        headers: { authorization: `Bearer ${savedToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({
          kind: "err",
          text: data.error ?? `Error ${res.status}`,
        });
        return;
      }
      setBanner({
        kind: "ok",
        text: `${data.upserts} partidos cargados desde ${data.source}.`,
      });
      await loadLeaderboard(savedToken);
    } catch (err) {
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MERQUE_LOGO} alt="Merquellantas" className="h-9 w-auto" />
            <span className="hidden h-6 w-px bg-[var(--line)] sm:block" />
            <span className="hidden text-sm font-semibold tracking-wide sm:inline">
              Polla Mundialista · Admin
            </span>
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-[var(--foreground-soft)] hover:text-[var(--brand)]"
          >
            Ir al dashboard →
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand)]">
          Panel · Administración
        </p>
        <h1 className="mt-3 text-3xl font-black uppercase leading-tight md:text-4xl">
          Crear usuarios y partidos
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--foreground-soft)]">
          Esta página usa el <code className="font-mono text-sm">ADMIN_TOKEN</code>{" "}
          que configuraste en Vercel. Se guarda en tu navegador después de
          ingresarlo una vez.
        </p>

        {banner && (
          <div
            role="status"
            className={
              "mt-6 border-l-4 p-4 text-sm " +
              (banner.kind === "ok"
                ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                : "border-red-500 bg-red-50 text-red-800")
            }
          >
            {banner.text}
          </div>
        )}

        <section className="mt-10 border border-[var(--line)] bg-white p-6">
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
            1 · Token de admin
          </h2>
          <form onSubmit={handleSaveToken} className="mt-4 flex flex-wrap gap-3">
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Pega tu ADMIN_TOKEN"
              className="h-11 flex-1 min-w-[260px] border border-[var(--line)] bg-white px-3 font-mono text-sm outline-none focus:border-[var(--brand)]"
            />
            <button
              type="submit"
              className="h-11 bg-[var(--brand)] px-5 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--brand-dark)]"
            >
              Guardar
            </button>
            {savedToken && (
              <button
                type="button"
                onClick={handleClearToken}
                className="h-11 border border-[var(--line)] px-5 text-sm font-semibold uppercase tracking-[0.18em] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                Olvidar
              </button>
            )}
          </form>
          {savedToken ? (
            <p className="mt-3 text-xs text-emerald-700">
              Token guardado · ya puedes crear usuarios y refrescar partidos.
            </p>
          ) : (
            <p className="mt-3 text-xs text-[var(--foreground-muted)]">
              Sin token no puedes crear usuarios.
            </p>
          )}
        </section>

        <section className="mt-8 border border-[var(--line)] bg-white p-6">
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
            2 · Crear usuario
          </h2>
          <form onSubmit={handleCreateUser} className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                Cédula / NIT (usuario y contraseña)
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={nit}
                onChange={(e) => setNit(e.target.value.replace(/[^0-9-]/g, ""))}
                placeholder="800130426-3"
                className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 font-mono tabular-nums outline-none focus:border-[var(--brand)]"
                required
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                Correo (opcional)
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@ejemplo.com"
                className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 outline-none focus:border-[var(--brand)]"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                Nombre
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cliente Ejemplo"
                className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 outline-none focus:border-[var(--brand)]"
                required
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                Intentos permitidos (1–20)
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={attempts}
                onChange={(e) => setAttempts(e.target.value)}
                className="mt-1 h-11 w-full border border-[var(--line)] bg-white px-3 font-mono tabular-nums outline-none focus:border-[var(--brand)]"
                required
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={creating || !savedToken}
                className="h-11 w-full bg-[var(--brand)] px-5 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Creando…" : "Crear usuario"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 border border-[var(--line)] bg-white p-6">
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
            3 · Importar usuarios desde Excel (.xlsx)
          </h2>
          <p className="mt-3 text-sm text-[var(--foreground-soft)]">
            La primera fila debe tener los encabezados:{" "}
            <code className="font-mono text-xs">CEDULA/NIT</code>,{" "}
            <code className="font-mono text-xs">Etiquetas de fila</code>,{" "}
            <code className="font-mono text-xs">VENTAS</code>,{" "}
            <code className="font-mono text-xs"># ACCESOS</code>,{" "}
            <code className="font-mono text-xs">VENDEDOR</code>. La cédula/NIT se
            usa como usuario y contraseña; <strong># ACCESOS</strong> define los
            intentos permitidos. Reimportar el mismo archivo actualiza los
            usuarios sin borrar sus pronósticos.
          </p>
          <form
            onSubmit={handleImport}
            className="mt-4 flex flex-wrap items-center gap-3"
          >
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="flex-1 min-w-[260px] text-sm file:mr-3 file:h-11 file:cursor-pointer file:border-0 file:bg-[var(--foreground)] file:px-4 file:text-xs file:font-semibold file:uppercase file:tracking-[0.18em] file:text-white"
            />
            <button
              type="submit"
              disabled={importing || !savedToken || !importFile}
              className="h-11 bg-[var(--brand)] px-5 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? "Importando…" : "Importar"}
            </button>
          </form>
          {importFile && (
            <p className="mt-2 font-mono text-[11px] text-[var(--foreground-muted)]">
              Archivo: {importFile.name}
            </p>
          )}
        </section>

        <section className="mt-8 border border-[var(--line)] bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
              4 · Usuarios existentes
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
              {loading ? "Cargando…" : `${users.length} usuario${users.length === 1 ? "" : "s"}`}
            </span>
          </div>
          {users.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--foreground-muted)]">
              {savedToken
                ? "Aún no hay usuarios. Crea uno arriba."
                : "Guarda tu token para ver los usuarios."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--line)]">
              {users.map((u) => (
                <li
                  key={u.email}
                  className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[1.4fr_1fr_auto] md:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold">{u.name}</p>
                    {u.seller && (
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
                        Vendedor: {u.seller}
                      </p>
                    )}
                  </div>
                  <p className="font-mono text-xs text-[var(--foreground-soft)]">
                    Cédula/NIT {u.cedula ?? u.nit}
                  </p>
                  <span className="inline-flex w-fit items-center gap-2 border border-[var(--foreground)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em]">
                    {u.attemptsAllowed} intento
                    {u.attemptsAllowed === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8 border border-[var(--line)] bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
              5 · Tabla de posiciones
            </h2>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                {leaderboardLoading
                  ? "Cargando…"
                  : `${leaderboard.length} boleta${leaderboard.length === 1 ? "" : "s"}`}
              </span>
              <button
                type="button"
                onClick={() => void loadLeaderboard(savedToken)}
                disabled={!savedToken || leaderboardLoading}
                className="h-8 border border-[var(--line)] px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] transition hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Recalcular
              </button>
            </div>
          </div>
          {leaderboardStats && (
            <p className="mt-3 font-mono text-[11px] text-[var(--foreground-muted)]">
              {leaderboardStats.finishedGroupMatches} partido
              {leaderboardStats.finishedGroupMatches === 1 ? "" : "s"} de fase de
              grupos terminado
              {leaderboardStats.finishedGroupMatches === 1 ? "" : "s"} ·{" "}
              {leaderboardStats.finishedKnockoutMatches} de eliminatorias ·{" "}
              {leaderboardStats.totalPredictions} boletas registradas
            </p>
          )}
          {leaderboard.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--foreground-muted)]">
              {savedToken
                ? "Aún no hay puntos para mostrar. Los puntos se calcularán automáticamente cuando los partidos terminen y los marcadores se carguen."
                : "Guarda tu token para ver la tabla."}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--foreground)] text-left font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Participante</th>
                    <th className="py-2 pr-3">Intento</th>
                    <th className="py-2 pr-3 text-right">Partidos</th>
                    <th className="py-2 pr-3 text-right">Final</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, idx) => {
                    const rank = idx + 1;
                    return (
                      <tr
                        key={`${row.email}-${row.attempt}`}
                        className="border-b border-[var(--line)] align-top"
                      >
                        <td className="py-3 pr-3 font-mono text-sm font-bold tabular-nums">
                          {rank === 1
                            ? "🥇"
                            : rank === 2
                              ? "🥈"
                              : rank === 3
                                ? "🥉"
                                : rank.toString().padStart(2, "0")}
                        </td>
                        <td className="py-3 pr-3">
                          <p className="font-semibold">{row.name}</p>
                          <p className="font-mono text-[11px] text-[var(--foreground-muted)]">
                            {row.email}
                          </p>
                        </td>
                        <td className="py-3 pr-3 font-mono text-xs text-[var(--foreground-soft)]">
                          {row.attempt}/{row.attemptsAllowed}
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <div className="font-mono font-bold tabular-nums">
                            {row.breakdown.group.points}
                          </div>
                          <div className="font-mono text-[10px] text-[var(--foreground-muted)]">
                            {row.breakdown.group.exact}e ·{" "}
                            {row.breakdown.group.outcomes}r ·{" "}
                            {row.breakdown.group.goalDiff}d
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <div className="font-mono font-bold tabular-nums">
                            {row.breakdown.final.points}
                          </div>
                          <div className="font-mono text-[10px] text-[var(--foreground-muted)]">
                            {row.breakdown.final.both
                              ? "camp + sub"
                              : row.breakdown.final.champion
                                ? "camp"
                                : row.breakdown.final.runnerUp
                                  ? "sub"
                                  : "—"}
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-right font-mono text-lg font-black tabular-nums">
                          {row.breakdown.total}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                Partidos: e = exactos (50), r = resultado (30), d = diferencia
                de gol (20) · Final: campeón y sub 350 · campeón 300 · sub 250
              </p>
            </div>
          )}
        </section>

        <section className="mt-8 border border-[var(--line)] bg-white p-6">
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
            6 · Partidos del Mundial
          </h2>
          <p className="mt-3 text-sm text-[var(--foreground-soft)]">
            Se cargan automáticamente la primera vez que alguien abre el
            dashboard. Si quieres forzar una recarga desde Wikipedia (o tu
            proveedor configurado), usa el botón.
          </p>
          <button
            type="button"
            onClick={handleRefreshMatches}
            disabled={refreshing || !savedToken}
            className="mt-4 h-11 border border-[var(--foreground)] px-5 text-sm font-semibold uppercase tracking-[0.18em] transition hover:bg-[var(--foreground)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Cargando…" : "Refrescar partidos"}
          </button>
        </section>

        <p className="mt-10 text-xs text-[var(--foreground-muted)]">
          ¿Necesitas diagnosticar la conexión a Mongo? Abre{" "}
          <Link className="underline" href="/api/health">
            /api/health
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
