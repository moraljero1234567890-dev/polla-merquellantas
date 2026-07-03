import "server-only";
import type { KnockoutPick, MatchDoc, PredictionDoc } from "./types";
import { knockoutIdentityKey } from "./locks";

export const POINTS = {
  // Group stage
  GROUP_EXACT: 50,
  GROUP_OUTCOME: 30,
  GROUP_GOAL_DIFF: 20,
  // Knockout per-match scoring (R16 onwards): all three stack, max 125/match
  KO_WINNER: 40,
  KO_EXACT: 60,
  KO_GOAL_DIFF: 25,
  // Old final bonuses kept at 0 for backward compatibility with admin page
  FINAL_BOTH: 0,
  CHAMPION: 0,
  RUNNER_UP: 0,
} as const;

// Knockout stages that earn per-match points (R16 onwards, not R32)
const SCORED_KNOCKOUT_STAGES = new Set([
  "ROUND_OF_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "THIRD_PLACE",
  "FINAL",
]);

export type ScoreBreakdown = {
  group: {
    exact: number;
    outcomes: number;
    goalDiff: number;
    points: number;
  };
  knockout: {
    /** Points earned per finished knockout match (R16 onwards). */
    byMatch: Record<string, number>;
    points: number;
  };
  /** Kept for admin-page backward compatibility; points are always 0 now. */
  final: {
    both: boolean;
    champion: boolean;
    runnerUp: boolean;
    points: number;
  };
  total: number;
};

export type LeaderboardRow = {
  email: string;
  name: string;
  attempt: number;
  attemptsAllowed: number;
  totalAttempts: number;
  breakdown: ScoreBreakdown;
};

type FinishedGroupMatch = {
  id: string;
  home: number;
  away: number;
};

function outcome(home: number, away: number): "H" | "A" | "D" {
  if (home > away) return "H";
  if (away > home) return "A";
  return "D";
}

function finishedGroupMatches(matches: MatchDoc[]): FinishedGroupMatch[] {
  const out: FinishedGroupMatch[] = [];
  for (const m of matches) {
    if (m.stage !== "GROUP_STAGE") continue;
    if (m.status !== "FINISHED") continue;
    const ft = m.score?.fullTime;
    if (!ft) continue;
    out.push({ id: m._id, home: ft.home, away: ft.away });
  }
  return out;
}

function knockoutWinnersByStage(matches: MatchDoc[]): {
  r16: Set<string>;
  qf: Set<string>;
  sf: Set<string>;
  champion: string | null;
  runnerUp: string | null;
} {
  const r16 = new Set<string>();
  const qf = new Set<string>();
  const sf = new Set<string>();
  let champion: string | null = null;
  let runnerUp: string | null = null;

  for (const m of matches) {
    if (m.status !== "FINISHED") continue;
    const ft = m.score?.fullTime;
    const pens = m.score?.penalties;
    if (!ft) continue;
    let winnerCode: string | null = null;
    if (ft.home > ft.away) winnerCode = m.home.code;
    else if (ft.away > ft.home) winnerCode = m.away.code;
    else if (pens) {
      if (pens.home > pens.away) winnerCode = m.home.code;
      else if (pens.away > pens.home) winnerCode = m.away.code;
    }
    if (!winnerCode) continue;
    const loserCode = winnerCode === m.home.code ? m.away.code : m.home.code;

    switch (m.stage) {
      case "ROUND_OF_16":
        r16.add(winnerCode);
        break;
      case "QUARTER_FINALS":
        qf.add(winnerCode);
        break;
      case "SEMI_FINALS":
        sf.add(winnerCode);
        break;
      case "FINAL":
        champion = winnerCode;
        runnerUp = loserCode;
        break;
      default:
        break;
    }
  }

  return { r16, qf, sf, champion, runnerUp };
}

function pickedWinnerCode(p: KnockoutPick): string | null {
  if (p.home == null || p.away == null) return null;
  if (p.home > p.away) return p.homeTeamCode;
  if (p.away > p.home) return p.awayTeamCode;
  if (p.penaltyWinner === "home") return p.homeTeamCode;
  if (p.penaltyWinner === "away") return p.awayTeamCode;
  return null;
}

