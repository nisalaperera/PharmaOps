"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2 } from "lucide-react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { apiPatch } from "@/lib/api-client";
import { getInitials } from "@/lib/utils";
import { showToast } from "@/lib/toast";

interface AvatarUploadProps {
  userId:    string;
  fullName:  string;
  avatarUrl: string | undefined;
  onUploaded: (url: string) => void;
}

export function AvatarUpload({ userId, fullName, avatarUrl, onUploaded }: AvatarUploadProps) {
  const inputRef   = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

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
      const storageRef  = ref(storage, `avatars/${userId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      await apiPatch(`/users/${userId}`, { avatar_url: downloadUrl });
      onUploaded(downloadUrl);
      showToast("success", "Avatar Updated", "Your profile photo has been changed successfully.");
    } catch {
      showToast("error", "Upload Failed", "Could not upload your photo. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative w-24 h-24 group">
      {/* Avatar */}
      <div
        className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-2xl font-bold text-white flex-shrink-0"
        style={{ background: "linear-gradient(135deg, #008080, #004B79)" }}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={fullName}
            width={96}
            height={96}
            className="w-full h-full object-cover"
          />
        ) : (
          getInitials(fullName)
        )}
      </div>

      {/* Upload overlay */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
        aria-label="Upload avatar"
      >
        {uploading
          ? <Loader2 className="w-6 h-6 text-white animate-spin" />
          : <Camera className="w-6 h-6 text-white" />
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
  );
}
