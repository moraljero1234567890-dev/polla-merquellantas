import type {
  GroupScore,
  KnockoutPick,
  MatchDoc,
  PredictionDoc,
} from "./types";
import { officialThirdAllocation } from "./third-place-allocation";
import { knockoutIdentityKey } from "./locks";

export type StandingRow = {
  teamCode: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  group: string;
};

export type GroupMatchLike = {
  _id: string;
  group: string | null;
  home: { code: string; name: string };
  away: { code: string; name: string };
};

export function computeGroupStandings(
  groupMatches: GroupMatchLike[],
  predictedScores: Record<string, { home: number | null; away: number | null }>,
): Record<string, StandingRow[]> {
  const byGroup: Record<string, GroupMatchLike[]> = {};
  for (const m of groupMatches) {
    if (!m.group) continue;
    (byGroup[m.group] ??= []).push(m);
  }

  const result: Record<string, StandingRow[]> = {};
  for (const [group, matches] of Object.entries(byGroup)) {
    const rows: Record<string, StandingRow> = {};
    const ensure = (code: string, name: string): StandingRow => {
      return (rows[code] ??= {
        teamCode: code,
        teamName: name,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
        group,
      });
    };

    for (const m of matches) {
      // Seed both teams so the table always lists the whole group,
      // even before any score is filled in.
      const home = ensure(m.home.code, m.home.name);
      const away = ensure(m.away.code, m.away.name);
      const score = predictedScores[m._id];
      if (
        !score ||
        typeof score.home !== "number" ||
        typeof score.away !== "number"
      )
        continue;
      home.played++;
      away.played++;
      home.gf += score.home;
      home.ga += score.away;
      away.gf += score.away;
      away.ga += score.home;
      if (score.home > score.away) {
        home.won++;
        away.lost++;
        home.points += 3;
      } else if (score.home < score.away) {
        away.won++;
        home.lost++;
        away.points += 3;
      } else {
        home.drawn++;
        away.drawn++;
        home.points += 1;
        away.points += 1;
      }
    }
    for (const r of Object.values(rows)) r.gd = r.gf - r.ga;

    const list = Object.values(rows).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.teamName.localeCompare(b.teamName);
    });

    result[group] = list;
  }
  return result;
}

/**
 * Standings computed from the ACTUAL group results (the full-time scores
 * already folded onto the stored fixtures from Wikipedia), rather than a
 * user's predictions.
 *
 * Strict mode: if ALL 48 group matches have scores, returns complete standings.
 *
 * Lenient mode: if some scores are missing from the DB but every group match
 * has already kicked off (kickoff UTC is in the past), the group stage is
 * definitively over and we compute standings from whatever scores we do have.
 * This prevents a Wikipedia parsing gap from permanently blocking the knockout
 * bracket.
 *
 * Returns null while the group stage is genuinely still in progress so callers
 * can fall back to predicted standings before real results exist.
 */
export function realGroupStandings(
  groupMatches: MatchDoc[],
  now: number = Date.now(),
): Record<string, StandingRow[]> | null {
  const scores: Record<string, GroupScore> = {};

  for (const m of groupMatches) {
    const ft = m.score?.fullTime;
    if (ft && typeof ft.home === "number" && typeof ft.away === "number") {
      scores[m._id] = { home: ft.home, away: ft.away };
    }
  }

  if (Object.keys(scores).length === 0) return null;

  // All scores present → complete standings, return immediately.
  if (Object.keys(scores).length === groupMatches.length) {
    return computeGroupStandings(groupMatches, scores);
  }

  // Some scores are missing. Only use partial data if the group stage is
  // definitively over. Hard cutoff: the 2026 group stage ended 2026-06-28.
  // Also accept if every match either has a score or a past kickoff time.
  const GROUP_STAGE_ENDED = new Date("2026-06-29T00:00:00Z").getTime();
  const groupStageOver =
    now >= GROUP_STAGE_ENDED ||
    groupMatches.every(
      (m) => scores[m._id] || (m.utcDate && new Date(m.utcDate).getTime() <= now),
    );

  if (!groupStageOver) return null;
  return computeGroupStandings(groupMatches, scores);
}

