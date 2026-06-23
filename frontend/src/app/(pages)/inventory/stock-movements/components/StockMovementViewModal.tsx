"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, PackagePlus } from "lucide-react";
import { Modal }         from "@/components/ui/Modal";
import { Button }        from "@/components/ui/Button";
import { Badge }         from "@/components/ui/Badge";
import { Autocomplete }  from "@/components/ui/Autocomplete";
import { apiGet, apiPost } from "@/lib/api-client";
import { showToast }       from "@/lib/toast";
import { formatDateTime, daysUntilExpiry, formatQuantity } from "@/lib/utils";
import { FormattedInput }  from "@/components/ui/FormattedInput";
import { STOCK_MOVEMENT_STATUS_VARIANT, STOCK_MOVEMENT_TYPE_VARIANT } from "@/lib/badges";
import { STOCK_MOVEMENT_STATUS_LABEL, STOCK_MOVEMENT_TYPE_LABEL }     from "@/lib/constants";
import { useBranch }       from "@/hooks/useBranch";
import { StockLocationQuickCreateModal } from "@/app/(pages)/inventory/components/StockLocationQuickCreateModal";
import type {
  StockMovement,
  Branch,
  StockLocation,
  LocationSuggestion,
  PaginatedResponse,
} from "@/types";

// ─── Props ───────────────────────────────────────────────────────────────────

interface StockMovementViewModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  movement: StockMovement | null;
}

// ─── Detail Row Helper ──────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </dt>
      <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
        {children}
      </dd>
    </div>
  );
}

// ─── Per-Row State ──────────────────────────────────────────────────────────

interface RowState {
  stockLocationId:   string;
  stockLocationName: string;
  confirmedQty:      number;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function StockMovementViewModal({ isOpen, onClose, movement: movementProp }: StockMovementViewModalProps) {
  const queryClient        = useQueryClient();
  const { activeBranchId } = useBranch();

  // Fetch live movement data so it updates after confirmations
  const { data: liveMovement } = useQuery<StockMovement>({
    queryKey: ["stock-movement-detail", movementProp?.id],
    queryFn:  () => apiGet<StockMovement>(`/stock-movements/${movementProp!.id}`),
    enabled:  isOpen && !!movementProp?.id,
  });
  const movement = liveMovement ?? movementProp;

  // Per-row overrides keyed by item index (location + confirmed qty)
  const [rowStates, setRowStates] = useState<Record<number, RowState>>({});

  // Per-row confirming state
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);

  // Quick-create modal state
  const [quickCreateOpen, setQuickCreateOpen]     = useState(false);
  const [quickCreateTargetIndex, setQuickCreateTargetIndex] = useState<number | null>(null);