function emptyBreakdown(): ScoreBreakdown {
  return {
    group: { exact: 0, outcomes: 0, goalDiff: 0, points: 0 },
    knockout: { byMatch: {}, points: 0 },
    final: { both: false, champion: false, runnerUp: false, points: 0 },
    total: 0,
  };
}

/** Score a single R16+ knockout pick against the real finished match result.
 * Returns 0 if the match hasn't finished yet or the pick has no score entered. */
function scoreKnockoutPick(pick: KnockoutPick, realMatch: MatchDoc): number {
  if (realMatch.status !== "FINISHED") return 0;
  const ft = realMatch.score?.fullTime;
  if (!ft || pick.home == null || pick.away == null) return 0;

  // Real winner (by FT, or by penalties if draw)
  let realWinner: string | null = null;
  if (ft.home > ft.away) realWinner = realMatch.home.code;
  else if (ft.away > ft.home) realWinner = realMatch.away.code;
  else {
    const pen = realMatch.score?.penalties;
    if (pen?.home != null && pen?.away != null) {
      if (pen.home > pen.away) realWinner = realMatch.home.code;
      else if (pen.away > pen.home) realWinner = realMatch.away.code;
    }
  }

  const predictedWinner = pickedWinnerCode(pick);
  let pts = 0;
  // +40: correct winner
  if (realWinner && predictedWinner && realWinner === predictedWinner) {
    pts += POINTS.KO_WINNER;
  }
  // +60: exact 90-min score
  if (pick.home === ft.home && pick.away === ft.away) {
    pts += POINTS.KO_EXACT;
  }
  // +25: correct goal difference
  if (Math.abs(pick.home - pick.away) === Math.abs(ft.home - ft.away)) {
    pts += POINTS.KO_GOAL_DIFF;
  }
  return pts;
}

export type AttemptScore = {
  breakdown: ScoreBreakdown;
  /** Points earned per finished group match (0 when the pick missed). */
  groupPointsByMatch: Record<string, number>;
  /**
   * Correct knockout picks (winner), kept for the results comparison view.
   */
  knockoutHits: {
    r16: string[];
    qf: string[];
    sf: string[];
    runnerUp: boolean;
    champion: boolean;
  };
};

export function emptyAttemptScore(): AttemptScore {
  return {
    breakdown: emptyBreakdown(),
    groupPointsByMatch: {},
    knockoutHits: { r16: [], qf: [], sf: [], runnerUp: false, champion: false },
  };
}

