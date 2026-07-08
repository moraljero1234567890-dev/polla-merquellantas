"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { formatDate } from "@/data/worldcup2026";
import { computeGroupStandings, type StandingRow } from "@/lib/bracket";
import {
  isGroupMatchLocked,
  isKnockoutMatchLocked,
  isKnockoutStageLocked,
  knockoutIdentityKey,
} from "@/lib/locks";
import { colombiaKickoff, staticFallback, type ApiMatch } from "@/lib/matches";
import { clearSession, readSession, type Session } from "@/lib/session";
import { displayTeam, normalizeTeam } from "@/lib/team-display";
import type { KnockoutPick, PredictionDoc } from "@/lib/types";

type CountryPreview = {
  es: string;
  flag: string;
  worldCup: {
    appearances: string | null;
    bestResult: string | null;
    matchStats: {
      played: number | null;
      won: number | null;
      drawn: number | null;
      lost: number | null;
      goalsFor: number | null;
      goalsAgainst: number | null;
    };
  };
};

const countryCache = new Map<string, Promise<CountryPreview | null>>();

function fetchCountryPreview(code: string): Promise<CountryPreview | null> {
  const key = code.toLowerCase();
  const hit = countryCache.get(key);
  if (hit) return hit;
  const p = fetch(`/api/country/${encodeURIComponent(code)}`, {
    cache: "force-cache",
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  countryCache.set(key, p);
  return p;
}

function HoverCard({
  rect,
  code,
  fallbackName,
  fallbackFlag,
}: {
  rect: DOMRect;
  code: string;
  fallbackName: string;
  fallbackFlag?: string;
}) {
  const [data, setData] = useState<CountryPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCountryPreview(code).then((d) => {
      if (cancelled) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (typeof document === "undefined") return null;

  const cardWidth = 280;
  const margin = 8;
  // Prefer above; flip to below if too close to top
  const placement: "above" | "below" =
    rect.top < 220 ? "below" : "above";
  const top = placement === "above" ? rect.top - margin : rect.bottom + margin;
  let left = rect.left + rect.width / 2 - cardWidth / 2;
  const viewportW =
    typeof window !== "undefined" ? window.innerWidth : cardWidth;
  if (left < 8) left = 8;
  if (left + cardWidth > viewportW - 8) left = viewportW - 8 - cardWidth;

  const ms = data?.worldCup.matchStats;
  const apps = data?.worldCup.appearances;
  const best = data?.worldCup.bestResult;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[100]"
      style={{
        top,
        left,
        width: cardWidth,
        transform: placement === "above" ? "translateY(-100%)" : "none",
      }}
    >
      <div className="border border-[var(--foreground)] bg-white p-3 shadow-xl">
        <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data?.flag ?? fallbackFlag ?? ""}
            alt=""
            aria-hidden
            className="h-6 w-9 border border-[var(--line)] object-cover"
          />
          <span className="text-sm font-black uppercase tracking-tight">
            {data?.es ?? fallbackName}
          </span>
        </div>

        {loading && !data ? (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
            Cargando…
          </p>
        ) : !data ? (
          <p className="mt-2 text-xs text-[var(--foreground-soft)]">
            Sin datos disponibles.
          </p>
        ) : !apps && !ms?.played && !best ? (
          <p className="mt-2 text-xs text-[var(--foreground-soft)]">
            Sin datos de Copa del Mundo.
          </p>
        ) : (
          <dl className="mt-2 space-y-1 text-xs">
            {apps && (
              <div className="flex justify-between gap-2">
                <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                  Mundiales
                </dt>
                <dd className="font-bold tabular-nums">{apps}</dd>
              </div>
            )}
            {ms?.played != null && (
              <div className="flex justify-between gap-2">
                <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                  Partidos
                </dt>
                <dd className="font-bold tabular-nums">{ms.played}</dd>
              </div>
            )}
            {(ms?.won != null || ms?.drawn != null || ms?.lost != null) && (
              <div className="flex justify-between gap-2">
                <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                  G · E · P
                </dt>
                <dd className="font-bold tabular-nums">
                  <span className="text-emerald-700">{ms.won ?? "—"}</span>
                  {" · "}
                  <span>{ms.drawn ?? "—"}</span>
                  {" · "}
                  <span className="text-red-700">{ms.lost ?? "—"}</span>
                </dd>
              </div>
            )}
            {(ms?.goalsFor != null || ms?.goalsAgainst != null) && (
              <div className="flex justify-between gap-2">
                <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                  Goles
                </dt>
                <dd className="font-bold tabular-nums">
                  {ms.goalsFor ?? "—"}{" "}
                  <span className="text-[var(--foreground-muted)]">·</span>{" "}
                  {ms.goalsAgainst ?? "—"}
                </dd>
              </div>
            )}
            {best && (
              <div className="pt-1">
                <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                  Mejor resultado
                </dt>
                <dd className="font-semibold leading-snug">{best}</dd>
              </div>
            )}
          </dl>
        )}

        <p className="mt-2 border-t border-[var(--line)] pt-2 font-mono text-[9px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
          Clic para ver más
        </p>
      </div>
    </div>,
    document.body,
  );
}

const MERQUE_LOGO = "/logos/merquellantas.png";

type SaveState = "idle" | "saving" | "saved" | "error";

type GroupDraft = { home: number | null; away: number | null };

function ScoreInput({
  value,
  onChange,
  onCommit,
  ariaLabel,
  size = "lg",
  disabled = false,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  onCommit?: () => void;
  ariaLabel: string;
  size?: "lg" | "sm";
  disabled?: boolean;
}) {
  const [text, setText] = useState<string>(
    value == null || value === undefined ? "" : String(value),
  );
  useEffect(() => {
    setText(value == null || value === undefined ? "" : String(value));
  }, [value]);
  const sizeCls =
    size === "sm"
      ? "h-9 w-9 text-base"
      : "h-12 w-14 text-xl";
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={20}
      aria-label={ariaLabel}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        if (disabled) return;
        const raw = e.target.value.replace(/[^0-9]/g, "");
        setText(raw);
        if (raw === "") {
          onChange(null);
        } else {
          const n = Number(raw);
          if (Number.isInteger(n) && n >= 0 && n <= 20) onChange(n);
        }
      }}
      onBlur={() => onCommit?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Tab") onCommit?.();
      }}
      className={`${sizeCls} border border-[var(--line)] text-center font-mono font-black tabular-nums outline-none transition ${
        disabled
          ? "cursor-not-allowed bg-[var(--surface)] text-[var(--foreground-muted)]"
          : "bg-white focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
      }`}
    />
  );
}

