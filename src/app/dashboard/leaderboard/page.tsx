"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession, readSession, type Session } from "@/lib/session";

const MERQUE_LOGO = "/logos/merquellantas.png";

type LeaderboardRow = {
  rank: number;
  name: string;
  attempt: number;
  totalAttempts: number;
  points: number;
  isYou: boolean;
};

export default function LeaderboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = readSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    setSession(s);
  }, [router]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leaderboard?email=${encodeURIComponent(session.email)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows ?? []);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("No pudimos cargar la tabla de posiciones.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-[var(--foreground-muted)]">
        Cargando…
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MERQUE_LOGO} alt="Merquellantas" className="h-9 w-auto" />
            <span className="hidden h-6 w-px bg-[var(--line)] sm:block" />
            <span className="hidden text-sm font-semibold tracking-wide sm:inline">
              Polla Mundialista
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="rounded-sm border border-[var(--line)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              Mis boletas
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-sm border border-[var(--line)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-[var(--line)] bg-[var(--foreground)] text-white">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--brand)]">
              Tabla de posiciones
            </p>
            <h1 className="mt-3 text-3xl font-black uppercase leading-tight md:text-5xl">
              Ranking de la polla
            </h1>
            <p className="mt-3 max-w-xl text-white/70">
              Posición de cada boleta según los puntos acumulados. Por
              privacidad no se muestran cédulas ni correos de los participantes.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-12">
          {loading ? (
            <div className="border border-dashed border-[var(--line)] bg-white p-12 text-center text-sm text-[var(--foreground-muted)]">
              Cargando…
            </div>
          ) : error ? (
            <div className="border-l-4 border-[var(--brand)] bg-[var(--brand-soft)] p-6 text-sm text-[var(--brand-dark)]">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="border border-dashed border-[var(--line)] bg-white p-12 text-center text-sm text-[var(--foreground-muted)]">
              Aún no hay posiciones para mostrar.
            </div>
          ) : (
            <ul className="grid gap-2">
              {rows.map((row, i) => (
                <li
                  key={`${row.name}-${row.attempt}-${i}`}
                  className={`grid grid-cols-[auto_1fr_auto] items-center gap-4 border p-4 ${
                    row.isYou
                      ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                      : "border-[var(--line)] bg-white"
                  }`}
                >
                  <span className="grid h-10 w-10 place-items-center border border-[var(--foreground)] font-mono text-sm font-black tabular-nums">
                    {row.rank}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold">
                      {row.name}
                      {row.isYou && (
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--brand)]">
                          Tú
                        </span>
                      )}
                    </p>
                    {row.totalAttempts > 1 && (
                      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
                        Boleta · Intento {row.attempt}
                      </p>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-2xl font-black tabular-nums">
                      {row.points}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--foreground-muted)]">
                      pts
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="border-t border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 text-sm text-[var(--foreground-soft)] md:flex-row">
          <span>© {new Date().getFullYear()} · Polla Mundialista Merque</span>
          <span className="text-[var(--foreground-muted)]">
            Beneficio exclusivo para clientes Merquellantas.
          </span>
        </div>
      </footer>
    </div>
  );
}
