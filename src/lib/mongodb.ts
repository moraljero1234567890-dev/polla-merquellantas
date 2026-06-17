import { MongoClient, type Db, type Collection } from "mongodb";
import type { MatchDoc, PredictionDoc, UserDoc } from "./types";

/** Small key/value collection for bookkeeping (e.g. last live-score refresh). */
export type MetaDoc = { _id: string; updatedAt: Date };

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  if (global._mongoClientPromise) return global._mongoClientPromise;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Missing MONGODB_URI. Set it in your environment (Vercel) before calling the API.",
    );
  }
  global._mongoClientPromise = new MongoClient(uri).connect();
  return global._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const dbName = process.env.MONGODB_DB ?? "polla_mundialista";
  const client = await getClientPromise();
  return client.db(dbName);
}

export async function matchesCollection(): Promise<Collection<MatchDoc>> {
  const db = await getDb();
  return db.collection<MatchDoc>("matches");
}

export async function usersCollection(): Promise<Collection<UserDoc>> {
  const db = await getDb();
  return db.collection<UserDoc>("users");
}

export async function predictionsCollection(): Promise<
  Collection<PredictionDoc>
> {
  const db = await getDb();
  return db.collection<PredictionDoc>("predictions");
}

export async function metaCollection(): Promise<Collection<MetaDoc>> {
  const db = await getDb();
  return db.collection<MetaDoc>("meta");
}

export default getClientPromise;
