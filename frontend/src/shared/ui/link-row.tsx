import { Table } from "@mantine/core";
import type { MouseEvent, ReactNode } from "react";
import classes from "./link-row.module.scss";

const ROW_LINK_ATTRIBUTE = "data-row-link";

const INTERACTIVE_SELECTOR = "a, button, input, select, textarea, [role='button'], [role='combobox']";

function hasTextSelection(): boolean {
  const selection = window.getSelection();

  return selection !== null && !selection.isCollapsed;
}

function handleRowClick(event: MouseEvent<HTMLTableRowElement>) {
  if (!(event.target instanceof Element) || event.target.closest(INTERACTIVE_SELECTOR) !== null) return;
  if (hasTextSelection()) return;

  const link = event.currentTarget.querySelector<HTMLAnchorElement>(`a[${ROW_LINK_ATTRIBUTE}]`);

  if (link === null) return;
  if (event.metaKey || event.ctrlKey) window.open(link.href, "_blank", "noopener");
  else link.click();
}

export function LinkRow({ children }: { children: ReactNode }) {
  return (
    <Table.Tr className={classes.row} onClick={handleRowClick}>
      {children}
    </Table.Tr>
  );
}
