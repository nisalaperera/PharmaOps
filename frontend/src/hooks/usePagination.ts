"use client";

import { useState, useCallback } from "react";
import type { PaginationConfig, SortConfig, SortDirection } from "@/types";

interface UsePaginationOptions {
  initialPage?:     number;
  initialPageSize?: number;
  initialSortField?: string;
  initialSortDirection?: SortDirection;
}

export function usePagination(options: UsePaginationOptions = {}) {
  const {
    initialPage          = 1,
    initialPageSize      = 20,
    initialSortField     = "",
    initialSortDirection = "asc",
  } = options;

  const [pagination, setPagination] = useState<PaginationConfig>({
    page:     initialPage,
    pageSize: initialPageSize,
  });

  const [sort, setSort] = useState<SortConfig>({
    field:     initialSortField,
    direction: initialSortDirection,
  });

  const [search, setSearch] = useState("");

  const goToPage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const changePageSize = useCallback((pageSize: number) => {
    setPagination({ page: 1, pageSize });
  }, []);

  const handleSort = useCallback((field: string) => {
    setSort((prev) => ({
      field,
      direction:
        prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const reset = useCallback(() => {
    setPagination({ page: initialPage, pageSize: initialPageSize });
    setSort({ field: initialSortField, direction: initialSortDirection });
    setSearch("");
  }, [initialPage, initialPageSize, initialSortField, initialSortDirection]);

  return {
    pagination,
    sort,
    search,
    goToPage,
    changePageSize,
    handleSort,
    handleSearch,
    reset,
    queryParams: {
      page:      pagination.page,
      page_size: pagination.pageSize,
      sort_by:   sort.field || undefined,
      sort_dir:  sort.field ? sort.direction : undefined,
      search:    search || undefined,
    },
  };
}
