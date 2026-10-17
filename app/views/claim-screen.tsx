"use client";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Avatar } from "../ui";

// First Discord sign-in: the person picks their own name from members not yet
// on Discord, or registers a new one. The server re-checks everything.
export function ClaimScreen({
  claim,
  onDone,
  onCancel,
}: {
  claim: { discordName: string; avatar: string | null; members: { id: string; display_name: string }[] };
  onDone: (error?: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ id: string; display_name: string } | null>(null);
  const [newName, setNewName] = useState(claim.discordName || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const q = query.trim().toLowerCase();
  const shown = claim.members.filter((m) => !q || m.display_name.toLowerCase().includes(q));
  const submit = async (body: any) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/discord", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "claim", ...body }),
      });
      const x: any = await r.json().catch(() => ({}));
      if (x.error) setError(x.error);
      else onDone();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-stage">
      <section className="auth-card">
        <div className="flex justify-center">
          <Avatar url={claim.avatar} name={claim.discordName} size={72} />
        </div>
        <p className="ui-eyebrow mt-4">ครั้งแรกที่เข้าใช้</p>
        <h1 className="auth-title">สวัสดี {claim.discordName}</h1>
        <p className="auth-lead">
          เลือกชื่อของคุณในแก๊ง ทำครั้งเดียว ครั้งหน้ากดเข้าด้วย Discord ได้เลย
          <br />
          เลือกชื่อคนอื่นไม่ได้นะ แอดมินเห็นทุกครั้งที่มีคนผูกชื่อ
        </p>
        {picked ? (
          <div className="mt-6 space-y-3">
            <p className="text-lg font-bold">ฉันคือ “{picked.display_name}”</p>
            <button disabled={busy} onClick={() => submit({ memberId: picked.id })} className="ui-btn ui-btn--primary ui-btn--block ui-btn--lg">
              {busy ? "กำลังบันทึก…" : "ยืนยัน ใช่ชื่อนี้"}
            </button>
            <button disabled={busy} onClick={() => setPicked(null)} className="ui-btn ui-btn--ghost w-full">
              เลือกใหม่
            </button>
          </div>
        ) : (
          <>
            <input
              id="claim-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อของคุณ"
              className="ui-input mt-6"
            />
            <div className="claim-list mt-3">
              {shown.length ? (
                shown.map((m) => (
                  <button key={m.id} type="button" onClick={() => setPicked(m)} className="claim-list__item">
                    {m.display_name}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ))
              ) : (
                <p className="p-3 text-sm text-[var(--ui-text-3)]">
                  {claim.members.length ? "ไม่พบชื่อนี้" : "ทุกชื่อในแก๊งผูก Discord แล้ว"}
                </p>
              )}
            </div>
            <form
              className="mt-5 space-y-2 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                submit({ newName });
              }}
            >
              <label htmlFor="claim-new" className="text-sm text-[var(--ui-text-3)]">
                ไม่มีชื่อคุณ? สมัครเป็นสมาชิกใหม่
              </label>
              <div className="flex gap-2">
                <input
                  id="claim-new"
                  required
                  minLength={2}
                  maxLength={40}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ชื่อในแก๊ง"
                  className="ui-input min-w-0 flex-1"
                />
                <button disabled={busy} className="ui-btn ui-btn--primary">
                  สมัคร
                </button>
              </div>
            </form>
          </>
        )}
        {error && <p className="mt-4 text-sm text-[var(--ui-text)]">{error}</p>}
        <button type="button" onClick={onCancel} className="text-link mt-5">
          ยกเลิก
        </button>
      </section>
    </main>
  );
}