export function scorePredictions(
  matches: MatchDoc[],
  predictions: PredictionDoc[],
): Map<string, AttemptScore> {
  const groupReal = finishedGroupMatches(matches);
  const knockReal = knockoutWinnersByStage(matches);

  // Build a map from identity key → real MatchDoc for knockout stages
  const knockoutMatchByKey = new Map<string, MatchDoc>();
  for (const m of matches) {
    if (!SCORED_KNOCKOUT_STAGES.has(m.stage)) continue;
    const key = knockoutIdentityKey(m.stage, m.home.code, m.away.code);
    if (key) knockoutMatchByKey.set(key, m);
  }

  const out = new Map<string, AttemptScore>();
  for (const p of predictions) {
    const score = emptyAttemptScore();
    const br = score.breakdown;

    // --- Group stage scoring (unchanged) ---
    for (const m of groupReal) {
      const pick = p.groupScores[m.id];
      if (!pick) continue;
      if (pick.home === m.home && pick.away === m.away) {
        br.group.exact += 1;
        br.group.points += POINTS.GROUP_EXACT;
        score.groupPointsByMatch[m.id] = POINTS.GROUP_EXACT;
      } else if (outcome(pick.home, pick.away) === outcome(m.home, m.away)) {
        br.group.outcomes += 1;
        br.group.points += POINTS.GROUP_OUTCOME;
        score.groupPointsByMatch[m.id] = POINTS.GROUP_OUTCOME;
      } else if (
        Math.abs(pick.home - pick.away) === Math.abs(m.home - m.away)
      ) {
        br.group.goalDiff += 1;
        br.group.points += POINTS.GROUP_GOAL_DIFF;
        score.groupPointsByMatch[m.id] = POINTS.GROUP_GOAL_DIFF;
      } else {
        score.groupPointsByMatch[m.id] = 0;
      }
    }

    // --- Knockout hit tracking (for results display) ---
    for (const pick of p.knockout.r16) {
      const w = pickedWinnerCode(pick);
      if (w && knockReal.r16.has(w)) score.knockoutHits.r16.push(pick.matchId);
    }
    for (const pick of p.knockout.qf) {
      const w = pickedWinnerCode(pick);
      if (w && knockReal.qf.has(w)) score.knockoutHits.qf.push(pick.matchId);
    }
    for (const pick of p.knockout.sf) {
      const w = pickedWinnerCode(pick);
      if (w && knockReal.sf.has(w)) score.knockoutHits.sf.push(pick.matchId);
    }

    const championHit = Boolean(
      knockReal.champion && p.champion?.code === knockReal.champion,
    );
    let runnerUpHit = false;
    if (knockReal.runnerUp && p.knockout.final) {
      const finalPick = p.knockout.final;
      const winner = pickedWinnerCode(finalPick);
      const loser =
        winner === finalPick.homeTeamCode
          ? finalPick.awayTeamCode
          : winner === finalPick.awayTeamCode
            ? finalPick.homeTeamCode
            : null;
      runnerUpHit = Boolean(loser && loser === knockReal.runnerUp);
    }
    score.knockoutHits.champion = championHit;
    score.knockoutHits.runnerUp = runnerUpHit;

    // --- Knockout per-match scoring (R16 onwards): 40 winner + 60 exact + 25 goal diff ---
    const scoredPicks: KnockoutPick[] = [
      ...p.knockout.r16,
      ...p.knockout.qf,
      ...p.knockout.sf,
      ...(p.knockout.third ? [p.knockout.third] : []),
      ...(p.knockout.final ? [p.knockout.final] : []),
    ];
    for (const pick of scoredPicks) {
      const key = knockoutIdentityKey(pick.stage, pick.homeTeamCode, pick.awayTeamCode);
      const realMatch = key ? knockoutMatchByKey.get(key) : undefined;
      if (!realMatch) continue;
      const pts = scoreKnockoutPick(pick, realMatch);
      br.knockout.byMatch[pick.matchId] = pts;
      br.knockout.points += pts;
    }

    // final.points = 0 (old champion bonus retired; points live in knockout.byMatch)
    br.final.champion = championHit;
    br.final.runnerUp = runnerUpHit;
    br.final.both = championHit && runnerUpHit;
    br.final.points = 0;

    br.total = br.group.points + br.knockout.points;
    out.set(p._id, score);
  }
  return out;
}

export function computeLeaderboard(
  matches: MatchDoc[],
  predictions: PredictionDoc[],
  users: { email: string; name: string; attemptsAllowed: number }[],
): LeaderboardRow[] {
  const scores = scorePredictions(matches, predictions);

  const userByEmail = new Map(users.map((u) => [u.email, u]));
  const totalAttemptsByEmail = new Map<string, number>();
  for (const p of predictions) {
    totalAttemptsByEmail.set(
      p.userEmail,
      (totalAttemptsByEmail.get(p.userEmail) ?? 0) + 1,
    );
  }

  const rows: LeaderboardRow[] = [];
  for (const p of predictions) {
    const user = userByEmail.get(p.userEmail);
    if (!user) continue;
    const br = scores.get(p._id)?.breakdown ?? emptyBreakdown();
    rows.push({
      email: user.email,
      name: user.name,
      attempt: p.attempt,
      attemptsAllowed: user.attemptsAllowed,
      totalAttempts: totalAttemptsByEmail.get(p.userEmail) ?? 0,
      breakdown: br,
    });
  }

  rows.sort((a, b) => {
    if (b.breakdown.total !== a.breakdown.total) {
      return b.breakdown.total - a.breakdown.total;
    }
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.attempt - b.attempt;
  });

  return rows;
}
