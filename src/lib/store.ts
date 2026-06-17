import "server-only";
import {
  matchesCollection,
  metaCollection,
  predictionsCollection,
  usersCollection,
} from "./mongodb";
import { fetchLatestFromConfiguredProvider } from "./providers";
import { fetchMatchesFromWikipedia } from "./wikipedia";
import { buildMatchSeed } from "./seed-data";
import type { MatchDoc, PredictionDoc, Score, UserDoc } from "./types";

async function ensureMatchesSeeded(): Promise<void> {
  const col = await matchesCollection();
  const count = await col.estimatedDocumentCount();
  if (count > 0) return;
  let docs: MatchDoc[] = [];
  // Wikipedia is the source of truth for the real 2026 draw + live results, so
  // seed from it first — this keeps the stored _id/team-code scheme identical
  // to what refreshMatchScores() folds results onto later.
  try {
    docs = await fetchMatchesFromWikipedia();
  } catch (err) {
    console.warn("Wikipedia seed failed, trying configured provider:", err);
  }
  if (docs.length === 0) {
    try {
      const result = await fetchLatestFromConfiguredProvider();
      docs = result.docs;
    } catch (err) {
      console.warn("Failed to fetch from provider, using static seed:", err);
    }
  }
  if (docs.length === 0) docs = buildMatchSeed();
  if (docs.length === 0) return;
  await col.insertMany(docs);
  await col.createIndex({ utcDate: 1 });
  await col.createIndex({ stage: 1, group: 1, matchday: 1 });
}

async function ensureUsersIndex(): Promise<void> {
  const col = await usersCollection();
  await col.createIndex({ email: 1 }, { unique: true });
}

export async function getAllMatches(): Promise<MatchDoc[]> {
  await ensureMatchesSeeded();
  const col = await matchesCollection();
  return col.find({}).sort({ utcDate: 1 }).toArray();
}

/** Don't hit the upstream provider more than once per this window. */
const REFRESH_MIN_INTERVAL_MS = 60_000;
const REFRESH_META_ID = "matchScoresRefresh";

export type RefreshResult = {
  refreshed: boolean;
  /** Why the Wikipedia fetch was skipped, if it was. */
  skipped?: "throttled" | "no-data" | "error";
  source?: string;
  /** Existing match docs whose score/status changed. */
  updated?: number;
  /** Real knockout fixtures inserted as teams get decided. */
  inserted?: number;
  /** Wikipedia rows that matched no stored fixture (kept for diagnostics). */
  unmatched?: number;
  error?: string;
};

/** Identity key shared by the static seed and Wikipedia: each pair of teams
 * meets once per group, so group + the unordered code pair is unique. */
function identityKey(
  stage: string,
  group: string | null,
  codeA: string,
  codeB: string,
): string | null {
  const a = codeA.trim().toLowerCase();
  const b = codeB.trim().toLowerCase();
  if (!a || !b) return null; // TBD knockout slot — can't bridge yet.
  // Codes can contain "-" (gb-eng), so join with "~" to keep pairs unambiguous.
  return `${stage}|${group ?? ""}|${[a, b].sort().join("~")}`;
}

/** Re-orient a Wikipedia score so home/away line up with the stored fixture,
 * which may list the same two teams in the opposite order. */
function orientScore(
  storedHomeCode: string,
  wiki: MatchDoc,
): MatchDoc["score"] {
  if (!wiki.score) return null;
  const swap = storedHomeCode.trim().toLowerCase() !== wiki.home.code;
  if (!swap) return wiki.score;
  const flip = (s: Score | null): Score | null =>
    s ? { home: s.away, away: s.home } : null;
  return {
    fullTime: flip(wiki.score.fullTime),
    halfTime: flip(wiki.score.halfTime),
    penalties: flip(wiki.score.penalties),
  };
}

/**
 * Fetch live results from Wikipedia and fold them onto the fixtures we already
 * store, so points reflect real outcomes. Group results update the existing
 * doc IN PLACE (matched by team identity, not _id) — predictions are keyed by
 * the stored _id, and the static seed uses a different id scheme than
 * Wikipedia, so updating in place is what keeps points landing without
 * creating duplicate fixtures. Only `status`/`score` change; the stored
 * schedule and edit-lock timing are left untouched. Knockout fixtures that
 * don't exist yet are inserted once both teams are known, enabling
 * champion/runner-up scoring as the bracket fills in.
 *
 * Throttled to ≤1 Wikipedia call/min so a burst of logins stays cheap, and it
 * never throws — a Wikipedia hiccup must not break sign-in.
 */