function TeamLink({
  code,
  name,
  crest,
  flagClass = "h-5 w-7",
  textClass = "text-sm font-bold uppercase tracking-tight",
  align = "left",
}: {
  code: string;
  name: string;
  crest?: string;
  flagClass?: string;
  textClass?: string;
  align?: "left" | "right";
}) {
  const triggerRef = useRef<HTMLAnchorElement | HTMLDivElement | null>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    return () => {
      if (enterTimer.current) clearTimeout(enterTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  const handleEnter = useCallback(() => {
    if (!code) return;
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    if (enterTimer.current) clearTimeout(enterTimer.current);
    enterTimer.current = setTimeout(() => {
      const el = triggerRef.current;
      if (!el) return;
      setRect(el.getBoundingClientRect());
      // Warm the cache before the popup mounts
      fetchCountryPreview(code);
    }, 180);
  }, [code]);

  const handleLeave = useCallback(() => {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setRect(null), 80);
  }, []);

  const inner = (
    <>
      {align === "right" && (
        <span className={`${textClass} truncate`}>{name || "—"}</span>
      )}
      {crest ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={crest}
          alt=""
          aria-hidden
          className={`${flagClass} shrink-0 border border-[var(--line)] object-cover`}
        />
      ) : null}
      {align === "left" && (
        <span className={`${textClass} truncate`}>{name || "—"}</span>
      )}
    </>
  );
  const wrap = `flex min-w-0 items-center gap-2 ${align === "right" ? "justify-end text-right" : ""}`;

  if (!code) {
    return <div className={wrap}>{inner}</div>;
  }
  return (
    <>
      <Link
        ref={triggerRef as React.RefObject<HTMLAnchorElement>}
        href={`/dashboard/country/${encodeURIComponent(code)}`}
        className={`${wrap} transition hover:text-[var(--brand)]`}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
      >
        {inner}
      </Link>
      {rect && (
        <HoverCard
          rect={rect}
          code={code}
          fallbackName={name}
          fallbackFlag={crest}
        />
      )}
    </>
  );
}

