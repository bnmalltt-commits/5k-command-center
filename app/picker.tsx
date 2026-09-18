"use client";

import { useEffect, useState } from "react";
import { Camera, Clipboard, X } from "lucide-react";

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
