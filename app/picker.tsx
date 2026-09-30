"use client";

import { useEffect, useState } from "react";
import { Camera, Clipboard, X } from "lucide-react";

// Vercel rejects request bodies over 4.5 MB before the upload route runs, and
// phone photos are often 5–8 MB. Anything over the budget is re-encoded as a
// JPEG, capped on its long side — plenty to read a screenshot or group photo.
const UPLOAD_BUDGET = 3.5 * 1024 * 1024;
export async function shrinkImage(file: File): Promise<File> {
  if (file.size <= UPLOAD_BUDGET) return file;
  const bitmap = await createImageBitmap(file);
  let result: Blob | null = null;
  for (const [side, quality] of [[2400, 0.85], [1800, 0.8], [1400, 0.72]] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (result && result.size <= UPLOAD_BUDGET) break;
  }
  bitmap.close();
  if (!result) return file;
  return new File([result], "evidence.jpg", { type: "image/jpeg" });
}

export function Picker({ onChange, resetToken }: { onChange: (file: File | null) => void; resetToken?: string | number }) {
  const [filename, setFilename] = useState("เลือกรูปหลักฐาน"),
    [preview, setPreview] = useState("");
  const applyFile = (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setFilename(file.name || "รูปจากคลิปบอร์ด");
    setPreview(URL.createObjectURL(file));
    onChange(file);
  };
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files || []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (file) {
        event.preventDefault();
        applyFile(file);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);
  useEffect(() => {
    setFilename("เลือกรูปหลักฐาน");
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    onChange(null);
  }, [resetToken]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg border border-dashed border-white/20 bg-black/20 px-4 py-4 text-sm text-slate-300 hover:border-red-400">
        {preview && (
          <img
            src={preview}
            alt="ตัวอย่างหลักฐาน"
            className="h-14 w-14 rounded-md object-cover"
          />
        )}
        <label className="flex cursor-pointer items-center gap-2">
          <Camera className="h-5 w-5 text-red-400" />
          {filename}
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(e) => applyFile(e.target.files?.[0] || null)}
          />
        </label>
        {preview && (
          <button
            type="button"
            onClick={() => {
              setFilename("เลือกรูปหลักฐาน");
              setPreview("");
              onChange(null);
            }}
            aria-label="ลบรูปหลักฐาน"
            title="ลบรูปหลักฐาน"
            className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
              const type = item.types.find((value) =>
                value.startsWith("image/"),
              );
              if (type) {
                const blob = await item.getType(type);
                applyFile(
                  new File(
                    [blob],
                    "clipboard-image." + (type.split("/")[1] || "png"),
                    { type },
                  ),
                );
                return;
              }
            }
          } catch {
            setFilename("กด Ctrl + V เพื่อวางรูป");
          }
        }}
        className="mx-auto flex items-center gap-2 text-xs text-slate-400 hover:text-red-300"
      >
        <Clipboard className="h-4 w-4" />
        วางจากคลิปบอร์ด · Ctrl + V
      </button>
    </div>
  );
}
