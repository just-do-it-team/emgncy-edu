import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

function internalTarget(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (!(event.target instanceof Element)) return null;

  const anchor = event.target.closest("a[href]");

  if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) {
    return null;
  }

  const url = new URL(anchor.href, window.location.href);

  if (url.origin !== window.location.origin) return null;

  const target = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  return target === current ? null : target;
}

const BACK = "back";

function holdCurrentEntry() {
  window.history.pushState(window.history.state, "", window.location.href);
}

export function useLeaveGuard(active: boolean) {
  const navigate = useNavigate();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      const target = internalTarget(event);

      if (target === null) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingPath(target);
    };

    const onPopState = () => {
      if (leaving.current) return;

      holdCurrentEntry();
      setPendingPath(BACK);
    };

    holdCurrentEntry();
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
    };
  }, [active]);

  return {
    pendingPath,
    stay: () => setPendingPath(null),
    leave: () => {
      setPendingPath(null);
      if (pendingPath === BACK) {
        leaving.current = true;
        window.history.go(-2);
        return;
      }
      if (pendingPath !== null) navigate(pendingPath);
    },
  };
}
