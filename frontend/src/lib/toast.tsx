import toast from "react-hot-toast";

type ToastType = "success" | "error";

export function showToast(type: ToastType, title: string, description?: string): void {
  const message = (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
      <span>{title}</span>
      {description && (
        <span style={{ fontSize: "0.75rem", fontWeight: 400, opacity: 0.75, lineHeight: "1.4" }}>
          {description}
        </span>
      )}
    </div>
  );

  if (type === "success") toast.success(message);
  else toast.error(message);
}