  // ─── Data Queries ─────────────────────────────────────────────────────────

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey: ["branches-select"],
    queryFn:  () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: "true", page_size: 200 }),
    enabled:  isOpen,
    staleTime: 5 * 60 * 1000,
  });
  const branchName = (branchesData?.data ?? []).find((b) => b.id === movement?.branch_id)?.name ?? movement?.branch_id ?? "";

  const locationBranchId = movement?.branch_id ?? activeBranchId;

  const { data: stockLocations = [], isLoading: isLoadingLocations } = useQuery({
    queryKey: ["stock-locations", locationBranchId],
    queryFn:  () =>
      apiGet<StockLocation[]>("/stock-locations", {
        branch_id: locationBranchId,
        is_active:  true,
      }),
    enabled: isOpen && !!locationBranchId,
  });

  // ─── Per-Row "is_new" Flags from Location Suggestions ──────────────────

  const [suggestedIsNew, setSuggestedIsNew] = useState<Record<number, boolean>>({});

  // ─── Stock Location Options ───────────────────────────────────────────────

  const stockLocationOptions = useMemo(
    () => stockLocations.map((loc) => ({ value: loc.id, label: `${loc.name} (${loc.code})` })),
    [stockLocations]
  );

  // ─── Auto-Populate Stock Location via Backend API ──────────────────────

  // Track whether we've done initial auto-populate for this order
  const [autoPopulated, setAutoPopulated] = useState(false);

  // Ref to prevent duplicate API calls during concurrent renders
  const autoPopulateRef = useRef(false);

  // Reset on modal close or order change
  useEffect(() => {
    if (!isOpen) {
      setRowStates({});
      setConfirmingIndex(null);
      setAutoPopulated(false);
      setSuggestedIsNew({});
      autoPopulateRef.current = false;
    }
  }, [isOpen]);

  // Auto-populate once when data is ready by calling backend suggest-location API
  useEffect(() => {
    if (!isOpen || !movement || autoPopulated || autoPopulateRef.current) return;
    if (movement.type !== "STOCK_IN") return;

    const unconfirmedItems = movement.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.is_confirmed);

    if (unconfirmedItems.length === 0) {
      setAutoPopulated(true);
      return;
    }

    autoPopulateRef.current = true;

    const branchId = movement.branch_id ?? activeBranchId;

    Promise.allSettled(
      unconfirmedItems.map(async ({ item, index }) => {
        const suggestion = await apiGet<LocationSuggestion>(
          "/stock-movements/suggest-location",
          {
            product_id:   item.product_id,
            batch_number: item.batch_number,
            expiry_date:  item.expiry_date ?? "",
            branch_id:    branchId,
          }
        );
        return { index, item, suggestion };
      })
    ).then((results) => {
      const newRowStates: Record<number, RowState> = {};
      const newIsNew: Record<number, boolean> = {};

      results.forEach((result, resultIndex) => {
        const { index: itemIndex, item } = unconfirmedItems[resultIndex];

        if (result.status === "fulfilled") {
          const { suggestion } = result.value;
          newRowStates[itemIndex] = {
            stockLocationId:   suggestion.is_new ? "" : suggestion.stock_location_id,
            stockLocationName: suggestion.stock_location_name,
            confirmedQty:      item.quantity,
          };
          newIsNew[itemIndex] = suggestion.is_new;
        } else {
          // On failure, fall back to empty location with default quantity
          newRowStates[itemIndex] = {
            stockLocationId:   "",
            stockLocationName: "",
            confirmedQty:      item.quantity,
          };
        }
      });

      setRowStates(newRowStates);
      setSuggestedIsNew(newIsNew);
      setAutoPopulated(true);
    });
  }, [isOpen, movement, autoPopulated, activeBranchId]);

  // ─── Confirm Item Mutation ────────────────────────────────────────────────

  const confirmItemMutation = useMutation({
    mutationFn: (payload: {
      item_index:         number;
      confirmed_quantity: number;
      stock_location_id?: string;
      stock_location_name?: string;
    }) => apiPost(`/stock-movements/${movement!.id}/confirm-item`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movement-detail", movementProp?.id] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      showToast("success", "Item Confirmed", "The item has been confirmed successfully.");
      setConfirmingIndex(null);
    },
    onError: (error: { message?: string }) => {
      showToast("error", "Confirm Failed", error?.message ?? "Something went wrong.");
      setConfirmingIndex(null);
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleRowLocationChange(index: number, locationId: string) {
    const location = stockLocations.find((loc) => loc.id === locationId);
    setRowStates((prev) => ({
      ...prev,
      [index]: {
        ...prev[index],
        stockLocationId:   locationId,
        stockLocationName: location?.name ?? "",
      },
    }));
  }

  function handleConfirmedQtyChange(index: number, qty: number) {
    setRowStates((prev) => ({
      ...prev,
      [index]: { ...prev[index], confirmedQty: qty },
    }));
  }

  function handleCreateNew(index: number) {
    setQuickCreateTargetIndex(index);
    setQuickCreateOpen(true);
  }

  function handleQuickCreateComplete(createdId: string) {
    if (quickCreateTargetIndex !== null) {
      const createdLocation = stockLocations.find((loc) => loc.id === createdId);
      setRowStates((prev) => ({
        ...prev,
        [quickCreateTargetIndex]: {
          ...prev[quickCreateTargetIndex],
          stockLocationId:   createdId,
          stockLocationName: createdLocation?.name ?? "",
        },
      }));
    }
    setQuickCreateTargetIndex(null);
  }

  function handleConfirmItem(index: number) {
    const rowState = rowStates[index];

    if (movement?.type === "STOCK_IN" && !rowState?.stockLocationId) {
      showToast("error", "Stock Location Required", "Please select a stock location before confirming.");
      return;
    }

    const confirmedQty = rowState?.confirmedQty ?? 0;
    if (confirmedQty < 1) {
      showToast("error", "Invalid Quantity", "Confirmed quantity must be at least 1.");
      return;
    }

    setConfirmingIndex(index);
    confirmItemMutation.mutate({
      item_index:          index,
      confirmed_quantity:  confirmedQty,
      stock_location_id:   rowState?.stockLocationId || undefined,
      stock_location_name: rowState?.stockLocationName || undefined,
    });
  }

  // ─── Render Guard ─────────────────────────────────────────────────────────

  if (!movement) return null;

  // ─── Expiry Color Helper ──────────────────────────────────────────────────

  function getExpiryColorClass(expiryDate: string): string {
    const daysLeft = daysUntilExpiry(expiryDate);
    if (daysLeft <= 0) return "text-danger-600 dark:text-danger-400";
    if (daysLeft <= 90) return "text-amber-600 dark:text-amber-400";
    return "";
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={movement.movement_number}
        size="half"
        headerExtra={
          <>
            <Badge variant={STOCK_MOVEMENT_STATUS_VARIANT[movement.status]}>
              {STOCK_MOVEMENT_STATUS_LABEL[movement.status]}
            </Badge>
            <Badge variant={STOCK_MOVEMENT_TYPE_VARIANT[movement.type]}>
              {STOCK_MOVEMENT_TYPE_LABEL[movement.type]}
            </Badge>
          </>
        }
      >
        <div className="space-y-6">
          {/* ── Header Summary Card ───────────────────────────────────────── */}
          <div className="rounded-xl p-4" style={{ background: "var(--color-surface-2)" }}>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <DetailRow label="Movement #">
                <span className="font-mono text-xs">{movement.movement_number}</span>
              </DetailRow>
              <DetailRow label="Type">
                <Badge variant={STOCK_MOVEMENT_TYPE_VARIANT[movement.type]}>
                  {STOCK_MOVEMENT_TYPE_LABEL[movement.type]}
                </Badge>
              </DetailRow>
              <DetailRow label="Status">
                <Badge variant={STOCK_MOVEMENT_STATUS_VARIANT[movement.status]}>
                  {STOCK_MOVEMENT_STATUS_LABEL[movement.status]}
                </Badge>
              </DetailRow>
              <DetailRow label="Branch">{branchName}</DetailRow>
              {movement.notes && (
                <div className="col-span-2 md:col-span-2">
                  <DetailRow label="Notes">{movement.notes}</DetailRow>
                </div>
              )}
              {movement.created_at && (
                <DetailRow label="Created">{formatDateTime(movement.created_at)}</DetailRow>
              )}
            </dl>
          </div>

          {/* ── Items Table ───────────────────────────────────────────────── */}
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              Movement Items ({movement.items.length})
            </p>

            <div
              className="rounded-xl border"
              style={{ borderColor: "var(--color-border)", overflow: "visible" }}
            >
              <div style={{ overflow: "visible" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--color-table-header)" }}>
                      {[
                        "#",
                        "Product",
                        "SKU",
                        "Batch",
                        "Expiry",
                        "Planned Qty",
                        "Confirmed Qty",
                        "Stock Location",
                        "Status / Action",
                      ].map((header) => (
                        <th
                          key={header}
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movement.items.map((item, index) => {
                      const rowState        = rowStates[index];
                      const isItemConfirmed = item.is_confirmed;
                      const isConfirmingRow = confirmingIndex === index && confirmItemMutation.isPending;

                      return (
                        <tr
                          key={index}
                          className="border-t"
                          style={{ borderColor: "var(--color-border)" }}
                        >
                          {/* # */}
                          <td
                            className="px-3 py-2 text-xs"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {index + 1}
                          </td>

                          {/* Product */}
                          <td
                            className="px-3 py-2 font-medium"
                            style={{ color: "var(--color-text)" }}
                          >
                            {item.product_name}
                          </td>

                          {/* SKU */}
                          <td
                            className="px-3 py-2 text-xs"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {item.sku || "—"}
                          </td>

                          {/* Batch */}
                          <td
                            className="px-3 py-2 font-mono text-xs"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {item.batch_number}
                          </td>

                          {/* Expiry */}
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {item.expiry_date ? (
                              <span className={getExpiryColorClass(item.expiry_date)}>
                                {item.expiry_date}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>

                          {/* Planned Qty */}
                          <td
                            className="px-3 py-2 text-right font-semibold"
                            style={{ color: "var(--color-text)" }}
                          >
                            {formatQuantity(item.quantity)}
                          </td>

                          {/* Confirmed Qty */}
                          <td className="px-2 py-1.5">
                            {isItemConfirmed ? (
                              <span className="text-xs font-mono text-right block" style={{ color: "var(--color-text)" }}>
                                {formatQuantity(item.confirmed_quantity)}
                              </span>
                            ) : (
                              <FormattedInput
                                format="quantity"
                                min={1}
                                max={item.quantity}
                                className="text-xs w-[70px]"
                                value={rowState?.confirmedQty ?? item.quantity}
                                onChange={(v) => handleConfirmedQtyChange(index, v)}
                              />
                            )}
                          </td>

                          {/* Stock Location */}
                          <td className="px-2 py-1.5 min-w-[200px] relative" style={{ overflow: "visible" }}>
                            {isItemConfirmed ? (
                              <span className="text-xs" style={{ color: "var(--color-text)" }}>
                                {item.stock_location_name || item.stock_location_id || "—"}
                              </span>
                            ) : movement.type === "STOCK_IN" ? (
                              <div>
                                <Autocomplete
                                  options={stockLocationOptions}
                                  value={rowState?.stockLocationId ?? ""}
                                  onChange={(value) => handleRowLocationChange(index, value)}
                                  onCreateNew={() => handleCreateNew(index)}
                                  placeholder="Select location..."
                                  isLoading={isLoadingLocations}
                                />
                                {rowState && !rowState.stockLocationId && rowState.stockLocationName && (
                                  <p className="text-[10px] mt-0.5 text-amber-600 dark:text-amber-400">
                                    Suggested: <strong>{rowState.stockLocationName}</strong> — use Create New
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                                {item.stock_location_name || item.stock_location_id || "—"}
                              </span>
                            )}
                          </td>

                          {/* Status / Action */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {isItemConfirmed ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                <Check className="w-3.5 h-3.5" />
                                Confirmed
                              </span>
                            ) : movement.status !== "COMPLETED" ? (
                              <Button
                                variant="primary"
                                size="sm"
                                leftIcon={<PackagePlus className="w-3.5 h-3.5" />}
                                onClick={() => handleConfirmItem(index)}
                                isLoading={isConfirmingRow}
                                disabled={confirmItemMutation.isPending}
                              >
                                Confirm
                              </Button>
                            ) : (
                              <span
                                className="text-xs"
                                style={{ color: "var(--color-text-muted)" }}
                              >
                                {"—"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Stock Location Quick Create Modal ─────────────────────────────── */}
      <StockLocationQuickCreateModal
        isOpen={quickCreateOpen}
        onClose={() => {
          setQuickCreateOpen(false);
          setQuickCreateTargetIndex(null);
        }}
        onCreated={handleQuickCreateComplete}
        defaultName={
          quickCreateTargetIndex !== null && suggestedIsNew[quickCreateTargetIndex]
            ? rowStates[quickCreateTargetIndex]?.stockLocationName
            : undefined
        }
      />
    </>
  );
}