export function isGroupStageComplete(
  groupMatches: MatchDoc[],
  predictedScores: Record<string, GroupScore>,
): boolean {
  return groupMatches.every((m) => {
    const s = predictedScores[m._id];
    return s && typeof s.home === "number" && typeof s.away === "number";
  });
}

// Official FIFA World Cup 2026 bracket (matches 73–88), in order.
// "W" = group winner, "R" = group runner-up, "T" = one of the 8 best
// third-placed teams. Each "T" slot lists the groups FIFA allows that
// third to come from (Annex C), which also guarantees a third never
// faces a team from its own group in the round of 32.
type SlotSpec =
  | { kind: "W" | "R"; group: string }
  | { kind: "T"; allowed: string[] };

const R32_TEMPLATE: Array<{ home: SlotSpec; away: SlotSpec }> = [
  // M73
  { home: { kind: "R", group: "A" }, away: { kind: "R", group: "B" } },
  // M74
  { home: { kind: "W", group: "E" }, away: { kind: "T", allowed: ["A", "B", "C", "D", "F"] } },
  // M75
  { home: { kind: "W", group: "F" }, away: { kind: "R", group: "C" } },
  // M76
  { home: { kind: "W", group: "C" }, away: { kind: "R", group: "F" } },
  // M77
  { home: { kind: "W", group: "I" }, away: { kind: "T", allowed: ["C", "D", "F", "G", "H"] } },
  // M78
  { home: { kind: "R", group: "E" }, away: { kind: "R", group: "I" } },
  // M79
  { home: { kind: "W", group: "A" }, away: { kind: "T", allowed: ["C", "E", "F", "H", "I"] } },
  // M80
  { home: { kind: "W", group: "L" }, away: { kind: "T", allowed: ["E", "H", "I", "J", "K"] } },
  // M81
  { home: { kind: "W", group: "D" }, away: { kind: "T", allowed: ["B", "E", "F", "I", "J"] } },
  // M82
  { home: { kind: "W", group: "G" }, away: { kind: "T", allowed: ["A", "E", "H", "I", "J"] } },
  // M83
  { home: { kind: "R", group: "K" }, away: { kind: "R", group: "L" } },
  // M84
  { home: { kind: "W", group: "H" }, away: { kind: "R", group: "J" } },
  // M85
  { home: { kind: "W", group: "B" }, away: { kind: "T", allowed: ["E", "F", "G", "I", "J"] } },
  // M86
  { home: { kind: "W", group: "J" }, away: { kind: "R", group: "H" } },
  // M87
  { home: { kind: "W", group: "K" }, away: { kind: "T", allowed: ["D", "E", "I", "J", "L"] } },
  // M88
  { home: { kind: "R", group: "D" }, away: { kind: "R", group: "G" } },
];

// How each round connects to the previous one, by official match order.
// R16 (matches 89–96): each entry holds the two R32 indices that feed it.
const R16_FEED: Array<[number, number]> = [
  [1, 4], // M89 = W74 vs W77
  [0, 2], // M90 = W73 vs W75
  [3, 5], // M91 = W76 vs W78
  [6, 7], // M92 = W79 vs W80
  [10, 11], // M93 = W83 vs W84
  [8, 9], // M94 = W81 vs W82
  [13, 15], // M95 = W86 vs W88
  [12, 14], // M96 = W85 vs W87
];
// QF (matches 97–100): two R16 indices each.
const QF_FEED: Array<[number, number]> = [
  [0, 1], // M97 = W89 vs W90
  [4, 5], // M98 = W93 vs W94
  [2, 3], // M99 = W91 vs W92
  [6, 7], // M100 = W95 vs W96
];
// SF (matches 101–102): two QF indices each.
const SF_FEED: Array<[number, number]> = [
  [0, 1], // M101 = W97 vs W98
  [2, 3], // M102 = W99 vs W100
];

