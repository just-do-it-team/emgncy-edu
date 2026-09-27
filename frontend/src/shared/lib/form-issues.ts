export interface FormIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export function issueMessages(issues: FormIssue[]): Record<string, string> {
  return Object.fromEntries(issues.filter((issue) => issue.path !== "").map((issue) => [issue.path, issue.message]));
}

export function errorMessages(issues: FormIssue[]): Record<string, string> {
  return issueMessages(issues.filter((issue) => issue.severity === "error"));
}

export function focusFormField(node: unknown) {
  if (!(node instanceof HTMLElement)) return;

  node.scrollIntoView({ block: "center" });
  node.focus();
}
