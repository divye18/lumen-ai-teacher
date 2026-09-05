import { masteryBand, masteryBandLabel } from "@/lib/teaching/mastery";

/**
 * MASTERY SUMMARY — groups this session's concept outcomes into
 * strong / developing / needs-work buckets, so "what am I strong at?" and
 * "what am I still developing?" are answerable in one glance instead of by
 * scanning individual mastery meters.
 *
 * Pure and deterministic. Reuses the EXISTING mastery band thresholds
 * (`teaching/mastery.ts`'s `MASTERY_BANDS`) — no new thresholds invented,
 * and the same STRONG/DEVELOPING/WEAK vocabulary the diagnostic summary
 * (`session/diagnostic-summary.ts`) already uses elsewhere in the app.
 */

export interface MasterySummaryConcept {
  key: string;
  title: string;
  masteryPoints: number;
  band: string;
}

export interface MasterySummary {
  strong: MasterySummaryConcept[];
  developing: MasterySummaryConcept[];
  /** Below the "developing" band — genuinely needs another pass. */
  needsWork: MasterySummaryConcept[];
}

export interface MasterySummaryInput {
  key: string;
  title: string;
  masteryPoints: number;
}

export function buildMasterySummary(
  concepts: MasterySummaryInput[],
): MasterySummary {
  const strong: MasterySummaryConcept[] = [];
  const developing: MasterySummaryConcept[] = [];
  const needsWork: MasterySummaryConcept[] = [];

  for (const c of concepts) {
    const entry: MasterySummaryConcept = {
      key: c.key,
      title: c.title,
      masteryPoints: c.masteryPoints,
      band: masteryBandLabel(c.masteryPoints),
    };
    const bandId = masteryBand(c.masteryPoints);
    if (bandId === "strong" || bandId === "proficient") {
      strong.push(entry);
    } else if (bandId === "developing" || bandId === "emerging") {
      developing.push(entry);
    } else {
      needsWork.push(entry);
    }
  }

  return { strong, developing, needsWork };
}
