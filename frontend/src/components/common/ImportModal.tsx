"use client";

import { useState, useRef } from "react";
import { Upload, Download, X, CheckCircle, AlertCircle, FileText } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { ImportResult } from "@/types";

interface ImportModalProps {
  isOpen:             boolean;
  onClose:            () => void;
  /** Display name shown in the modal title and descriptions, e.g. "Users" */
  entityName:         string;
  /** Called with the chosen file; must resolve to an ImportResult */
  onImport:           (file: File) => Promise<ImportResult>;
  /** Called when the user clicks Download Template */
  onDownloadTemplate: () => Promise<void>;
  /** Short description of required/optional columns shown under the template button */
  templateNote:       string;
}

export function ImportModal({
  isOpen,
  onClose,
  entityName,
  onImport,
  onDownloadTemplate,
  templateNote,
}: ImportModalProps) {
  const [selectedFile,     setSelectedFile]     = useState<File | null>(null);
  const [isImporting,      setIsImporting]       = useState(false);
  const [isDownloadingTpl, setIsDownloadingTpl]  = useState(false);
  const [result,           setResult]            = useState<ImportResult | null>(null);
  const [importError,      setImportError]       = useState<string | null>(null);
  const [isDragOver,       setIsDragOver]        = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleClose() {
    setSelectedFile(null);
    setResult(null);
    setImportError(null);
    onClose();
  }

  function applyFile(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError("Only .csv files are accepted.");
      return;
    }
    setSelectedFile(file);
    setResult(null);
    setImportError(null);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    applyFile(e.target.files?.[0] ?? null);
    // Reset the input so the same file can be re-selected after an error
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    applyFile(e.dataTransfer.files[0] ?? null);
  }

  async function handleImport() {
    if (!selectedFile) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const importResult = await onImport(selectedFile);
      setResult(importResult);
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? "Import failed. Please try again.";
      setImportError(message);
    } finally {
      setIsImporting(false);
    }
  }

  async function handleDownloadTemplate() {
    setIsDownloadingTpl(true);
    try {
      await onDownloadTemplate();
    } finally {
      setIsDownloadingTpl(false);
    }
  }

  const showDropZone = !result;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Import ${entityName}`}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              variant="primary"
              leftIcon={<Upload className="w-4 h-4" />}
              onClick={handleImport}
              disabled={!selectedFile}
              isLoading={isImporting}
            >
              Import
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">

        {/* Template download hint */}
        <div
          className="flex items-start gap-3 rounded-xl p-3"
          style={{ background: "var(--color-surface-2)" }}
        >
          <FileText
            className="w-4 h-4 mt-0.5 flex-shrink-0"
            style={{ color: "var(--color-primary)" }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              Download Template
            </p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              {templateNote}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="w-3.5 h-3.5" />}
            onClick={handleDownloadTemplate}
            isLoading={isDownloadingTpl}
          >
            Template
          </Button>
        </div>

        {/* Drop zone — only shown before a result is available */}
        {showDropZone && (
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
            style={{
              borderColor: isDragOver ? "var(--color-primary)"   : "var(--color-border)",
              background:  isDragOver ? "var(--color-surface-2)" : "var(--color-surface)",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleInputChange}
            />
            <Upload
              className="w-8 h-8 mx-auto mb-3"
              style={{ color: isDragOver ? "var(--color-primary)" : "var(--color-text-muted)" }}
            />
            {selectedFile ? (
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                  {selectedFile.name}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {(selectedFile.size / 1024).toFixed(1)} KB — click to change
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  Drop a CSV file here, or click to browse
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Only .csv files are accepted
                </p>
              </div>
            )}
          </div>
        )}

        {/* Network / validation error */}
        {importError && (
          <div
            className="flex items-start gap-2 rounded-xl p-3"
            style={{ background: "var(--color-surface-2)" }}
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-danger-500" />
            <p className="text-sm" style={{ color: "var(--color-text)" }}>{importError}</p>
          </div>
        )}

        {/* Import result summary */}
        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div
                className="flex items-center gap-3 rounded-xl p-4"
                style={{ background: "var(--color-surface-2)" }}
              >
                <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-500" />
                <div>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Imported</p>
                  <p className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>
                    {result.created}
                  </p>
                </div>
              </div>
              <div
                className="flex items-center gap-3 rounded-xl p-4"
                style={{ background: "var(--color-surface-2)" }}
              >
                <AlertCircle
                  className={`w-5 h-5 flex-shrink-0 ${result.failed > 0 ? "text-danger-500" : "text-emerald-500"}`}
                />
                <div>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Failed</p>
                  <p
                    className={`text-2xl font-bold ${result.failed > 0 ? "text-danger-600 dark:text-danger-400" : ""}`}
                    style={result.failed === 0 ? { color: "var(--color-text)" } : undefined}
                  >
                    {result.failed}
                  </p>
                </div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div
                className="rounded-xl p-3 max-h-52 overflow-y-auto space-y-2"
                style={{ background: "var(--color-surface-2)" }}
              >
                <p className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
                  Row Errors
                </p>
                {result.errors.map((err, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <X className="w-3 h-3 mt-0.5 flex-shrink-0 text-danger-500" />
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      <span className="font-medium" style={{ color: "var(--color-text)" }}>
                        Row {err.row}:
                      </span>{" "}
                      {err.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </Modal>
  );
}
