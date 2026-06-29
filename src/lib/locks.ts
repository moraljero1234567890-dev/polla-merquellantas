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

// One-time "second chance" window. The group stage finished on June 28, 2026,
// so the real round-of-32 bracket is now known. To let everyone realign their
// knockout picks with the ACTUAL fixtures (their predicted bracket may not
// match reality), every knockout round is reopened for ALL users until the end
// of June 29, 2026 Colombia time (UTC-5). After this instant the normal
// per-round schedule above resumes. Set to a past instant to disable.
export const KNOCKOUT_GLOBAL_REOPEN_UNTIL = "2026-06-30T04:59:59Z";

// Per-user knockout exceptions, keyed by canonical cédula/NIT (digits only,
// no verification digit). A listed user may keep editing EVERY knockout round
// until the given instant, ignoring the normal per-round schedule above.
export const KNOCKOUT_USER_OVERRIDE: Record<string, string> = {
  // Edits allowed through the end of June 30, 2026 Colombia time (UTC-5).
  "800195354": "2026-07-01T04:59:59Z",
};

/** Canonical cédula/NIT: drop the check digit and keep digits only. */
function canonicalNit(raw: string): string {
  return String(raw ?? "").split("-")[0].replace(/\D/g, "");
}

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
 * A specific knockout match is locked if its round is locked OR it has already
 * kicked off. The kickoff check matters during the global reopen window: the
 * round is otherwise editable, but a match that has already started can never
 * be changed (e.g. an early round-of-32 game that was played before the rest).
 */
export function isKnockoutMatchLocked(
  stage: string | null | undefined,
  kickoffIso: string | null | undefined,
  now: number = Date.now(),
  userNit?: string | null,
): boolean {
  if (isKnockoutStageLocked(stage, now, userNit)) return true;
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

/**
 * A knockout round is locked ~24h before that round starts. A user listed in
 * KNOCKOUT_USER_OVERRIDE instead stays unlocked for every round until their
 * single override deadline, then locks.
 */
export function isKnockoutStageLocked(
  stage: string | null | undefined,
  now: number = Date.now(),
  userNit?: string | null,
): boolean {
  if (!stage) return false;
  // Global second-chance window reopens every knockout round for everyone and
  // takes precedence over the per-round schedule and per-user overrides.
  if (now < new Date(KNOCKOUT_GLOBAL_REOPEN_UNTIL).getTime()) return false;
  const override = userNit
    ? KNOCKOUT_USER_OVERRIDE[canonicalNit(userNit)]
    : undefined;
  if (override) {
    return now >= new Date(override).getTime();
  }
  const iso = KNOCKOUT_STAGE_LOCK[stage];
  if (!iso) return false;
  return now >= new Date(iso).getTime();
}
