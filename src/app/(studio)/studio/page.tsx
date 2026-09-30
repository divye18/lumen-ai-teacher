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
    <div className="flex flex-col gap-12 pb-12 sm:gap-16">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="flex flex-col items-start pt-4 lg:col-span-7">
          <header className="mb-10 w-full">
            <p className="mb-3 text-[length:var(--text-label)] font-semibold tracking-[0.1em] text-[var(--color-ink-muted)] uppercase">
              Learning Studio
            </p>
            <h1 className="text-[length:var(--text-hero)] leading-[1.05] font-medium tracking-tight text-balance text-[var(--color-ink)]">
              {curriculumHome.continueLearning
                ? "Continue your study of Physics."
                : "Begin your curriculum exploration."}
            </h1>
            <p className="mt-4 text-[length:var(--text-title)] text-[var(--color-ink-muted)]">
              {firstName ? `${greeting()}, ${firstName}.` : `${greeting()}.`}
            </p>
          </header>

          <div className="flex w-full flex-col gap-8">
            <CurriculumContinueLearningCard
              continueLearning={curriculumHome.continueLearning}
              chapterProgress={curriculumHome.chapterProgress}
            />
            <BrowseCurriculumCard />
          </div>
        </div>

        <div className="flex flex-col pt-4 lg:col-span-5">
          <HomeProgressSection
            chapterProgress={curriculumHome.chapterProgress}
            nextTopic={curriculumHome.nextTopic}
            masterySummary={masterySummary}
          />
        </div>
      </div>

      {overview.hasAnyData ? (
        <div className="flex flex-col gap-8 border-t border-[var(--color-border)] pt-12">
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
        <div className="flex flex-col gap-8 border-t border-[var(--color-border)] pt-12">
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