function topThirdPlaced(
  standings: Record<string, StandingRow[]>,
): StandingRow[] {
  const all = Object.values(standings)
    .map((rows) => rows[2])
    .filter((r): r is StandingRow => Boolean(r));
  return all
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.teamName.localeCompare(b.teamName);
    })
    .slice(0, 8);
}

// Assign each qualifying third to a "T" slot whose allowed-groups list
// contains its group, forming a complete matching. Most-constrained slot
// first, so a valid assignment is always found when one exists.
function assignThirdsToSlots(
  slotAllowed: string[][],
  thirdGroups: string[],
): number[] | null {
  const order = slotAllowed
    .map((allowed, slot) => ({ slot, count: allowed.length }))
    .sort((a, b) => a.count - b.count)
    .map((o) => o.slot);

  const usedThird = new Array(thirdGroups.length).fill(false);
  const result = new Array(slotAllowed.length).fill(-1);

  function backtrack(i: number): boolean {
    if (i === order.length) return true;
    const slot = order[i];
    for (let t = 0; t < thirdGroups.length; t++) {
      if (usedThird[t]) continue;
      if (!slotAllowed[slot].includes(thirdGroups[t])) continue;
      usedThird[t] = true;
      result[slot] = t;
      if (backtrack(i + 1)) return true;
      usedThird[t] = false;
      result[slot] = -1;
    }
    return false;
  }

  return backtrack(0) ? result : null;
}

export type R32SeedTeam = { code: string; name: string } | null;

export function buildR32Seeds(
  standings: Record<string, StandingRow[]>,
): Array<{ home: R32SeedTeam; away: R32SeedTeam }> {
  const thirds = topThirdPlaced(standings);
  const thirdGroups = thirds.map((r) => r.group);

  // Slots, in template order, that take a best-third team.
  const thirdSlots: { templateIdx: number; side: "home" | "away"; allowed: string[] }[] = [];
  R32_TEMPLATE.forEach((t, idx) => {
    if (t.home.kind === "T") {
      thirdSlots.push({ templateIdx: idx, side: "home", allowed: t.home.allowed });
    }
    if (t.away.kind === "T") {
      thirdSlots.push({ templateIdx: idx, side: "away", allowed: t.away.allowed });
    }
  });

  // Map "templateIdx:side" -> the assigned third row.
  const thirdBySlotKey = new Map<string, StandingRow>();

  // Prefer FIFA's official Annex C allocation: it is predetermined for each of
  // the 495 possible sets of eight qualifying third-place groups. Several
  // constraint-valid matchings exist for any given set, so only this lookup
  // reproduces the real bracket (e.g. it puts Paraguay, not Bosnia, opposite
  // the Group E winner). Fall back to a constraint-satisfying matching while
  // the eight thirds aren't all known yet (a partially-filled prediction).
  const official = officialThirdAllocation(thirdGroups);
  if (official) {
    const thirdByGroup = new Map(thirds.map((r) => [r.group, r]));
    thirdSlots.forEach((s) => {
      const tmpl = R32_TEMPLATE[s.templateIdx];
      const winner =
        tmpl.home.kind === "W"
          ? tmpl.home
          : tmpl.away.kind === "W"
            ? tmpl.away
            : null;
      const thirdGroup = winner ? official.get(winner.group) : undefined;
      const row = thirdGroup ? thirdByGroup.get(thirdGroup) : undefined;
      if (row) thirdBySlotKey.set(`${s.templateIdx}:${s.side}`, row);
    });
  } else {
    const assignment = assignThirdsToSlots(
      thirdSlots.map((s) => s.allowed),
      thirdGroups,
    );
    if (assignment) {
      thirdSlots.forEach((s, i) => {
        const t = assignment[i];
        if (t >= 0 && thirds[t]) {
          thirdBySlotKey.set(`${s.templateIdx}:${s.side}`, thirds[t]);
        }
      });
    }
  }

  const pick = (
    slot: SlotSpec,
    templateIdx: number,
    side: "home" | "away",
  ): R32SeedTeam => {
    if (slot.kind === "T") {
      const row = thirdBySlotKey.get(`${templateIdx}:${side}`);
      return row ? { code: row.teamCode, name: row.teamName } : null;
    }
    const rows = standings[slot.group];
    if (!rows) return null;
    const idx = slot.kind === "W" ? 0 : 1;
    const row = rows[idx];
    return row ? { code: row.teamCode, name: row.teamName } : null;
  };

  return R32_TEMPLATE.map((t, idx) => ({
    home: pick(t.home, idx, "home"),
    away: pick(t.away, idx, "away"),
  }));
}

