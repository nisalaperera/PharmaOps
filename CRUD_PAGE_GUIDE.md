# CRUD Page Guide — PharmaOps

Reference for building new list/CRUD pages consistently. Based on `branches` and `users` pages.

---

## File Structure

```
src/app/(pages)/<name>/
├── page.tsx               # Page component (list view + all state)
├── schemas.ts             # Zod schemas + inferred types
└── components/
    ├── <Entity>Modal.tsx      # Create / Edit modal
    ├── <Entity>ViewModal.tsx  # Read-only detail modal
    └── ...                    # Other domain-specific modals
```

Backend:
```
backend/src/app/api/v1/<name>.py     # FastAPI router
backend/src/app/models/<name>.py     # Pydantic models
```

---

## Frontend — `page.tsx`

### 1. Imports (ordered)

```tsx
"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { <Icon>, Plus, Pencil, Upload, SlidersHorizontal, Eye, Trash2, FileDown, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { StatusBadge }            from "@/components/ui/StatusBadge";
import { ConfirmModal }           from "@/components/ui/ConfirmModal";
import { ImportModal }            from "@/components/common/ImportModal";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiPatch, apiDownloadFile, apiUploadFile, downloadBlob } from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { <ENTITY>_FILTER_OPTIONS } from "@/lib/constants";
import { <Entity>Modal }          from "@/app/(pages)/<name>/components/<Entity>Modal";
import { <Entity>ViewModal }      from "@/app/(pages)/<name>/components/<Entity>ViewModal";
import type { <Entity>, PaginatedResponse, ImportResult } from "@/types";
```

---

### 2. Export helpers (above component)

Define `buildRow`, `exportSelectedCsv`, and `exportSelectedPdf` as plain functions outside the component.

**File naming rules:**
- Always include the current date (`yyyy-MM-dd`) in the file name — never use `"selected"`.
- For branch-level pages, include the branch name (slugified) in the file name.
- Examples: `users_2026-04-04.csv`, `branches_colombo_2026-04-04.pdf`

**PDF header rules:**
- Always include the org logo (`APP_CONFIG.orgLogo`) and org name (`APP_CONFIG.orgName`) at the top.
- For branch-level exports, also include the branch name below the org name.
- Use `doc.addImage()` to embed the logo — load it as a data URL via a helper or fetch at call time.

```tsx
import APP_CONFIG from "@/lib/config";
import { format } from "date-fns";

function buildRow(item: <Entity>): string[] {
  return [item.field1, item.field2, ...];
}

/** Returns today's date as "yyyy-MM-dd" for use in file names. */
function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function exportSelectedCsv(selected: <Entity>[]) {
  const header  = ["Col1", "Col2", ...];
  const rows    = selected.map(buildRow);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `<entities>_${exportDateStamp()}.csv`);
}

/**
 * exportSelectedPdf
 * - Embeds org logo + org name in the header.
 * - Pass `branchName` for branch-level exports (adds branch name to header + file name).
 */
async function exportSelectedPdf(selected: <Entity>[], branchName?: string) {
  const doc  = new jsPDF();
  const head = [["Col1", "Col2", ...]];
  const body = selected.map(buildRow);

  // ── Header: org logo ──────────────────────────────────────────────────────
  // Fetch the logo and embed it as a data URL so it works in the browser.
  let cursorY = 14;
  try {
    const res     = await fetch(APP_CONFIG.orgLogo);
    const blob    = await res.blob();
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    doc.addImage(dataUrl, "PNG", 14, cursorY, 12, 12);  // x, y, width, height (mm)
    cursorY += 1;
  } catch {
    // Logo load failure is non-fatal — continue without it.
  }

  // ── Header: org name + optional branch name ───────────────────────────────
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(APP_CONFIG.orgName, 28, cursorY + 6);
  cursorY += 10;

  if (branchName) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Branch: ${branchName}`, 28, cursorY);
    cursorY += 6;
  }

  // ── Report title ──────────────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("<Entity> Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 8 } });

  // ── File name: include branch slug when applicable ─────────────────────────
  const branchSlug = branchName ? `_${branchName.toLowerCase().replace(/\s+/g, "_")}` : "";
  doc.save(`<entities>${branchSlug}_${exportDateStamp()}.pdf`);
}
```

> For **global (non-branch) pages** omit `branchName`. For **branch-level pages** pass the current branch's name as `branchName` to both functions.

---

### 3. Component state

```tsx
export default function <Entity>Page() {
  const { user: me, permissions } = useAuth();
  const canManage = permissions?.isAdmin || permissions?.isManager; // adjust per domain

  // — Filter state
  const [<filterName>, set<FilterName>] = useState("");
  const [filterVisible, setFilterVisible] = useState(false);

  // — Modal state (one state variable per modal)
  const [modalOpen,       setModalOpen]       = useState(false);
  const [editing<Entity>, setEditing<Entity>] = useState<<Entity> | null>(null);
  const [view<Entity>,    setView<Entity>]    = useState<<Entity> | null>(null);
  const [confirm<Entity>, setConfirm<Entity>] = useState<<Entity> | null>(null);
  const [importOpen,      setImportOpen]      = useState(false);

  // — Row selection + export
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);
```

---

### 4. Pagination

```tsx
  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialPageSize: 20, initialSortField: "<defaultSortField>" });