function GroupMatchRow({
  match,
  score,
  onChange,
  onCommit,
  locked = false,
}: {
  match: ApiMatch;
  score: GroupDraft | undefined;
  onChange: (home: number | null, away: number | null) => void;
  onCommit: () => void;
  locked?: boolean;
}) {
  const home = normalizeTeam(match.home);
  const away = normalizeTeam(match.away);
  // Show kickoff in Colombia time (UTC-5); fall back to stored UTC date/time
  const kickoff = match.utcDate
    ? colombiaKickoff(match.utcDate)
    : { date: formatDate(match.date), time: match.time };
  return (
    <li
      className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 border p-4 md:grid-cols-[120px_1fr_auto_1fr_auto] ${
        locked ? "border-[var(--line)] bg-[var(--surface)]" : "border-[var(--line)] bg-white"
      }`}
    >
      <div className="hidden font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)] md:block">
        <div>{kickoff.date}</div>
        <div className="text-[var(--foreground)]">{kickoff.time}</div>
        {locked && (
          <div className="mt-1 font-bold text-[var(--brand)]">Cerrado</div>
        )}
      </div>
      <div className="md:justify-end">
        <TeamLink
          code={home.code}
          name={home.name}
          crest={home.crest}
          flagClass="h-9 w-12"
          textClass="text-base font-bold uppercase tracking-tight"
          align="right"
        />
      </div>
      <div className="flex items-center gap-2">
        <ScoreInput
          value={score?.home ?? null}
          onChange={(v) => onChange(v, score?.away ?? null)}
          onCommit={onCommit}
          ariaLabel={`${home.name} goles`}
          disabled={locked}
        />
        <span className="font-mono text-xs font-bold text-[var(--foreground-muted)]">
          vs
        </span>
        <ScoreInput
          value={score?.away ?? null}
          onChange={(v) => onChange(score?.home ?? null, v)}
          onCommit={onCommit}
          ariaLabel={`${away.name} goles`}
          disabled={locked}
        />
      </div>
      <div>
        <TeamLink
          code={away.code}
          name={away.name}
          crest={away.crest}
          flagClass="h-9 w-12"
          textClass="text-base font-bold uppercase tracking-tight"
          align="left"
        />
      </div>
      <div className="col-span-3 border-t border-dashed border-[var(--line)] pt-2 text-xs text-[var(--foreground-soft)] md:col-span-1 md:border-0 md:pt-0 md:text-right">
        <div className="md:hidden">
          {kickoff.date} · {kickoff.time}
          {locked && (
            <span className="ml-2 font-bold text-[var(--brand)]">· Cerrado</span>
          )}
        </div>
        <div className="font-medium">{match.venue}</div>
        {match.city && (
          <div className="text-[var(--foreground-muted)]">{match.city}</div>
        )}
      </div>
    </li>
  );
}

function BracketCard({
  pick,
  onChange,
  onCommit,
  onPickPenalty,
  size = "sm",
  disabled = false,
  kickoffLabel,
  realScore,
}: {
  pick: KnockoutPick;
  onChange: (home: number | null, away: number | null) => void;
  onCommit: () => void;
  onPickPenalty: (winner: "home" | "away") => void;
  size?: "sm" | "lg";
  disabled?: boolean;
  kickoffLabel?: string;
  realScore?: { home: number; away: number; penWinner: "home" | "away" | null } | null;
}) {
  // For locked (disabled) cards, display the actual match result when available.
  const displayHome = disabled && realScore != null ? realScore.home : pick.home;
  const displayAway = disabled && realScore != null ? realScore.away : pick.away;
  const displayPenWinner = disabled && realScore != null ? realScore.penWinner : pick.penaltyWinner;

  const isTie = displayHome != null && displayAway != null && displayHome === displayAway;
  const home = displayTeam(pick.homeTeamCode, pick.homeTeamName);
  const away = displayTeam(pick.awayTeamCode, pick.awayTeamName);
  const winner =
    displayHome != null && displayAway != null
      ? displayHome > displayAway
        ? "home"
        : displayAway > displayHome
          ? "away"
          : displayPenWinner
      : null;
  const inputSize = size === "lg" ? "lg" : "sm";
  const flagCls = size === "lg" ? "h-7 w-10" : "h-5 w-7";
  const textCls =
    size === "lg"
      ? "text-sm font-bold uppercase tracking-tight"
      : "text-xs font-bold uppercase tracking-tight";

  const row = (
    side: "home" | "away",
    team: { code: string; name: string; crest: string },
    score: number | null,
    onScore: (v: number | null) => void,
  ) => {
    const isWinner = winner === side;
    const isLoser = winner && winner !== side;
    return (
      <div
        className={
          "flex items-center justify-between gap-2 px-2 py-1.5 " +
          (isWinner
            ? "bg-[var(--brand-soft)] "
            : isLoser
              ? "opacity-60 "
              : "")
        }
      >
        <TeamLink
          code={team.code}
          name={team.name}
          crest={team.crest}
          flagClass={flagCls}
          textClass={textCls}
          align="left"
        />
        <ScoreInput
          value={score}
          onChange={onScore}
          onCommit={onCommit}
          ariaLabel={`${team.name} goles`}
          size={inputSize}
          disabled={disabled}
        />
      </div>
    );
  };

  return (
    <div
      className={`w-full border border-[var(--line)] shadow-sm ${
        disabled ? "bg-[var(--surface)]" : "bg-white"
      }`}
    >
      {kickoffLabel && (
        <div className="border-b border-dashed border-[var(--line)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
          {kickoffLabel}
        </div>
      )}
      {row("home", home, displayHome, (v) => onChange(v, pick.away))}
      <div className="h-px bg-[var(--line)]" />
      {row("away", away, displayAway, (v) => onChange(pick.home, v))}
      {isTie && !disabled && (
        <div className="border-t border-dashed border-[var(--line)] bg-[var(--surface)] px-2 py-1.5">
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--foreground-muted)]">
            Gana en penales
          </p>
          <div className="mt-1 flex gap-1">
            <button
              type="button"
              onClick={() => onPickPenalty("home")}
              className={
                "flex-1 truncate border px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition " +
                (pick.penaltyWinner === "home"
                  ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                  : "border-[var(--line)] hover:border-[var(--brand)]")
              }
              title={home.name}
            >
              {home.name}
            </button>
            <button
              type="button"
              onClick={() => onPickPenalty("away")}
              className={
                "flex-1 truncate border px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition " +
                (pick.penaltyWinner === "away"
                  ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                  : "border-[var(--line)] hover:border-[var(--brand)]")
              }
              title={away.name}
            >
              {away.name}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BracketColumn({
  title,
  subtitle,
  children,
  width = 220,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div
      className="flex flex-col"
      style={{ minWidth: width, width }}
    >
      <div className="mb-2 flex items-baseline justify-between border-b border-[var(--foreground)] pb-2">
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.28em]">
          {title}
        </h3>
        {subtitle && (
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
            {subtitle}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1">{children}</div>
    </div>
  );
}

function BracketSlot({
  children,
  isFirstOfPair,
  hasNextRound,
}: {
  children: React.ReactNode;
  isFirstOfPair?: boolean;
  hasNextRound?: boolean;
}) {
  return (
    <div className="relative flex flex-1 items-center">
      {children}
      {hasNextRound && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute right-[-12px] top-1/2 h-px w-3 bg-[var(--line)]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute right-[-12px] w-px bg-[var(--line)]"
            style={
              isFirstOfPair
                ? { top: "50%", height: "50%" }
                : { bottom: "50%", height: "50%" }
            }
          />
        </>
      )}
    </div>
  );
}

function GroupStandingsTable({
  group,
  rows,
}: {
  group: string;
  rows: StandingRow[];
}) {
  return (
    <div className="border border-[var(--line)] bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--foreground)] px-4 py-3">
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.28em]">
          Tabla · Grupo {group}
        </h3>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
          Según tu pronóstico
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--foreground-muted)]">
          Llena los marcadores para ver la tabla.
        </p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--line)] font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--foreground-muted)]">
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Equipo</th>
              <th className="px-1 py-2 text-center">PJ</th>
              <th className="px-1 py-2 text-center">G</th>
              <th className="px-1 py-2 text-center">E</th>
              <th className="px-1 py-2 text-center">P</th>
              <th className="hidden px-1 py-2 text-center sm:table-cell">GF</th>
              <th className="hidden px-1 py-2 text-center sm:table-cell">GC</th>
              <th className="px-1 py-2 text-center">DG</th>
              <th className="px-2 py-2 text-center">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const team = displayTeam(r.teamCode, r.teamName);
              const rowCls =
                i < 2
                  ? "border-l-2 border-l-emerald-600 bg-emerald-50/60"
                  : i === 2
                    ? "border-l-2 border-l-amber-500 bg-amber-50/60"
                    : "border-l-2 border-l-transparent";
              return (
                <tr
                  key={r.teamCode}
                  className={`border-b border-[var(--line)] text-sm last:border-b-0 ${rowCls}`}
                >
                  <td className="px-2 py-2 font-mono text-xs font-black tabular-nums">
                    {i + 1}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {team.crest && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={team.crest}
                          alt=""
                          aria-hidden
                          className="h-4 w-6 shrink-0 border border-[var(--line)] object-cover"
                        />
                      )}
                      <span className="truncate text-xs font-bold uppercase tracking-tight">
                        {team.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-1 py-2 text-center font-mono text-xs tabular-nums">
                    {r.played}
                  </td>
                  <td className="px-1 py-2 text-center font-mono text-xs tabular-nums text-emerald-700">
                    {r.won}
                  </td>
                  <td className="px-1 py-2 text-center font-mono text-xs tabular-nums">
                    {r.drawn}
                  </td>
                  <td className="px-1 py-2 text-center font-mono text-xs tabular-nums text-red-700">
                    {r.lost}
                  </td>
                  <td className="hidden px-1 py-2 text-center font-mono text-xs tabular-nums sm:table-cell">
                    {r.gf}
                  </td>
                  <td className="hidden px-1 py-2 text-center font-mono text-xs tabular-nums sm:table-cell">
                    {r.ga}
                  </td>
                  <td className="px-1 py-2 text-center font-mono text-xs tabular-nums">
                    {r.gd > 0 ? `+${r.gd}` : r.gd}
                  </td>
                  <td className="px-2 py-2 text-center font-mono text-sm font-black tabular-nums">
                    {r.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="border-t border-dashed border-[var(--line)] px-4 py-2 text-[10px] leading-relaxed text-[var(--foreground-muted)]">
        <span className="font-bold text-emerald-700">1º y 2º</span> clasifican
        directo · <span className="font-bold text-amber-600">3º</span> puede
        avanzar entre los 8 mejores terceros. Se actualiza con cada marcador
        que llenas.
      </p>
    </div>
  );
}

const STAGE_TITLES: Record<KnockoutPick["stage"], string> = {
  ROUND_OF_32: "Dieciseisavos",
  ROUND_OF_16: "Octavos",
  QUARTER_FINALS: "Cuartos",
  SEMI_FINALS: "Semifinales",
  THIRD_PLACE: "Tercer puesto",
  FINAL: "Final",
};

// Display order so the visual bracket reads as a proper tree: consecutive
// pairs in each column feed the next column in order (the underlying data
// uses the official FIFA non-sequential match feeds — see bracket.ts).
const BRACKET_ORDER: Record<string, number[]> = {
  ROUND_OF_32: [1, 4, 0, 2, 10, 11, 8, 9, 3, 5, 6, 7, 13, 15, 12, 14],
  ROUND_OF_16: [0, 1, 4, 5, 2, 3, 6, 7],
  QUARTER_FINALS: [0, 1, 2, 3],
  SEMI_FINALS: [0, 1],
};

function orderPicks(picks: KnockoutPick[], stage: string): KnockoutPick[] {
  const order = BRACKET_ORDER[stage];
  if (!order) return picks;
  return order.map((i) => picks[i]).filter((p): p is KnockoutPick => Boolean(p));
}

export default function PredictPage() {
  const router = useRouter();
  const params = useParams<{ attempt: string }>();
  const attemptNum = Number(params.attempt);

  const [session, setSession] = useState<Session | null>(null);
  const [matches, setMatches] = useState<ApiMatch[]>([]);
  const [prediction, setPrediction] = useState<PredictionDoc | null>(null);
  const [groupDrafts, setGroupDrafts] = useState<Record<string, GroupDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [activeGroup, setActiveGroup] = useState<string>("A");
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const pendingPayloads = useRef<
    Map<
      string,
      | { kind: "group"; matchId: string; home: number; away: number }
      | {
          kind: "knockout";
          matchId: string;
          home: number | null;
          away: number | null;
          penaltyWinner: "home" | "away" | null;
        }
    >
  >(new Map());
  const inflight = useRef<number>(0);

  useEffect(() => {
    const s = readSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    if (
      !Number.isInteger(attemptNum) ||
      attemptNum < 1 ||
      attemptNum > s.attemptsAllowed
    ) {
      router.replace("/dashboard");
      return;
    }
    setSession(s);
  }, [router, attemptNum]);

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
        const arr: ApiMatch[] = Array.isArray(m.matches)
          ? m.matches
          : staticFallback();
        setMatches(arr.length ? arr : staticFallback());
        setPrediction(p.prediction);
        setGroupDrafts(p.prediction?.groupScores ?? {});
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("No pudimos cargar tu pronóstico.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, attemptNum]);

  const groupMatches = useMemo(
    () => matches.filter((m) => m.stage === "GROUP_STAGE" && m.group),
    [matches],
  );
  const groupKeys = useMemo(() => {
    const set = new Set<string>();
    groupMatches.forEach((m) => m.group && set.add(m.group));
    return Array.from(set).sort();
  }, [groupMatches]);
  const matchesByGroup = useMemo(() => {
    const map: Record<string, ApiMatch[]> = {};
    groupMatches.forEach((m) => {
      if (!m.group) return;
      (map[m.group] ??= []).push(m);
    });
    Object.values(map).forEach((list) =>
      list.sort((a, b) => {
        const md = (a.matchday ?? 0) - (b.matchday ?? 0);
        if (md !== 0) return md;
        return a.date.localeCompare(b.date);
      }),
    );
    return map;
  }, [groupMatches]);

  const standingsByGroup = useMemo(
    () => computeGroupStandings(groupMatches, groupDrafts),
    [groupMatches, groupDrafts],
  );

  // Kickoff time of each real knockout fixture, keyed by stage + teams.
  const knockoutKickoffs = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of matches) {
      if (m.stage === "GROUP_STAGE" || !m.utcDate) continue;
      const key = knockoutIdentityKey(m.stage, m.home.code, m.away.code);
      if (key) map.set(key, m.utcDate);
    }
    return map;
  }, [matches]);

  // Kickoff time of each real knockout fixture, keyed by synthetic matchId
  // (R32-1, R16-3, QF-2, …) derived from the Wikipedia externalId or _id.
  // This lookup does NOT depend on team codes and is used as the primary lock
  // source, because a team-code mismatch (wrong standings, partial data) would
  // silently leave past matches editable.
  const knockoutKickoffsByMatchId = useMemo(() => {
    const PREFIX: Record<string, string> = {
      ROUND_OF_32: "R32",
      ROUND_OF_16: "R16",
      QUARTER_FINALS: "QF",
      SEMI_FINALS: "SF",
      THIRD_PLACE: "THIRD",
      FINAL: "FINAL",
    };
    const map = new Map<string, string>();
    for (const m of matches) {
      if (m.stage === "GROUP_STAGE" || !m.utcDate) continue;
      const src =
        m.externalId ??
        (/^wiki-(.+)$/.exec(m._id)?.[1] ?? null);
      if (!src) continue;
      const parts = /^([A-Z_]+)-(\d+)$/.exec(src);
      if (!parts) continue;
      const prefix = PREFIX[parts[1]];
      if (!prefix) continue;
      map.set(`${prefix}-${parts[2]}`, m.utcDate);
    }
    return map;
  }, [matches]);

  // Colombia-time kickoff label for each real knockout fixture (shown on bracket cards).
  const knockoutKickoffLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of matches) {
      if (m.stage === "GROUP_STAGE" || !m.utcDate) continue;
      const key = knockoutIdentityKey(m.stage, m.home.code, m.away.code);
      if (!key) continue;
      const { date, time } = colombiaKickoff(m.utcDate);
      map.set(key, `${date} · ${time}`);
    }
    return map;
  }, [matches]);

  const knockoutPickLocked = useCallback(
    (pick: KnockoutPick): boolean => {
      const now = Date.now();
      // Primary: look up by matchId → externalId (code-independent). This
      // catches past matches even when team-code mismatches break the key lookup.
      const directKickoff = knockoutKickoffsByMatchId.get(pick.matchId) ?? null;
      if (directKickoff) {
        return isKnockoutMatchLocked(pick.stage, directKickoff, now, session?.nit);
      }
      // Fallback: look up by identity key (team codes).
      const key = knockoutIdentityKey(
        pick.stage,
        pick.homeTeamCode,
        pick.awayTeamCode,
      );
      const kickoff = key ? knockoutKickoffs.get(key) ?? null : null;
      return isKnockoutMatchLocked(pick.stage, kickoff, now, session?.nit);
    },
    [knockoutKickoffsByMatchId, knockoutKickoffs, session?.nit],
  );

  // Real scores for FINISHED knockout matches, keyed by synthetic matchId.
  // Used to display actual results on locked bracket cards regardless of whether
  // patchKnockoutWithRealFixtures correctly applied the score via the pick.
  const knockoutRealScores = useMemo(() => {
    const PREFIX: Record<string, string> = {
      ROUND_OF_32: "R32",
      ROUND_OF_16: "R16",
      QUARTER_FINALS: "QF",
      SEMI_FINALS: "SF",
      THIRD_PLACE: "THIRD",
      FINAL: "FINAL",
    };
    const map = new Map<
      string,
      { home: number; away: number; penWinner: "home" | "away" | null }
    >();
    for (const m of matches) {
      if (m.stage === "GROUP_STAGE" || m.status !== "FINISHED") continue;
      const ft = m.score?.fullTime;
      if (!ft) continue;
      const src =
        m.externalId ?? (/^wiki-(.+)$/.exec(m._id)?.[1] ?? null);
      let matchId: string | null = null;
      if (src) {
        const parts = /^([A-Z_]+)-(\d+)$/.exec(src);
        if (parts) {
          const prefix = PREFIX[parts[1]];
          if (prefix) matchId = `${prefix}-${parts[2]}`;
        }
      }
      if (!matchId) continue;
      const pen = m.score?.penalties;
      const penWinner: "home" | "away" | null = pen
        ? pen.home > pen.away
          ? "home"
          : pen.away > pen.home
            ? "away"
            : null
        : null;
      map.set(matchId, { home: ft.home, away: ft.away, penWinner });
    }
    return map;
  }, [matches]);

  const filledCount = Object.values(groupDrafts).filter(
    (d) => typeof d.home === "number" && typeof d.away === "number",
  ).length;
  const totalGroupMatches = groupMatches.length;
  const groupComplete =
    totalGroupMatches > 0 && filledCount === totalGroupMatches;

  // Show the knockout bracket if the server returned picks (r32 is populated)
  // OR once the group stage has definitively ended (2026-06-29). The server
  // now always returns a full bracket structure after that date, so everyone
  // can predict the current round even if earlier rounds were wrong or skipped.
  const GROUP_STAGE_ENDED_MS = new Date("2026-06-29T00:00:00Z").getTime();
  const knockoutOpen =
    Date.now() >= GROUP_STAGE_ENDED_MS ||
    (prediction?.knockout.r32.length ?? 0) > 0;

  const knockoutFilled = useMemo(() => {
    if (!prediction) return 0;
    const stages = [
      prediction.knockout.r32,
      prediction.knockout.r16,
      prediction.knockout.qf,
      prediction.knockout.sf,
    ].flat();
    const extras = [prediction.knockout.third, prediction.knockout.final].filter(
      (p): p is KnockoutPick => Boolean(p),
    );
    return [...stages, ...extras].filter(
      (p) => p.home != null && p.away != null,
    ).length;
  }, [prediction]);

  const totalKnockout = 32;
  const allDone =
    groupComplete &&
    knockoutFilled === totalKnockout &&
    !!prediction?.champion;

  const sendPayload = useCallback(
    async (
      matchId: string,
      payload:
        | { kind: "group"; matchId: string; home: number; away: number }
        | {
            kind: "knockout";
            matchId: string;
            home: number | null;
            away: number | null;
            penaltyWinner: "home" | "away" | null;
          },
    ) => {
      if (!session) return;
      pendingPayloads.current.delete(matchId);
      inflight.current += 1;
      setSaveState("saving");
      try {
        const res = await fetch(`/api/predictions/${attemptNum}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, email: session.email }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { prediction: PredictionDoc };
        setPrediction(data.prediction);
        if (payload.kind === "group") {
          setGroupDrafts((prev) => ({
            ...prev,
            [matchId]: { home: payload.home, away: payload.away },
          }));
        }
        inflight.current -= 1;
        if (inflight.current <= 0 && pendingPayloads.current.size === 0) {
          inflight.current = 0;
          setSaveState("saved");
        }
      } catch {
        inflight.current = Math.max(0, inflight.current - 1);
        setSaveState("error");
      }
    },
    [session, attemptNum],
  );

  const flushMatch = useCallback(
    (matchId: string) => {
      const t = saveTimers.current.get(matchId);
      if (t) {
        clearTimeout(t);
        saveTimers.current.delete(matchId);
      }
      const payload = pendingPayloads.current.get(matchId);
      if (payload) {
        void sendPayload(matchId, payload);
      }
    },
    [sendPayload],
  );

  function queueGroupSave(
    matchId: string,
    home: number | null,
    away: number | null,
  ) {
    setGroupDrafts((prev) => {
      const next = { ...prev };
      if (home == null && away == null) {
        delete next[matchId];
      } else {
        next[matchId] = { home, away };
      }
      return next;
    });
    if (typeof home === "number" && typeof away === "number") {
      pendingPayloads.current.set(matchId, {
        kind: "group",
        matchId,
        home,
        away,
      });
      const existing = saveTimers.current.get(matchId);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        saveTimers.current.delete(matchId);
        const payload = pendingPayloads.current.get(matchId);
        if (payload) void sendPayload(matchId, payload);
      }, 250);
      saveTimers.current.set(matchId, t);
    } else {
      // Drop any pending save for this match — partial values shouldn't reach server
      pendingPayloads.current.delete(matchId);
      const existing = saveTimers.current.get(matchId);
      if (existing) {
        clearTimeout(existing);
        saveTimers.current.delete(matchId);
      }
    }
  }

  function queueKnockoutSave(
    matchId: string,
    home: number | null,
    away: number | null,
    penaltyWinner: "home" | "away" | null,
  ) {
    setPrediction((prev) => {
      if (!prev) return prev;
      const nextKnockout: PredictionDoc["knockout"] = {
        r32: [...prev.knockout.r32],
        r16: [...prev.knockout.r16],
        qf: [...prev.knockout.qf],
        sf: [...prev.knockout.sf],
        third: prev.knockout.third,
        final: prev.knockout.final,
      };
      const arrayStages: Array<"r32" | "r16" | "qf" | "sf"> = [
        "r32",
        "r16",
        "qf",
        "sf",
      ];
      for (const stage of arrayStages) {
        const arr = nextKnockout[stage];
        const idx = arr.findIndex((p) => p.matchId === matchId);
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], home, away, penaltyWinner };
          return { ...prev, knockout: nextKnockout };
        }
      }
      if (nextKnockout.third?.matchId === matchId) {
        nextKnockout.third = {
          ...nextKnockout.third,
          home,
          away,
          penaltyWinner,
        };
        return { ...prev, knockout: nextKnockout };
      }
      if (nextKnockout.final?.matchId === matchId) {
        nextKnockout.final = {
          ...nextKnockout.final,
          home,
          away,
          penaltyWinner,
        };
        return { ...prev, knockout: nextKnockout };
      }
      return prev;
    });
    pendingPayloads.current.set(matchId, {
      kind: "knockout",
      matchId,
      home,
      away,
      penaltyWinner,
    });
    const existing = saveTimers.current.get(matchId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      saveTimers.current.delete(matchId);
      const payload = pendingPayloads.current.get(matchId);
      if (payload) void sendPayload(matchId, payload);
    }, 250);
    saveTimers.current.set(matchId, t);
  }

  useEffect(() => {
    function flushAll() {
      const ids = Array.from(saveTimers.current.keys());
      for (const id of ids) {
        const t = saveTimers.current.get(id);
        if (t) clearTimeout(t);
        saveTimers.current.delete(id);
        const payload = pendingPayloads.current.get(id);
        if (payload) void sendPayload(id, payload);
      }
    }
    const onHide = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    window.addEventListener("beforeunload", flushAll);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", flushAll);
      document.removeEventListener("visibilitychange", onHide);
      flushAll();
    };
  }, [sendPayload]);

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

  const groupMatchesForActive = matchesByGroup[activeGroup] ?? [];
  const matchdaysForActive = Array.from(
    new Set(groupMatchesForActive.map((m) => m.matchday)),
  )
    .filter((md): md is number => md != null)
    .sort();

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
          <div className="flex items-center gap-4">
            <span
              aria-live="polite"
              className={
                "hidden text-xs font-mono uppercase tracking-[0.28em] sm:inline " +
                (saveState === "saving"
                  ? "text-[var(--foreground-muted)]"
                  : saveState === "saved"
                    ? "text-emerald-600"
                    : saveState === "error"
                      ? "text-red-600"
                      : "text-[var(--foreground-muted)]")
              }
            >
              {saveState === "saving"
                ? "Guardando…"
                : saveState === "saved"
                  ? "Guardado"
                  : saveState === "error"
                    ? "Error al guardar"
                    : ""}
            </span>
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
              Boleta · Intento {attemptNum}
            </p>
            <h1 className="mt-3 text-3xl font-black uppercase leading-tight md:text-5xl">
              Llena tu pronóstico
            </h1>
            <p className="mt-3 max-w-xl text-white/70">
              Predice el marcador exacto de cada partido. Al terminar la fase de
              grupos calculamos tu llave de eliminatorias.
            </p>
            <div className="mt-6 grid max-w-md grid-cols-2 gap-6 font-mono text-[11px] uppercase tracking-[0.28em] text-white/60">
              <div>
                <dt>Fase de grupos</dt>
                <dd className="mt-1 text-2xl font-black tabular-nums text-white">
                  {filledCount}/{totalGroupMatches || "—"}
                </dd>
              </div>
              <div>
                <dt>Eliminatorias</dt>
                <dd className="mt-1 text-2xl font-black tabular-nums text-white">
                  {knockoutOpen ? `${knockoutFilled}/${totalKnockout}` : "—"}
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

            <section className="sticky top-[65px] z-20 border-b border-[var(--line)] bg-[var(--background)]/95 backdrop-blur">
              <div className="mx-auto max-w-6xl px-6 py-4">
                <div className="flex items-center gap-3 overflow-x-auto pb-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--foreground-muted)]">
                    Grupo
                  </span>
                  <div className="flex gap-2">
                    {groupKeys.map((g) => {
                      const active = g === activeGroup;
                      const groupFilled = (matchesByGroup[g] ?? []).every(
                        (m) => {
                          const d = groupDrafts[m._id];
                          return (
                            d &&
                            typeof d.home === "number" &&
                            typeof d.away === "number"
                          );
                        },
                      );
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setActiveGroup(g)}
                          className={
                            "relative h-10 min-w-10 shrink-0 border px-3 font-mono text-base font-black transition " +
                            (active
                              ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                              : groupFilled
                                ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                                : "border-[var(--line)] bg-white text-[var(--foreground)] hover:border-[var(--brand)] hover:text-[var(--brand)]")
                          }
                        >
                          {g}
                          {groupFilled && !active && (
                            <span
                              aria-hidden
                              className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-600"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            <section className="mx-auto max-w-6xl px-6 py-10">
              <div className="border-l-4 border-[var(--brand)] bg-white p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand)]">
                  Grupo {activeGroup}
                </p>
                <p className="mt-2 text-sm text-[var(--foreground-soft)]">
                  Llena el marcador de cada partido. Los cambios se guardan
                  automáticamente.
                </p>
              </div>
              <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="lg:order-2 lg:sticky lg:top-[150px]">
                  <GroupStandingsTable
                    group={activeGroup}
                    rows={standingsByGroup[activeGroup] ?? []}
                  />
                </div>
                <div className="space-y-8 lg:order-1">
                  {matchdaysForActive.map((md) => {
                    const list = groupMatchesForActive.filter(
                      (m) => m.matchday === md,
                    );
                    if (!list.length) return null;
                    return (
                      <div key={md}>
                        <div className="mb-3 flex items-baseline justify-between border-b border-[var(--foreground)] pb-2">
                          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.3em]">
                            Jornada {md}
                          </h2>
                          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--foreground-muted)]">
                            {list[0].date ? formatDate(list[0].date) : ""}
                          </span>
                        </div>
                        <ul className="grid gap-3">
                          {list.map((m) => (
                            <GroupMatchRow
                              key={m._id}
                              match={m}
                              score={groupDrafts[m._id]}
                              onChange={(h, a) => queueGroupSave(m._id, h, a)}
                              onCommit={() => flushMatch(m._id)}
                              locked={isGroupMatchLocked(m.utcDate)}
                            />
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="mx-auto max-w-6xl px-6 pb-16">
              <div className="border-t border-[var(--line)] pt-10">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--foreground-muted)]">
                  Eliminatorias
                </p>
                <h2 className="mt-2 text-2xl font-black uppercase md:text-3xl">
                  {knockoutOpen
                    ? "Tu llave de eliminación"
                    : "Completa la fase de grupos para abrir la llave"}
                </h2>
                {!knockoutOpen && (
                  <p className="mt-2 text-sm text-[var(--foreground-soft)]">
                    Llevas {filledCount}/{totalGroupMatches} partidos predichos.
                  </p>
                )}
                {knockoutOpen && !groupComplete && (
                  <p className="mt-2 text-sm text-[var(--foreground-soft)]">
                    La llave ya muestra los cruces reales del Mundial. Ajusta tus
                    predicciones de eliminación si quieres.
                  </p>
                )}
              </div>

              {knockoutOpen && (
                <div className="mt-8 space-y-10">
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--foreground-muted)] md:hidden">
                    Desliza horizontalmente para ver toda la llave →
                  </p>
                  <div className="overflow-x-auto pb-6">
                    <div
                      className="flex gap-6"
                      style={{ minHeight: 1500 }}
                    >
                      {(
                        [
                          {
                            stage: "ROUND_OF_32" as const,
                            picks: orderPicks(
                              prediction.knockout.r32,
                              "ROUND_OF_32",
                            ),
                            width: 230,
                          },
                          {
                            stage: "ROUND_OF_16" as const,
                            picks: orderPicks(
                              prediction.knockout.r16,
                              "ROUND_OF_16",
                            ),
                            width: 220,
                          },
                          {
                            stage: "QUARTER_FINALS" as const,
                            picks: orderPicks(
                              prediction.knockout.qf,
                              "QUARTER_FINALS",
                            ),
                            width: 220,
                          },
                          {
                            stage: "SEMI_FINALS" as const,
                            picks: orderPicks(
                              prediction.knockout.sf,
                              "SEMI_FINALS",
                            ),
                            width: 220,
                          },
                          {
                            stage: "FINAL" as const,
                            picks: prediction.knockout.final
                              ? [prediction.knockout.final]
                              : [],
                            width: 240,
                          },
                        ] as const
                      ).map((col, colIdx, arr) => {
                        const filled = col.picks.filter(
                          (p) => p.home != null && p.away != null,
                        ).length;
                        const hasNextRound = colIdx < arr.length - 1;
                        const stageLocked = isKnockoutStageLocked(
                          col.stage,
                          Date.now(),
                          session?.nit,
                        );
                        return (
                          <BracketColumn
                            key={col.stage}
                            title={STAGE_TITLES[col.stage]}
                            subtitle={
                              stageLocked
                                ? "Cerrado"
                                : `${filled}/${col.picks.length}`
                            }
                            width={col.width}
                          >
                            {col.picks.map((p, i) => (
                              <BracketSlot
                                key={p.matchId}
                                isFirstOfPair={i % 2 === 0}
                                hasNextRound={hasNextRound}
                              >
                                <BracketCard
                                  pick={p}
                                  disabled={stageLocked || knockoutPickLocked(p)}
                                  size={col.stage === "FINAL" ? "lg" : "sm"}
                                  kickoffLabel={(() => {
                                    const key = knockoutIdentityKey(p.stage, p.homeTeamCode, p.awayTeamCode);
                                    return key ? knockoutKickoffLabels.get(key) : undefined;
                                  })()}
                                  realScore={knockoutRealScores.get(p.matchId) ?? null}
                                  onChange={(h, a) =>
                                    queueKnockoutSave(
                                      p.matchId,
                                      h,
                                      a,
                                      p.penaltyWinner,
                                    )
                                  }
                                  onCommit={() => flushMatch(p.matchId)}
                                  onPickPenalty={(w) =>
                                    queueKnockoutSave(
                                      p.matchId,
                                      p.home,
                                      p.away,
                                      w,
                                    )
                                  }
                                />
                              </BracketSlot>
                            ))}
                          </BracketColumn>
                        );
                      })}
                    </div>
                  </div>

                  {prediction.knockout.third && (
                    <div className="max-w-sm">
                      <div className="mb-2 flex items-baseline justify-between border-b border-[var(--foreground)] pb-2">
                        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.28em]">
                          {STAGE_TITLES.THIRD_PLACE}
                        </h3>
                      </div>
                      <BracketCard
                        pick={prediction.knockout.third}
                        size="lg"
                        disabled={knockoutPickLocked(prediction.knockout.third)}
                        kickoffLabel={(() => {
                          const t = prediction.knockout.third!;
                          const key = knockoutIdentityKey(t.stage, t.homeTeamCode, t.awayTeamCode);
                          return key ? knockoutKickoffLabels.get(key) : undefined;
                        })()}
                        realScore={knockoutRealScores.get(prediction.knockout.third.matchId) ?? null}
                        onChange={(h, a) =>
                          queueKnockoutSave(
                            prediction.knockout.third!.matchId,
                            h,
                            a,
                            prediction.knockout.third!.penaltyWinner,
                          )
                        }
                        onCommit={() =>
                          flushMatch(prediction.knockout.third!.matchId)
                        }
                        onPickPenalty={(w) =>
                          queueKnockoutSave(
                            prediction.knockout.third!.matchId,
                            prediction.knockout.third!.home,
                            prediction.knockout.third!.away,
                            w,
                          )
                        }
                      />
                    </div>
                  )}

                  {prediction.champion &&
                    (() => {
                      const champ = displayTeam(
                        prediction.champion.code,
                        prediction.champion.name,
                      );
                      return (
                        <Link
                          href={`/dashboard/country/${encodeURIComponent(champ.code)}`}
                          className="group flex items-center gap-6 border-l-4 border-[var(--brand)] bg-[var(--brand-soft)] p-8 transition hover:bg-[var(--brand)] hover:text-white"
                        >
                          {champ.crest && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={champ.crest}
                              alt=""
                              aria-hidden
                              className="h-16 w-24 shrink-0 border border-[var(--line)] object-cover"
                            />
                          )}
                          <div>
                            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand-dark)] group-hover:text-white">
                              Tu campeón pronosticado
                            </p>
                            <p className="mt-3 text-4xl font-black uppercase tracking-tight text-[var(--brand-dark)] group-hover:text-white">
                              {champ.name}
                            </p>
                          </div>
                        </Link>
                      );
                    })()}

                  {allDone && (
                    <div className="border border-emerald-600 bg-emerald-50 p-6 text-sm text-emerald-800">
                      ¡Boleta completa! Tu pronóstico se ha guardado. Puedes
                      regresar al{" "}
                      <Link href="/dashboard" className="font-bold underline">
                        panel
                      </Link>{" "}
                      o seguir ajustando hasta el primer partido.
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
