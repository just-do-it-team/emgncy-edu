import { useState } from "react";
import { DEFAULT_PAGE_SIZE } from "./pagination-options";

export function usePagination<T>(rows: T[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const lastPage = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, lastPage);

  return {
    page: safePage,
    pageSize,
    total: rows.length,
    rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    onPageChange: setPage,
    onPageSizeChange: (next: number) => {
      setPageSize(next);
      setPage(1);
    },
  };
}
