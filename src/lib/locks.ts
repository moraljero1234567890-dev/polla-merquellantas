// Shared edit-lock configuration for predictions.
// Plain module (no "server-only") so the UI and the API agree exactly.
//
// All values are absolute UTC instants. Colombia is UTC-5 (no DST).

// Group predictions are open to everyone until the end of June 16, 2026
// Colombia time (= 2026-06-17T04:59:59Z). A group match ALSO locks the
// instant it kicks off, even if that happens before this deadline.
export const GROUP_FILL_DEADLINE = "2026-06-17T04:59:59Z";

// Knockout picks stay editable per round until roughly 24h before that
// round begins in the real 2026 World Cup schedule, so people can keep
// adjusting "before the games." Adjust these if the schedule shifts.
export const KNOCKOUT_STAGE_LOCK: Record<string, string> = {
  ROUND_OF_32: "2026-06-27T16:00:00Z", // R32 starts Jun 28
  ROUND_OF_16: "2026-07-02T16:00:00Z", // R16 starts ~Jul 3
  QUARTER_FINALS: "2026-07-08T16:00:00Z", // QF starts ~Jul 9
  SEMI_FINALS: "2026-07-12T16:00:00Z", // SF starts ~Jul 14
  THIRD_PLACE: "2026-07-17T16:00:00Z", // 3rd place ~Jul 18
  FINAL: "2026-07-18T16:00:00Z", // Final ~Jul 19
};

export type KnockoutStage =
  | "ROUND_OF_32"
  | "ROUND_OF_16"
  | "QUARTER_FINALS"
  | "SEMI_FINALS"
  | "THIRD_PLACE"
  | "FINAL";

/** True once the global group-fill deadline has passed. */
export function isGroupFillClosed(now: number = Date.now()): boolean {
  return now >= new Date(GROUP_FILL_DEADLINE).getTime();
}

/**
 * A group match is locked once it has kicked off, or once the global
 * group-fill deadline passes — whichever comes first.
 */
export function isGroupMatchLocked(
  kickoffIso: string | undefined | null,
  now: number = Date.now(),
): boolean {
  if (isGroupFillClosed(now)) return true;
  if (kickoffIso) {
    const k = new Date(kickoffIso).getTime();
    if (Number.isFinite(k) && now >= k) return true;
  }
  return false;
}

/** Map a synthetic knockout matchId (e.g. "R32-1") to its stage. */
export function stageFromMatchId(matchId: string): KnockoutStage | null {
  if (matchId.startsWith("R32")) return "ROUND_OF_32";
  if (matchId.startsWith("R16")) return "ROUND_OF_16";
  if (matchId.startsWith("QF")) return "QUARTER_FINALS";
  if (matchId.startsWith("SF")) return "SEMI_FINALS";
  if (matchId.startsWith("THIRD")) return "THIRD_PLACE";
  if (matchId.startsWith("FINAL")) return "FINAL";
  return null;
}

/** A knockout round is locked ~24h before that round starts. */
export function isKnockoutStageLocked(
  stage: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!stage) return false;
  const iso = KNOCKOUT_STAGE_LOCK[stage];
  if (!iso) return false;
  return now >= new Date(iso).getTime();
}
