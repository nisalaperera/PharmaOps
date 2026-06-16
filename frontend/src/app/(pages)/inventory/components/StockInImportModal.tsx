"use client";

import { useQueryClient }   from "@tanstack/react-query";
import { ImportModal }       from "@/components/common/ImportModal";
import { apiPost, apiDownloadFile, downloadBlob } from "@/lib/api-client";
import { showToast }         from "@/lib/toast";
import { format }            from "date-fns";
import type { ImportResult } from "@/types";

interface StockInImportModalProps {
  isOpen:  boolean;
  onClose: () => void;
}

export function StockInImportModal({ isOpen, onClose }: StockInImportModalProps) {
  const queryClient = useQueryClient();

  async function handleImport(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append("file", file);

    const result = await apiPost<ImportResult>("/inventory/stock-in/import", formData);

    if (result.created > 0 || result.updated > 0) {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      showToast(
        "success",
        "Import Complete",
        `${result.created} created, ${result.updated} updated${result.failed > 0 ? `, ${result.failed} failed` : ""}.`,
      );
    }

    return result;
  }

  async function handleDownloadTemplate(): Promise<void> {
    try {
      const blob = await apiDownloadFile("/inventory/stock-in/import/template", {});
      downloadBlob(blob, `stock_in_import_template_${format(new Date(), "yyyy-MM-dd")}.csv`);
    } catch {
      showToast("error", "Download Failed", "Could not download the template. Please try again.");
    }
  }

  return (
    <ImportModal
      isOpen={isOpen}
      onClose={onClose}
      entityName="Stock In"
      onImport={handleImport}
      onDownloadTemplate={handleDownloadTemplate}
      templateNote="Required: product_name, batch_number, expiry_date (yyyy-MM-dd), quantity, purchase_price, selling_price. Optional: sku, supplier_name, branch_id (org-level users only)."
    />
  );
}
