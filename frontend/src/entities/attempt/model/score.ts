import type { CriterionCode } from "@/shared/config";

export interface CriterionScore {
  weight: number;
  value: number;
  points: number;
}

export interface ScoreBreakdown {
  criteria: Record<CriterionCode, CriterionScore>;
  total: number;
  passed: boolean;
}
