import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrowseCurriculumCard } from "@/components/dashboard/browse-curriculum-card";
import { ContinueLearning } from "@/components/dashboard/continue-learning";
import { CurriculumContinueLearningCard } from "@/components/dashboard/curriculum-continue-learning-card";
import { DemoCard } from "@/components/dashboard/demo-card";
import { EmptyStudio } from "@/components/dashboard/empty-studio";
import {
  HomeProgressSection,
  type MasterySummary,
} from "@/components/dashboard/home-progress-section";
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
import { getCurriculumHome } from "@/lib/studio/curriculum-home";

export const metadata: Metadata = { title: "Studio" };
export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) redirect("/login?next=/studio");

  const llmConfigured = getLLMProviderFromConfig().ok;
  const [overview, curriculumHome] = await Promise.all([
    getStudioOverview(supabase, user.value.id, { llmConfigured }),
    getCurriculumHome(supabase, user.value.id),
  ]);

  const firstName = overview.learnerName?.split(" ")[0];

  // Reuses the mastery aggregate `getStudioOverview` already assembled —
  // no new mastery query. Only concepts with real evidence (attempted at
  // least once) count, so an unassessed concept never dilutes the average.
  const assessedConcepts = overview.concepts.filter((c) => c.assessed);
  const masterySummary: MasterySummary | null =
    assessedConcepts.length > 0
      ? {
          averagePoints: Math.round(
            assessedConcepts.reduce((sum, c) => sum + c.masteryPoints, 0) /
              assessedConcepts.length,
          ),
          conceptCount: assessedConcepts.length,
        }
      : null;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          {firstName ? `${greeting()}, ${firstName}` : greeting()}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          {curriculumHome.continueLearning
            ? "Pick up where you left off."
            : "Choose a topic to start learning."}
        </p>
      </header>

      <CurriculumContinueLearningCard
        continueLearning={curriculumHome.continueLearning}
        chapterProgress={curriculumHome.chapterProgress}
      />

      <HomeProgressSection
        chapterProgress={curriculumHome.chapterProgress}
        nextTopic={curriculumHome.nextTopic}
        masterySummary={masterySummary}
      />

      <BrowseCurriculumCard />

      {overview.hasAnyData ? (
        <div className="flex flex-col gap-6 border-t border-[var(--color-border)] pt-8">
          <RecommendedAction recommendation={overview.recommendation} />

          {overview.activeSession ? (
            <ContinueLearning session={overview.activeSession} />
          ) : null}

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
      ) : (
        <div className="flex flex-col gap-6 border-t border-[var(--color-border)] pt-8">
          <DemoCard />
          <EmptyStudio name={overview.learnerName} />
        </div>
      )}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
