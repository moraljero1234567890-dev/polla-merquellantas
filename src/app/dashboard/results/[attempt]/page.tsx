"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/data/worldcup2026";
import { staticFallback, type ApiMatch } from "@/lib/matches";
import { clearSession, readSession, type Session } from "@/lib/session";
// Type-only import: erased at compile time, so the "server-only" guard
// inside scoring.ts never runs in the browser bundle.
import type { AttemptScore } from "@/lib/scoring";
import { displayTeam, normalizeTeam } from "@/lib/team-display";
import type { KnockoutPick, PredictionDoc } from "@/lib/types";

const MERQUE_LOGO = "/logos/merquellantas.png";

const STAGE_TITLES: Record<KnockoutPick["stage"], string> = {
  ROUND_OF_32: "Dieciseisavos",
  ROUND_OF_16: "Octavos",
  QUARTER_FINALS: "Cuartos",
  SEMI_FINALS: "Semifinales",
  THIRD_PLACE: "Tercer puesto",
  FINAL: "Final",
};


type MatchWithScore = ApiMatch;

function pickClass(
  predicted: { home: number; away: number } | null,
  actual: { home: number; away: number } | null,
): string {
  if (!actual) return "border-[var(--line)] bg-white";
  if (!predicted) return "border-[var(--line)] bg-white";
  if (predicted.home === actual.home && predicted.away === actual.away) {
    return "border-emerald-600 bg-emerald-50";
  }
  const predDiff = predicted.home - predicted.away;
  const actDiff = actual.home - actual.away;
  const sameOutcome =
    (predDiff > 0 && actDiff > 0) ||
    (predDiff < 0 && actDiff < 0) ||
    (predDiff === 0 && actDiff === 0);
  if (sameOutcome) return "border-amber-500 bg-amber-50";
  return "border-red-400 bg-red-50";
}

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams<{ attempt: string }>();
  const attemptNum = Number(params.attempt);

  const [session, setSession] = useState<Session | null>(null);
  const [matches, setMatches] = useState<MatchWithScore[]>([]);
  const [prediction, setPrediction] = useState<PredictionDoc | null>(null);
  const [score, setScore] = useState<AttemptScore | null>(null);
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
    Promise.all([
      fetch("/api/matches").then((r) => r.json()),
      fetch(
        `/api/predictions/${attemptNum}?email=${encodeURIComponent(session.email)}`,
      ).then((r) => r.json()),
    ])
      .then(([m, p]) => {
        if (cancelled) return;
        const arr: MatchWithScore[] = Array.isArray(m.matches)
          ? m.matches
          : staticFallback();
        setMatches(arr.length ? arr : staticFallback());
        setPrediction(p.prediction);
        setScore(p.score ?? null);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("No pudimos cargar tu boleta.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, attemptNum]);

  // Only show group matches that have actually been played (or are in progress).
  // Showing SCHEDULED future matches would make it look like users predicted
  // games that "never happened."
  const groupMatches = useMemo(
    () =>
      matches.filter(
        (m) =>
          m.stage === "GROUP_STAGE" &&
          m.group &&
          (m.status === "FINISHED" || m.status === "IN_PLAY"),
      ),
    [matches],
  );

  // Real knockout fixtures indexed two ways so we can find the result for any
  // pick regardless of whether team codes or matchId ordering aligns exactly.
  const knockoutMatchByKey = useMemo(() => {
    const map = new Map<string, MatchWithScore>();
    for (const m of matches) {
      if (m.stage === "GROUP_STAGE") continue;
      const a = m.home.code.toLowerCase();
      const b = m.away.code.toLowerCase();
      if (!a || !b) continue;
      const key = `${m.stage}|${[a, b].sort().join("~")}`;
      map.set(key, m);
    }
    return map;
  }, [matches]);

  const knockoutMatchByMatchId = useMemo(() => {
    const PREFIX: Record<string, string> = {
      ROUND_OF_32: "R32",
      ROUND_OF_16: "R16",
      QUARTER_FINALS: "QF",
      SEMI_FINALS: "SF",
      THIRD_PLACE: "THIRD",
      FINAL: "FINAL",
    };
    const map = new Map<string, MatchWithScore>();
    for (const m of matches) {
      if (m.stage === "GROUP_STAGE") continue;
      const src = m.externalId ?? (/^wiki-(.+)$/.exec(m._id)?.[1] ?? null);
      if (!src) continue;
      const parts = /^([A-Z_]+)-(\d+)$/.exec(src);
      if (!parts) continue;
      const prefix = PREFIX[parts[1]];
      if (!prefix) continue;
      map.set(`${prefix}-${parts[2]}`, m);
    }
    return map;
  }, [matches]);

  function knockoutKey(stage: string, codeA: string, codeB: string): string | null {
    const a = codeA.trim().toLowerCase();
    const b = codeB.trim().toLowerCase();
    if (!stage || !a || !b) return null;
    return `${stage}|${[a, b].sort().join("~")}`;
  }

  function findRealMatch(matchId: string, stage: string, codeA: string, codeB: string): MatchWithScore | null {
    // Primary: matchId-based (code-independent)
    const byId = knockoutMatchByMatchId.get(matchId);
    if (byId) return byId;
    // Fallback: identity key
    const key = knockoutKey(stage, codeA, codeB);
    return key ? (knockoutMatchByKey.get(key) ?? null) : null;
  }

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
          <Link href="/dashboard" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MERQUE_LOGO} alt="Merquellantas" className="h-9 w-auto" />
            <span className="hidden h-6 w-px bg-[var(--line)] sm:block" />
            <span className="hidden text-sm font-semibold tracking-wide sm:inline">
              Polla Mundialista
            </span>
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-sm border border-[var(--line)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-[var(--line)] bg-[var(--foreground)] text-white">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--brand)]">
              Boleta · Intento {attemptNum}
            </p>
            <h1 className="mt-3 text-3xl font-black uppercase leading-tight md:text-5xl">
              Tu pronóstico vs. resultados reales
            </h1>
            <p className="mt-3 max-w-xl text-white/70">
              Los marcadores se actualizan diariamente durante el Mundial.
              <span className="text-emerald-300"> Verde</span> = exacto,{" "}
              <span className="text-amber-300">amarillo</span> = mismo resultado,{" "}
              <span className="text-red-300">rojo</span> = fallaste.
            </p>
            <div className="mt-6 grid max-w-md grid-cols-3 gap-6 font-mono text-[11px] uppercase tracking-[0.28em] text-white/60">
              <div>
                <dt>Puntos totales</dt>
                <dd className="mt-1 text-3xl font-black tabular-nums text-[var(--brand)]">
                  {score?.breakdown.total ?? 0}
                </dd>
              </div>
              <div>
                <dt>Fase grupos</dt>
                <dd className="mt-1 text-3xl font-black tabular-nums text-white">
                  {score?.breakdown.group.points ?? 0}
                </dd>
              </div>
              <div>
                <dt>Eliminatorias</dt>
                <dd className="mt-1 text-3xl font-black tabular-nums text-white">
                  {score?.breakdown.knockout?.points ?? 0}
                </dd>
              </div>
            </div>
          </div>
        </section>

        {loading || !prediction ? (
          <section className="mx-auto max-w-6xl px-6 py-12">
            <div className="border border-dashed border-[var(--line)] bg-white p-12 text-center text-sm text-[var(--foreground-muted)]">
              Cargando…
            </div>
          </section>
        ) : (
          <>
            {error && (
              <div className="mx-auto mt-6 max-w-6xl border-l-4 border-[var(--brand)] bg-[var(--brand-soft)] p-4 px-6 text-sm text-[var(--brand-dark)]">
                {error}
              </div>
            )}

            <section className="mx-auto max-w-6xl px-6 py-10">
              <h2 className="border-b border-[var(--foreground)] pb-2 font-mono text-xs font-bold uppercase tracking-[0.3em]">
                Desglose de puntos
              </h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    {
                      label: "Marcador exacto (grupos)",
                      count: score?.breakdown.group.exact ?? 0,
                      each: 50,
                    },
                    {
                      label: "Resultado (ganador o empate) grupos",
                      count: score?.breakdown.group.outcomes ?? 0,
                      each: 30,
                    },
                    {
                      label: "Diferencia de gol (grupos)",
                      count: score?.breakdown.group.goalDiff ?? 0,
                      each: 20,
                    },
                  ] as const
                ).map((item) => (
                  <div
                    key={item.label}
                    className={`border p-4 ${
                      item.count > 0
                        ? "border-emerald-600 bg-emerald-50"
                        : "border-[var(--line)] bg-white"
                    }`}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                      {item.label}
                    </p>
                    <p className="mt-2 flex items-baseline gap-2">
                      <span className="font-mono text-2xl font-black tabular-nums">
                        {item.count}
                      </span>
                      <span className="text-xs text-[var(--foreground-soft)]">
                        × {item.each} pts ={" "}
                        <span className="font-bold text-[var(--foreground)]">
                          {item.count * item.each}
                        </span>
                      </span>
                    </p>
                  </div>
                ))}
                <div
                  className={`border p-4 sm:col-span-2 lg:col-span-3 ${
                    (score?.breakdown.knockout?.points ?? 0) > 0
                      ? "border-emerald-600 bg-emerald-50"
                      : "border-[var(--line)] bg-white"
                  }`}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                    Eliminatorias (octavos en adelante · máx 125 pts/partido)
                  </p>
                  <p className="mt-2 flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-black tabular-nums">
                      {score?.breakdown.knockout?.points ?? 0}
                    </span>
                    <span className="text-xs text-[var(--foreground-soft)]">
                      pts · 40 resultado + 60 exacto + 25 diferencia de gol
                    </span>
                  </p>
                </div>
              </div>
            </section>

            <section className="mx-auto max-w-6xl px-6 py-10">
              <h2 className="border-b border-[var(--foreground)] pb-2 font-mono text-xs font-bold uppercase tracking-[0.3em]">
                Fase de grupos
              </h2>
              <ul className="mt-6 grid gap-3">
                {groupMatches.map((m) => {
                  const predicted = prediction.groupScores[m._id] ?? null;
                  const actual = m.score?.fullTime ?? null;
                  const homeT = normalizeTeam(m.home);
                  const awayT = normalizeTeam(m.away);
                  return (
                    <li
                      key={m._id}
                      className={`grid grid-cols-1 items-center gap-3 border p-4 md:grid-cols-[120px_1fr_auto_1fr_auto] ${pickClass(
                        predicted,
                        actual,
                      )}`}
                    >
                      <div className="hidden font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)] md:block">
                        <div>{formatDate(m.date)}</div>
                        <div>Grupo {m.group}</div>
                      </div>
                      <div className="flex items-center gap-3 md:justify-end">
                        <span className="text-right text-base font-bold uppercase tracking-tight">
                          {homeT.name}
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={homeT.crest}
                          alt=""
                          aria-hidden
                          className="h-9 w-12 border border-[var(--line)] object-cover"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-center font-mono text-sm">
                        <div>
                          <div className="text-[9px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                            Tú
                          </div>
                          <div className="mt-1 text-2xl font-black tabular-nums">
                            {predicted
                              ? `${predicted.home}–${predicted.away}`
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                            Real
                          </div>
                          <div className="mt-1 text-2xl font-black tabular-nums">
                            {actual
                              ? `${actual.home}–${actual.away}`
                              : "—"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={awayT.crest}
                          alt=""
                          aria-hidden
                          className="h-9 w-12 border border-[var(--line)] object-cover"
                        />
                        <span className="text-base font-bold uppercase tracking-tight">
                          {awayT.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)] md:flex-col md:items-end md:gap-1 md:text-right">
                        <span>
                          {m.status === "FINISHED"
                            ? "Final"
                            : m.status === "IN_PLAY"
                              ? "En juego"
                              : "Programado"}
                        </span>
                        {m.status === "FINISHED" &&
                          (() => {
                            const pts =
                              score?.groupPointsByMatch[m._id] ?? 0;
                            return (
                              <span
                                className={`border px-2 py-0.5 text-[11px] font-black tabular-nums tracking-normal ${
                                  pts > 0
                                    ? "border-emerald-600 bg-emerald-100 text-emerald-800"
                                    : "border-[var(--line)] bg-white text-[var(--foreground-muted)]"
                                }`}
                              >
                                +{pts} pts
                              </span>
                            );
                          })()}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="mx-auto max-w-6xl px-6 pb-16">
              <h2 className="border-b border-[var(--foreground)] pb-2 font-mono text-xs font-bold uppercase tracking-[0.3em]">
                Eliminatorias (tu llave)
              </h2>
              <div className="mt-6 grid gap-10">
                {(
                  [
                    { stage: "ROUND_OF_32" as const, picks: prediction.knockout.r32, scored: false },
                    { stage: "ROUND_OF_16" as const, picks: prediction.knockout.r16, scored: true },
                    { stage: "QUARTER_FINALS" as const, picks: prediction.knockout.qf, scored: true },
                    { stage: "SEMI_FINALS" as const, picks: prediction.knockout.sf, scored: true },
                    ...(prediction.knockout.third
                      ? [{ stage: "THIRD_PLACE" as const, picks: [prediction.knockout.third], scored: true }]
                      : []),
                    ...(prediction.knockout.final
                      ? [{ stage: "FINAL" as const, picks: [prediction.knockout.final], scored: true }]
                      : []),
                  ] as const
                ).map(({ stage, picks, scored }) => {
                  const visiblePicks = picks.filter((p) => p.homeTeamCode && p.awayTeamCode);
                  if (!visiblePicks.length) return null;
                  return (
                    <div key={stage}>
                      <h3 className="mb-3 border-b border-[var(--foreground)] pb-2 font-mono text-xs font-bold uppercase tracking-[0.3em]">
                        {STAGE_TITLES[stage]}
                        {scored ? (
                          <span className="ml-3 font-normal text-[var(--foreground-muted)]">
                            · máx 125 pts/partido
                          </span>
                        ) : (
                          <span className="ml-3 font-normal text-[var(--foreground-muted)]">
                            · sin puntos
                          </span>
                        )}
                      </h3>
                      <ul className="grid gap-3">
                        {visiblePicks.map((p) => {
                          const h = displayTeam(p.homeTeamCode, p.homeTeamName);
                          const a = displayTeam(p.awayTeamCode, p.awayTeamName);
                          const pts = scored
                            ? (score?.breakdown.knockout?.byMatch[p.matchId] ?? null)
                            : null;
                          const realMatch = findRealMatch(p.matchId, stage, p.homeTeamCode, p.awayTeamCode);
                          const realFt = realMatch?.score?.fullTime ?? null;
                          const userPredicted = p.home != null && p.away != null;
                          const cardClass =
                            scored && realFt && userPredicted
                              ? (pts ?? 0) > 0
                                ? "border-emerald-600 bg-emerald-50"
                                : "border-red-400 bg-red-50"
                              : "border-[var(--line)] bg-white";
                          return (
                            <li
                              key={p.matchId}
                              className={`grid grid-cols-1 items-center gap-3 border p-4 md:grid-cols-[1fr_auto_1fr_auto] ${cardClass}`}
                            >
                              <div className="flex items-center justify-end gap-3 md:text-right">
                                <span className="text-base font-bold uppercase tracking-tight">
                                  {h.name || "—"}
                                </span>
                                {h.crest && (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={h.crest}
                                    alt=""
                                    aria-hidden
                                    className="h-9 w-12 shrink-0 border border-[var(--line)] object-cover"
                                  />
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-3 text-center font-mono text-sm">
                                <div>
                                  <div className="text-[9px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                                    Tú
                                  </div>
                                  <div className="mt-1 text-2xl font-black tabular-nums">
                                    {userPredicted
                                      ? `${p.home}–${p.away}${p.penaltyWinner ? " pen" : ""}`
                                      : "—"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[9px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                                    Real
                                  </div>
                                  <div className="mt-1 text-2xl font-black tabular-nums">
                                    {realFt
                                      ? `${realFt.home}–${realFt.away}${realMatch?.score?.penalties ? " pen" : ""}`
                                      : "—"}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                {a.crest && (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={a.crest}
                                    alt=""
                                    aria-hidden
                                    className="h-9 w-12 shrink-0 border border-[var(--line)] object-cover"
                                  />
                                )}
                                <span className="text-base font-bold uppercase tracking-tight">
                                  {a.name || "—"}
                                </span>
                              </div>

                              <div className="flex items-center justify-end gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)] md:flex-col md:items-end md:gap-1">
                                <span>
                                  {realFt
                                    ? "Final"
                                    : realMatch?.status === "IN_PLAY"
                                      ? "En juego"
                                      : "Pendiente"}
                                </span>
                                {scored && realFt && (
                                  <span
                                    className={`border px-2 py-0.5 text-[11px] font-black tabular-nums tracking-normal ${
                                      (pts ?? 0) > 0
                                        ? "border-emerald-600 bg-emerald-100 text-emerald-800"
                                        : "border-[var(--line)] bg-white text-[var(--foreground-muted)]"
                                    }`}
                                  >
                                    +{pts ?? 0} pts
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}

                {prediction.champion && (
                  <div className="border-l-4 border-[var(--brand)] bg-[var(--brand-soft)] p-8">
                    <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand-dark)]">
                      Tu campeón pronosticado
                    </p>
                    <p className="mt-3 text-4xl font-black uppercase tracking-tight text-[var(--brand-dark)]">
                      {displayTeam(
                        prediction.champion.code,
                        prediction.champion.name,
                      ).name}
                    </p>
                    <p className="mt-2 text-sm text-[var(--brand-dark)]/70">
                      Los puntos por el campeón se calculan en el partido de la Final.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
