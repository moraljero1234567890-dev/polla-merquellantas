import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCountry } from "@/lib/country-data";

export const revalidate = 86400;

const MERQUE_LOGO = "/logos/merquellantas.png";

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="border border-[var(--line)] bg-white p-4">
      <dt className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-semibold text-[var(--foreground)]">
        {value}
      </dd>
    </div>
  );
}

export default async function CountryPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await loadCountry(code);
  if (!data) notFound();

  const factsHasAny = Object.values(data.facts).some(Boolean);
  const ms = data.worldCup.matchStats;
  const matchStatsHasAny = !!(
    ms.played ||
    ms.won ||
    ms.drawn ||
    ms.lost ||
    ms.goalsFor ||
    ms.goalsAgainst
  );
  const wcHasAny = !!(
    data.worldCup.appearances ||
    data.worldCup.firstAppearance ||
    data.worldCup.bestResult ||
    data.worldCup.summary ||
    matchStatsHasAny
  );
  const perMatch = (n: number | null, played: number | null): string | null => {
    if (n == null || !played) return null;
    return (n / played).toFixed(2);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MERQUE_LOGO} alt="Merquellantas" className="h-9 w-auto" />
            <span className="hidden h-6 w-px bg-[var(--line)] sm:block" />
            <span className="hidden text-sm font-semibold tracking-wide sm:inline">
              Polla Mundialista
            </span>
          </Link>
          <Link
            href="/dashboard"
            className="rounded-sm border border-[var(--line)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            ← Volver
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-[var(--line)] bg-[var(--foreground)] text-white">
          <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-6 py-12 md:flex-row md:items-center md:gap-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.flag}
              alt={data.es}
              className="h-28 w-44 border border-white/20 object-cover"
            />
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--brand)]">
                Selección Masculina · {data.fifa}
              </p>
              <h1 className="mt-3 text-4xl font-black uppercase leading-tight md:text-5xl">
                {data.es}
              </h1>
              {data.es !== data.en && (
                <p className="mt-2 text-sm text-white/60">{data.en}</p>
              )}
              {data.facts.nickname && (
                <p className="mt-3 italic text-white/80">
                  &ldquo;{data.facts.nickname}&rdquo;
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-10">
          {data.summary?.extract && (
            <div className="border-l-4 border-[var(--brand)] bg-white p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand)]">
                Resumen
              </p>
              <p className="mt-3 leading-relaxed text-[var(--foreground)]">
                {data.summary.extract}
              </p>
              <a
                href={data.summary.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-4 inline-block text-xs font-mono uppercase tracking-[0.28em] text-[var(--brand-dark)] underline"
              >
                Wikipedia ↗
              </a>
            </div>
          )}

          {wcHasAny && (
            <div className="mt-10">
              <div className="mb-3 flex items-baseline justify-between border-b border-[var(--foreground)] pb-2">
                <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
                  Récord en Copa del Mundo
                </h2>
              </div>
              <dl className="grid gap-3 md:grid-cols-3">
                <Stat label="Participaciones" value={data.worldCup.appearances} />
                <Stat label="Primera vez" value={data.worldCup.firstAppearance} />
                <Stat label="Mejor resultado" value={data.worldCup.bestResult} />
              </dl>

              {matchStatsHasAny && (
                <div className="mt-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                    Datos de partidos
                  </p>
                  <dl className="mt-2 grid gap-3 md:grid-cols-3">
                    <Stat
                      label="Partidos"
                      value={ms.played != null ? String(ms.played) : null}
                    />
                    <Stat
                      label="Partidos ganados"
                      value={ms.won != null ? String(ms.won) : null}
                    />
                    <Stat
                      label="Partidos empatados"
                      value={ms.drawn != null ? String(ms.drawn) : null}
                    />
                    <Stat
                      label="Partidos perdidos"
                      value={ms.lost != null ? String(ms.lost) : null}
                    />
                    <Stat
                      label="Goles anotados"
                      value={
                        ms.goalsFor != null
                          ? perMatch(ms.goalsFor, ms.played)
                            ? `${ms.goalsFor} (${perMatch(ms.goalsFor, ms.played)} por partido)`
                            : String(ms.goalsFor)
                          : null
                      }
                    />
                    <Stat
                      label="Goles recibidos"
                      value={
                        ms.goalsAgainst != null
                          ? perMatch(ms.goalsAgainst, ms.played)
                            ? `${ms.goalsAgainst} (${perMatch(ms.goalsAgainst, ms.played)} por partido)`
                            : String(ms.goalsAgainst)
                          : null
                      }
                    />
                  </dl>
                </div>
              )}

              {data.worldCup.summary && (
                <div className="mt-4 border border-[var(--line)] bg-white p-5">
                  <p className="leading-relaxed text-sm text-[var(--foreground)]">
                    {data.worldCup.summary}
                  </p>
                  {data.worldCup.url && (
                    <a
                      href={data.worldCup.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-3 inline-block text-xs font-mono uppercase tracking-[0.28em] text-[var(--brand-dark)] underline"
                    >
                      Historia completa ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {factsHasAny && (
            <div className="mt-10">
              <div className="mb-3 flex items-baseline justify-between border-b border-[var(--foreground)] pb-2">
                <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
                  Datos de la selección
                </h2>
              </div>
              <dl className="grid gap-3 md:grid-cols-2">
                <Stat label="Ranking FIFA" value={data.facts.fifaRanking} />
                <Stat label="Director técnico" value={data.facts.headCoach} />
                <Stat label="Capitán" value={data.facts.captain} />
                <Stat label="Más partidos" value={data.facts.mostCaps} />
                <Stat label="Máximo goleador" value={data.facts.topScorer} />
                <Stat label="Estadio local" value={data.facts.homeStadium} />
                <Stat label="Asociación" value={data.facts.association} />
                <Stat label="Confederación" value={data.facts.confederation} />
                <Stat label="Primer partido" value={data.facts.firstGame} />
                <Stat label="Mayor victoria" value={data.facts.largestWin} />
                <Stat label="Peor derrota" value={data.facts.worstDefeat} />
              </dl>
            </div>
          )}

          {data.recentSquad.length > 0 && (
            <div className="mt-10">
              <div className="mb-3 flex items-baseline justify-between border-b border-[var(--foreground)] pb-2">
                <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
                  Jugadores recientes
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--foreground-muted)]">
                  {data.recentSquad.length}
                </span>
              </div>
              <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {data.recentSquad.map((name) => (
                  <li
                    key={name}
                    className="border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!data.summary && !factsHasAny && !wcHasAny && (
            <div className="border border-dashed border-[var(--line)] bg-white p-12 text-center text-sm text-[var(--foreground-muted)]">
              No pudimos cargar los datos de Wikipedia para esta selección.
              Intenta recargar en unos minutos.
            </div>
          )}

          <div className="mt-12 border-t border-[var(--line)] pt-6 text-xs text-[var(--foreground-muted)]">
            Fuente: Wikipedia (es).
          </div>
        </section>
      </main>
    </div>
  );
}
