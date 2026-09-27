import { Table, Tooltip, UnstyledButton } from "@mantine/core";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDirection } from "@/shared/lib";
import classes from "./sortable-th.module.scss";
import { tooltipEvents } from "./tooltip-events";

const ariaSort = { asc: "ascending", desc: "descending" } as const;

interface SortableThProps {
  label: string;
  direction: SortDirection | null;
  onSort: () => void;
  width?: number;
  colSpan?: number;
  hint?: string;
}

export function SortableTh({ label, direction, onSort, width, colSpan, hint }: SortableThProps) {
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <Table.Th w={width} colSpan={colSpan} aria-sort={direction ? ariaSort[direction] : "none"}>
      <Tooltip label={hint} disabled={!hint} events={tooltipEvents} color="povDark.6" radius={0}>
        <UnstyledButton className={classes.button} onClick={onSort}>
          {label}
          <Icon
            size={14}
            aria-hidden="true"
            className={direction ? classes.iconActive : classes.iconIdle}
          />
        </UnstyledButton>
      </Tooltip>
    </Table.Th>
  );
}
