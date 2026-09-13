"use client";

import { useState } from "react";
import { Activity, BadgeCheck, Camera, ChevronRight, CircleAlert, Clock3, Crosshair, Flame, Gamepad2, Menu, ShieldCheck, Star, Trophy, Upload, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const members = [
  { name: "Boss", score: 44, status: "ผ่านแล้ว", tone: "good" },
  { name: "Jame", score: 40, status: "รอตรวจ", tone: "wait" },
  { name: "Nutt", score: 39, status: "ยังไม่ส่ง", tone: "idle" },
  { name: "Pang", score: 43, status: "ผ่านแล้ว", tone: "good" },
  { name: "Mild", score: 36, status: "ขาด", tone: "danger" },
];

const partyCandidates = ["Boss", "Jame", "Nutt", "Pang", "Mild", "Beam", "Gun", "Ice", "Mew", "Nine"];

const states = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  wait: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  idle: "border-slate-600 bg-slate-700/30 text-slate-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-300",
};

type View = "airdrop" | "party" | "admin" | "leaderboard" | "squad";

function Status({ children, tone = "good" }: { children: React.ReactNode; tone?: keyof typeof states }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-black tracking-wide ${states[tone]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{children}</span>;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`command-panel ${className}`}>{children}</section>;
}

export default function Home() {
  const [round, setRound] = useState<"20:00" | "22:00">("22:00");
  const [partyCount, setPartyCount] = useState(12);
  const [queued, setQueued] = useState(false);
  const [view, setView] = useState<View>("admin");
  const [partyCrew, setPartyCrew] = useState<string[]>(["Boss", "Jame", "Nutt", "Pang", "Mild"]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07080b] text-white selection:bg-red-600/70">
      <div className="command-grid fixed inset-0 pointer-events-none opacity-40" />
      <div className="relative mx-auto flex min-h-screen max-w-[1560px]">
        <aside className="hidden w-[258px] shrink-0 border-r border-white/10 bg-black/40 px-5 py-6 lg:flex lg:flex-col">
          <img src="/5k-logo.png" alt="5K Fivethousand" className="h-28 w-full object-contain object-left" />
          <div className="mt-9 space-y-2">
            {[{ icon: Crosshair, label: "COMMAND CENTER", value: "admin" }, { icon: Camera, label: "แอร์ดรอป", value: "airdrop" }, { icon: Users, label: "ปาร์ตี้", value: "party" }, { icon: Trophy, label: "ตารางคะแนน", value: "leaderboard" }, { icon: ShieldCheck, label: "จัดการแก๊ง", value: "squad" }].map(({ icon: Icon, label, value }) => { const active = view === value; return <button onClick={() => setView(value as View)} key={label} className={`group flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-black tracking-wide transition ${active ? "border border-red-500/40 bg-red-600/15 text-white shadow-[0_0_24px_rgba(220,38,38,.14)]" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><Icon className={`h-4 w-4 ${active ? "text-red-400" : "text-slate-500 group-hover:text-red-300"}`} />{label}</button>; })}
          </div>
          <div className="mt-auto rounded-xl border border-white/10 bg-white/[.035] p-4"><p className="text-[10px] font-black tracking-[.18em] text-slate-500">SQUAD STATUS</p><div className="mt-3 flex items-end justify-between"><div><p className="text-2xl font-black text-white">25<span className="ml-1 text-sm text-slate-500">คน</span></p><p className="text-xs text-emerald-400">● ออนไลน์ 23</p></div><Activity className="h-7 w-7 text-red-500" /></div></div>
        </aside>

        <div className="flex-1 px-4 py-4 sm:px-7 sm:py-6 lg:px-9">
          <header className="mb-6 flex items-center justify-between gap-4 border-b border-white/10 pb-4 sm:mb-8">
            <div className="flex items-center gap-3 lg:hidden"><img src="/5k-logo.png" alt="5K" className="h-11 w-24 object-contain" /><span className="h-7 w-px bg-white/15" /><p className="text-[10px] font-black tracking-[.13em] text-slate-400">COMMAND<br />CENTER</p></div>
            <div className="hidden lg:block"><p className="text-[10px] font-black tracking-[.2em] text-red-400">SQUAD OPERATIONS / LIVE</p><p className="mt-1 text-sm font-bold text-slate-400">อาทิตย์ 13 กันยายน 2569 · ประเทศไทย</p></div>
            <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-black">BOSS</p><p className="text-[10px] font-bold tracking-wider text-red-400">ADMINISTRATOR</p></div><div className="grid h-10 w-10 place-items-center rounded-lg border border-red-500/50 bg-red-600/15 font-black text-red-200 shadow-[0_0_18px_rgba(220,38,38,.18)]">B</div><button className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-slate-400 lg:hidden"><Menu className="h-5 w-5" /></button></div>
          </header>

          <section className="command-hero relative mb-6 overflow-hidden rounded-xl border border-red-500/25 p-5 sm:p-7">
            <div className="absolute right-0 top-0 h-full w-1/2 bg-[linear-gradient(135deg,transparent_20%,rgba(220,38,38,.12))]" />
            <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div><p className="flex items-center gap-2 text-xs font-black tracking-[.16em] text-red-400"><Flame className="h-4 w-4" />DAILY MISSION</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">คืนนี้คุณเก็บได้ <span className="text-red-500">6 แต้ม</span></h1><p className="mt-3 text-sm text-slate-400">แอร์ดรอปครบ 2 รอบ · ปาร์ตี้กำลังรอตรวจ</p></div>
              <div className="flex items-center gap-5 border-t border-white/10 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0"><div><p className="text-[10px] font-black tracking-[.16em] text-slate-500">TOTAL SCORE</p><p className="mt-1 text-4xl font-black text-white">044<span className="text-base text-red-400"> PTS</span></p></div><Star className="h-10 w-10 fill-red-500/20 text-red-500" /></div>
            </div>
          </section>

          <Tabs value={view} onValueChange={(nextView) => setView(nextView as View)} className="gap-5">
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-1 sm:w-fit">
              <TabsTrigger value="airdrop" className="min-w-28 rounded-md px-4 py-2.5 text-xs font-black tracking-wide data-[state=active]:bg-red-600 data-[state=active]:text-white">แอร์ดรอป</TabsTrigger>
              <TabsTrigger value="party" className="min-w-24 rounded-md px-4 py-2.5 text-xs font-black tracking-wide data-[state=active]:bg-red-600 data-[state=active]:text-white">ปาร์ตี้</TabsTrigger>
              <TabsTrigger value="admin" className="min-w-32 rounded-md px-4 py-2.5 text-xs font-black tracking-wide data-[state=active]:bg-red-600 data-[state=active]:text-white">COMMAND CENTER</TabsTrigger>
              <TabsTrigger value="leaderboard" className="min-w-28 rounded-md px-4 py-2.5 text-xs font-black tracking-wide data-[state=active]:bg-red-600 data-[state=active]:text-white">คะแนน</TabsTrigger>
              <TabsTrigger value="squad" className="min-w-28 rounded-md px-4 py-2.5 text-xs font-black tracking-wide data-[state=active]:bg-red-600 data-[state=active]:text-white">จัดการแก๊ง</TabsTrigger>
            </TabsList>

            <TabsContent value="airdrop" className="mt-0 grid gap-5 xl:grid-cols-[1.5fr_.85fr]">
              <Panel className="p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="label">AIRDROP CHECK-IN</p><h2 className="mt-2 text-2xl font-black">ภารกิจแอร์ดรอปวันนี้</h2></div><Crosshair className="h-7 w-7 text-red-500" /></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{(["20:00", "22:00"] as const).map((time, index) => <button onClick={() => setRound(time)} key={time} className={`relative overflow-hidden rounded-lg border p-5 text-left transition ${round === time ? "border-red-500/70 bg-red-600/10 shadow-[0_0_25px_rgba(220,38,38,.12)]" : "border-white/10 bg-white/[.025] hover:border-white/25"}`}><span className="absolute left-0 top-0 h-full w-1 bg-red-500 opacity-0 transition group-hover:opacity-100" /><div className="flex items-center justify-between"><p className="label">ROUND {index + 1}</p><Status tone="good">ผ่านแล้ว</Status></div><p className="mt-5 font-mono text-4xl font-black tracking-tight">{time}</p><p className="mt-2 text-sm text-slate-400">หลักฐานตรวจผ่าน · <span className="font-black text-emerald-400">+3 PTS</span></p></button>)}</div><button onClick={() => setQueued(true)} className="red-action mt-5 w-full"><Upload className="h-5 w-5" />{queued ? "ส่งเข้าคิวตรวจแล้ว" : `ส่งหลักฐานรอบ ${round}`}</button></Panel>
              <Panel className="p-5 sm:p-6"><p className="label">MISSION LOG</p><h2 className="mt-2 text-xl font-black">ภารกิจล่าสุด</h2><div className="mt-5 space-y-2">{[{ label: "แอร์ดรอป รอบ 22:00", value: "+3 PTS", time: "วันนี้" }, { label: "แอร์ดรอป รอบ 20:00", value: "+3 PTS", time: "วันนี้" }, { label: "แอร์ดรอป รอบ 22:00", value: "+3 PTS", time: "12 ก.ย." }].map((mission) => <div key={`${mission.label}${mission.time}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[.025] p-3"><div><p className="text-sm font-bold">{mission.label}</p><p className="mt-1 text-xs text-slate-500">{mission.time} · <span className="text-emerald-400">ตรวจผ่าน</span></p></div><p className="font-mono text-sm font-black text-red-400">{mission.value}</p></div>)}</div></Panel>
            </TabsContent>

            <TabsContent value="party" className="mt-0 grid gap-5 xl:grid-cols-[1.5fr_.85fr]">
              <Panel className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="label">CREATE A PARTY</p><h2 className="mt-2 text-2xl font-black">รวมตี้สำหรับกิจกรรมนี้</h2><p className="mt-2 text-sm text-slate-400">เลือกคนใหม่ได้ทุกครั้ง ตี้นี้จะใช้เฉพาะกิจกรรมที่กำลังส่ง</p></div><Status tone={partyCrew.length === 5 ? "good" : "wait"}>{partyCrew.length} / 5 คน</Status></div><div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">{partyCandidates.map((name) => { const chosen = partyCrew.includes(name); return <button onClick={() => setPartyCrew((crew) => chosen ? crew.filter((member) => member !== name) : crew.length < 5 ? [...crew, name] : crew)} key={name} className={`rounded-lg border p-3 text-center transition ${chosen ? "border-red-500/60 bg-red-600/15 text-white" : "border-white/10 bg-white/[.025] text-slate-400 hover:border-white/30"}`}><span className={`mx-auto grid h-9 w-9 place-items-center rounded-md text-sm font-black ${chosen ? "bg-red-600 text-white" : "bg-slate-800 text-slate-300"}`}>{name[0]}</span><p className="mt-2 truncate text-xs font-black">{name}</p></button>; })}</div><div className="mt-5 flex flex-col gap-4 rounded-lg border border-red-500/20 bg-red-950/20 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black">PARTY RUNS วันนี้: <span className="text-red-400">{partyCount}</span></p><p className="mt-1 text-xs text-slate-400">ต้องเลือกครบ 5 คน แล้วทุกคนจะได้ +1 เมื่อรายการผ่าน</p></div><button disabled={partyCrew.length !== 5} onClick={() => { setPartyCount((count) => count + 1); setPartyCrew([]); }} className="red-action !w-full !py-2.5 disabled:cursor-not-allowed disabled:opacity-40 sm:!w-auto"><Camera className="h-4 w-4" />สร้างตี้และส่งกิจกรรม</button></div></Panel>
              <Panel className="p-5 sm:p-6"><p className="label">PARTY SCOREBOARD</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="score-card"><p>ส่งแล้ว</p><strong>{partyCount}</strong><small>รายการ</small></div><div className="score-card red"><p>รอตรวจ</p><strong>01</strong><small>รายการ</small></div></div><div className="mt-5 rounded-lg border border-white/10 bg-white/[.025] p-4"><p className="label">CURRENT PARTY</p><div className="mt-3 flex flex-wrap gap-2">{partyCrew.length ? partyCrew.map((name) => <span key={name} className="rounded-md bg-red-600/15 px-2 py-1 text-xs font-black text-red-200">{name}</span>) : <p className="text-sm text-slate-500">เริ่มเลือกสมาชิกสำหรับปาร์ตี้ใหม่</p>}</div></div><div className="mt-5 space-y-2">{["กิจกรรม #12 · รอตรวจ", "กิจกรรม #11 · ผ่านแล้ว +1", "กิจกรรม #10 · ผ่านแล้ว +1"].map((item) => <div key={item} className="flex items-center justify-between border-b border-white/10 py-3 text-sm font-bold"><span>{item}</span><ChevronRight className="h-4 w-4 text-red-400" /></div>)}</div></Panel>
            </TabsContent>

            <TabsContent value="admin" className="mt-0 space-y-5"><section className="grid gap-3 sm:grid-cols-3">{[{ label: "CHECKED IN", value: "18", help: "ตรวจผ่านแล้ว", icon: BadgeCheck, color: "text-emerald-400" }, { label: "VERIFY QUEUE", value: "04", help: "รอตรวจรูป", icon: Clock3, color: "text-amber-300" }, { label: "MISSING", value: "03", help: "ยังไม่ส่ง / ขาด", icon: CircleAlert, color: "text-red-400" }].map(({ label, value, help, icon: Icon, color }) => <Panel key={label} className="p-5"><Icon className={`h-5 w-5 ${color}`} /><p className="mt-4 text-3xl font-black">{value}</p><p className="mt-1 text-xs font-black tracking-wider text-slate-400">{label}</p><p className="mt-1 text-xs text-slate-600">{help}</p></Panel>)}</section><Panel className="overflow-hidden"><div className="flex items-center justify-between border-b border-white/10 p-5 sm:p-6"><div><p className="label">LIVE ROSTER</p><h2 className="mt-2 text-xl font-black">เช็คชื่อรอบ 22:00</h2></div><Status tone="wait">4 รอตรวจ</Status></div><div className="overflow-x-auto"><table className="min-w-[680px] w-full text-left"><thead className="border-b border-white/10 bg-white/[.025] text-[10px] font-black tracking-[.14em] text-slate-500"><tr><th className="px-6 py-4">MEMBER</th><th className="px-6 py-4">PARTY</th><th className="px-6 py-4">20:00</th><th className="px-6 py-4">22:00</th><th className="px-6 py-4 text-right">SCORE</th></tr></thead><tbody>{members.map((member) => <tr key={member.name} className="border-b border-white/10 last:border-0 hover:bg-white/[.025]"><td className="px-6 py-4 font-black">{member.name}</td><td className="px-6 py-4 text-sm text-slate-400">ตี้ 1</td><td className="px-6 py-4"><Status>ผ่านแล้ว</Status></td><td className="px-6 py-4"><Status tone={member.tone as keyof typeof states}>{member.status}</Status></td><td className="px-6 py-4 text-right font-mono font-black text-red-400">{member.score}</td></tr>)}</tbody></table></div></Panel></TabsContent>
            <TabsContent value="leaderboard" className="mt-0 grid gap-5 lg:grid-cols-[1fr_.65fr]"><Panel className="overflow-hidden"><div className="border-b border-white/10 p-5 sm:p-6"><p className="label">SQUAD RANKING</p><h2 className="mt-2 text-2xl font-black">ตารางคะแนน</h2></div><div className="divide-y divide-white/10">{[...members].sort((a, b) => b.score - a.score).map((member, index) => <div key={member.name} className="flex items-center gap-4 p-4 sm:px-6"><span className={`grid h-9 w-9 place-items-center rounded-md font-mono font-black ${index === 0 ? "bg-red-600 text-white" : "bg-white/5 text-slate-400"}`}>{String(index + 1).padStart(2, "0")}</span><span className="grid h-9 w-9 place-items-center rounded-md bg-slate-800 text-sm font-black">{member.name[0]}</span><div className="flex-1"><p className="font-black">{member.name}</p><p className="text-xs text-slate-500">กิจกรรมล่าสุด · ร้าน A</p></div><p className="font-mono text-xl font-black text-red-400">{member.score}<span className="ml-1 text-[10px] text-slate-500">PTS</span></p></div>)}</div></Panel><Panel className="p-5 sm:p-6"><Trophy className="h-8 w-8 text-red-500" /><p className="label mt-5">CURRENT LEADER</p><p className="mt-2 text-3xl font-black">Boss</p><p className="mt-2 text-sm text-slate-400">นำอันดับ 1 ด้วยคะแนนรวม</p><p className="mt-6 font-mono text-5xl font-black text-red-500">44<span className="ml-1 text-sm text-slate-500">PTS</span></p></Panel></TabsContent>
            <TabsContent value="squad" className="mt-0 grid gap-5 lg:grid-cols-[1fr_.65fr]"><Panel className="overflow-hidden"><div className="flex items-center justify-between border-b border-white/10 p-5 sm:p-6"><div><p className="label">SQUAD MANAGEMENT</p><h2 className="mt-2 text-2xl font-black">สมาชิกแก๊ง</h2></div><Status>25 คน</Status></div><div className="divide-y divide-white/10">{members.map((member) => <div key={member.name} className="flex items-center gap-4 p-4 sm:px-6"><span className="grid h-10 w-10 place-items-center rounded-md bg-slate-800 font-black">{member.name[0]}</span><div className="flex-1"><p className="font-black">{member.name}</p><p className="text-xs text-slate-500">MEMBER · เลือกตี้ได้ทุกกิจกรรม</p></div><Status tone={member.tone as keyof typeof states}>{member.status}</Status></div>)}</div></Panel><Panel className="p-5 sm:p-6"><Users className="h-8 w-8 text-red-500" /><p className="label mt-5">SQUAD OVERVIEW</p><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between border-b border-white/10 pb-3"><span className="text-slate-400">สมาชิกทั้งหมด</span><strong>25 คน</strong></div><div className="flex justify-between border-b border-white/10 pb-3"><span className="text-slate-400">รูปแบบปาร์ตี้</span><strong>รวมทีมเฉพาะกิจ</strong></div><div className="flex justify-between"><span className="text-slate-400">พื้นที่รูปคงเหลือ</span><strong className="text-emerald-400">68%</strong></div></div></Panel></TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}
