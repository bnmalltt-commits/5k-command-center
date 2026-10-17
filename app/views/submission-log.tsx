"use client";
import { useState } from "react";
import {
  Chips,
  EmptyState,
  Panel,
  Row,
  SearchInput,
} from "../ui";
import { type Data, Thumb, Status } from "./shared";

export const PAGE_SIZE = 50;
export function SubmissionLog({ data }: { data: Data }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [shown, setShown] = useState(PAGE_SIZE);
  const needle = query.trim().toLowerCase();
  const filtered = data.submissionLog.filter((item: any) => {
    if (status !== "all" && item.status !== status) return false;
    if (!needle) return true;
    return `${item.submitted_by || ""} ${item.detail || ""} ${item.activity_date || ""}`
      .toLowerCase()
      .includes(needle);
  });
  const visible = filtered.slice(0, shown);
  return (
    <Panel
      label="SUBMISSION LOG"
      title="ประวัติการส่งทั้งหมด"
      subtitle={`${filtered.length} รายการ`}
      flush
    >
      <div className="space-y-3 p-4">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setShown(PAGE_SIZE);
          }}
          placeholder="ค้นหาชื่อ รอบ หรือวันที่"
        />
        <Chips
          value={status}
          onChange={(next) => {
            setStatus(next);
            setShown(PAGE_SIZE);
          }}
          options={[
            { id: "all", label: "ทั้งหมด" },
            { id: "pending", label: "รอตรวจ" },
            { id: "approved", label: "ผ่านแล้ว" },
            { id: "rejected", label: "ไม่ผ่าน" },
          ]}
        />
      </div>
      {visible.length ? (
        <>
          {visible.map((item: any) => {
            // Approved evidence is deleted from storage to save space, so
            // there's nothing left to open.
            const viewable = item.status !== "approved" && item.image_key;
            return (
              <Row
                key={item.type + item.id}
                inset={false}
                href={viewable ? `/api/image/${item.image_key}` : undefined}
                leading={
                  <Thumb
                    imageKey={viewable ? item.image_key : null}
                    tone={
                      item.status === "approved"
                        ? "green"
                        : item.status === "rejected"
                          ? "red"
                          : "amber"
                    }
                  />
                }
                title={item.type === "party" ? item.detail : `แอร์ดรอป · รอบ ${item.detail}`}
                subtitle={`${item.activity_date} · ส่งโดย ${item.submitted_by}${
                  item.approved_by ? ` · ตรวจโดย ${item.approved_by}` : " · ยังไม่ตรวจ"
                }${item.status === "rejected" && item.reject_reason ? ` · เหตุผล: ${item.reject_reason}` : ""}`}
                trailing={<Status value={item.status} />}
              />
            );
          })}
          {filtered.length > visible.length && (
            <div className="p-3 text-center">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE_SIZE)}
                className="ui-btn ui-btn--ghost ui-btn--sm"
              >
                โหลดเพิ่ม {Math.min(PAGE_SIZE, filtered.length - visible.length)} รายการ
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          art={data.submissionLog.length ? undefined : "crate"}
          title={
            data.submissionLog.length
              ? "ไม่พบรายการที่ค้นหา"
              : "ยังไม่มีประวัติการส่ง"
          }
          hint={
            data.submissionLog.length
              ? "ลองเปลี่ยนคำค้นหรือตัวกรองสถานะ"
              : "เมื่อมีคนส่งหลักฐาน รายการจะขึ้นที่นี่"
          }
        />
      )}
    </Panel>
  );
}