export async function refreshMatchScores(opts?: {
  force?: boolean;
}): Promise<RefreshResult> {
  try {
    const meta = await metaCollection();
    const now = new Date();
    if (!opts?.force) {
      const last = await meta.findOne({ _id: REFRESH_META_ID });
      if (
        last?.updatedAt &&
        now.getTime() - new Date(last.updatedAt).getTime() <
          REFRESH_MIN_INTERVAL_MS
      ) {
        return { refreshed: false, skipped: "throttled" };
      }
    }
    // Claim the window up front so concurrent logins don't all fan out.
    await meta.updateOne(
      { _id: REFRESH_META_ID },
      { $set: { updatedAt: now } },
      { upsert: true },
    );

    const wikiMatches = await fetchMatchesFromWikipedia();
    if (!wikiMatches.length) {
      return { refreshed: false, skipped: "no-data", source: "wikipedia" };
    }

    const col = await matchesCollection();
    const stored = await col.find({}).toArray();
    const storedByIdentity = new Map<string, MatchDoc>();
    for (const m of stored) {
      const key = identityKey(m.stage, m.group, m.home.code, m.away.code);
      if (key) storedByIdentity.set(key, m);
    }

    let updated = 0;
    let inserted = 0;
    let unmatched = 0;
    for (const w of wikiMatches) {
      const key = identityKey(w.stage, w.group, w.home.code, w.away.code);
      const existing = key ? storedByIdentity.get(key) : undefined;

      if (existing) {
        const score = orientScore(existing.home.code, w);
        // Mirror Wikipedia's truth, but never wipe a real score back to null.
        if (w.status === existing.status && !score) {
          continue;
        }
        const res = await col.updateOne(
          { _id: existing._id },
          { $set: { status: w.status, score } },
        );
        if (res.modifiedCount > 0) updated += 1;
      } else if (w.stage !== "GROUP_STAGE" && key) {
        // A real knockout fixture we don't have yet (both teams now known).
        // Safe to insert: knockout scoring reads winner codes, not _ids.
        await col.replaceOne({ _id: w._id }, w, { upsert: true });
        inserted += 1;
      } else {
        unmatched += 1;
      }
    }

    return { refreshed: true, source: "wikipedia", updated, inserted, unmatched };
  } catch (err) {
    return {
      refreshed: false,
      skipped: "error",
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

export async function findUserByCredentials(
  email: string,
  nit: string,
): Promise<UserDoc | null> {
  const col = await usersCollection();
  const cleanEmail = email.trim().toLowerCase();
  const cleanNit = nit.replace(/\D/g, "");
  return col.findOne({ email: cleanEmail, nit: cleanNit });
}

export async function findUserByNit(nit: string): Promise<UserDoc | null> {
  const col = await usersCollection();
  const clean = canonicalNit(nit);
  if (!clean) return null;
  return col.findOne({ nit: clean });
}

/**
 * Canonical cédula/NIT: drop the Colombian verification digit (the part
 * after a hyphen, e.g. "800130426-3" -> "800130426") and keep digits only.
 * This is the single normalized form used as the user key everywhere.
 */
export function canonicalNit(raw: string): string {
  return String(raw ?? "")
    .split("-")[0]
    .replace(/\D/g, "");
}

/** Internal email key synthesized from a cédula when none is provided. */
export function syntheticEmail(nit: string): string {
  return `${canonicalNit(nit)}@polla.local`;
}

export async function listAllUsers(): Promise<UserDoc[]> {
  const col = await usersCollection();
  return col.find({}).sort({ createdAt: -1 }).toArray();
}

export async function createUser(input: {
  email?: string;
  nit: string;
  cedula?: string;
  name: string;
  seller?: string;
  attemptsAllowed: number;
}): Promise<UserDoc> {
  await ensureUsersIndex();
  const col = await usersCollection();
  const nit = canonicalNit(input.cedula ?? input.nit);
  const email = (input.email?.trim().toLowerCase() || syntheticEmail(nit));
  const doc: UserDoc = {
    _id: email,
    email,
    nit,
    // Stored without the verification digit, so it never shows the "-X".
    cedula: nit,
    name: input.name.trim(),
    seller: input.seller?.trim() || undefined,
    attemptsAllowed: Math.max(1, Math.min(20, Math.floor(input.attemptsAllowed))),
    createdAt: new Date(),
  };
  await col.replaceOne({ _id: doc._id }, doc, { upsert: true });
  return doc;
}

export type BulkUserInput = {
  nit: string;
  cedula?: string;
  name: string;
  seller?: string;
  attemptsAllowed: number;
};

/**
 * Insert/update many users at once (XLSX import). Keyed by the synthetic
 * email derived from the cédula, so re-importing the same sheet updates
 * existing users (e.g. a corrected attempt count) in place — preserving
 * their original createdAt and never touching their saved predictions.
 */
export async function bulkUpsertUsers(
  rows: BulkUserInput[],
): Promise<{ count: number; created: number; updated: number }> {
  await ensureUsersIndex();
  const col = await usersCollection();
  const ops = rows
    .map((r) => {
      const nit = canonicalNit(r.cedula ?? r.nit);
      if (!nit) return null;
      const email = syntheticEmail(nit);
      // $set updates fields on existing users (attempts, name, seller…);
      // $setOnInsert only stamps createdAt the first time the user appears.
      return {
        updateOne: {
          filter: { _id: email },
          update: {
            $set: {
              email,
              nit,
              // Stored without the verification digit ("-X").
              cedula: nit,
              name: r.name.trim(),
              seller: r.seller?.trim() || undefined,
              attemptsAllowed: Math.max(
                1,
                Math.min(20, Math.floor(r.attemptsAllowed)),
              ),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
        },
      };
    })
    .filter((op): op is NonNullable<typeof op> => op !== null);
  if (ops.length === 0) return { count: 0, created: 0, updated: 0 };
  const res = await col.bulkWrite(ops, { ordered: false });
  const created = res.upsertedCount ?? 0;
  const updated = res.modifiedCount ?? 0;
  return { count: ops.length, created, updated };
}

/**
 * One-time cleanup: rewrite every user (and its predictions) so the
 * cédula/NIT has no verification digit. Users were originally stored with
 * the check digit baked into the key (e.g. "8001304263"); this re-keys
 * them to the canonical form ("800130426") derived from their stored
 * cédula, moving their predictions along so nothing is lost.
 */
export async function normalizeAllCedulas(): Promise<{
  scanned: number;
  changed: number;
  unchanged: number;
  collisions: number;
  predictionsMoved: number;
}> {
  const userCol = await usersCollection();
  const predCol = await predictionsCollection();
  const users = await userCol.find({}).toArray();

  let changed = 0;
  let unchanged = 0;
  let collisions = 0;
  let predictionsMoved = 0;

  for (const user of users) {
    // Prefer the stored cédula (may still hold the "-X"); fall back to nit.
    const newNit = canonicalNit(user.cedula ?? user.nit);
    if (newNit.length < 6) {
      unchanged++;
      continue;
    }
    const newEmail = syntheticEmail(newNit);

    if (newEmail === user._id) {
      // Key already canonical; just make sure the cédula shows no "-X".
      if (user.cedula !== newNit || user.nit !== newNit) {
        await userCol.updateOne(
          { _id: user._id },
          { $set: { nit: newNit, cedula: newNit } },
        );
        changed++;
      } else {
        unchanged++;
      }
      continue;
    }

    // Key changes. Bail if a canonical record already exists (duplicate).
    const existing = await userCol.findOne({ _id: newEmail });
    if (existing) {
      collisions++;
      continue;
    }

    // Move this user's predictions to the new email/_id first.
    const preds = await predCol
      .find({ userEmail: user._id })
      .toArray();
    for (const p of preds) {
      const moved: PredictionDoc = {
        ...p,
        _id: `${newEmail}#${p.attempt}`,
        userEmail: newEmail,
      };
      await predCol.replaceOne({ _id: moved._id }, moved, { upsert: true });
      if (moved._id !== p._id) await predCol.deleteOne({ _id: p._id });
      predictionsMoved++;
    }

    // Recreate the user under the canonical key, then drop the old doc.
    const newUser: UserDoc = {
      ...user,
      _id: newEmail,
      email: newEmail,
      nit: newNit,
      cedula: newNit,
    };
    await userCol.replaceOne({ _id: newEmail }, newUser, { upsert: true });
    await userCol.deleteOne({ _id: user._id });
    changed++;
  }

  return {
    scanned: users.length,
    changed,
    unchanged,
    collisions,
    predictionsMoved,
  };
}

export async function getUserByEmail(email: string): Promise<UserDoc | null> {
  const col = await usersCollection();
  return col.findOne({ email: email.trim().toLowerCase() });
}

export async function listPredictionsForUser(
  email: string,
): Promise<PredictionDoc[]> {
  const col = await predictionsCollection();
  return col
    .find({ userEmail: email.trim().toLowerCase() })
    .sort({ attempt: 1 })
    .toArray();
}

export async function listAllPredictions(): Promise<PredictionDoc[]> {
  const col = await predictionsCollection();
  return col.find({}).toArray();
}

export async function getPrediction(
  email: string,
  attempt: number,
): Promise<PredictionDoc | null> {
  const col = await predictionsCollection();
  return col.findOne({
    userEmail: email.trim().toLowerCase(),
    attempt,
  });
}

export async function upsertPrediction(doc: PredictionDoc): Promise<void> {
  const col = await predictionsCollection();
  await col.replaceOne({ _id: doc._id }, doc, { upsert: true });
}

export async function isTournamentLocked(): Promise<boolean> {
  const col = await matchesCollection();
  const first = await col
    .find({ stage: "GROUP_STAGE" })
    .sort({ utcDate: 1 })
    .limit(1)
    .toArray();
  if (!first.length) return false;
  return new Date(first[0].utcDate).getTime() <= Date.now();
}
