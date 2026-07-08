import { matches as staticMatches, flagSrc } from "@/data/worldcup2026";

/**
 * Convert a UTC ISO timestamp to Colombia date/time.
 * Colombia is always UTC-5 (no DST).
 */
export function colombiaKickoff(utcIso: string): { date: string; time: string } {
  const ms = new Date(utcIso).getTime() - 5 * 60 * 60 * 1000;
  const d = new Date(ms);
  const months = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  return {
    date: `${d.getUTCDate()} ${months[d.getUTCMonth()]}`,
    time: `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`,
  };
}

export type ApiMatch = {
  _id: string;
  externalId?: string;
  utcDate?: string;
  date: string;
  time: string;
  venue: string;
  city?: string;
  group: string | null;
  matchday: number | null;
  stage: string;
  stageLabel: string;
  status?: string;
  score?: {
    fullTime?: { home: number; away: number } | null;
    penalties?: { home: number; away: number } | null;
  } | null;
  home: { code: string; name: string; crest: string };
  away: { code: string; name: string; crest: string };
};

export function staticFallback(): ApiMatch[] {
  return staticMatches.map((m) => ({
    _id: m.id,
    date: m.date,
    time: m.time,
    venue: m.venue,
    city: m.city,
    group: m.group,
    matchday: m.matchday,
    stage: "GROUP_STAGE",
    stageLabel: "Fase de Grupos",
    home: { code: m.home.code, name: m.home.name, crest: flagSrc(m.home.code, 80) },
    away: { code: m.away.code, name: m.away.name, crest: flagSrc(m.away.code, 80) },
  }));
}