export function emptyPick(
  matchId: string,
  stage: KnockoutPick["stage"],
  home: R32SeedTeam,
  away: R32SeedTeam,
): KnockoutPick {
  return {
    matchId,
    stage,
    homeTeamCode: home?.code ?? "",
    homeTeamName: home?.name ?? "",
    awayTeamCode: away?.code ?? "",
    awayTeamName: away?.name ?? "",
    home: null,
    away: null,
    penaltyWinner: null,
  };
}

function winnerOf(pick: KnockoutPick): R32SeedTeam {
  if (pick.home == null || pick.away == null) return null;
  if (pick.home > pick.away)
    return { code: pick.homeTeamCode, name: pick.homeTeamName };
  if (pick.away > pick.home)
    return { code: pick.awayTeamCode, name: pick.awayTeamName };
  if (pick.penaltyWinner === "home")
    return { code: pick.homeTeamCode, name: pick.homeTeamName };
  if (pick.penaltyWinner === "away")
    return { code: pick.awayTeamCode, name: pick.awayTeamName };
  return null;
}

function loserOf(pick: KnockoutPick): R32SeedTeam {
  if (pick.home == null || pick.away == null) return null;
  if (pick.home > pick.away)
    return { code: pick.awayTeamCode, name: pick.awayTeamName };
  if (pick.away > pick.home)
    return { code: pick.homeTeamCode, name: pick.homeTeamName };
  if (pick.penaltyWinner === "home")
    return { code: pick.awayTeamCode, name: pick.awayTeamName };
  if (pick.penaltyWinner === "away")
    return { code: pick.homeTeamCode, name: pick.homeTeamName };
  return null;
}

function realWinnerFromMatch(m: MatchDoc): R32SeedTeam {
  if (m.status !== "FINISHED") return null;
  const ft = m.score?.fullTime;
  if (!ft) return null;
  if (ft.home > ft.away) return { code: m.home.code, name: m.home.name };
  if (ft.away > ft.home) return { code: m.away.code, name: m.away.name };
  const pen = m.score?.penalties;
  if (pen) {
    if (pen.home > pen.away) return { code: m.home.code, name: m.home.name };
    if (pen.away > pen.home) return { code: m.away.code, name: m.away.name };
  }
  return null;
}

/**
 * Map a Wikipedia externalId (e.g. "ROUND_OF_32-3") to the synthetic matchId
 * used inside PredictionDoc (e.g. "R32-3"). Returns null for unknown formats.
 */
function externalIdToMatchId(externalId: string): string | null {
  const prefixMap: Record<string, string> = {
    ROUND_OF_32: "R32",
    ROUND_OF_16: "R16",
    QUARTER_FINALS: "QF",
    SEMI_FINALS: "SF",
    THIRD_PLACE: "THIRD",
    FINAL: "FINAL",
  };
  const m = /^([A-Z_]+)-(\d+)$/.exec(externalId);
  if (!m) return null;
  const prefix = prefixMap[m[1]];
  if (!prefix) return null;
  return `${prefix}-${m[2]}`;
}

/**
 * Build a knockout bracket directly from real fixtures already stored in the
 * DB, without needing group standings. Used when some group match scores are
 * missing (e.g. Wikipedia parsing gap) but the real R32/R16 bracket is already
 * determined and those fixtures are in the DB.
 *
 * Returns null if there are no real knockout fixtures to work from.
 */
