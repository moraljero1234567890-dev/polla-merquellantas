import "server-only";
import {
  matchesCollection,
  predictionsCollection,
  usersCollection,
} from "./mongodb";
import { fetchLatestFromConfiguredProvider } from "./providers";
import { buildMatchSeed } from "./seed-data";
import type { MatchDoc, PredictionDoc, UserDoc } from "./types";

async function ensureMatchesSeeded(): Promise<void> {
  const col = await matchesCollection();
  const count = await col.estimatedDocumentCount();
  if (count > 0) return;
  let docs: MatchDoc[] = [];
  try {
    const result = await fetchLatestFromConfiguredProvider();
    docs = result.docs;
  } catch (err) {
    console.warn("Failed to fetch from provider, using static seed:", err);
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
  const cleanNit = nit.replace(/\D/g, "");
  if (!cleanNit) return null;
  return col.findOne({ nit: cleanNit });
}

/** Internal email key synthesized from a cédula when none is provided. */
export function syntheticEmail(nit: string): string {
  return `${nit.replace(/\D/g, "")}@polla.local`;
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
  const nit = input.nit.replace(/\D/g, "");
  const email = (input.email?.trim().toLowerCase() || syntheticEmail(nit));
  const doc: UserDoc = {
    _id: email,
    email,
    nit,
    cedula: input.cedula?.trim() || undefined,
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
 * existing users without touching their predictions.
 */
export async function bulkUpsertUsers(
  rows: BulkUserInput[],
): Promise<{ count: number }> {
  await ensureUsersIndex();
  const col = await usersCollection();
  const ops = rows
    .map((r) => {
      const nit = r.nit.replace(/\D/g, "");
      if (!nit) return null;
      const email = syntheticEmail(nit);
      const doc: UserDoc = {
        _id: email,
        email,
        nit,
        cedula: r.cedula?.trim() || undefined,
        name: r.name.trim(),
        seller: r.seller?.trim() || undefined,
        attemptsAllowed: Math.max(1, Math.min(20, Math.floor(r.attemptsAllowed))),
        createdAt: new Date(),
      };
      return {
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        },
      };
    })
    .filter((op): op is NonNullable<typeof op> => op !== null);
  if (ops.length === 0) return { count: 0 };
  await col.bulkWrite(ops, { ordered: false });
  return { count: ops.length };
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
