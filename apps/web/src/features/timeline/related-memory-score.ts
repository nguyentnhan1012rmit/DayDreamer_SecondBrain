import { MOOD_META } from "@/lib/mood-meta";
import { isAttachmentObject } from "./attachment-utils";
import type { RelatedMemory, TimelineEntry } from "./types";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "been",
  "cua",
  "cho",
  "from",
  "have",
  "hom",
  "mot",
  "nhung",
  "that",
  "the",
  "this",
  "today",
  "toi",
  "trong",
  "voi",
  "was",
  "were",
  "with",
  "your",
]);

function getWords(entry: TimelineEntry) {
  const attachmentText = (entry.attachments ?? [])
    .filter(isAttachmentObject)
    .map((attachment) => attachment.extractedTextPreview ?? attachment.fileName)
    .join(" ");
  const calendarText = (entry.calendarEvents ?? [])
    .map((event) => event.title)
    .join(" ");

  return new Set(
    `${entry.title} ${entry.content} ${attachmentText} ${calendarText}`
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((word) => word.length > 3 && !STOP_WORDS.has(word)) ?? [],
  );
}

export const RELATED_MEMORY_CANDIDATE_LIMIT = 64;
const NEARBY_ENTRY_WINDOW = 4;

export function buildRelatedMemoryMap(entries: TimelineEntry[]) {
  const profiles = entries.map((entry) => ({
    entry,
    words: getWords(entry),
    tags: new Set((entry.tags ?? []).map((tag) => tag.toLocaleLowerCase())),
    timestamp: new Date(entry.createdAt).getTime(),
  }));

  const profilesById = new Map(
    profiles.map((profile, index) => [profile.entry.id, { profile, index }]),
  );
  const tagIndex = buildInvertedIndex(
    profiles,
    (profile) => profile.tags,
  );
  const wordIndex = buildInvertedIndex(
    profiles,
    (profile) => profile.words,
  );

  return new Map(
    profiles.map((profile, profileIndex) => {
      const candidateIds = new Set<string>();
      collectCandidates(candidateIds, profile.tags, tagIndex, profile.entry.id);
      collectCandidates(candidateIds, profile.words, wordIndex, profile.entry.id);
      for (
        let offset = 1;
        offset <= NEARBY_ENTRY_WINDOW &&
        candidateIds.size < RELATED_MEMORY_CANDIDATE_LIMIT;
        offset += 1
      ) {
        const previous = profiles[profileIndex - offset];
        const next = profiles[profileIndex + offset];
        if (previous) candidateIds.add(previous.entry.id);
        if (next) candidateIds.add(next.entry.id);
      }

      const candidates = Array.from(candidateIds)
        .slice(0, RELATED_MEMORY_CANDIDATE_LIMIT)
        .map((candidateId) => profilesById.get(candidateId)?.profile)
        .filter((candidate): candidate is (typeof profiles)[number] =>
          Boolean(candidate),
        )
        .map<RelatedMemory>((candidate) => {
          const sharedTags = [...profile.tags].filter((tag) =>
            candidate.tags.has(tag),
          );
          const sharedWords = [...profile.words].filter((word) =>
            candidate.words.has(word),
          );
          const sameMood =
            Boolean(profile.entry.mood) &&
            profile.entry.mood === candidate.entry.mood;
          const distanceDays =
            Math.abs(profile.timestamp - candidate.timestamp) / 86_400_000;
          const score =
            sharedTags.length * 4 +
            Math.min(sharedWords.length, 4) * 1.25 +
            (sameMood ? 0.75 : 0) +
            (distanceDays <= 14 ? 0.5 : 0);

          let reason = "Nearby in your timeline";
          if (sharedTags.length) reason = `Shared #${sharedTags[0]}`;
          else if (sharedWords.length) {
            reason = `Similar theme: ${sharedWords.slice(0, 2).join(", ")}`;
          } else if (sameMood && profile.entry.mood) {
            reason = `Also felt ${MOOD_META[profile.entry.mood].label.toLocaleLowerCase()}`;
          }

          return { entry: candidate.entry, reason, score };
        })
        .sort((first, second) => {
          if (second.score !== first.score) return second.score - first.score;
          const firstDistance = Math.abs(
            profile.timestamp - new Date(first.entry.createdAt).getTime(),
          );
          const secondDistance = Math.abs(
            profile.timestamp - new Date(second.entry.createdAt).getTime(),
          );
          return firstDistance - secondDistance;
        });

      const meaningful = candidates.filter(
        (candidate) => candidate.score >= 1.5,
      );
      return [
        profile.entry.id,
        (meaningful.length ? meaningful : candidates).slice(0, 2),
      ] as const;
    }),
  );
}

function buildInvertedIndex<T extends { entry: TimelineEntry }>(
  profiles: T[],
  values: (profile: T) => Set<string>,
) {
  const index = new Map<string, string[]>();
  for (const profile of profiles) {
    for (const value of values(profile)) {
      const ids = index.get(value) ?? [];
      ids.push(profile.entry.id);
      index.set(value, ids);
    }
  }
  return index;
}

function collectCandidates(
  candidates: Set<string>,
  values: Set<string>,
  index: Map<string, string[]>,
  ownId: string,
) {
  for (const value of values) {
    for (const id of index.get(value) ?? []) {
      if (id !== ownId) candidates.add(id);
      if (candidates.size >= RELATED_MEMORY_CANDIDATE_LIMIT) return;
    }
  }
}
