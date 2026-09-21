import { useState } from "react";

const storageKey = "emgncy-edu-teacher-sidebar";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(storageKey) === "collapsed";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(storageKey, collapsed ? "collapsed" : "expanded");
  } catch {
    return;
  }
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    const next = !collapsed;

    writeCollapsed(next);
    setCollapsed(next);
  };

  return { collapsed, toggle };
}