export function buildKnockoutFromRealFixtures(
  realKnockoutMatches: MatchDoc[],
  existing?: PredictionDoc["knockout"],
): PredictionDoc["knockout"] | null {
  // Index real fixtures by synthetic matchId.
  // Try externalId first; fall back to parsing the _id (Wikipedia-inserted
  // docs use "_id: wiki-ROUND_OF_32-N" even when externalId isn't set).
  const byId = new Map<string, MatchDoc>();
  for (const m of realKnockoutMatches) {
    const src = m.externalId ?? (/^wiki-(.+)$/.exec(m._id)?.[1] ?? null);
    if (!src) continue;
    const id = externalIdToMatchId(src);
    if (id) byId.set(id, m);
  }
  if (byId.size === 0) return null;

  /** Extract the winner of a real finished fixture. */
  function realWinner(m: MatchDoc): R32SeedTeam {
    return realWinnerFromMatch(m);
  }

  /** Return winner of a pick — from a real match result if available,
   *  otherwise from the user's entered score. */
  function pickWinner(pick: KnockoutPick): R32SeedTeam {
    const real = byId.get(pick.matchId);
    if (real) {
      const w = realWinner(real);
      if (w) return w;
    }
    if (pick.home == null || pick.away == null) return null;
    if (pick.home > pick.away) return { code: pick.homeTeamCode, name: pick.homeTeamName };
    if (pick.away > pick.home) return { code: pick.awayTeamCode, name: pick.awayTeamName };
    if (pick.penaltyWinner === "home") return { code: pick.homeTeamCode, name: pick.homeTeamName };
    if (pick.penaltyWinner === "away") return { code: pick.awayTeamCode, name: pick.awayTeamName };
    return null;
  }

  /** Build a KnockoutPick from a real fixture, preserving the user's score if
   *  the teams match and the match hasn't been played yet. */
  function makePick(
    matchId: string,
    stage: KnockoutPick["stage"],
    home: R32SeedTeam,
    away: R32SeedTeam,
    prevArr: KnockoutPick[] | undefined,
  ): KnockoutPick {
    const real = byId.get(matchId);
    // Prefer real teams from the stored fixture if available.
    const h = (real?.home.code ? { code: real.home.code, name: real.home.name } : home);
    const a = (real?.away.code ? { code: real.away.code, name: real.away.name } : away);
    const fresh = emptyPick(matchId, stage, h, a);

    // If the match is already finished, use the real score.
    if (real?.status === "FINISHED" && real.score?.fullTime) {
      const ft = real.score.fullTime;
      const pen = real.score.penalties;
      let penWinner: "home" | "away" | null = null;
      if (pen) penWinner = pen.home > pen.away ? "home" : pen.away > pen.home ? "away" : null;
      return { ...fresh, home: ft.home, away: ft.away, penaltyWinner: penWinner };
    }

    // Preserve user's pick if teams match.
    const prev = prevArr?.find((p) => p.matchId === matchId);
    if (prev && prev.homeTeamCode === fresh.homeTeamCode && prev.awayTeamCode === fresh.awayTeamCode) {
      return { ...fresh, home: prev.home, away: prev.away, penaltyWinner: prev.penaltyWinner };
    }
    return fresh;
  }

  const r32: KnockoutPick[] = [];
  for (let i = 1; i <= 16; i++) {
    const id = `R32-${i}`;
    r32.push(makePick(id, "ROUND_OF_32", null, null, existing?.r32));
  }

  const r16: KnockoutPick[] = [];
  for (let i = 0; i < 8; i++) {
    const id = `R16-${i + 1}`;
    const [a, b] = R16_FEED[i];
    const winA = pickWinner(r32[a]);
    const winB = pickWinner(r32[b]);
    r16.push(makePick(id, "ROUND_OF_16", winA, winB, existing?.r16));
  }

  const qf: KnockoutPick[] = [];
  for (let i = 0; i < 4; i++) {
    const id = `QF-${i + 1}`;
    const [a, b] = QF_FEED[i];
    const winA = pickWinner(r16[a]);
    const winB = pickWinner(r16[b]);
    qf.push(makePick(id, "QUARTER_FINALS", winA, winB, existing?.qf));
  }

  const sf: KnockoutPick[] = [];
  for (let i = 0; i < 2; i++) {
    const id = `SF-${i + 1}`;
    const [a, b] = SF_FEED[i];
    const winA = pickWinner(qf[a]);
    const winB = pickWinner(qf[b]);
    sf.push(makePick(id, "SEMI_FINALS", winA, winB, existing?.sf));
  }

  const sfLoserA = (() => {
    const p = sf[0]; if (!p) return null;
    const w = pickWinner(p); if (!w) return null;
    return w.code === p.homeTeamCode
      ? { code: p.awayTeamCode, name: p.awayTeamName }
      : { code: p.homeTeamCode, name: p.homeTeamName };
  })();
  const sfLoserB = (() => {
    const p = sf[1]; if (!p) return null;
    const w = pickWinner(p); if (!w) return null;
    return w.code === p.homeTeamCode
      ? { code: p.awayTeamCode, name: p.awayTeamName }
      : { code: p.homeTeamCode, name: p.homeTeamName };
  })();
  const third = makePick("THIRD-1", "THIRD_PLACE", sfLoserA, sfLoserB, existing?.third ? [existing.third] : undefined);

  const sfWinA = pickWinner(sf[0]);
  const sfWinB = pickWinner(sf[1]);
  const final = makePick("FINAL-1", "FINAL", sfWinA, sfWinB, existing?.final ? [existing.final] : undefined);

  return { r32, r16, qf, sf, third, final };
}

