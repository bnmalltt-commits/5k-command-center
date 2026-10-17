"use client";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BarChart3,
  CalendarOff,
  ChevronRight,
  Crosshair,
  History,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Upload,
  Users,
} from "lucide-react";
import { PartyCommandCenter } from "./party-command-center";
import { bangkokHour, roundDate } from "@/lib/rounds";
import { shrinkImage } from "./picker";
import { playFx } from "./three/prefs";
import { SceneToggle } from "./three/toggle";
import { brush } from "./three/sound";
import { Widget3D, WidgetStage } from "./three/widget";
import {
  Avatar,
  ConfirmDialog,
  DiscordMark,
  Dot,
  EmptyState,
  Panel,
  Row,
} from "./ui";
import { AdminCommandCenter } from "./views/admin";
import { ClaimScreen } from "./views/claim-screen";
import { LeaveRoom } from "./views/leave-room";
import { MissionCard, AirdropHistory } from "./views/mission";
import { MyPoints } from "./views/my-points";
import { ProfileDialog } from "./views/profile-dialog";
import { uploadResult, type Round, ROUNDS, type Data, EMPTY_DATA, ViewLoading, Celebration, prefersLessMotion, CountUp, Ring, Meter } from "./views/shared";
import { SquadRanking } from "./views/squad-ranking";
import { SubmissionLog } from "./views/submission-log";
import { GangSummary } from "./views/summary";

