"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, ImageIcon } from "lucide-react";
import { apiUploadFile } from "@/lib/api-client";
import { showToast } from "@/lib/toast";

interface LogoUploadProps {
  currentLogoUrl: string | null | undefined;
  uploadEndpoint: string;
  onUploaded:     (url: string) => void;
}

export function LogoUpload({ currentLogoUrl, uploadEndpoint, onUploaded }: LogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const fullLogoUrl = currentLogoUrl ? `${apiBase}${currentLogoUrl}` : null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      showToast("error", "Invalid File Type", "Only JPG, PNG, or WebP images are allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast("error", "File Too Large", "Image must be smaller than 2 MB.");
      return;
    }

    setUploading(true);
    try {
      const result = await apiUploadFile<{ logo_url: string }>(uploadEndpoint, file);
      onUploaded(result.logo_url);
      showToast("success", "Logo Updated", "The logo has been uploaded successfully.");
    } catch {
      showToast("error", "Upload Failed", "Could not upload the logo. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20 group">
        <div
          className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center border-2 border-dashed"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
        >
          {fullLogoUrl ? (
            <Image
              src={fullLogoUrl}
              alt="Logo"
              width={80}
              height={80}
              className="w-full h-full object-contain p-1"
              unoptimized
            />
          ) : (
            <ImageIcon className="w-8 h-8" style={{ color: "var(--color-text-muted)" }} />
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute inset-0 rounded-xl flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
          aria-label="Upload logo"
        >
          {uploading
            ? <Loader2 className="w-5 h-5 text-white animate-spin" />
            : <Camera className="w-5 h-5 text-white" />
          }
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      <div>
        <p className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
          {currentLogoUrl ? "Click to change logo" : "Upload a logo"}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          JPG, PNG, or WebP. Max 2 MB.
        </p>
      </div>
    </div>
  );
}
