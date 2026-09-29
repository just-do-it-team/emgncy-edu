import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { matchRouteTitle } from "@/shared/config";

const PRODUCT = "Тренажёр Системы-112";
const ARM_PATH = "/student/arm";

const cabinets: [string, string][] = [
  ["/teacher", "Кабинет преподавателя"],
  ["/student", "Кабинет обучаемого"],
  ["/admin", "Администрирование"],
];

function titleOf(pathname: string): string {
  const cabinet = cabinets.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1];
  const page = matchRouteTitle(pathname);

  if (cabinet === undefined) return pathname.startsWith("/login") ? `Вход — ${PRODUCT}` : PRODUCT;
  if (page === undefined || page === cabinet) return `${cabinet} — ${PRODUCT}`;

  return `${page} — ${cabinet}`;
}

/** Заголовок вкладки по странице. Рабочее место ставит его само: там во вкладке номер открытого происшествия. */
export function DocumentTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!pathname.startsWith(ARM_PATH)) document.title = titleOf(pathname);
  }, [pathname]);

  return null;
}