export default function Home() {
  const [data, setData] = useState<Data | null>(null),
    [view, setView] = useState("airdrop"),
    [round, setRound] = useState<Round>(ROUNDS[0]),
    [image, setImage] = useState<File | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [authNeeded, setAuthNeeded] = useState(false),
    [loadedViews, setLoadedViews] = useState<string[]>([]),
    [pickerReset, setPickerReset] = useState(0),
    [claim, setClaim] = useState<any>(null),
    [discordLater, setDiscordLater] = useState(false),
    [showOffline, setShowOffline] = useState(false),
    [celebration, setCelebration] = useState(""),
    [profileId, setProfileId] = useState<string | null>(null),
    [reviewTarget, setReviewTarget] = useState(""),
    [confirmState, setConfirmState] = useState<{
      message: string;
      resolve: (ok: boolean) => void;
    } | null>(null);
  // Styled stand-in for window.confirm. Same await-a-boolean shape, so every
  // caller keeps its existing control flow. Only one dialog can be pending at
  // a time — setConfirmState would silently replace an earlier unresolved
  // one otherwise, stranding whichever caller was waiting on it forever.
  const confirmStateRef = useRef(confirmState);
  confirmStateRef.current = confirmState;
  const confirmAsync = (message: string) => {
    if (confirmStateRef.current) confirmStateRef.current.resolve(false);
    return new Promise<boolean>((resolve) => setConfirmState({ message, resolve }));
  };
  // `load` is passed straight to onClick and setInterval, so it has to stay
  // zero-argument — the current view rides along in a ref instead.
  const viewRef = useRef(view);
  // Only the newest load may write: a slow 60s poll that lands after an
  // upload's refresh would otherwise put the old data back.
  const loadSeq = useRef(0);
  // Called as load() from buttons and after saves, or as load({ silent: true })
  // by the 60s poll, which refreshes quietly instead of flashing the badge.
  const load = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    const seq = ++loadSeq.current;
    if (!silent) setLoading(true);
    try {
      const r = await fetch(`/api/dashboard?view=${viewRef.current}`, {
          cache: "no-store",
        }),
        x: any = await r.json();
      if (seq !== loadSeq.current) return;
      if (r.status === 401) {
        setData(null);
        setLoadedViews([]);
        setAuthNeeded(true);
      } else if (x.error) setNotice(x.error);
      else {
        // Merge, don't replace: the response only carries the requested
        // view's extra keys, so this keeps other views' already-loaded data.
        setData((prev) => ({ ...EMPTY_DATA, ...(prev ?? {}), ...x }));
        setLoadedViews((prev) =>
          prev.includes(x.view) ? prev : [...prev, x.view],
        );
        setAuthNeeded(false);
      }
    } catch {
      if (seq === loadSeq.current && !silent) setNotice("เชื่อมต่อระบบไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };
  // Once signed in, fetch the pages people open most in the background, so
  // the first switch to them is instant too.
  const prefetched = useRef(false);
  useEffect(() => {
    if (!data || prefetched.current) return;
    prefetched.current = true;
    const timer = window.setTimeout(async () => {
      for (const v of ["score", "party", "mine"]) {
        if (seenViews.current.includes(v)) continue;
        try {
          const r = await fetch(`/api/dashboard?view=${v}`, { cache: "no-store" });
          if (!r.ok) return;
          const x: any = await r.json();
          if (x.error || x.view !== v) continue;
          // Only the page's own keys: the shared ones may be newer already.
          setData((prev) => (prev ? { ...x, ...prev, ...Object.fromEntries(Object.entries(x).filter(([k]) => !(k in prev) || (EMPTY_DATA as any)[k] === (prev as any)[k])) } : prev));
          setLoadedViews((prev) => (prev.includes(v) ? prev : [...prev, v]));
        } catch {
          return;
        }
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [Boolean(data)]);
  // A page seen before shows straight away and refreshes quietly behind;
  // only a first visit shows the loading state.
  const seenViews = useRef<string[]>([]);
  seenViews.current = loadedViews;
  useEffect(() => {
    viewRef.current = view;
    load({ silent: seenViews.current.includes(view) });
  }, [view]);
  useEffect(() => {
    const timer = window.setInterval(() => load({ silent: true }), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const id = "loading-indicator";
    let el = document.getElementById(id);
    if (loading || busy) {
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.className = "loading-pill";
        el.setAttribute("role", "status");
        document.body.appendChild(el);
      }
      el.textContent = loading ? "กำลังโหลดข้อมูล…" : "กำลังบันทึกข้อมูล…";
    } else if (el) el.remove();
    return () => {
      document.getElementById(id)?.remove();
    };
  }, [loading, busy]);
  // Each round's evidence, on the date that round counts for: until 05:00 the
  // evening rounds are still last night's (a late 23:00 counts for it).
  const mine = useMemo(() => {
    if (!data) return new Map<any, any>();
    const hour = bangkokHour();
    return new Map(
      data.airdrops
        .filter((x: any) => x.activity_date === roundDate(x.round_time, data.date, hour))
        .map((x: any) => [x.round_time, x]),
    );
  }, [data]);
  // Open on the unsent round closest to the current Bangkok time, so the send
  // button is the next thing to do (at 00:50 that's 01:00, not 17:00). Only on
  // the first load: a later refresh — including the one that crosses midnight
  // — must never switch the round, which would also clear a chosen image.
  // Admins see the review queue in the browser tab title even when the app is
  // in a background tab; the 60s poll keeps it current.
  useEffect(() => {
    const n = data?.me.role === "admin" ? data.pendingCount || 0 : 0;
    document.title = n > 0
      ? `(${n}) 5000 Fivethousand`
      : "5000 Fivethousand";
  }, [data?.pendingCount, data?.me.role]);
  useEffect(() => {
    const message = new URLSearchParams(window.location.search).get("discord");
    if (message === null) return;
    setNotice(message === "unavailable" ? "ยังไม่ได้ตั้งค่าเข้าสู่ระบบด้วย Discord" : message || "เข้าสู่ระบบด้วย Discord แล้ว");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("fivek_discord_later")) setDiscordLater(true);
    } catch {}
  }, []);
  // Toasts clear themselves; longer messages stay up a little longer.
  useEffect(() => {
    if (!notice || !data) return;
    const timer = window.setTimeout(() => setNotice(""), Math.max(5000, notice.length * 80));
    return () => window.clearTimeout(timer);
  }, [notice, Boolean(data)]);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("claim")) return;
    window.history.replaceState(null, "", window.location.pathname);
    fetch("/api/auth/discord", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "claim_options" }),
    })
      .then((r) => r.json())
      .then((x: any) => {
        if (x.error) setNotice(x.error);
        else if (x.ok) void load(); // already linked (another tab)
        else setClaim(x);
      })
      .catch(() => setNotice("เชื่อมต่อไม่สำเร็จ ลองเข้าสู่ระบบด้วย Discord อีกครั้ง"));
  }, []);
  // ?review=<type>-<id> from a Discord card: kept in sessionStorage so it
  // survives signing in first, then opened on the admin page.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("review");
    let target = fromUrl && /^(airdrop|party)-[0-9]+$/.test(fromUrl) ? fromUrl : "";
    try {
      if (target) sessionStorage.setItem("fivek_review", target);
      else target = sessionStorage.getItem("fivek_review") || "";
    } catch {}
    if (fromUrl) window.history.replaceState(null, "", window.location.pathname);
    if (target) setReviewTarget(target);
  }, []);
  useEffect(() => {
    if (!reviewTarget || !data) return;
    if (data.me.role !== "admin") {
      setReviewTarget("");
      try { sessionStorage.removeItem("fivek_review"); } catch {}
      return;
    }
    if (view !== "admin") setView("admin");
  }, [reviewTarget, Boolean(data), data?.me.role]);
  // The 3D scene centres the emblem on the sign-in / loading screens and gives
  // it its own spot on each page of the app.
  useEffect(() => {
    document.documentElement.dataset.sceneMode = data ? view : "login";
  }, [Boolean(data), view]);
  // Cards marked .tilt lean a few degrees towards the mouse, with a soft glare
  // (desktop mice only, never for reduced motion).
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    // Reduced-motion screens get it only while the 3D layer is set to move.
    const allowed = () => !prefersLessMotion() || document.documentElement.dataset.sceneMotion === "full";
    let active: HTMLElement | null = null;
    const reset = (el: HTMLElement) => {
      for (const name of ["--rx", "--ry", "--gx", "--gy"]) el.style.removeProperty(name);
    };
    const onMove = (event: PointerEvent) => {
      const el = allowed() ? ((event.target as Element | null)?.closest?.(".tilt") as HTMLElement | null) : null;
      if (active && active !== el) reset(active);
      active = el;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      el.style.setProperty("--rx", `${((0.5 - y) * 6).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${((x - 0.5) * 8).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    };
    const onLeave = () => {
      if (active) reset(active);
      active = null;
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  useEffect(() => {
    const onOpen = (event: Event) => setProfileId(String((event as CustomEvent).detail));
    window.addEventListener("fivek-profile", onOpen);
    return () => window.removeEventListener("fivek-profile", onOpen);
  }, []);
  // Celebrate milestones reached since the last refresh (never on first load,
  // so reopening the site doesn't replay them).
  const milestones = useRef<{ rounds: number; team: number; rank: number | null; score: number } | null>(null);
  useEffect(() => {
    if (!data) return;
    const now = {
      rounds: ROUNDS.filter((r) => mine.get(r)?.status === "approved").length,
      team: data.team?.mine?.today ?? 0,
      rank: data.me.monthRank,
      score: Number(data.me.monthScore || 0),
    };
    const before = milestones.current;
    milestones.current = now;
    if (!before) return;
    // Points went up since the last refresh (an approval landed): coins.
    if (now.score > before.score) playFx("coins", now.score - before.score);
    const perDay = data.team?.perDay ?? 9;
    if (now.rounds === ROUNDS.length && before.rounds < ROUNDS.length)
      setCelebration("ส่งครบ 4 รอบวันนี้แล้ว!");
    else if (data.team?.mine && now.team >= perDay && before.team < perDay)
      setCelebration(`คะแนนทีมครบ ${perDay} แล้ววันนี้!`);
    else if (now.rank && before.rank && now.rank < before.rank)
      setCelebration(`ขึ้นเป็นอันดับ #${now.rank} ของเดือน!`);
  }, [data, mine]);
  const autoRoundDone = useRef(false);
  useEffect(() => {
    if (!data || autoRoundDone.current) return;
    autoRoundDone.current = true;
    const [h, m] = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date())
      .split(":")
      .map(Number);
    const now = h * 60 + m;
    const distance = (r: Round) => {
      const [rh, rm] = r.split(":").map(Number);
      const d = Math.abs(rh * 60 + rm - now);
      return Math.min(d, 1440 - d);
    };
    const byTime = [...ROUNDS].sort((a, b) => distance(a) - distance(b));
    const next =
      byTime.find((r) => !mine.get(r)) ||
      byTime.find((r) => mine.get(r)?.status !== "approved");
    if (next) setRound(next);
  }, [data, mine]);
  const confirmationMessage = (body: any) => {
    const action = body.action;
    const messages: Record<string, string> = {
      favorite: body.enabled
        ? "ยืนยันเพิ่มสมาชิกคนนี้เป็นรายการโปรดใช่หรือไม่?"
        : "ยืนยันนำสมาชิกคนนี้ออกจากรายการโปรดใช่หรือไม่?",
      approve: "ยืนยันอนุมัติหลักฐานนี้และเพิ่มคะแนนให้สมาชิกใช่หรือไม่?",
      reject: "ยืนยันว่าไม่ผ่านหลักฐานนี้ใช่หรือไม่? สมาชิกจะต้องส่งหลักฐานใหม่",
      member: `ยืนยันเพิ่มสมาชิกใหม่ชื่อ “${body.name}” ใช่หรือไม่?`,
      member_update: `ตรวจสอบชื่อก่อนบันทึก\n\nยืนยันเปลี่ยนชื่อเป็น “${body.name}” ใช่หรือไม่?`,
      member_delete: "ยืนยันเอาสมาชิกนี้ออกจากแก๊งใช่หรือไม่? สมาชิกจะออกจากระบบทันทีและจะไม่แสดงในรายชื่ออีก",
      member_discord_unlink: `ยืนยันยกเลิกผูก Discord ของ “${body.name}” ใช่หรือไม่?\n\nคนที่ใช้บัญชีนี้อยู่จะถูกออกจากระบบ แล้วเจ้าของตัวจริงเข้าด้วย Discord และเลือกชื่อนี้ใหม่ได้`,
      member_reactivate: `ยืนยันเอา “${body.name}” กลับเข้าแก๊งใช่หรือไม่? แต้มและประวัติเดิมจะกลับมาด้วย`,
      admin_party_dissolve: `ยืนยันยุบปาร์ตี้ “${body.name}” ใช่หรือไม่? สมาชิกทุกคนจะออกจากทีมทันที`,
      admin_party_remove_member: `ยืนยันนำ “${body.name}” ออกจากปาร์ตี้ “${body.partyName}” ใช่หรือไม่? ถ้าเป็นหัวหน้า ตำแหน่งจะส่งต่อให้สมาชิกคนถัดไป`,
      points_adjust: `ยืนยัน${Number(body.points) > 0 ? "เพิ่ม" : "หัก"} ${Math.abs(Number(body.points))} แต้ม ${Number(body.points) > 0 ? "ให้" : "จาก"} “${body.name}” ใช่หรือไม่?\n\nเหตุผล: ${body.reason}${body.shops ? `\nงัดร้านผ่านครบ ${body.shops} ร้าน ระบบคืน ${Math.abs(Number(body.points))} แต้มให้อัตโนมัติ` : ""}`,
      points_undo:
        body.source === "adjustment"
          ? `ยืนยันยกเลิกการปรับแต้มของ “${body.names}” ใช่หรือไม่?`
          : `ยืนยันยกเลิกการอนุมัตินี้ใช่หรือไม่?\n\nแต้มของ ${body.names} จะถูกดึงคืน และรายการจะเปลี่ยนเป็น “ไม่ผ่าน” (ย้อนกลับไปรอตรวจไม่ได้ เพราะรูปหลักฐานถูกลบไปแล้ว)`,
      leave_delete: `ยืนยันลบรายการลาของ “${body.name}” วันที่ ${body.date} ใช่หรือไม่?`,
      admin_access: body.enabled
        ? "ยืนยันเพิ่มสิทธิ์แอดมินให้สมาชิกนี้ใช่หรือไม่?"
        : "ยืนยันถอนสิทธิ์แอดมินของสมาชิกนี้ใช่หรือไม่?",
      party_create: `ยืนยันสร้างปาร์ตี้ “${body.name}” และเพิ่มสมาชิกที่เลือกเข้าทีมทันทีใช่หรือไม่?`,
      party_update: `ยืนยันเปลี่ยนชื่อปาร์ตี้เป็น “${body.name}” ใช่หรือไม่?`,
      party_lock: "ยืนยันล็อกปาร์ตี้ใช่หรือไม่? หลังล็อกจะไม่รับสมาชิกเพิ่ม",
      party_leave: "ยืนยันออกจากปาร์ตี้ใช่หรือไม่?",
      party_remove_member: "ยืนยันนำสมาชิกคนนี้ออกจากปาร์ตี้ใช่หรือไม่?",
      party_invite: "ยืนยันเพิ่มสมาชิกคนนี้เข้าปาร์ตี้ทันทีใช่หรือไม่?",
      party_join: "ยืนยันเข้าร่วมปาร์ตี้นี้ใช่หรือไม่?",
      party_respond: body.accept
        ? "ยืนยันรับคำเชิญและเข้าร่วมปาร์ตี้ใช่หรือไม่?"
        : "ยืนยันปฏิเสธคำเชิญปาร์ตี้ใช่หรือไม่?",
      party_dissolve: "ยืนยันยุบปาร์ตี้ใช่หรือไม่? การดำเนินการนี้ย้อนกลับไม่ได้",
      leave_request: "ยืนยันบันทึกการแจ้งลานี้ใช่หรือไม่?",
    };
    return messages[action] || "ยืนยันดำเนินการนี้ใช่หรือไม่?";
  };
  const call = async (body: any) => {
    if (!body.confirmed && !(await confirmAsync(confirmationMessage(body))))
      return false;
    const { confirmed: _confirmed, ...payload } = body;
    setBusy(true);
    try {
      const r = await fetch(
          payload.action.startsWith("party_") ? "/api/party" : "/api/dashboard",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        ),
        x: any = await r.json();
      setNotice(x.error || x.notice || "บันทึกแล้ว");
      if (!x.error) {
        await load();
        return true;
      }
      return false;
    } catch {
      setNotice("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
      return false;
    } finally {
      setBusy(false);
    }
  };
  // Airdrop evidence for the selected round (team evidence is sent from the
  // team page).
  const sendAirdrop = async (event: FormEvent) => {
    event.preventDefault();
    if (!image) return setNotice("กรุณาเลือกรูปหลักฐาน");
    if (!(await confirmAsync(`ยืนยันส่งหลักฐานแอร์ดรอปรอบ ${round} เข้าคิวตรวจใช่หรือไม่?`))) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("type", "airdrop");
      form.append("image", await shrinkImage(image));
      form.append("round", round);
      const r = await fetch("/api/upload", { method: "POST", body: form }),
        x: any = await uploadResult(r);
      setNotice(x.error || x.notice || "ส่งเข้าคิวตรวจแล้ว");
      if (!x.error) {
        playFx("airdrop");
        setImage(null);
        setPickerReset((value) => value + 1);
        await load();
      }
    } catch (error) {
      setNotice(
        error instanceof Error && error.name === "ImageError"
          ? error.message
          : "ส่งรูปไม่สำเร็จ ลองใหม่อีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    loadSeq.current++; // drop any load still in flight for this account
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {}
    try {
      sessionStorage.removeItem("fivek_discord_later");
    } catch {}
    setData(null);
    setLoadedViews([]);
    setView("airdrop");
    viewRef.current = "airdrop";
    autoRoundDone.current = false;
    setDiscordLater(false);
    setNotice("");
    setLoading(false);
    setAuthNeeded(true);
  };
  // A short brush stroke sound on the main (red) buttons, when sound is on.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.(".ui-btn--primary");
      if (button && !(button as HTMLButtonElement).disabled) brush();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  if (claim)
    return (
      <ClaimScreen
        claim={claim}
        onCancel={() => setClaim(null)}
        onDone={() => {
          setClaim(null);
          setNotice("");
          void load();
        }}
      />
    );
  if (!data && authNeeded)
    return (
      <main className="login-stage">
        <section className="auth-card">
          <img src="/art/5000.svg" alt="5000 Fivethousand" className="auth-logo" width={2054} height={1178} />
          <p className="ui-eyebrow">COMMAND CENTER · แก๊ง 5000</p>
          <h1 className="auth-title">เข้าสู่ระบบแก๊ง</h1>
          <p className="auth-lead">
            เข้าด้วยบัญชี Discord ของคุณ
            <br />
            ครั้งแรกจะให้เลือกชื่อของคุณในแก๊ง
          </p>
          <a href="/api/auth/discord" className="discord-btn mt-6">
            <DiscordMark />
            เข้าสู่ระบบด้วย Discord
          </a>
          {notice && <p className="mt-4 text-sm text-[var(--ui-text)]">{notice}</p>}
          <div className="auth-steps" aria-hidden="true">
            <span>
              <Upload />
              ส่งหลักฐาน
            </span>
            <span>
              <Users />
              ทำทีม
            </span>
            <span>
              <Trophy />
              ขึ้นอันดับ
            </span>
          </div>
        </section>
        <SceneToggle className="scene-toggle--corner" />
      </main>
    );
  if (!data && (loading || !notice))
    return (
      // While the first load is in flight the 5000 logo is painted in, stroke
      // by stroke, with a red brush sweep under it.
      <main className="boot" aria-busy="true" aria-label="กำลังเปิดศูนย์บัญชาการ">
        <div className="boot__mark">
          <img src="/art/5000.svg" alt="5000 Fivethousand" className="boot__logo" width={2054} height={1178} />
          <span className="boot__sweep" aria-hidden="true" />
        </div>
        <p className="boot__label">กำลังเปิดศูนย์บัญชาการ…</p>
      </main>
    );
  if (!data)
    return (
      <main className="login-stage">
        <section className="auth-card">
          <h1 className="auth-title">ยังเปิดข้อมูลไม่ได้</h1>
          <p className="auth-lead">{notice || "ลองเชื่อมต่ออีกครั้ง"}</p>
          <button onClick={() => load()} className="ui-btn ui-btn--primary ui-btn--block mt-6">
            ลองใหม่
          </button>
        </section>
      </main>
    );
  const members = [...data.members].sort(
    (a, b) =>
      Number(Boolean(b.online)) - Number(Boolean(a.online)) ||
      Number(data.favorites.includes(b.id)) -
        Number(data.favorites.includes(a.id)) ||
      a.display_name.localeCompare(b.display_name),
  );
  // Three daily destinations stay one tap away; everything occasional lives
  // under "เพิ่มเติม" so the phone bar never grows past four slots.
  const mainNav: [string, string, any][] = [
    ["airdrop", "ภารกิจ", Crosshair],
    ["party", "ทีม", Users],
    ["score", "อันดับ", Trophy],
  ];
  // จัดการแก๊ง is admin-only, so it shouldn't appear for everyone else — the
  // view itself already refuses non-admins.
  const moreNav: [string, string, any, string][] = (
    [
      ["summary", "สรุป", LayoutDashboard, "ภาพรวมแก๊ง ผลรายเดือน และงานที่แอดมินต้องตาม"],
      ["leave", "ห้องลา", CalendarOff, "แจ้งลาและดูประวัติการลา"],
      ["mine", "แต้มของฉัน", BarChart3, "แต้มรายวัน แยกว่าได้จากอะไร โดนหักเท่าไหร่"],
      ["log", "ประวัติการส่ง", History, "หลักฐานที่ส่งทั้งหมดและผลตรวจ"],
      ["admin", "จัดการแก๊ง", ShieldCheck, "ตรวจหลักฐาน สมาชิก ปาร์ตี้ แต้ม"],
    ] as [string, string, any, string][]
  ).filter(([id]) => id !== "admin" || data.me.role === "admin");
  const inMore = view === "more" || moreNav.some(([id]) => id === view);
  // Each page's own heading in the top bar.
  const today = new Date(`${data.date}T00:00:00Z`).toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const PAGE_META: Record<string, [string, string]> = {
    airdrop: ["ภารกิจวันนี้", `สวัสดี ${data.me.name} · ${today}`],
    party: ["ทีม", "จัดทีม ส่งหลักฐานงัดร้านและลูป"],
    score: ["อันดับ", "ตารางคะแนนของแก๊ง"],
    summary: ["สรุป", `ภาพรวมของแก๊ง · ${today}`],
    leave: ["ห้องลา", "แจ้งลาล่วงหน้า และดูประวัติการลา"],
    mine: ["แต้มของฉัน", "แต้มรายวัน แยกว่าได้จากอะไร โดนหักเท่าไหร่"],
    log: ["ประวัติการส่ง", "หลักฐานที่ส่งทั้งหมดและผลตรวจ"],
    admin: ["จัดการแก๊ง", "ตรวจหลักฐาน สมาชิก ทีม แต้ม และการลา"],
    more: ["เพิ่มเติม", "ทุกเมนูของแก๊ง"],
  };
  const [pageTitle, pageSub] = PAGE_META[view] || PAGE_META.airdrop;
  // Each page's own 3D icon beside its heading.
  const rankTone = (rank?: number | null) =>
    rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : rank && rank <= 10 ? "red" : "steel";
  const PAGE_ICONS: Record<string, { kind: Parameters<typeof Widget3D>[0]["kind"]; args?: Parameters<typeof Widget3D>[0]["args"] }> = {
    airdrop: { kind: "crate", args: { chute: false } },
    party: { kind: "squad", args: { filled: data.myParty?.members?.length || 0 } },
    score: { kind: "trophy", args: { tone: rankTone(data.me.monthRank) } },
    summary: { kind: "trophy", args: { tone: "gold" } },
    leave: { kind: "calendar", args: { date: data.date } },
    mine: { kind: "coins" },
    log: { kind: "clipboard" },
    admin: { kind: "shield" },
    more: { kind: "badge" },
  };
  const pageIcon = PAGE_ICONS[view] || PAGE_ICONS.airdrop;
  const pendingCount = data.me.role === "admin" ? data.pendingCount || 0 : 0;
  const pendingBadge = pendingCount > 0 && (
    <span className="nav-badge" aria-label={`รอตรวจ ${pendingCount} รายการ`}>
      {pendingCount > 99 ? "99+" : pendingCount}
    </span>
  );
  return (
    <main className="command-shell">
      <WidgetStage />
      <div className="command-desktop">
        {/* No fixed width: the grid tracks on .command-desktop own the column
            widths, and a hard w-* here overflows its track and covers the
            content column. */}
        <aside className="command-sidebar" aria-label="เมนู">
          <div className="side-brand">
            <Widget3D
              kind="badge"
              className="side-brand__badge"
              fallback={<img src="/art/5000.svg" alt="5000 Fivethousand" className="side-brand__mark" />}
            />
            <div className="side-brand__text">
              <b>COMMAND</b>
              <span>CENTER</span>
            </div>
          </div>
          <nav className="side-nav" aria-label="เมนูหลัก">
            {mainNav.map(([id, label, Icon]: any) => (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-current={view === id ? "page" : undefined}
                className="side-nav__item"
              >
                <Icon />
                {label}
              </button>
            ))}
            <hr className="side-nav__divider" aria-hidden="true" />
            {moreNav.map(([id, label, Icon]: any) => (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-current={view === id ? "page" : undefined}
                className="side-nav__item"
              >
                <Icon />
                {label}
                {id === "admin" && pendingBadge}
              </button>
            ))}
            {!data.me.discordLinked && (
              <a href="/api/auth/discord?mode=link" className="side-nav__item side-nav__item--discord">
                <DiscordMark />
                เชื่อม Discord
              </a>
            )}
          </nav>
          {/* Who's signed in, pinned to the bottom, with sign-out. */}
          <div className="side-foot">
            <SceneToggle />
            <div className="side-user">
              <Avatar url={data.avatars?.[String(data.me.id)]} name={data.me.name} size={36} />
              <div className="side-user__text">
                <b>{data.me.name}</b>
                <span>{data.me.role === "admin" ? "แอดมิน" : "สมาชิก"}</span>
              </div>
              <button type="button" onClick={logout} className="icon-btn" aria-label="ออกจากระบบ" title="ออกจากระบบ">
                <LogOut />
              </button>
            </div>
          </div>
        </aside>
        <section className="main-col min-w-0 flex-1">
          <header className="topbar">
            <img src="/art/5000.svg" alt="5000" className="topbar__logo" />
            <Widget3D key={view} kind={pageIcon.kind} args={pageIcon.args} className="topbar__icon" />
            <div className="topbar__heading">
              <h1 className="topbar__title">{pageTitle}</h1>
              <p className="topbar__sub">{pageSub}</p>
            </div>
            <div className={`topbar-stats ${view === "airdrop" ? "topbar-stats--home" : ""}`}>
              <button type="button" onClick={() => setView("mine")} className="topbar-stat">
                <b>
                  <CountUp value={data.me.monthScore} />
                </b>
                <span>แต้มเดือนนี้</span>
              </button>
              <button type="button" onClick={() => setView("score")} className="topbar-stat topbar-stat--extra">
                <b>{data.me.monthRank ? `#${data.me.monthRank}` : "—"}</b>
                <span>อันดับ</span>
              </button>
              {data.team?.mine && (
                <button type="button" onClick={() => setView("party")} className="topbar-stat topbar-stat--extra">
                  <b>
                    {data.team.mine.today}/{data.team.perDay}
                  </b>
                  <span>ทีมวันนี้</span>
                  <Meter value={data.team.mine.today} max={data.team.perDay} label="คะแนนทีมวันนี้" />
                </button>
              )}
              {(data.myPenalties || []).slice(0, 1).map((penalty: any) => (
                <button key={penalty.id} type="button" onClick={() => setView("mine")} className="topbar-stat topbar-stat--extra topbar-stat--warn">
                  <b>
                    {penalty.done}/{penalty.shops}
                  </b>
                  <span>งัดร้านคืน {penalty.points} แต้ม</span>
                </button>
              ))}
              {data.team?.mine && data.team.mine.debt > 0 && (
                <button type="button" onClick={() => setView("mine")} className="topbar-stat topbar-stat--extra topbar-stat--warn">
                  <b>{data.team.mine.debt}</b>
                  <span>ขาดทีมเดือนนี้</span>
                </button>
              )}
            </div>
            <button onClick={() => load()} aria-label="รีเฟรชข้อมูล" title="รีเฟรชข้อมูล" className="icon-btn">
              <RefreshCw />
            </button>
          </header>
          {!data.me.discordLinked && !discordLater && (
            <div className="link-discord">
              <span className="link-discord__icon">
                <DiscordMark />
              </span>
              <div className="min-w-0 flex-1">
                <p className="link-discord__title">ผูกบัญชี Discord ของคุณ</p>
                <p className="link-discord__sub">
                  เว็บเข้าด้วย Discord อย่างเดียวแล้ว · ถ้าไม่ผูก ออกจากระบบแล้วจะเข้าบัญชีนี้ไม่ได้ และส่งหลักฐาน/แจ้งลาไม่ได้
                </p>
              </div>
              <div className="link-discord__actions">
                <a href="/api/auth/discord?mode=link" className="discord-btn discord-btn--sm">
                  ผูกเลย
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setDiscordLater(true);
                    try {
                      sessionStorage.setItem("fivek_discord_later", "1");
                    } catch {}
                  }}
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                >
                  ไว้ทีหลัง
                </button>
              </div>
            </div>
          )}
          {view === "airdrop" && (
            <div className="home-dash">
            <MissionCard
              data={data}
              round={round}
              setRound={setRound}
              mine={mine}
              busy={busy}
              image={image}
              setImage={setImage}
              pickerReset={pickerReset}
              onSubmit={sendAirdrop}
              onBatchDone={(message, sent) => {
                setNotice(message);
                if (sent) {
                  playFx("airdrop");
                  void load();
                }
              }}
            />
            <div className="home-stats">
              <button
                type="button"
                onClick={() => setView("party")}
                className="hud-tile hud-tile--wide tilt"
              >
                <span className="ui-eyebrow">คะแนนทีมวันนี้</span>
                {data.team?.mine && !data.myParty ? (
                  // No team = no way to earn team points: the one thing to do.
                  <>
                    <b className="hud-tile__value hud-tile__value--text">ยังไม่มีทีม</b>
                    <span className="hud-tile__sub">ต้องมีทีมก่อนถึงจะส่งงัดร้าน/ลูปได้ · ทีมคนเดียวก็ได้</span>
                    <span className="tile-cta">สร้างหรือเข้าทีม →</span>
                    {data.team.mine.debt > 0 && (
                      <span className="hud-tile__warn">
                        เดือนนี้ขาด {data.team.mine.debt} คะแนน · ถูกหักไป {data.team.mine.debt * data.team.penalty} แต้ม
                      </span>
                    )}
                  </>
                ) : data.team?.mine ? (
                  <>
                    <span className="tile-ring-row">
                      <Ring value={data.team.mine.today} max={data.team.perDay} />
                      <span className="tile-ring-row__text">
                        <span className="hud-tile__sub">
                          {data.team.mine.neededToday > 0
                            ? `ต้องได้อีก ${data.team.mine.neededToday} คะแนนก่อนจบวัน · งัดร้าน +${data.team.points.shop} ลูป +${data.team.points.loop}`
                            : data.team.mine.today > data.team.perDay
                              ? `ครบแล้ว · ส่วนที่เกินเก็บไว้ชดวันอื่นในเดือนนี้`
                              : "ครบแล้ววันนี้"}
                        </span>
                        {data.team.mine.debt > 0 && (
                          <span className="hud-tile__warn">
                            เดือนนี้ขาด {data.team.mine.debt} คะแนน · ถูกหักไป {data.team.mine.debt * data.team.penalty} แต้ม
                          </span>
                        )}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <b className="hud-tile__value hud-tile__value--text">
                      ขั้นต่ำวันละ {data.team?.perDay ?? 9} คะแนน
                    </b>
                    <span className="hud-tile__sub">
                      {data.team && data.date < data.team.start
                        ? `เริ่ม ${Number(data.team.start.slice(8))}/${Number(data.team.start.slice(5, 7))} · งัดร้าน +${data.team.points.shop} ลูป +${data.team.points.loop} แอร์ดรอป +${data.team.points.airdrop} · ขาดแต้มละ ${data.team.penalty}`
                        : `งัดร้าน +${data.team?.points.shop ?? 3} · ลูป +${data.team?.points.loop ?? 1}`}
                    </span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setView("score")}
                className="hud-tile tilt"
              >
                <Widget3D kind="trophy" args={{ tone: rankTone(data.me.monthRank) }} className="hud-tile__3d" />
                <span className="ui-eyebrow">อันดับเดือนนี้</span>
                {data.me.monthRank ? (
                  <b
                    className={`rank-badge rank-badge--${
                      data.me.monthRank === 1
                        ? "gold"
                        : data.me.monthRank === 2
                          ? "silver"
                          : data.me.monthRank === 3
                            ? "bronze"
                            : data.me.monthRank <= 10
                              ? "top"
                              : "base"
                    }`}
                  >
                    #<CountUp value={data.me.monthRank} />
                  </b>
                ) : (
                  <b className="hud-tile__value">—</b>
                )}
                <span className="hud-tile__sub">
                  {data.me.monthRank
                    ? `${data.me.monthScore} แต้ม`
                    : "ยังไม่มีแต้มเดือนนี้"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setView("party")}
                className="hud-tile tilt"
              >
                <Widget3D kind="squad" args={{ filled: data.myParty?.members?.length || 0 }} className="hud-tile__3d" />
                <span className="ui-eyebrow">ทีมของคุณ</span>
                <b className="hud-tile__value hud-tile__value--text">
                  {data.myParty?.name || "＋ สร้างทีม"}
                </b>
                <span className="hud-tile__sub">
                  {data.myParty
                    ? `${data.myParty.members?.length || 0}/5 คน`
                    : "หรือเข้าร่วมทีมของเพื่อน"}
                </span>
              </button>
            </div>
            </div>
          )}
          {view === "more" && (
            <Panel label="MENU" flush>
              {moreNav.map(([id, label, Icon, hint]) => (
                <Row
                  key={id}
                  inset={false}
                  onClick={() => setView(id)}
                  leading={
                    <span className="more-icon">
                      <Icon className="h-5 w-5" />
                    </span>
                  }
                  title={label}
                  subtitle={hint}
                  trailing={
                    <>
                      {id === "admin" && pendingBadge}
                      <ChevronRight className="h-4 w-4 text-[var(--ui-text-3)]" />
                    </>
                  }
                />
              ))}
              {!data.me.discordLinked && (
                <Row
                  inset={false}
                  href="/api/auth/discord?mode=link"
                  newTab={false}
                  leading={
                    <span className="more-icon">
                      <DiscordMark />
                    </span>
                  }
                  title="เชื่อม Discord"
                  subtitle="ต้องผูกก่อน ไม่งั้นออกจากระบบแล้วจะเข้าบัญชีนี้ไม่ได้"
                  trailing={<ChevronRight className="h-4 w-4 text-[var(--ui-text-3)]" />}
                />
              )}
              <Row
                inset={false}
                onClick={logout}
                leading={
                  <span className="more-icon">
                    <LogOut className="h-5 w-5" />
                  </span>
                }
                title="ออกจากระบบ"
                subtitle={`เข้าสู่ระบบในชื่อ ${data.me.name}`}
              />
              <div className="more-scene">
                <div>
                  <b>ฉากหลัง 3D</b>
                  <span>เคลื่อนไหวเต็มที่ · นิ่งไว้ประหยัดเครื่อง · หรือปิด</span>
                </div>
                <SceneToggle />
              </div>
            </Panel>
          )}
          {notice && (
            <div className="toast" role="status" aria-live="polite">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice("")} aria-label="ปิดข้อความ">
                ×
              </button>
            </div>
          )}
          {view === "airdrop" && (
            <AirdropHistory data={data} />
          )}
          {view === "party" &&
            (!loadedViews.includes("party") ? (
              <ViewLoading />
            ) : (
            <PartyCommandCenter
              data={data}
              members={members}
              call={call}
              busy={busy}
              onSubmit={async (ids, file, shopName, kind) => {
                if (
                  !(await confirmAsync(
                    `ยืนยันส่งหลักฐาน${kind === "loop" ? "ลูป" : "งัดร้าน"}ให้สมาชิก ${ids.length} คนเข้าคิวตรวจใช่หรือไม่?`,
                  ))
                )
                  return false;
                setBusy(true);
                try {
                  const form = new FormData();
                  form.append("type", "party");
                  form.append("image", await shrinkImage(file));
                  form.append("memberIds", JSON.stringify(ids));
                  form.append("kind", kind);
                  if (shopName) form.append("shopName", shopName);
                  const r = await fetch("/api/upload", {
                      method: "POST",
                      body: form,
                    }),
                    x: any = await uploadResult(r);
                  setNotice(x.error || "ส่งเข้าคิวตรวจแล้ว");
                  if (x.error) return false;
                  await load();
                  return true;
                } catch (error) {
                  setNotice(
                    error instanceof Error && error.name === "ImageError"
                      ? error.message
                      : "ส่งหลักฐานกิจกรรมไม่สำเร็จ ลองใหม่อีกครั้ง",
                  );
                  return false;
                } finally {
                  setBusy(false);
                }
              }}
            />
            ))}
          {view === "score" &&
            // Without this the monthly tab briefly (or, if the request fails,
            // permanently) showed all-time scores under a monthly title.
            (!loadedViews.includes("score") ? (
              <ViewLoading />
            ) : (
              <SquadRanking
                leaderboard={data.leaderboard}
                boards={data.boards}
                monthBoards={data.monthBoards}
                highlightId={data.me.id}
                avatars={data.avatars}
              />
            ))}
          {view === "admin" &&
            (data.me.role !== "admin" ? (
              <Panel>
                <EmptyState title="หน้านี้สำหรับแอดมินเท่านั้น" />
              </Panel>
            ) : !loadedViews.includes("admin") ? (
              <ViewLoading />
            ) : (
              <AdminCommandCenter
                data={data}
                call={call}
                busy={busy}
                reviewTarget={reviewTarget}
                onReviewTargetUsed={(found) => {
                  setReviewTarget("");
                  try { sessionStorage.removeItem("fivek_review"); } catch {}
                  if (!found) setNotice("รายการนี้ตรวจไปแล้ว");
                }}
              />
            ))}
          {view === "leave" &&
            (!loadedViews.includes("leave") ? (
              <ViewLoading />
            ) : (
              <LeaveRoom data={data} call={call} busy={busy} />
            ))}
          {view === "summary" &&
            (!loadedViews.includes("summary") ? (
              <ViewLoading />
            ) : (
              <GangSummary data={data} onGo={setView} />
            ))}
          {view === "mine" &&
            (!loadedViews.includes("mine") ? (
              <ViewLoading />
            ) : (
              <MyPoints data={data} />
            ))}
          {view === "log" &&
            (!loadedViews.includes("log") ? (
              <ViewLoading />
            ) : (
              <SubmissionLog data={data} />
            ))}
        </section>
        <aside className="command-rail" aria-label="สถานะแก๊ง">
          <Panel
            label="SQUAD STATUS"
            title="สถานะแก๊ง"
            subtitle={`${data.members.filter((m: any) => m.online).length}/${data.members.length} คนออนไลน์`}
            flush
          >
            <div className="rail-scroll">
              {!members.some((member: any) => member.online) && (
                <p className="px-4 py-3 text-sm text-[var(--ui-text-3)]">ไม่มีใครออนไลน์ตอนนี้</p>
              )}
              {members.filter((member: any) => member.online || showOffline).map((member: any) => (
                <Row
                  key={member.id}
                  inset={false}
                  leading={
                    <span className="avatar-status">
                      <Avatar url={data.avatars?.[String(member.id)]} name={member.display_name} size={28} />
                      <Dot tone={member.online ? "green" : "idle"} />
                    </span>
                  }
                  title={member.display_name}
                  trailing={
                    <span className="text-xs text-[var(--ui-text-3)]">
                      {member.online ? "ออนไลน์" : "ออฟไลน์"}
                    </span>
                  }
                />
              ))}
              {members.some((member: any) => !member.online) && (
                <button type="button" onClick={() => setShowOffline((v) => !v)} className="rail-toggle">
                  {showOffline
                    ? "ซ่อนคนออฟไลน์"
                    : `ดูคนออฟไลน์ ${members.filter((member: any) => !member.online).length} คน`}
                </button>
              )}
            </div>
          </Panel>
          {view !== "score" && (
            <SquadRanking leaderboard={data.monthTop} avatars={data.avatars} compact />
          )}
        </aside>
      </div>
      <nav className="bottom-nav" aria-label="เมนูหลัก">
        {[...mainNav, ["more", "เพิ่มเติม", LayoutGrid] as [string, string, any]].map(
          ([id, label, Icon]: any) => {
            const active = id === "more" ? inMore : view === id;
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-current={active ? "page" : undefined}
                className={`bottom-nav__item ${active ? "is-active" : ""}`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
                {id === "more" && pendingBadge}
              </button>
            );
          },
        )}
      </nav>
      {celebration && <Celebration message={celebration} onDone={() => setCelebration("")} />}
      {profileId && <ProfileDialog id={profileId} data={data} onClose={() => setProfileId(null)} />}
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          busy={busy}
          onResolve={(ok) => {
            confirmState.resolve(ok);
            setConfirmState(null);
          }}
        />
      )}
    </main>
  );
}
