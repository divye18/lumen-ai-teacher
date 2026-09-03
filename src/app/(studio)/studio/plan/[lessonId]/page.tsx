import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LessonPlanView } from "@/components/plan/lesson-plan-view";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getLessonView } from "@/lib/studio/lesson-view";

export const metadata: Metadata = { title: "Lesson plan" };
export const dynamic = "force-dynamic";

export default async function LessonPlanPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) redirect(`/login?next=/studio/plan/${lessonId}`);

  const bundle = await getLessonView(supabase, user.value.id, lessonId);
  if (!bundle.ok) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <LessonPlanView
        lesson={bundle.value.lesson}
        masteryByConcept={bundle.value.masteryByConcept}
      />
    </div>
  );
}
