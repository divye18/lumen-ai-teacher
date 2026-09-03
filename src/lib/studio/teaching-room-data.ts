import "server-only";

import { createLessonStore } from "@/lib/db/repositories";
import type { LumenServerClient } from "@/lib/db/server";
import { buildTeachingRuntime } from "@/lib/session/service";
import type { TimelineConcept } from "@/components/learning/session-timeline";
import type { SessionView } from "@/lib/session/views";
import { ok, type Result } from "@/lib/result";

export interface TeachingRoomData {
  session: SessionView;
  concepts: TimelineConcept[];
  llmConfigured: boolean;
}

export async function getTeachingRoomData(
  db: LumenServerClient,
  userId: string,
  sessionId: string,
): Promise<Result<TeachingRoomData>> {
  const { orchestrator, llmConfigured } = buildTeachingRuntime(db, userId);
  const sessionRes = await orchestrator.startOrResume({ sessionId });
  if (!sessionRes.ok) return sessionRes;
  const session = sessionRes.value;

  const conceptsRes = await createLessonStore(db).listConcepts(
    session.lessonId,
  );
  const concepts: TimelineConcept[] = (conceptsRes.ok ? conceptsRes.value : [])
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      key: c.concept_key,
      title: c.title,
      status: c.status,
      position: c.position,
    }));

  return ok({ session, concepts, llmConfigured });
}
