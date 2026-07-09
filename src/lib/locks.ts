// Shared edit-lock configuration for predictions.
// Plain module (no "server-only") so the UI and the API agree exactly.
//
// Every match locks individually the moment it kicks off (UTC).
// Colombia = UTC-5 (no DST), so a 2:00 PM Colombia kickoff is 19:00 UTC
// and the lock triggers at or after that instant.

export type KnockoutStage =
  | "ROUND_OF_32"
  | "ROUND_OF_16"
  | "QUARTER_FINALS"
  | "SEMI_FINALS"
  | "THIRD_PLACE"
  | "FINAL";

/**
 * A group match is locked the moment it kicks off.
 * If no kickoff time is known, it stays editable.
 */
export function isGroupMatchLocked(
  kickoffIso: string | undefined | null,
  now: number = Date.now(),
): boolean {
  if (kickoffIso) {
    const k = new Date(kickoffIso).getTime();
    if (Number.isFinite(k) && now >= k) return true;
  }
  return false;
}

/** Identity key for a knockout match: stage + the unordered team-code pair.
 * Lets a synthetic pick (R32-1, …) be matched to the real fixture that carries
 * the kickoff time. Returns null while either team is still undecided. */
export function knockoutIdentityKey(
  stage: string | null | undefined,
  codeA: string | null | undefined,
  codeB: string | null | undefined,
): string | null {
  const a = (codeA ?? "").trim().toLowerCase();
  const b = (codeB ?? "").trim().toLowerCase();
  if (!stage || !a || !b) return null;
  return `${stage}|${[a, b].sort().join("~")}`;
}

/**
 * A knockout match is locked the moment it kicks off.
 * If no kickoff time is known yet (bracket not fully set), it stays editable.
 */
export function isKnockoutMatchLocked(
  _stage: string | null | undefined,
  kickoffIso: string | null | undefined,
  now: number = Date.now(),
  _userNit?: string | null,
): boolean {
  if (kickoffIso) {
    const k = new Date(kickoffIso).getTime();
    if (Number.isFinite(k) && now >= k) return true;
  }
  return false;
}

// Hard cutoffs for rounds whose matches have all concluded.
// Used as a safety net when individual kickoff times are missing from the DB.
const STAGE_HARD_LOCK: Partial<Record<KnockoutStage, string>> = {
  ROUND_OF_32: "2026-07-03T00:00:00Z", // all R32 matches ended by July 2
  ROUND_OF_16: "2026-07-08T00:00:00Z", // all R16 matches ended by July 7
};

/**
 * Stage-level lock. Returns true for rounds whose cutoff date is in the past,
 * ensuring the entire column is disabled even if individual kickoff data is missing.
 */
export function isKnockoutStageLocked(
  stage: string | null | undefined,
  now: number = Date.now(),
  _userNit?: string | null,
): boolean {
  const cutoff = stage ? STAGE_HARD_LOCK[stage as KnockoutStage] : undefined;
  if (cutoff && now >= new Date(cutoff).getTime()) return true;
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