```

---

### 5. Filters

```tsx
  const filters = {
    ...(filter1 && { field1: filter1 }),
    ...(filter2 && { field2: filter2 }),
  };

  const hasActiveFilters  = filter1 !== "" || filter2 !== "";
  const activeFilterCount = (filter1 ? 1 : 0) + (filter2 ? 1 : 0);

  function clearFilters() {
    setFilter1(""); setFilter2("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }
```

---

### 6. Data fetching

```tsx
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<<Entity>>>({
    queryKey: ["<entities>", queryParams, filters],
    queryFn:  () => apiGet<PaginatedResponse<<Entity>>>("<entities>", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const items      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;
```

---

### 7. Toggle-status mutation

```tsx
  const toggleStatusMutation = useMutation({
    mutationFn: (item: <Entity>) =>
      apiPatch<<Entity>>(`/<entities>/${item.id}`, { is_active: !item.is_active }),
    onSuccess: (_, item) => {
      queryClient.invalidateQueries({ queryKey: ["<entities>"] });
      showToast(
        "success",
        item.is_active ? "<Entity> Deactivated" : "<Entity> Activated",
        item.is_active ? `${item.name} has been deactivated.` : `${item.name} is now active.`
      );
      setConfirm<Entity>(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });
```

---

### 8. Selection helpers

```tsx
  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys    = items.map((i) => i.id);
  const allOnPageSelected  = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection() { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = items.filter((i) => selectedKeys.has(i.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;
```

---

### 9. Export handlers

```tsx
  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (filter1) exportParams.field1 = filter1;
        if (search)  exportParams.search = search;
        const blob = await apiDownloadFile("/<entities>/export", exportParams);
        downloadBlob(blob, `<entities>_${exportDateStamp()}.csv`);
      } catch {
        showToast("error", "Export Failed", "Could not export records. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedItems);
    }
  }

  // For branch-level pages, pass the branch name: exportSelectedPdf(selectedItems, currentBranch?.name)
  function handleExportPdf() { exportSelectedPdf(selectedItems); }

  async function handleImport(file: File): Promise<ImportResult> {
    const result = await apiUploadFile<ImportResult>("/<entities>/import", file);
    queryClient.invalidateQueries({ queryKey: ["<entities>"] });
    return result;
  }

  async function handleDownloadTemplate(): Promise<void> {
    const blob = await apiDownloadFile("/<entities>/import/template");
    downloadBlob(blob, "<entities>_import_template.csv");
  }
```

---

### 10. Column definitions

```tsx
  const columns: Column<<Entity>>[] = [
    {
      key: "primaryField",
      header: "Label",
      sortable: true,
      render: (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.primaryField}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {row.secondaryField}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.is_active ? "ACTIVE" : "INACTIVE"} />,
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "100px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setView<Entity>(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && (
            <button
              title="Edit"
              onClick={(e) => { e.stopPropagation(); setEditing<Entity>(row); setModalOpen(true); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {canManage && (
            <button
              title={row.is_active ? "Deactivate" : "Activate"}
              onClick={(e) => { e.stopPropagation(); setConfirm<Entity>(row); }}
              className={
                row.is_active
                  ? "p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  : "p-1.5 rounded-md transition-colors text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              }
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];
```

> **Extra domain-specific action buttons** (e.g. Reset Password, Transfer) go before the divider `<span>` inside the actions cell. Separate them from the standard View/Edit/Toggle group with:
> ```tsx
> <span className="w-px h-4 mx-1 flex-shrink-0" style={{ background: "var(--color-border)" }} />
> ```

---

### 11. JSX layout

```tsx
  const isDeactivating = confirm<Entity>?.is_active === true;

  return (
    <div className="page-container">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <<Icon> className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title"><Entity> Management</h1>
          </div>
          <p className="page-subtitle mt-1">Short description of what this page manages</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filters toggle */}
          <Button
            variant={filterVisible || hasActiveFilters ? "primary" : "outline"}
            size="sm"
            leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            onClick={() => setFilterVisible((v) => !v)}
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/25 text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <SearchBar
            placeholder="Search by …"
            onSearch={handleSearch}
            className="w-[30rem] max-w-full"
          />

          {/* Action buttons — separated by a border */}
          {canManage && (
            <div
              className="flex items-center gap-2 pl-3 ml-1 border-l flex-shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <Button variant="primary" leftIcon={<Upload className="w-4 h-4" />} onClick={() => setImportOpen(true)}>
                Import
              </Button>
              <Button
                variant="primary"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => { setEditing<Entity>(null); setModalOpen(true); }}
              >
                New <Entity>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <FilterBar isVisible={filterVisible} hasActiveFilters={hasActiveFilters} onClear={clearFilters} onHide={hideFilters}>
        <select
          value={filter1}
          onChange={(e) => { setFilter1(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {/* Add more <select> or <input> filter controls as needed */}
      </FilterBar>

      {/* ── Table card ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>

        {/* Select-all-pages banner */}
        {showSelectAllBanner && (
          <div
            className="px-4 py-2 text-sm text-center border-b"
            style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
          >
            <span style={{ color: "var(--color-text-muted)" }}>
              {pagination.pageSize} records on this page are selected.{" "}
            </span>
            <button onClick={handleSelectAllPages} className="font-semibold text-primary-500 hover:underline">
              Select all {totalItems} records
            </button>
          </div>
        )}

        {allPagesSelected && (
          <div
            className="px-4 py-2 text-sm text-center border-b"
            style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
          >
            <span className="font-semibold text-primary-500">All {totalItems} records selected.</span>{" "}
            <button onClick={clearSelection} className="hover:underline" style={{ color: "var(--color-text-muted)" }}>
              Clear selection
            </button>
          </div>
        )}

        <DataTable<<Entity>>
          columns={columns}
          data={items}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No <entities> found matching "${search}"` : "No <entities> found."}
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={handleSelectionChange}
        />

        {/* Pagination */}
        <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {totalItems > 0 && (
            <Pagination
              currentPage={pagination.page}
              totalPages={totalPages}
              totalRecords={totalItems}
              pageSize={pagination.pageSize}
              onPageChange={goToPage}
              onPageSizeChange={changePageSize}
              pageSizeOptions={[10, 20, 50]}
            />
          )}
        </div>

        {/* Export footer — shown only when rows are selected */}
        {(selectedKeys.size > 0 || allPagesSelected) && (
          <div
            className="border-t flex items-center justify-between px-4 py-3 gap-3"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              {selectionCount} record{selectionCount !== 1 ? "s" : ""} selected
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                leftIcon={<FileDown className="w-3.5 h-3.5" />}
                onClick={handleExportCsv}
                isLoading={isExportingCsv}
              >
                Export CSV
              </Button>
              {!allPagesSelected && (
                <Button
                  variant="outline" size="sm"
                  leftIcon={<FileText className="w-3.5 h-3.5" />}
                  onClick={handleExportPdf}
                >
                  Export PDF
                </Button>
              )}
              <button
                onClick={clearSelection}
                className="text-xs px-2 py-1 rounded transition-colors hover:bg-[var(--color-surface)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <<Entity>Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing<Entity>(null); }}
        editing<Entity>={editing<Entity>}
      />

      <<Entity>ViewModal
        isOpen={!!view<Entity>}
        onClose={() => setView<Entity>(null)}
        <entity>={view<Entity>}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="<Entities>"
        onImport={handleImport}
        onDownloadTemplate={handleDownloadTemplate}
        templateNote="Required columns: …"
      />

      <ConfirmModal
        isOpen={!!confirm<Entity>}
        onClose={() => setConfirm<Entity>(null)}
        title={isDeactivating ? "Deactivate <Entity>" : "Activate <Entity>"}
        body={
          isDeactivating ? (
            <>Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>{confirm<Entity>?.name}</span>?
            </>
          ) : (
            <>Are you sure you want to activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>{confirm<Entity>?.name}</span>?
            </>
          )
        }
        confirmLabel={isDeactivating ? "Deactivate" : "Activate"}
        variant={isDeactivating ? "danger" : "primary"}
        onConfirm={() => confirm<Entity> && toggleStatusMutation.mutate(confirm<Entity>)}
        isLoading={toggleStatusMutation.isPending}
      />
    </div>
  );
}
```

---

## Frontend — `schemas.ts`

```ts
import { z } from "zod";

export const <entity>CreateSchema = z.object({
  name:  z.string().min(1, "Name is required"),
  phone: z.string().regex(/^\d{3} \d{3} \d{4}$/, "Format: ### ### ####").optional().or(z.literal("")),
  // add domain-specific fields
});

export const <entity>EditSchema = <entity>CreateSchema.partial();

export type <Entity>CreateValues = z.infer<typeof <entity>CreateSchema>;
export type <Entity>EditValues   = z.infer<typeof <entity>EditSchema>;
```

---

## Frontend — `<Entity>Modal.tsx`

```tsx
"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }   from "@/components/ui/Modal";
import { Button }  from "@/components/ui/Button";
import { Input }   from "@/components/ui/Input";
import { apiPost, apiPatch } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { formatPhoneNumber } from "@/lib/utils";
import { <entity>CreateSchema, <entity>EditSchema, type <Entity>CreateValues, type <Entity>EditValues }
  from "@/app/(pages)/<name>/schemas";
import type { <Entity> } from "@/types";

interface <Entity>ModalProps {
  isOpen:         boolean;
  onClose:        () => void;
  editing<Entity>: <Entity> | null;
}

export function <Entity>Modal({ isOpen, onClose, editing<Entity> }: <Entity>ModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editing<Entity> !== null;

  const form = useForm<...>({
    resolver:      zodResolver(isEditing ? <entity>EditSchema : <entity>CreateSchema),
    defaultValues: { name: "", phone: "", ... },
  });

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      form.reset({ name: editing<Entity>.name, ... });
    } else {
      form.reset({ name: "", ... });
    }
  }, [isOpen, editing<Entity>]);

  const mutation = useMutation({
    mutationFn: (values: ...) =>
      isEditing
        ? apiPatch(`/<entities>/${editing<Entity>!.id}`, values)
        : apiPost(`/<entities>`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["<entities>"] });
      showToast("success", isEditing ? "<Entity> Updated" : "<Entity> Created", "...");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", isEditing ? "Update Failed" : "Create Failed", err?.message ?? "Something went wrong.");
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit <Entity>" : "New <Entity>"}>
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        {/* form fields */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            {isEditing ? "Save Changes" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
```

**Phone field pattern** (always use `Controller`):
```tsx
<Controller
  name="phone"
  control={form.control}
  render={({ field }) => (
    <Input
      {...field}
      label="Phone"
      maxLength={12}
      placeholder="### ### ####"
      onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
      error={form.formState.errors.phone?.message}
    />
  )}
/>
```

---

## Frontend — `<Entity>ViewModal.tsx`

```tsx
import { Modal } from "@/components/ui/Modal";
import type { <Entity> } from "@/types";

interface Props { isOpen: boolean; onClose: () => void; <entity>: <Entity> | null; }

export function <Entity>ViewModal({ isOpen, onClose, <entity> }: Props) {
  if (!<entity>) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="<Entity> Details">
      <dl className="space-y-3">
        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Name</dt>
          <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{<entity>.name}</dd>
        </div>
        {/* repeat per field */}
      </dl>
    </Modal>
  );
}
```

---

## Backend — Router (`api/v1/<name>.py`)

```python
from fastapi import APIRouter, HTTPException, status, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import require_min_role, get_current_user
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.<name> import <Entity>Create, <Entity>Update, <Entity>Response
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/<entities>", tags=["<Entities>"])

# Whitelist sortable fields
<ENTITY>_SORT_FIELDS = {"name", "created_at"}


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[<Entity>Response])
async def list_<entities>(
    page:      int        = Query(default=1, ge=1),
    page_size: int        = Query(default=20, ge=1, le=100),
    search:    str | None = Query(default=None),
    is_active: bool | None = Query(default=None),  # add domain filters
    sort_by:   str | None = Query(default="name"),
    sort_dir:  str | None = Query(default="asc"),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}
    if is_active is not None:
        filter["is_active"] = is_active
    if search:
        filter.update(build_search_filter(search, ["name", "other_field"]))

    sort_field     = sort_by if sort_by in <ENTITY>_SORT_FIELDS else "name"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.<ENTITIES>].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.<ENTITIES>].find(filter).sort(sort_field, sort_direction).skip(skip).limit(page_size)

    return PaginatedResponse[<Entity>Response](
        data=[<Entity>Response(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=<Entity>Response, status_code=status.HTTP_201_CREATED)
async def create_<entity>(
    payload:      <Entity>Create,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()
    entity_id = new_id()
    data = {
        "_id": entity_id,
        **payload.model_dump(),
        "created_at": now, "updated_at": now,
        **audit_create_fields(current_user),
    }
    db[Collections.<ENTITIES>].insert_one(data)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="<entity>", resource_id=entity_id,
    )
    return <Entity>Response(**doc_to_dict(data))


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{<entity>_id}", response_model=<Entity>Response)
async def get_<entity>(
    <entity>_id:  str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.<ENTITIES>].find_one({"_id": <entity>_id})
    if not doc:
        raise HTTPException(status_code=404, detail="<Entity> not found")
    return <Entity>Response(**doc_to_dict(doc))


# ── Update ────────────────────────────────────────────────────────────────────

@router.patch("/{<entity>_id}", response_model=<Entity>Response)
async def update_<entity>(
    <entity>_id:  str,
    payload:      <Entity>Update,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db  = get_db()
    doc = db[Collections.<ENTITIES>].find_one({"_id": <entity>_id})
    if not doc:
        raise HTTPException(status_code=404, detail="<Entity> not found")

    updates = {
        k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None
    }
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.<ENTITIES>].update_one({"_id": <entity>_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="<entity>", resource_id=<entity>_id,
    )
    updated = db[Collections.<ENTITIES>].find_one({"_id": <entity>_id})
    return <Entity>Response(**doc_to_dict(updated))


# ── Export CSV ────────────────────────────────────────────────────────────────

@router.get("/export")
async def export_<entities>(
    search:       str | None  = Query(default=None),
    is_active:    bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}
    if is_active is not None: filter["is_active"] = is_active
    if search:                filter.update(build_search_filter(search, ["name"]))

    docs = db[Collections.<ENTITIES>].find(filter).sort("name", 1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Field2", "Status"])  # header
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([d["name"], d.get("field2", ""), "Active" if d.get("is_active") else "Inactive"])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=<entities>_export.csv"},
    )


# ── Import CSV ────────────────────────────────────────────────────────────────

@router.post("/import")
async def import_<entities>(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db      = get_db()
    content = await file.read()
    reader  = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    created = 0
    errors  = []

    for i, row in enumerate(reader, start=2):
        try:
            now       = datetime.now(timezone.utc).isoformat()
            entity_id = new_id()
            data = {
                "_id":        entity_id,
                "name":       row["name"].strip(),
                "is_active":  True,
                "created_at": now, "updated_at": now,
                **audit_create_fields(current_user),
            }
            db[Collections.<ENTITIES>].insert_one(data)
            created += 1
        except Exception as e:
            errors.append(f"Row {i}: {str(e)}")

    return {"created": created, "errors": errors}


# ── Import template ───────────────────────────────────────────────────────────

@router.get("/import/template")
async def get_import_template(current_user: dict = Depends(get_current_user)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "field2"])  # header only
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=<entities>_import_template.csv"},
    )
```

---

## Backend — Models (`models/<name>.py`)

```python
from pydantic import BaseModel, Field
from typing import Optional

class <Entity>Create(BaseModel):
    name:      str
    phone:     Optional[str] = None
    is_active: bool = True
    # domain fields

class <Entity>Update(BaseModel):
    name:      Optional[str]  = None
    phone:     Optional[str]  = None
    is_active: Optional[bool] = None

class <Entity>Response(BaseModel):
    id:         str
    name:       str
    phone:      Optional[str] = None
    is_active:  bool
    created_at: str
    updated_at: str
```

---

## Checklist — New CRUD Page

### Frontend
- [ ] `page.tsx` — state, query, mutations, columns, JSX structure
- [ ] `schemas.ts` — Zod create + edit schemas, exported inferred types
- [ ] `<Entity>Modal.tsx` — create/edit form with react-hook-form + zodResolver
- [ ] `<Entity>ViewModal.tsx` — read-only details modal
- [ ] Add route to `nav-config.ts`
- [ ] Add TypeScript interface to `types/index.ts`
- [ ] Add any new status/filter constants to `lib/constants.ts`
- [ ] Add badge helpers to `lib/badges.ts` if needed

### Backend
- [ ] `models/<name>.py` — Create, Update, Response Pydantic models
- [ ] `api/v1/<name>.py` — list, create, get, update, export, import, import-template endpoints
- [ ] Register router in `main.py`
- [ ] Add collection name to `Collections` enum in `database.py`
