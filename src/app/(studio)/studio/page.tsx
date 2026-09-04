import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ContinueLearning } from "@/components/dashboard/continue-learning";
import { DemoCard } from "@/components/dashboard/demo-card";
import { EmptyStudio } from "@/components/dashboard/empty-studio";
import { LearningLens } from "@/components/dashboard/learning-lens";
import { LearnerMemory } from "@/components/dashboard/learner-memory";
import { LearningMomentum } from "@/components/dashboard/learning-momentum";
import { MisconceptionRadar } from "@/components/dashboard/misconception-radar";
import { RecommendedAction } from "@/components/dashboard/recommended-action";
import { KnowledgeGraphPanel } from "@/components/graph/knowledge-graph-panel";
import { getLLMProviderFromConfig } from "@/lib/ai/llm";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getStudioOverview } from "@/lib/studio/overview";

export const metadata: Metadata = { title: "Studio" };
export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) redirect("/login?next=/studio");

  const llmConfigured = getLLMProviderFromConfig().ok;
  const overview = await getStudioOverview(supabase, user.value.id, {
    llmConfigured,
  });

  if (!overview.hasAnyData) {
    return (
      <div className="flex flex-col gap-6">
        <DemoCard />
        <EmptyStudio name={overview.learnerName} />
      </div>
    );
  }

  const firstName = overview.learnerName?.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          {firstName ? `${greeting()}, ${firstName}` : greeting()}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          {overview.activeSession
            ? "You have a lesson in progress."
            : "Here's where your learning stands."}
        </p>
      </header>

      <RecommendedAction recommendation={overview.recommendation} />

      {overview.activeSession ? (
        <ContinueLearning session={overview.activeSession} />
      ) : (
        <DemoCard />
      )}

      <KnowledgeGraphPanel graph={overview.graph} />

      <LearningLens observations={overview.observations} />

      <LearnerMemory
        memory={overview.learnerMemory}
        intelligenceInsight={overview.intelligenceInsight}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <MisconceptionRadar misconceptions={overview.misconceptions} />
        <LearningMomentum momentum={overview.momentum} />
      </div>

      {!overview.llmConfigured ? (
        <p className="text-center text-[12px] text-[var(--color-ink-faint)]">
          Lumen is running in offline planning mode. Add an{" "}
          <code className="font-mono">LLM_API_KEY</code> for AI-generated
          lessons, questions and evaluation.
        </p>
      ) : null}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
