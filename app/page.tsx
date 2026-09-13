"use client";

import { useMemo, useState } from "react";
import {
  Camera, Check, ChevronRight, Clock3, ImagePlus, LogOut, Menu,
  Star, Users, X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DropState = "ผ่านแล้ว" | "รอตรวจ" | "ยังไม่ส่ง" | "ขาด";

const people: { name: string; group: string; evening: DropState; night: DropState; points: number }[] = [
  { name: "Boss", group: "ตี้ 1", evening: "ผ่านแล้ว", night: "ผ่านแล้ว", points: 44 },
  { name: "Jame", group: "ตี้ 1", evening: "ผ่านแล้ว", night: "รอตรวจ", points: 40 },
  { name: "Nutt", group: "ตี้ 1", evening: "ผ่านแล้ว", night: "ยังไม่ส่ง", points: 39 },
  { name: "Pang", group: "ตี้ 1", evening: "ผ่านแล้ว", night: "ผ่านแล้ว", points: 43 },
  { name: "Mild", group: "ตี้ 1", evening: "ผ่านแล้ว", night: "ขาด", points: 36 },
];

const statusStyle: Record<DropState, string> = {
  "ผ่านแล้ว": "bg-emerald-100 text-emerald-800",
  "รอตรวจ": "bg-amber-100 text-amber-800",
  "ยังไม่ส่ง": "bg-slate-100 text-slate-700",
  "ขาด": "bg-rose-100 text-rose-800",
};

function StatusPill({ status }: { status: DropState }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[status]}`}>{status}</span>;
}

export default function Home() {
  const [activeRound, setActiveRound] = useState<"20:00" | "22:00">("22:00");
  const [partyCount, setPartyCount] = useState(12);
  const [submitted, setSubmitted] = useState(false);
  const counts = useMemo(() => ({ passed: people.filter((p) => p.night === "ผ่านแล้ว").length, waiting: people.filter((p) => p.night === "รอตรวจ").length, missing: people.filter((p) => p.night === "ยังไม่ส่ง" || p.night === "ขาด").length }), []);

  return (
    <main className="min-h-screen bg-[#f2f7fb] text-[#102a43]">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-7 lg:px-10">
        <header className="mb-7 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#102a43] text-xl text-[#fbbf24]"><Star className="h-6 w-6 fill-current" /></div>
            <div><p className="text-lg font-black tracking-tight">Airdrop Party</p><p className="text-sm text-slate-500">เช็คชื่อ · ส่งรูป · เก็บแต้ม</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="เมนู" className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-600 shadow-sm md:hidden"><Menu className="h-5 w-5" /></button>
            <div className="hidden items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm sm:flex"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#d9efff] text-sm font-black text-[#1170b8]">B</span><div className="leading-tight"><p className="text-sm font-bold">Boss</p><p className="text-xs text-slate-500">แอดมิน</p></div><LogOut className="ml-2 h-4 w-4 text-slate-400" /></div>
          </div>
        </header>

        <section className="mb-6 overflow-hidden rounded-3xl bg-[#102a43] px-5 py-6 text-white shadow-xl shadow-[#102a43]/15 sm:px-7">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div><p className="mb-2 text-sm font-bold text-[#fbbf24]">อาทิตย์ 13 กันยายน 2569</p><h1 className="text-3xl font-black tracking-tight sm:text-4xl">คืนนี้คุณเก็บได้ 6 แต้ม</h1><p className="mt-2 text-sm text-slate-300">แอร์ดรอปครบ 2 รอบ · ปาร์ตี้ 0 กิจกรรม</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3"><p className="text-xs font-bold text-slate-300">แต้มสะสมทั้งหมด</p><p className="mt-1 text-3xl font-black text-[#fbbf24]">44 <span className="text-base text-slate-300">แต้ม</span></p></div>
          </div>
        </section>

        <Tabs defaultValue="airdrop" className="gap-5">
          <TabsList className="h-11 rounded-xl bg-white p-1 shadow-sm">
            <TabsTrigger value="airdrop" className="rounded-lg px-4 font-bold">แอร์ดรอป</TabsTrigger>
            <TabsTrigger value="party" className="rounded-lg px-4 font-bold">ปาร์ตี้</TabsTrigger>
            <TabsTrigger value="admin" className="rounded-lg px-4 font-bold">ภาพรวมแอดมิน</TabsTrigger>
          </TabsList>

          <TabsContent value="airdrop" className="space-y-5">
            <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
              <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-500">ส่งหลักฐานของฉัน</p><h2 className="mt-1 text-xl font-black">แอร์ดรอปวันนี้</h2></div><Camera className="h-6 w-6 text-[#1170b8]" /></div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {(["20:00", "22:00"] as const).map((time) => <button key={time} onClick={() => setActiveRound(time)} className={`rounded-2xl border-2 p-4 text-left transition ${activeRound === time ? "border-[#1170b8] bg-[#eff8ff]" : "border-slate-100 hover:border-slate-200"}`}><p className="flex items-center gap-2 text-sm font-bold text-slate-500"><Clock3 className="h-4 w-4" />รอบ</p><p className="mt-1 text-2xl font-black">{time}</p><span className="mt-3 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">ผ่านแล้ว +3</span></button>)}
                </div>
                <Dialog>
                  <DialogTrigger asChild><button className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1170b8] px-4 py-3.5 font-bold text-white transition hover:bg-[#0b5b98]"><ImagePlus className="h-5 w-5" />ส่งรูปสำหรับรอบ {activeRound}</button></DialogTrigger>
                  <DialogContent><DialogHeader><DialogTitle>ส่งหลักฐานแอร์ดรอป</DialogTitle><DialogDescription>ระบบจะให้ 3 แต้ม เมื่อแอดมินตรวจรูปผ่าน</DialogDescription></DialogHeader><label className="grid min-h-36 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50 text-center text-sm font-bold text-[#1170b8]"><input className="sr-only" type="file" accept="image/*" onChange={() => setSubmitted(true)} /><span><ImagePlus className="mx-auto mb-2 h-6 w-6" />เลือกรูปจากเครื่อง</span></label>{submitted && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">เลือกรูปแล้ว พร้อมส่งตรวจ</p>}<DialogFooter><button onClick={() => setSubmitted(true)} className="rounded-xl bg-[#1170b8] px-4 py-2.5 font-bold text-white">ส่งตรวจ</button></DialogFooter></DialogContent>
                </Dialog>
              </div>
              <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6"><p className="text-sm font-bold text-slate-500">ประวัติล่าสุด</p><h2 className="mt-1 text-xl font-black">แต้มแอร์ดรอป</h2><div className="mt-5 space-y-3">{[{ time: "22:00", date: "วันนี้", result: "+3 แต้ม" }, { time: "20:00", date: "วันนี้", result: "+3 แต้ม" }, { time: "22:00", date: "12 ก.ย.", result: "+3 แต้ม" }].map((row) => <div key={`${row.date}${row.time}`} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"><div><p className="font-bold">รอบ {row.time}</p><p className="text-xs text-slate-500">{row.date} · ตรวจผ่านแล้ว</p></div><span className="font-black text-emerald-700">{row.result}</span></div>)}</div></div>
            </section>
          </TabsContent>

          <TabsContent value="party" className="space-y-5">
            <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
              <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start justify-between"><div><p className="text-sm font-bold text-slate-500">ตี้ของฉัน</p><h2 className="mt-1 text-xl font-black">ตี้ 1 · ร้าน A</h2></div><span className="rounded-full bg-[#fff5ce] px-3 py-1 text-xs font-black text-[#7d5900]">5 / 5 คน</span></div><div className="mt-5 flex flex-wrap gap-2">{people.map((person) => <span key={person.name} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-bold">{person.name}</span>)}</div><div className="mt-6 rounded-2xl bg-[#f2f7fb] p-4"><p className="font-black">วันนี้ตี้ส่งแล้ว {partyCount} กิจกรรม</p><p className="mt-1 text-sm text-slate-500">ทุกกิจกรรมที่ผ่าน สมาชิกทั้ง 5 คนได้คนละ 1 แต้ม</p></div><button onClick={() => setPartyCount((count) => count + 1)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#fbbf24] px-4 py-3.5 font-black text-[#4a3500]"><ImagePlus className="h-5 w-5" />ส่งกิจกรรมปาร์ตี้ใหม่</button></div>
              <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6"><p className="text-sm font-bold text-slate-500">สรุปแต้มตี้วันนี้</p><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#102a43] p-4 text-white"><p className="text-sm text-slate-300">ส่งแล้ว</p><p className="mt-1 text-3xl font-black">{partyCount}</p><p className="text-xs text-slate-300">รายการ</p></div><div className="rounded-2xl bg-[#fff5ce] p-4"><p className="text-sm text-[#7d5900]">แต้มต่อคน</p><p className="mt-1 text-3xl font-black text-[#7d5900]">+{partyCount}</p><p className="text-xs text-[#7d5900]">เมื่อตรวจผ่าน</p></div></div><div className="mt-5 space-y-2">{["กิจกรรม #12 · รอตรวจ", "กิจกรรม #11 · ผ่านแล้ว +1", "กิจกรรม #10 · ผ่านแล้ว +1"].map((item) => <div key={item} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3 text-sm font-bold"><span>{item}</span><ChevronRight className="h-4 w-4 text-slate-400" /></div>)}</div></div>
            </section>
          </TabsContent>

          <TabsContent value="admin" className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-3">{[{ label: "ตรวจผ่าน", value: counts.passed, color: "text-emerald-700 bg-emerald-50" }, { label: "รอตรวจ", value: counts.waiting, color: "text-amber-700 bg-amber-50" }, { label: "ยังไม่ส่ง / ขาด", value: counts.missing, color: "text-rose-700 bg-rose-50" }].map((card) => <div key={card.label} className={`rounded-2xl p-5 ${card.color}`}><p className="text-sm font-bold">{card.label}</p><p className="mt-2 text-3xl font-black">{card.value}</p><p className="text-xs">จากสมาชิก 25 คน</p></div>)}</section>
            <section className="overflow-hidden rounded-3xl bg-white shadow-sm"><div className="flex items-center justify-between p-5 sm:p-6"><div><p className="text-sm font-bold text-slate-500">รอบ 22:00 น.</p><h2 className="mt-1 text-xl font-black">เช็คชื่อวันนี้</h2></div><Users className="h-6 w-6 text-[#1170b8]" /></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead className="border-y border-slate-100 bg-slate-50 text-xs text-slate-500"><tr><th className="px-6 py-3">สมาชิก</th><th className="px-6 py-3">ตี้</th><th className="px-6 py-3">20:00</th><th className="px-6 py-3">22:00</th><th className="px-6 py-3">แต้ม</th></tr></thead><tbody>{people.map((person) => <tr key={person.name} className="border-b border-slate-50 last:border-0"><td className="px-6 py-4 font-black">{person.name}</td><td className="px-6 py-4 text-sm text-slate-500">{person.group}</td><td className="px-6 py-4"><StatusPill status={person.evening} /></td><td className="px-6 py-4"><StatusPill status={person.night} /></td><td className="px-6 py-4 font-black text-[#1170b8]">{person.points}</td></tr>)}</tbody></table></div></section>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
