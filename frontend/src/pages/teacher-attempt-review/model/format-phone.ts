export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.length !== 11) return value;

  const [country, area, first, second, third] = [
    digits.slice(0, 1),
    digits.slice(1, 4),
    digits.slice(4, 7),
    digits.slice(7, 9),
    digits.slice(9, 11),
  ];

  return `+${country} (${area}) ${first}-${second}-${third}`;
}