export function buildKnockoutFromGroup(
  standings: Record<string, StandingRow[]>,
  existing?: PredictionDoc["knockout"],
  realKnockoutMatches?: MatchDoc[],
): PredictionDoc["knockout"] {
  // Build a lookup from identity key → real winner for finished knockout matches.
  // When a real result exists we use it for bracket propagation instead of the
  // user's predicted score, so every user sees the correct bracket automatically
  // (e.g. after all R32 games are done, R16 teams are pre-filled from results).
  const realWinnerMap = new Map<string, R32SeedTeam>();
  if (realKnockoutMatches) {
    for (const m of realKnockoutMatches) {
      const key = knockoutIdentityKey(m.stage, m.home.code, m.away.code);
      if (key) realWinnerMap.set(key, realWinnerFromMatch(m));
    }
  }

  function effectiveWinner(pick: KnockoutPick): R32SeedTeam {
    const key = knockoutIdentityKey(pick.stage, pick.homeTeamCode, pick.awayTeamCode);
    if (key && realWinnerMap.has(key)) return realWinnerMap.get(key) ?? null;
    return winnerOf(pick);
  }

  const r32Seeds = buildR32Seeds(standings);
  const r32: KnockoutPick[] = r32Seeds.map((seed, i) => {
    const id = `R32-${i + 1}`;
    const prev = existing?.r32?.find((p) => p.matchId === id);
    const fresh = emptyPick(id, "ROUND_OF_32", seed.home, seed.away);

    // If the real match finished, bake its score into the pick so downstream
    // rounds (R16) can derive the winner without needing a user-entered score.
    const realKey = knockoutIdentityKey("ROUND_OF_32", fresh.homeTeamCode, fresh.awayTeamCode);
    const realMatch = realKey
      ? realKnockoutMatches?.find((m) => {
          const k = knockoutIdentityKey(m.stage, m.home.code, m.away.code);
          return k === realKey;
        })
      : undefined;
    if (realMatch?.status === "FINISHED" && realMatch.score?.fullTime) {
      const ft = realMatch.score.fullTime;
      const pen = realMatch.score.penalties;
      let penWinner: "home" | "away" | null = null;
      if (pen) penWinner = pen.home > pen.away ? "home" : pen.away > pen.home ? "away" : null;
      return { ...fresh, home: ft.home, away: ft.away, penaltyWinner: penWinner };
    }

    if (
      prev &&
      prev.homeTeamCode === fresh.homeTeamCode &&
      prev.awayTeamCode === fresh.awayTeamCode
    ) {
      return { ...fresh, home: prev.home, away: prev.away, penaltyWinner: prev.penaltyWinner };
    }
    return fresh;
  });

  const r16: KnockoutPick[] = [];
  for (let i = 0; i < 8; i++) {
    const [a, b] = R16_FEED[i];
    const winA = effectiveWinner(r32[a]);
    const winB = effectiveWinner(r32[b]);
    const id = `R16-${i + 1}`;
    const prev = existing?.r16?.find((p) => p.matchId === id);
    const fresh = emptyPick(id, "ROUND_OF_16", winA, winB);
    if (
      prev &&
      prev.homeTeamCode === fresh.homeTeamCode &&
      prev.awayTeamCode === fresh.awayTeamCode
    ) {
      r16.push({ ...fresh, home: prev.home, away: prev.away, penaltyWinner: prev.penaltyWinner });
    } else {
      r16.push(fresh);
    }
  }

  const qf: KnockoutPick[] = [];
  for (let i = 0; i < 4; i++) {
    const [a, b] = QF_FEED[i];
    const winA = effectiveWinner(r16[a]);
    const winB = effectiveWinner(r16[b]);
    const id = `QF-${i + 1}`;
    const prev = existing?.qf?.find((p) => p.matchId === id);
    const fresh = emptyPick(id, "QUARTER_FINALS", winA, winB);
    if (
      prev &&
      prev.homeTeamCode === fresh.homeTeamCode &&
      prev.awayTeamCode === fresh.awayTeamCode
    ) {
      qf.push({ ...fresh, home: prev.home, away: prev.away, penaltyWinner: prev.penaltyWinner });
    } else {
      qf.push(fresh);
    }
  }

  const sf: KnockoutPick[] = [];
  for (let i = 0; i < 2; i++) {
    const [a, b] = SF_FEED[i];
    const winA = effectiveWinner(qf[a]);
    const winB = effectiveWinner(qf[b]);
    const id = `SF-${i + 1}`;
    const prev = existing?.sf?.find((p) => p.matchId === id);
    const fresh = emptyPick(id, "SEMI_FINALS", winA, winB);
    if (
      prev &&
      prev.homeTeamCode === fresh.homeTeamCode &&
      prev.awayTeamCode === fresh.awayTeamCode
    ) {
      sf.push({ ...fresh, home: prev.home, away: prev.away, penaltyWinner: prev.penaltyWinner });
    } else {
      sf.push(fresh);
    }
  }

  const sfLoserA = loserOf(sf[0]);
  const sfLoserB = loserOf(sf[1]);
  const thirdFresh = emptyPick("THIRD-1", "THIRD_PLACE", sfLoserA, sfLoserB);
  const thirdPrev = existing?.third;
  const third: KnockoutPick =
    thirdPrev &&
    thirdPrev.homeTeamCode === thirdFresh.homeTeamCode &&
    thirdPrev.awayTeamCode === thirdFresh.awayTeamCode
      ? { ...thirdFresh, home: thirdPrev.home, away: thirdPrev.away, penaltyWinner: thirdPrev.penaltyWinner }
      : thirdFresh;

  const sfWinA = effectiveWinner(sf[0]);
  const sfWinB = effectiveWinner(sf[1]);
  const finalFresh = emptyPick("FINAL-1", "FINAL", sfWinA, sfWinB);
  const finalPrev = existing?.final;
  const final: KnockoutPick =
    finalPrev &&
    finalPrev.homeTeamCode === finalFresh.homeTeamCode &&
    finalPrev.awayTeamCode === finalFresh.awayTeamCode
      ? { ...finalFresh, home: finalPrev.home, away: finalPrev.away, penaltyWinner: finalPrev.penaltyWinner }
      : finalFresh;

  return { r32, r16, qf, sf, third, final };
}

