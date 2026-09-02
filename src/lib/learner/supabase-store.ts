import type { LearnerState } from "@/types/learner";
import { err, ok, type Result } from "@/lib/result";
import {
  createInteractionStore,
  createLearnerProfileStore,
  createMasteryStore,
  createMisconceptionStore,
  createSessionStore,
  type DbClient,
  type LearningSessionRow,
} from "@/lib/db/repositories";
import { uuidSchema } from "@/lib/db/schemas";
import { ValidationError } from "@/lib/errors";

import { assembleLearnerState } from "./assemble";
import type { LearnerStateStore } from "./index";

/**
 * Supabase-backed {@link LearnerStateStore}.
 *
 * Pass the request-scoped server client for user-facing calls (RLS enforces
 * ownership) or the admin client for trusted server tasks. This module has no
 * `server-only` marker itself, but every client that reaches it does.
 */
export function createSupabaseLearnerStateStore(
  db: DbClient,
): LearnerStateStore {
  const profiles = createLearnerProfileStore(db);
  const mastery = createMasteryStore(db);
  const interactions = createInteractionStore(db);
  const misconceptions = createMisconceptionStore(db);
  const sessions = createSessionStore(db);

  function requireUuid(value: string, label: string): Result<string> {
    const parsed = uuidSchema.safeParse(value);
    if (!parsed.success) {
      return err(new ValidationError(`${label} must be a UUID.`));
    }
    return ok(parsed.data);
  }

  return {
    async getLearnerState(userId, options): Promise<Result<LearnerState>> {
      const uid = requireUuid(userId, "userId");
      if (!uid.ok) return uid;

      const recentLimit = options?.recentInteractionLimit ?? 20;

      const [masteryRes, misconRes, profileRes] = await Promise.all([
        mastery.listForUser(uid.value),
        misconceptions.listActiveForUser(uid.value),
        profiles.get(uid.value),
      ]);
      if (!masteryRes.ok) return masteryRes;
      if (!misconRes.ok) return misconRes;

      const scopedToSession = Boolean(options?.sessionId);
      let sessionRow: LearningSessionRow | null = null;

      if (options?.sessionId) {
        const sid = requireUuid(options.sessionId, "sessionId");
        if (!sid.ok) return sid;
        const sessionRes = await sessions.get(sid.value);
        if (!sessionRes.ok) return sessionRes;
        sessionRow = sessionRes.value;
      }

      const recent = sessionRow
        ? await interactions.listForSession(sessionRow.id, {
            limit: recentLimit,
          })
        : await interactions.listRecentForUser(uid.value, recentLimit);
      if (!recent.ok) return recent;

      return ok(
        assembleLearnerState({
          userId: uid.value,
          session: sessionRow,
          profile: profileRes.ok ? profileRes.value : null,
          mastery: masteryRes.value,
          misconceptions: misconRes.value,
          // session timeline is oldest-first; recent-for-user is newest-first.
          recentInteractions: scopedToSession
            ? [...recent.value].reverse()
            : recent.value,
        }),
      );
    },

    getConceptMastery(userId, conceptId) {
      return mastery.get(userId, conceptId);
    },

    upsertConceptMastery(input) {
      return mastery.upsert(input);
    },

    recordInteraction(input) {
      return interactions.record(input);
    },

    recordMisconception(input) {
      return misconceptions.record(input);
    },

    resolveMisconception(misconceptionId) {
      return misconceptions.resolve(misconceptionId);
    },

    updateLearnerProfile(input) {
      return profiles.upsert(input);
    },
  };
}
