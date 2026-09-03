import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { TeachingRoom } from "@/components/teaching/teaching-room";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getTeachingRoomData } from "@/lib/studio/teaching-room-data";

export const metadata: Metadata = { title: "Learning" };
export const dynamic = "force-dynamic";

export default async function LearnPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
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

  return (
    <TeachingRoom
      sessionId={sessionId}
      initialSession={data.value.session}
      concepts={data.value.concepts}
    />
  );
}
