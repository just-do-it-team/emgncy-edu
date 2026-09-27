export interface ServiceDiff {
  added: string[];
  removed: string[];
}

export function serviceDiff(auto: string[], chosen: string[]): ServiceDiff {
  return {
    added: chosen.filter((code) => !auto.includes(code)),
    removed: auto.filter((code) => !chosen.includes(code)),
  };
}

export function rerouteServices(previousAuto: string[], nextAuto: string[], chosen: string[]): string[] {
  const { added, removed } = serviceDiff(previousAuto, chosen);

  return [...nextAuto.filter((code) => !removed.includes(code)), ...added.filter((code) => !nextAuto.includes(code))];
}