/**
 * Overlay real fixture data onto an already-built bracket.
 *
 * For each pick, if a real knockout fixture exists in the DB for that matchId
 * (looked up via externalId or _id pattern), this function:
 *   - Overwrites homeTeamCode/Name and awayTeamCode/Name with the real teams.
 *   - Overwrites the score only for FINISHED matches (they're locked anyway).
 *
 * This is the last step in recomputeKnockout and ensures users ALWAYS see the
 * correct real teams for the current round — even when the propagation chain
 * broke due to missing intermediate scores.
 */
export function patchKnockoutWithRealFixtures(
  knockout: PredictionDoc["knockout"],
  realKnockoutMatches: MatchDoc[],
): PredictionDoc["knockout"] {
  const byId = new Map<string, MatchDoc>();
  for (const m of realKnockoutMatches) {
    const src = m.externalId ?? (/^wiki-(.+)$/.exec(m._id)?.[1] ?? null);
    if (!src) continue;
    const id = externalIdToMatchId(src);
    if (id) byId.set(id, m);
  }
  if (byId.size === 0) return knockout;

  function patch(pick: KnockoutPick): KnockoutPick {
    const real = byId.get(pick.matchId);
    if (!real) return pick;
    const hCode = real.home.code || pick.homeTeamCode;
    const aCode = real.away.code || pick.awayTeamCode;
    const patched: KnockoutPick = {
      ...pick,
      homeTeamCode: hCode,
      homeTeamName: real.home.code ? real.home.name : pick.homeTeamName,
      awayTeamCode: aCode,
      awayTeamName: real.away.code ? real.away.name : pick.awayTeamName,
    };
    if (real.status === "FINISHED" && real.score?.fullTime) {
      const ft = real.score.fullTime;
      const pen = real.score.penalties;
      const penWinner: "home" | "away" | null =
        pen ? (pen.home > pen.away ? "home" : pen.away > pen.home ? "away" : null) : null;
      return { ...patched, home: ft.home, away: ft.away, penaltyWinner: penWinner };
    }
    return patched;
  }

  return {
    r32: knockout.r32.map(patch),
    r16: knockout.r16.map(patch),
    qf: knockout.qf.map(patch),
    sf: knockout.sf.map(patch),
    third: knockout.third ? patch(knockout.third) : null,
    final: knockout.final ? patch(knockout.final) : null,
  };
}

