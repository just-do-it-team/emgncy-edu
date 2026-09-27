import { List, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import type { FormIssue } from "@/shared/lib";
import classes from "./issues-list.module.scss";

interface IssuesListProps {
  issues: FormIssue[];
  blockingTitle: string;
  onFocus: (path: string) => void;
}

function IssueGroup({ title, issues, onFocus }: { title: string; issues: FormIssue[]; onFocus: (path: string) => void }) {
  if (issues.length === 0) return null;

  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>
        {title}: {issues.length}
      </Text>
      <List size="sm" spacing={2}>
        {issues.map((issue, index) => (
          <List.Item key={`${issue.path}-${index}`}>
            <UnstyledButton className={classes.issueButton} onClick={() => onFocus(issue.path)}>
              {issue.message}
            </UnstyledButton>
          </List.Item>
        ))}
      </List>
    </Stack>
  );
}

export function IssuesList({ issues, blockingTitle, onFocus }: IssuesListProps) {
  if (issues.length === 0) return null;

  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <IssueGroup title={blockingTitle} issues={issues.filter((issue) => issue.severity === "error")} onFocus={onFocus} />
        <IssueGroup title="Предупреждения" issues={issues.filter((issue) => issue.severity === "warning")} onFocus={onFocus} />
      </Stack>
    </Paper>
  );
}
