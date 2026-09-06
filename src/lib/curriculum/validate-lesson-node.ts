import "server-only";

import type { CurriculumStore } from "@/lib/db/repositories";
import { ValidationError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

/**
 * Server-side validation for an untrusted `curriculumNodeId` supplied to
 * `POST /api/lessons` (Milestone 18.3b). The client can send any string —
 * this never trusts it.
 *
 * Uses the request-scoped `CurriculumStore` (RLS as the signed-in user), so
 * `getNode` already returns NOT_FOUND for a node under a private source that
 * isn't this user's own — the primary security boundary is RLS itself, not
 * this function. The explicit checks below are defense-in-depth: even if a
 * node were somehow visible, only a global, active TOPIC node is accepted
 * as valid lesson provenance.
 */
export async function resolveLessonCurriculumNode(
  store: CurriculumStore,
  curriculumNodeId: string,
): Promise<Result<string>> {
  const node = await store.getNode(curriculumNodeId);
  if (!node.ok) {
    return err(
      new ValidationError(
        "The referenced curriculum topic could not be found.",
      ),
    );
  }

  if (node.value.node_type !== "TOPIC") {
    return err(
      new ValidationError(
        `curriculumNodeId must reference a TOPIC node (got ${node.value.node_type}).`,
      ),
    );
  }
  if (node.value.status !== "ACTIVE") {
    return err(
      new ValidationError("This curriculum topic is no longer active."),
    );
  }

  const source = await store.getSource(node.value.curriculum_source_id);
  if (!source.ok) {
    return err(
      new ValidationError("The curriculum topic's source could not be found."),
    );
  }
  if (
    source.value.owner_user_id !== null ||
    source.value.kind === "USER_UPLOAD"
  ) {
    return err(
      new ValidationError(
        "curriculumNodeId must reference a global curriculum source.",
      ),
    );
  }

  return ok(node.value.id);
}
