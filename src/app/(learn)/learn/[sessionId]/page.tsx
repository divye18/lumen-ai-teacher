import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DiagnosticGate } from "@/components/teaching/diagnostic-gate";
import { TeachingRoom } from "@/components/teaching/teaching-room";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getTeachingRoomData } from "@/lib/studio/teaching-room-data";

export const metadata: Metadata = { title: "Learning" };
export const dynamic = "force-dynamic";

export default async function LearnPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { sessionId } = await params;
  const { demo } = await searchParams;
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) redirect(`/login?next=/learn/${sessionId}`);

  const data = await getTeachingRoomData(supabase, user.value.id, sessionId);
  if (!data.ok) {
    if (
      data.error.code === "SESSION_NOT_FOUND" ||
      data.error.code === "LESSON_NOT_FOUND" ||
      data.error.code === "NOT_FOUND"
    ) {
      notFound();
    }
    // Config / provider issues still render the room; the client shows the
    // specific step error and lets the learner retry.
  }

  if (data.ok && data.value.session.status === "COMPLETED") {
    redirect(`/studio/session/${sessionId}/complete`);
  }

  if (!data.ok) notFound();

  if (data.value.session.diagnostic) {
    return (
      <DiagnosticGate
        sessionId={sessionId}
        items={data.value.session.diagnostic.items}
      />
    );
  }

  if (data.value.session.diagnosticSummary) {
    return (
      <DiagnosticGate
        sessionId={sessionId}
        items={[]}
        initialSummary={data.value.session.diagnosticSummary}
      />
    );
  }

  return (
    <TeachingRoom
      sessionId={sessionId}
      initialSession={data.value.session}
      concepts={data.value.concepts}
      graph={data.value.graph}
      demo={demo === "1"}
      voiceCloud={data.value.voiceCloud}
    />
  );
}
