export interface ProceduralPace {
  initialDelaySeconds: number;
  releaseIntervalSeconds: number;
  maxActive: number;
}

export const PROCEDURAL_PACE_BY_DIFFICULTY: ReadonlyMap<number, ProceduralPace> = new Map([
  [1, { initialDelaySeconds: 5, releaseIntervalSeconds: 180, maxActive: 1 }],
  [2, { initialDelaySeconds: 5, releaseIntervalSeconds: 120, maxActive: 1 }],
  [3, { initialDelaySeconds: 5, releaseIntervalSeconds: 90, maxActive: 2 }],
  [4, { initialDelaySeconds: 0, releaseIntervalSeconds: 60, maxActive: 3 }],
]);
