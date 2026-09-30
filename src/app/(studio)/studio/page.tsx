import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { LumenCore } from "@/components/brand/lumen-core";
import { getLLMProviderFromConfig } from "@/lib/ai/llm";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getStudioOverview } from "@/lib/studio/overview";
import { getCurriculumHome } from "@/lib/studio/curriculum-home";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Studio" };
export const dynamic = "force-dynamic";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

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
  const averagePoints = assessedConcepts.length > 0
    ? Math.round(assessedConcepts.reduce((sum, c) => sum + c.masteryPoints, 0) / assessedConcepts.length)
    : 0;

  return (
    <div className="dark relative min-h-svh w-full flex flex-col bg-[var(--color-canvas)] text-[var(--color-ink)] selection:bg-[var(--color-ink-muted)] selection:text-[var(--color-canvas)]">
      
      {/* 01 - HERO SECTION */}
      <section className="relative flex flex-col justify-center min-h-[70vh] px-6 sm:px-12 max-w-7xl mx-auto w-full pt-20">
        
        {/* Core in background */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[20%] opacity-60 pointer-events-none md:translate-x-[10%] lg:translate-x-0 hidden sm:block">
          <div className="w-[60vw] max-w-[600px] aspect-square">
            <LumenCore size="hero" intensity="subtle" interactive />
          </div>
        </div>

        <div className="relative z-10 flex flex-col items-start max-w-3xl">
          <p className="mb-8 font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--color-ink-muted)] uppercase">
            {firstName ? `${greeting()}, ${firstName}.` : `${greeting()}.`}
          </p>
          
          <h2 className="font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--color-learning)] uppercase mb-6">
            Current Objective
          </h2>
          
          <h1 className="font-editorial text-5xl leading-[1.05] font-medium tracking-tight text-[var(--color-ink)] sm:text-7xl">
            {overview.activeSession ? overview.activeSession.lessonTitle : (curriculumHome.continueLearning ? curriculumHome.continueLearning.topicTitle : "Begin your exploration.")}
          </h1>

          <p className="mt-6 font-mono text-[13px] text-[var(--color-ink-muted)] uppercase tracking-widest">
            {overview.activeSession ? "In Progress" : curriculumHome.continueLearning?.chapterTitle || "Select a subject to begin learning."}
          </p>
          
          <div className="mt-12 flex gap-4">
             {overview.activeSession || curriculumHome.continueLearning ? (
               <LinkButton href={`/learn/${overview.activeSession ? overview.activeSession.sessionId : curriculumHome.continueLearning?.sessionId}`} size="lg" variant="secondary" className="border-transparent bg-white text-[var(--color-canvas)] hover:bg-white/90 rounded-none px-12 py-6 text-[15px]">
                 Continue Learning
               </LinkButton>
             ) : (
               <LinkButton href="/learn/c" size="lg" variant="secondary" className="border-transparent bg-white text-[var(--color-canvas)] hover:bg-white/90 rounded-none px-12 py-6 text-[15px]">
                 Browse Curriculum
               </LinkButton>
             )}
          </div>
        </div>
      </section>

      {/* 02 - LEARNER STATE */}
      <section className="relative px-6 sm:px-12 max-w-7xl mx-auto w-full py-24 border-t border-[var(--color-border)]/20">
        <div className="grid gap-16 md:grid-cols-2">
           
           {/* Progress Cluster */}
           <div className="flex flex-col gap-12">
              <h2 className="font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--color-ink-faint)] uppercase">
                Curriculum Trajectory
              </h2>
              
              {curriculumHome.chapterProgress ? (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between font-mono text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">
                    <span>{curriculumHome.chapterProgress.completedTopics} of {curriculumHome.chapterProgress.totalTopics} Topics</span>
                    <span>
                      {curriculumHome.chapterProgress.totalTopics > 0
                        ? Math.round((curriculumHome.chapterProgress.completedTopics / curriculumHome.chapterProgress.totalTopics) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="h-[2px] w-full bg-[var(--color-border)]/20 relative">
                    <div
                      style={{
                        width: `${curriculumHome.chapterProgress.totalTopics > 0 ? (curriculumHome.chapterProgress.completedTopics / curriculumHome.chapterProgress.totalTopics) * 100 : 0}%`,
                      }}
                      className="absolute inset-y-0 left-0 bg-[var(--color-learning)]"
                    />
                  </div>
                </div>
              ) : (
                 <p className="font-editorial text-2xl text-[var(--color-ink-muted)]">
                   No progress recorded yet.
                 </p>
              )}

              {assessedConcepts.length > 0 && (
                <div className="flex flex-col gap-4 pt-8">
                  <div className="flex justify-between font-mono text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">
                    <span>Average Concept Mastery</span>
                    <span className="text-[var(--color-achievement)]">{averagePoints} pts</span>
                  </div>
                  <div className="h-[2px] w-full bg-[var(--color-border)]/20 relative">
                    <div
                      style={{ width: `${averagePoints}%` }}
                      className="absolute inset-y-0 left-0 bg-[var(--color-achievement)]"
                    />
                  </div>
                </div>
              )}
           </div>

           {/* Learner Intelligence Cluster */}
           <div className="flex flex-col gap-16">
              
              {/* Memory */}
              {overview.learnerMemory && overview.learnerMemory.signals.length > 0 && (
                <div className="flex flex-col gap-6">
                   <h2 className="font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--color-ink-faint)] uppercase">
                     Learner Memory
                   </h2>
                   <div className="flex flex-col gap-6">
                     {overview.learnerMemory.signals.slice(0, 3).map(s => (
                       <div key={s.text} className="flex flex-col">
                         <p className="font-editorial text-xl text-[var(--color-ink)]">{s.text}</p>
                         <span className="mt-2 font-mono text-[10px] text-[var(--color-ink-faint)] uppercase tracking-wider">{s.evidence}</span>
                       </div>
                     ))}
                   </div>
                </div>
              )}

              {/* Misconceptions */}
              {overview.misconceptions && overview.misconceptions.length > 0 && (
                <div className="flex flex-col gap-6 pt-8 border-t border-[var(--color-border)]/20">
                   <h2 className="font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--color-danger)]/80 uppercase">
                     Active Misconceptions
                   </h2>
                   <div className="flex flex-col gap-6">
                     {overview.misconceptions.slice(0, 3).map(m => (
                       <div key={m.id} className="flex flex-col">
                         <p className="font-editorial text-xl text-[var(--color-ink)]">{m.whatLumenNoticed}</p>
                         <span className="mt-2 font-mono text-[10px] text-[var(--color-danger)]/60 uppercase tracking-wider">Category: {m.category}</span>
                       </div>
                     ))}
                   </div>
                </div>
              )}

           </div>

        </div>
      </section>

      {/* 03 - CURRICULUM ACCESS */}
      <section className="relative px-6 sm:px-12 max-w-7xl mx-auto w-full py-24 border-t border-[var(--color-border)]/20">
         <div className="flex flex-col items-center justify-center text-center">
            <h2 className="font-editorial text-4xl text-[var(--color-ink)] sm:text-5xl mb-8">
              Explore Curriculum
            </h2>
            <LinkButton href="/learn/c" size="lg" variant="secondary" className="border-transparent bg-white/5 text-white hover:bg-white/10 rounded-none px-12 py-4">
              Enter Knowledge Map
            </LinkButton>
         </div>
      </section>

    </div>
  );
}
