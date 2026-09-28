import { expectedPathOf } from "@/entities/scenario";

export function templatePathOf(loc: (string | number)[]): string {
  const [head, ...rest] = loc;

  if (head === "name" || head === "description" || head === "difficulty") return head;
  if (head === "initial_call") return "initialUtterance";
  if (head === "initial_card") return "card.sourceType";
  if (head === "expected_result") return expectedPathOf(rest, "expected");

  return "name";
}
