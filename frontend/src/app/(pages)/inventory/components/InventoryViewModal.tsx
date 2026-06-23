"use client";

import { useState }                                      from "react";
import { useQuery, keepPreviousData }                    from "@tanstack/react-query";
import { Modal }                                         from "@/components/ui/Modal";
import { Badge }                                         from "@/components/ui/Badge";
import { Pagination }                                    from "@/components/common/Pagination";
import { daysUntilExpiry, formatAmount, formatQuantity, formatDateTime } from "@/lib/utils";
import { apiGet }                                        from "@/lib/api-client";
import { MOVEMENT_LOG_TYPE_OPTIONS, MOVEMENT_LOG_TYPE_LABEL } from "@/lib/constants";
import { MOVEMENT_LOG_TYPE_VARIANT }                     from "@/lib/badges";
import type { InventoryItem, StockMovementLog, StockMovementLogType, PaginatedResponse } from "@/types";

const IN_TYPES: StockMovementLogType[] = ["STOCK_IN", "TRANSFER_IN", "PURCHASE"];

interface InventoryViewModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  item:          InventoryItem | null;
  branchNameMap: Record<string, string>;
}

export function InventoryViewModal({
  isOpen, onClose, item, branchNameMap,
}: InventoryViewModalProps) {
  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const [historyPage, setHistoryPage]       = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [historyTypeFilter, setHistoryTypeFilter] = useState("");

  const { data: historyData, isLoading: historyLoading } = useQuery<PaginatedResponse<StockMovementLog>>({
    queryKey: ["inventory-history", item?.id, historyPage, historyPageSize, historyTypeFilter],
    queryFn:  () => apiGet<PaginatedResponse<StockMovementLog>>(`/inventory/${item!.id}/history`, {
      page:      historyPage,
      page_size: historyPageSize,
      ...(historyTypeFilter && { movement_type: historyTypeFilter }),
    }),
    placeholderData: keepPreviousData,
    enabled: isOpen && !!item && activeTab === "history",
  });

  if (!item) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiredQty = item.batches
    .filter((b) => b.expiry_date && new Date(b.expiry_date) < today)
    .reduce((sum, b) => sum + b.quantity, 0);

  const historyItems = historyData?.data ?? [];
  const historyTotal = historyData?.total ?? 0;
  const historyTotalPages = historyData?.total_pages ?? 1;

  const REFERENCE_TYPE_LABEL: Record<string, string> = {
    stock_movement:   "Stock Movement",
    manual:           "Manual",
    purchase_invoice: "Purchase Invoice",
    sale_invoice:     "Sale Invoice",
    transfer:         "Transfer",
    transfer_reject:  "Transfer Reject",
    import:           "Import",
  };

  const tabClass = (tab: string) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      activeTab === tab
        ? "border-primary-500 text-primary-500"
        : "border-transparent hover:border-[var(--color-border)]"
    }`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Inventory Details" size="full">
      {/* Tabs */}
      <div className="flex border-b mb-4" style={{ borderColor: "var(--color-border)" }}>
        <button className={tabClass("details")} style={activeTab !== "details" ? { color: "var(--color-text-muted)" } : undefined}
          onClick={() => setActiveTab("details")}>
          Details
        </button>
        <button className={tabClass("history")} style={activeTab !== "history" ? { color: "var(--color-text-muted)" } : undefined}
          onClick={() => { setActiveTab("history"); setHistoryPage(1); }}>
          History
        </button>
      </div>

      {activeTab === "details" && (
        <div className="space-y-6">
          {/* Summary */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Product
              </dt>
              <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>
                {item.product_name}
              </dd>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Branch
              </dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
                {branchNameMap[item.branch_id] ?? item.branch_id}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Basic SKU Total Qty {item.basic_sku && <span className="normal-case font-normal">({item.basic_sku})</span>}
              </dt>
              <dd className="text-sm font-semibold mt-1 tabular-nums" style={{ color: "var(--color-text)" }}>
                {formatQuantity(item.basic_sku_total_quantity)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Basic SKU Count
              </dt>
              <dd className="text-sm mt-1 tabular-nums" style={{ color: "var(--color-text)" }}>
                {formatQuantity(item.basic_sku_count)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Expired Qty
              </dt>
              <dd className={`text-sm font-semibold mt-1 tabular-nums ${expiredQty > 0 ? "text-danger-500" : ""}`}
                style={expiredQty === 0 ? { color: "var(--color-text)" } : undefined}>
                {formatQuantity(expiredQty)}
              </dd>
            </div>

            {item.updated_at && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                  Last Updated
                </dt>
                <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
                  {item.updated_at.slice(0, 10)}
                </dd>
              </div>
            )}
          </dl>

          {/* Batch table */}
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>
              Batches {item.batches.length > 0 && `(${item.batches.length})`}
            </h3>

            {item.batches.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: "var(--color-text-muted)" }}>
                No batches recorded for this item.
              </p>
            ) : (
              <div className="rounded-lg overflow-auto border" style={{ borderColor: "var(--color-border)" }}>
                <table className="w-full text-xs whitespace-nowrap">
                  <thead>
                    <tr style={{ background: "var(--color-surface-2)" }}>
                      {["Batch #", "Expiry", "Qty", "Basic SKU", "Basic Qty", "Basic Sell", "Basic Buy"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {item.batches.map((batch, idx) => {
                      const days       = daysUntilExpiry(batch.expiry_date);
                      const isExpired  = days < 0;
                      const isExpiring = !isExpired && days <= 90;

                      return (
                        <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                          <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text)" }}>{batch.batch_number}</td>
                          <td className="px-3 py-2">
                            <span
                              className={isExpired ? "font-semibold text-danger-500" : isExpiring ? "font-semibold text-amber-500" : ""}
                              style={!isExpired && !isExpiring ? { color: "var(--color-text-muted)" } : undefined}
                            >
                              {batch.expiry_date}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text)" }}>{formatQuantity(batch.quantity)}</td>
                          <td className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>{batch.basic_sku || "—"}</td>
                          <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text)" }}>{formatQuantity(batch.basic_sku_quantity)}</td>
                          <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{formatAmount(batch.basic_sku_selling_price)}</td>
                          <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{formatAmount(batch.basic_sku_purchase_price)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-4">
          {/* Type filter */}
          <div className="flex items-center gap-3">
            <select
              value={historyTypeFilter}
              onChange={(e) => { setHistoryTypeFilter(e.target.value); setHistoryPage(1); }}
              className="form-select w-auto text-sm"
            >
              {MOVEMENT_LOG_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* History table */}
          <div className="rounded-lg overflow-auto border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr style={{ background: "var(--color-surface-2)" }}>
                  {["Date", "Type", "Batch", "Qty", "Source", "Notes"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      Loading...
                    </td>
                  </tr>
                ) : historyItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No movement history found.
                    </td>
                  </tr>
                ) : (
                  historyItems.map((log) => {
                    const isIn = IN_TYPES.includes(log.movement_type);
                    return (
                      <tr key={log.id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                        <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>
                          {log.created_at ? formatDateTime(log.created_at) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={MOVEMENT_LOG_TYPE_VARIANT[log.movement_type] ?? "default"}>
                            {MOVEMENT_LOG_TYPE_LABEL[log.movement_type] ?? log.movement_type}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text)" }}>
                          {log.batch_number || "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums font-medium" style={{ color: isIn ? "var(--color-success)" : "var(--color-danger)" }}>
                          {isIn ? "+" : "−"}{formatQuantity(log.quantity)}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {log.reference_type ? (REFERENCE_TYPE_LABEL[log.reference_type] ?? log.reference_type) : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs max-w-[200px] truncate" style={{ color: "var(--color-text-muted)" }}>
                          {log.notes || log.reason || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {historyTotal > 0 && (
            <Pagination
              currentPage={historyPage}
              totalPages={historyTotalPages}
              totalRecords={historyTotal}
              pageSize={historyPageSize}
              onPageChange={setHistoryPage}
              onPageSizeChange={(size) => { setHistoryPageSize(size); setHistoryPage(1); }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
