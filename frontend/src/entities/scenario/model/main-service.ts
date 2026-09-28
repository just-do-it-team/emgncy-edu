const serviceCodeByPrimary: Record<string, string> = {
  MCHS: "101",
  Police: "102",
  AMBULANCE: "103",
  MOSGAZ: "104",
  MZD: "RZD",
  "Dep.tszn": "DEP_TSZN",
};

export function primaryServiceCode(primary: string | null): string | null {
  const [first] = (primary ?? "").split(",").map((part) => part.trim());

  if (!first) return null;

  return serviceCodeByPrimary[first] ?? (/^[A-Z0-9_]+$/.test(first) ? first : null);
}

export function withMainService(routed: string[], main: string | null): string[] {
  const rest = [...new Set(routed)].filter((code) => code !== main);

  return main === null ? rest : [main, ...rest];
}

export function restoredMainService(routed: string[], main: string | null): string | null {
  return main !== null && !routed.includes(main) ? main : null;
}