/**
 * Guarantee that every round has the right number of pick slots.
 * Called after bracket building so the client always sees a full structure
 * and knockoutOpen stays true even before group standings are known.
 * Existing picks are preserved; only missing slots are added as empty.
 */
export function ensureKnockoutSlots(
  existing: PredictionDoc["knockout"],
): PredictionDoc["knockout"] {
  function fillSlots(
    arr: KnockoutPick[],
    count: number,
    stage: KnockoutPick["stage"],
    prefix: string,
  ): KnockoutPick[] {
    if (arr.length >= count) return arr;
    const result = [...arr];
    for (let i = result.length + 1; i <= count; i++) {
      result.push(emptyPick(`${prefix}-${i}`, stage, null, null));
    }
    return result;
  }
  return {
    r32: fillSlots(existing.r32, 16, "ROUND_OF_32", "R32"),
    r16: fillSlots(existing.r16, 8, "ROUND_OF_16", "R16"),
    qf: fillSlots(existing.qf, 4, "QUARTER_FINALS", "QF"),
    sf: fillSlots(existing.sf, 2, "SEMI_FINALS", "SF"),
    third: existing.third ?? emptyPick("THIRD-1", "THIRD_PLACE", null, null),
    final: existing.final ?? emptyPick("FINAL-1", "FINAL", null, null),
  };
}

export function championFromFinal(
  final: KnockoutPick | null,
): { code: string; name: string } | null {
  if (!final) return null;
  const winner = winnerOf(final);
  return winner;
}
