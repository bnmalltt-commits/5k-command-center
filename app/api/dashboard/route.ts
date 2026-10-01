import { db, partyLock } from "@/lib/db";
import { leaveStatements } from "@/lib/party";
import { notifyApproval, notifyRejection, discordUserId, discordAvatarUrl, postCard } from "@/lib/notify";
import { pointsByDaySql, teamStatusSql, teamPointsByDaySql, pointsFor, TEAM_RULE_START, TEAM_PER_DAY, TEAM_PENALTY, KIND_POINTS, AIRDROP_POINTS } from "@/lib/points";
import { storage } from "@/lib/storage";
import { now, thaiDate, onlineSince, requireMember, requireAdmin, requireSam, json, sameId, discordLinked, NEEDS_DISCORD } from "@/lib/auth";

// Give the ~11 parallel queries this route fires room to finish instead of
// Vercel killing the function mid-flight, which would abandon their Postgres
// connections (they'd sit "active" on the server forever since nobody ever
// reads the response) and starve the connection pool for later requests.
export const maxDuration = 30;

const validType = (type: unknown) => {
  if (type !== "airdrop" && type !== "party") throw Error("ประเภทไม่ถูกต้อง");
  return type;
};

// Unique, never-reused id for a manual adjustment. MAX(source_id)+1 let two
// admins saving at once share an id (so one undo removed both) and reused an
// undone id, so a stale undo could delete someone else's newer adjustment.
// ms timestamp * 1000 + random stays under Number.MAX_SAFE_INTEGER.
const adjustmentId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

// First Bangkok date of today / this week (Monday), as YYYY-MM-DD so it
// compares directly against activity_date text.
function periodStarts(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(y, m - 1, d - weekday)).toISOString().slice(0, 10);
  return { day: today, week: monday };
}

// Every score read goes through pointsByDaySql (lib/points.ts): ledger points
// dated by the activity they reward, plus the derived team-quota penalty.
// Totals for a set of members, as {member_id, name, total}.
// Each member's points for one month ("YYYY-MM"), the same total the monthly
// ranking shows, so the Discord card matches what members see on the site.
async function totalsFor(memberIds: unknown[], today: string, month: string) {
  if (!memberIds.length) return [] as any[];
  return (await db.prepare(
    `SELECT m.id AS member_id,m.display_name AS name,m.external_user_id,COALESCE(SUM(x.points),0) AS total FROM members m LEFT JOIN (${pointsByDaySql(today)}) x ON x.member_id=m.id AND substr(x.day,1,7)=? WHERE m.id = ANY(?::bigint[]) GROUP BY m.id`
  ).bind(month, memberIds.map(Number)).all<any>()).results;
}

async function activeParty(memberId: number) {
  return db
    .prepare("SELECT p.id,p.name,p.status FROM parties p JOIN party_members pm ON pm.party_id=p.id WHERE pm.member_id=? AND p.status IN ('open','locked') LIMIT 1")
    .bind(memberId)
    .first<any>();
}

async function partyDetails(party: any) {
  if (!party) return null;
  const members = await db
    .prepare("SELECT m.id,m.display_name,m.role,CASE WHEN m.last_seen_at IS NOT NULL AND m.last_seen_at>=? THEN 1 ELSE 0 END AS online,pm.joined_at FROM party_members pm JOIN members m ON m.id=pm.member_id WHERE pm.party_id=? AND m.active=1 ORDER BY online DESC,pm.id")
    .bind(onlineSince(), party.id)
    .all();
  return { ...party, members: members.results };
}

// Which extra payload keys each view actually reads. Everything not listed
// here is "core" and ships on every request. The connection pool runs max: 1
// (the session pooler caps the project at 15), so these queries serialize —
// every query we skip is a round trip saved off the response time.
//
// NOTE: if a nav entry ever grows a badge count (e.g. "คำเชิญ (2)"), the key
// behind that count has to move into core, since it'd then be read from every
// view rather than only inside its own.
const VIEWS = ["airdrop", "party", "score", "admin", "leave", "log"] as const;
type View = (typeof VIEWS)[number];

export async function GET(request: Request) {
  try {
    const me = await requireMember(request), date = thaiDate();
    const POINTS_BY_DAY = pointsByDaySql(date);
    const requested = new URL(request.url).searchParams.get("view");
    const view: View = (VIEWS as readonly string[]).includes(requested || "")
      ? (requested as View)
      : "airdrop";
    const wants = {
      party: view === "party",
      admin: view === "admin" && me.role === "admin",
      leave: view === "leave",
      log: view === "log",
    };
    await db.prepare("UPDATE members SET last_seen_at=? WHERE id=?").bind(now(), me.id).run();
    const since = onlineSince();
    const empty = Promise.resolve({ results: [] as any[] });
    const [members, airdrops, parties, favorites, leaderboard, managed, partyBase, partyInvites, openParties, leaveRequests, submissionLog, score, pending] = await Promise.all([
      db.prepare("SELECT id,display_name,role,CASE WHEN last_seen_at IS NOT NULL AND last_seen_at>=? THEN 1 ELSE 0 END AS online FROM members WHERE active=1 ORDER BY online DESC,display_name").bind(since).all(),
      db.prepare("SELECT id,activity_date,round_time,status,image_key,created_at FROM airdrop_submissions WHERE member_id=? ORDER BY activity_date DESC,round_time DESC LIMIT 30").bind(me.id).all(),
      wants.party
        ? db.prepare("SELECT pa.id,pa.kind,pa.status,pa.image_key,pa.activity_date,pa.created_at,STRING_AGG(allm.display_name,' · ') AS members FROM party_activities pa JOIN party_activity_members mine ON mine.party_activity_id=pa.id AND mine.member_id=? JOIN party_activity_members allpam ON allpam.party_activity_id=pa.id JOIN members allm ON allm.id=allpam.member_id GROUP BY pa.id ORDER BY pa.created_at DESC LIMIT 30").bind(me.id).all()
        : empty,
      db.prepare("SELECT favorite_member_id FROM member_favorites WHERE owner_member_id=?").bind(me.id).all(),
      db.prepare(`SELECT m.id,m.display_name,CASE WHEN m.last_seen_at>=? THEN 1 ELSE 0 END AS online,COALESCE(SUM(pl.points),0) AS score FROM members m LEFT JOIN (${POINTS_BY_DAY}) pl ON pl.member_id=m.id WHERE m.active=1 GROUP BY m.id ORDER BY score DESC,m.display_name LIMIT 100`).bind(since).all(),
      wants.admin ? db.prepare("SELECT id,username,display_name,role,active,is_primary_admin,COALESCE(external_user_id LIKE 'discord:%',false) AS discord_linked FROM members ORDER BY active DESC,display_name").bind().all() : empty,
      db.prepare("SELECT p.id,p.name,p.status,p.owner_member_id,p.active,owner.display_name AS owner_name FROM parties p JOIN party_members mine ON mine.party_id=p.id AND mine.member_id=? LEFT JOIN members owner ON owner.id=p.owner_member_id WHERE p.status IN ('open','locked') ORDER BY p.id DESC LIMIT 1").bind(me.id).first(),
      wants.party
        ? db.prepare("SELECT i.id,i.party_id,i.created_at,p.name AS party_name,inviter.display_name AS inviter_name,COUNT(pm.id) AS member_count FROM party_invites i JOIN parties p ON p.id=i.party_id JOIN members inviter ON inviter.id=i.inviter_member_id LEFT JOIN party_members pm ON pm.party_id=i.party_id WHERE i.invitee_member_id=? AND i.status='pending' AND p.status='open' GROUP BY i.id,p.name,inviter.display_name").bind(me.id).all()
        : empty,
      wants.party
        ? db.prepare("SELECT p.id,p.name,p.owner_member_id,owner.display_name AS owner_name,COUNT(pm.id) AS member_count FROM parties p JOIN members owner ON owner.id=p.owner_member_id LEFT JOIN party_members pm ON pm.party_id=p.id WHERE p.status='open' AND p.active=1 GROUP BY p.id,p.name,p.owner_member_id,owner.display_name HAVING COUNT(pm.id)<5 ORDER BY p.id DESC LIMIT 20").bind().all()
        : empty,
      !wants.leave
        ? empty
        : me.role === "admin"
          ? db.prepare("SELECT l.id,l.leave_date,l.reason,l.created_at,m.display_name,creator.display_name AS created_by_name FROM leave_requests l JOIN members m ON m.id=l.member_id JOIN members creator ON creator.id=l.created_by ORDER BY l.leave_date DESC LIMIT 100").bind().all()
          : db.prepare("SELECT l.id,l.leave_date,l.reason,l.created_at,m.display_name,creator.display_name AS created_by_name FROM leave_requests l JOIN members m ON m.id=l.member_id JOIN members creator ON creator.id=l.created_by WHERE l.member_id=? ORDER BY l.leave_date DESC LIMIT 100").bind(me.id).all(),
      wants.log
        ? db.prepare("SELECT * FROM (SELECT 'airdrop' AS type,a.id,a.round_time AS detail,a.activity_date,a.status,a.created_at,a.image_key,m.display_name AS submitted_by,approver.display_name AS approved_by FROM airdrop_submissions a JOIN members m ON m.id=a.member_id LEFT JOIN members approver ON approver.id=a.approved_by UNION ALL SELECT 'party' AS type,pa.id,CASE pa.kind WHEN 'loop' THEN 'ลูป' ELSE 'งัดร้าน' END AS detail,pa.activity_date,pa.status,pa.created_at,pa.image_key,submitter.display_name AS submitted_by,approver.display_name AS approved_by FROM party_activities pa LEFT JOIN members submitter ON submitter.id=pa.submitted_by_member_id LEFT JOIN members approver ON approver.id=pa.approved_by) x ORDER BY created_at DESC LIMIT 300").bind().all()
        : empty,
      db.prepare(`SELECT COALESCE(SUM(points),0) AS total FROM (${POINTS_BY_DAY}) x WHERE member_id=?`).bind(me.id).first<any>(),
      wants.admin
        ? db.prepare("SELECT * FROM (SELECT 'airdrop' AS type,a.id,a.image_key,a.round_time AS detail,a.created_at,m.display_name AS submitted_by FROM airdrop_submissions a JOIN members m ON m.id=a.member_id WHERE a.status='pending' UNION ALL SELECT 'party' AS type,pa.id,pa.image_key,CASE pa.kind WHEN 'loop' THEN 'ลูป' ELSE COALESCE('งัดร้าน · '||sp.shop_name,'งัดร้าน') END AS detail,pa.created_at,submitter.display_name AS submitted_by FROM party_activities pa LEFT JOIN parties sp ON sp.id=pa.party_id LEFT JOIN members submitter ON submitter.id=pa.submitted_by_member_id WHERE pa.status='pending') x ORDER BY created_at DESC LIMIT 200").bind().all()
        : empty,
    ]);
    // Dependent on partyBase.id, so it can't join the batch above. It stays on
    // every request because myParty is core chrome (MissionControl reads it).
    const party = await partyDetails(partyBase);
    // Core, not admin-view-only: the nav badge is read from every view.
    const pendingCount = me.role === "admin"
      ? Number((await db.prepare("SELECT (SELECT COUNT(*) FROM airdrop_submissions WHERE status='pending')+(SELECT COUNT(*) FROM party_activities WHERE status='pending') AS n").bind().first<any>())?.n || 0)
      : undefined;
    // Last 7 Bangkok dates for the attendance tab, returned whole so picking a
    // day needs no extra request.
    const [ay, am, ad] = date.split("-").map(Number);
    const attendanceFrom = new Date(Date.UTC(ay, am - 1, ad - 6)).toISOString().slice(0, 10);
    const [attendance, attendanceLeaves, teamStatus, teamDays] = wants.admin
      ? await Promise.all([
          db.prepare("SELECT member_id,activity_date,round_time,status FROM airdrop_submissions WHERE activity_date>=?").bind(attendanceFrom).all(),
          db.prepare("SELECT member_id,leave_date FROM leave_requests WHERE leave_date>=? AND leave_date<=?").bind(attendanceFrom, date).all(),
          db.prepare(teamStatusSql(date)).bind().all(),
          db.prepare(teamPointsByDaySql(attendanceFrom)).bind().all(),
        ])
      : [null, null, null, null];
    // Discord avatars keyed by member id, for every list that shows people.
    const avatarRows = (await db.prepare("SELECT id,external_user_id,discord_avatar FROM members WHERE active=1 AND external_user_id LIKE 'discord:%'").bind().all<any>()).results;
    const avatars = Object.fromEntries(avatarRows.map((r: any) => [String(r.id), discordAvatarUrl(r.external_user_id, r.discord_avatar)]));
    // The member's own team-quota standing, for the home screen (null before
    // the rule starts or for a member it doesn't cover yet).
    const myTeam = await db.prepare(`SELECT * FROM (${teamStatusSql(date)}) s WHERE member_id=?`).bind(me.id).first<any>();
    const [adminParties, ledger, adminLeaves] = wants.admin
      ? await Promise.all([
          db.prepare("SELECT p.id,p.name,p.status,owner.display_name AS owner_name,COALESCE(json_agg(json_build_object('id',m.id,'name',m.display_name) ORDER BY pm.id) FILTER (WHERE m.id IS NOT NULL),'[]') AS members FROM parties p LEFT JOIN members owner ON owner.id=p.owner_member_id LEFT JOIN party_members pm ON pm.party_id=p.id LEFT JOIN members m ON m.id=pm.member_id WHERE p.status IN ('open','locked') GROUP BY p.id,owner.display_name ORDER BY p.id DESC").bind().all(),
          // One row per award: a party approval credits up to 5 people under the
          // same source_id, and undoing it has to take back all of them at once.
          db.prepare("SELECT pl.source,pl.source_id,MAX(pl.id) AS id,MAX(pl.points) AS points,MAX(pl.note) AS note,MAX(pl.created_at) AS created_at,STRING_AGG(m.display_name,' · ' ORDER BY m.display_name) AS names FROM point_ledger pl JOIN members m ON m.id=pl.member_id GROUP BY pl.source,pl.source_id ORDER BY MAX(pl.id) DESC LIMIT 60").bind().all(),
          db.prepare("SELECT l.id,l.leave_date,l.reason,m.display_name,creator.display_name AS created_by_name FROM leave_requests l JOIN members m ON m.id=l.member_id JOIN members creator ON creator.id=l.created_by ORDER BY l.leave_date DESC LIMIT 100").bind().all(),
        ])
      : [null, null, null];
    // Top 5 of the current month for the side rail, shown on every view.
    const monthTop = (await db.prepare(
      `SELECT m.id,m.display_name,CASE WHEN m.last_seen_at>=? THEN 1 ELSE 0 END AS online,SUM(x.points) AS score FROM (${POINTS_BY_DAY}) x JOIN members m ON m.id=x.member_id WHERE m.active=1 AND x.day>=? GROUP BY m.id ORDER BY score DESC,m.display_name LIMIT 5`
    ).bind(since, `${date.slice(0, 7)}-01`).all()).results;
    // The home screen headlines the user's own month: score and rank among
    // everyone who has scored this month (null rank until they score).
    const monthMe = await db.prepare(
      `WITH s AS (SELECT x.member_id,SUM(x.points) AS score FROM (${POINTS_BY_DAY}) x JOIN members m ON m.id=x.member_id WHERE m.active=1 AND x.day>=? GROUP BY x.member_id) SELECT (SELECT score FROM s WHERE member_id=?) AS score,(SELECT COUNT(*)+1 FROM s WHERE score>(SELECT score FROM s WHERE member_id=?)) AS rank`
    ).bind(`${date.slice(0, 7)}-01`, me.id, me.id).first<any>();
    let boards: Record<string, any[]> | null = null;
    let monthBoards: Record<string, any[]> | null = null;
    if (view === "score") {
      boards = Object.fromEntries(
        await Promise.all(
          (Object.entries(periodStarts(date)) as [string, string][]).map(async ([period, start]) => [
            period,
            (await db.prepare(
              `SELECT m.id,m.display_name,CASE WHEN m.last_seen_at>=? THEN 1 ELSE 0 END AS online,SUM(x.points) AS score FROM (${POINTS_BY_DAY}) x JOIN members m ON m.id=x.member_id WHERE m.active=1 AND x.day>=? GROUP BY m.id ORDER BY score DESC,m.display_name LIMIT 100`
            ).bind(since, start).all()).results,
          ]),
        ),
      );
      // Every month in one pass, so each month's ranking is kept once a new
      // month starts and switching months needs no extra request.
      const rows = (await db.prepare(
        `SELECT substr(x.day,1,7) AS month,m.id,m.display_name,CASE WHEN m.last_seen_at>=? THEN 1 ELSE 0 END AS online,SUM(x.points) AS score FROM (${POINTS_BY_DAY}) x JOIN members m ON m.id=x.member_id WHERE m.active=1 GROUP BY 1,m.id ORDER BY 1 DESC,score DESC,m.display_name`
      ).bind(since).all<any>()).results;
      monthBoards = { [date.slice(0, 7)]: [] };
      for (const { month, ...row } of rows) (monthBoards[month] ||= []).push(row);
    }
    // View-scoped keys are omitted (not sent as []) when they weren't asked
    // for, so the client can merge a response over what it already has
    // without a poll for one view wiping another view's loaded data.
    return json({
      view,
      me: {
        id: me.id,
        name: me.display_name,
        role: me.role,
        score: (score as any)?.total || 0,
        monthScore: Number(monthMe?.score || 0),
        monthRank: monthMe?.score == null ? null : Number(monthMe.rank),
        discordLinked: String(me.external_user_id || "").startsWith("discord:"),
      },
      date,
      members: members.results,
      airdrops: airdrops.results,
      favorites: favorites.results.map((x: any) => x.favorite_member_id),
      leaderboard: leaderboard.results,
      monthTop,
      avatars,
      team: {
        start: TEAM_RULE_START,
        perDay: TEAM_PER_DAY,
        penalty: TEAM_PENALTY,
        points: { ...KIND_POINTS, airdrop: AIRDROP_POINTS },
        mine: myTeam && {
          today: Number(myTeam.today),
          debt: Number(myTeam.debt),
          bank: Number(myTeam.bank),
          neededToday: Number(myTeam.needed_today),
        },
      },
      ...(pendingCount !== undefined && { pendingCount }),
      myParty: party,
      ...(wants.party && {
        parties: parties.results,
        partyInvites: partyInvites.results,
        openParties: openParties.results,
      }),
      ...(wants.admin && {
        managedMembers: managed.results,
        pending: pending.results,
        adminParties: adminParties!.results,
        ledger: ledger!.results,
        adminLeaves: adminLeaves!.results,
        attendance: attendance!.results,
        attendanceLeaves: attendanceLeaves!.results,
        teamStatus: teamStatus!.results,
        teamDays: teamDays!.results,
      }),
      ...(boards && { boards, monthBoards }),
      ...(wants.leave && { leaveRequests: leaveRequests.results }),
      ...(wants.log && { submissionLog: submissionLog.results }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ";
    return json({ error: message }, message.includes("เข้าสู่ระบบ") ? 401 : 500);
  }
}

export async function POST(request: Request) {
  try {
    const me = await requireMember(request), body = await request.json();
    if (body.action === "favorite") {
      const id = Number(body.memberId);
      if (!id || sameId(id, me.id)) throw Error("เลือกสมาชิกไม่ถูกต้อง");
      const target = await db.prepare("SELECT id FROM members WHERE id=? AND active=1").bind(id).first();
      if (!target) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
      if (body.enabled)
        await db.prepare("INSERT INTO member_favorites (owner_member_id,favorite_member_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING").bind(me.id, id, now()).run();
      else await db.prepare("DELETE FROM member_favorites WHERE owner_member_id=? AND favorite_member_id=?").bind(me.id, id).run();
      return json({ ok: true });
    }
    if (body.action === "approve") {
      const admin = await requireAdmin(request), type = validType(body.type), id = Number(body.id);
      const table = type === "party" ? "party_activities" : "airdrop_submissions";
      const recipients = type === "party"
        ? await db.prepare("SELECT member_id FROM party_activity_members WHERE party_activity_id=?").bind(id).all<any>()
        : { results: [await db.prepare("SELECT member_id FROM airdrop_submissions WHERE id=?").bind(id).first<any>()] };
      const credited = recipients.results.filter(Boolean);
      // Measured, not assumed: a party approval can also refund a team-quota
      // penalty, so "after - before" may exceed the points credited here. Read
      // before the status flips — an approved activity already counts toward
      // the quota, which would fold the refund into "before".
      const today = thaiDate();
      // Points count toward the month the activity happened in.
      const activity = await db.prepare(`SELECT activity_date${type === "party" ? ",kind" : ""} FROM ${table} WHERE id=?`).bind(id).first<any>();
      const month = String(activity?.activity_date || today).slice(0, 7);
      const points = pointsFor(type, activity?.kind, String(activity?.activity_date || today));
      const kindLabel = type === "party" ? (activity?.kind === "loop" ? "ลูป" : "งัดร้าน") : "แอร์ดรอป";
      const before = await totalsFor(credited.map((r: any) => r.member_id), today, month);
      const updated = await db.prepare(`UPDATE ${table} SET status='approved',approved_by=? WHERE id=? AND status='pending' RETURNING image_key,activity_date${type === "party" ? "" : ",round_time"}`).bind(admin.id, id).first<any>();
      if (!updated) throw Error("รายการนี้ตรวจไปแล้วหรือไม่พบข้อมูล");
      const inserted = await db.batch(
        credited.map((r: any) =>
          db.prepare("INSERT INTO point_ledger (member_id,source,source_id,points,note,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING")
            .bind(r.member_id, type, id, points, `${kindLabel}ตรวจผ่าน`, now())
        )
      );
      // The approval is committed; nothing in the Discord card may turn it into an error.
      try {
        await notifyApproval({
          kind: type === "party"
            ? `${kindLabel} · ${updated.activity_date}`
            : `แอร์ดรอปรอบ ${updated.round_time} · ${updated.activity_date}`,
          approvedBy: admin.display_name,
          month: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }),
          // Only people this approval actually credited.
          people: await (async () => {
            const ids = credited.filter((_: any, i: number) => inserted[i]?.meta.changes).map((r: any) => String(r.member_id));
            const after = await totalsFor(ids, today, month);
            return after
              .map((row: any) => ({
                name: row.name,
                discordId: discordUserId(row.external_user_id),
                before: Number(before.find((b: any) => String(b.member_id) === String(row.member_id))?.total || 0),
                after: Number(row.total),
              }))
              .sort((a: any, b: any) => a.name.localeCompare(b.name));
          })(),
          // Read before the delete below — this is the last moment the photo exists.
          loadImage: async () => {
            if (!updated.image_key) return null;
            const object = await storage.get(updated.image_key);
            if (!object) return null;
            return {
              blob: await new Response(object.body).blob(),
              ext: String(updated.image_key).split(".").pop() || "png",
            };
          },
        });
      } catch {}
      // Evidence is only needed until it's verified — delete it once approved
      // so storage doesn't fill up. Best-effort: never fail the approval over it.
      if (updated.image_key) await storage.delete(updated.image_key).catch(() => {});
      return json({ ok: true });
    }
    if (body.action === "reject") {
      const admin = await requireAdmin(request), type = validType(body.type), table = type === "party" ? "party_activities" : "airdrop_submissions";
      const rejected = await db.prepare(`UPDATE ${table} SET status='rejected',approved_by=? WHERE id=? AND status='pending' RETURNING activity_date${type === "party" ? ",kind" : ",round_time"}`).bind(admin.id, Number(body.id)).first<any>();
      if (!rejected) throw Error("รายการนี้ตรวจไปแล้วหรือไม่พบข้อมูล");
      const people = (type === "party"
        ? await db.prepare("SELECT m.display_name AS name,m.external_user_id FROM party_activity_members pam JOIN members m ON m.id=pam.member_id WHERE pam.party_activity_id=? ORDER BY m.display_name").bind(Number(body.id)).all<any>()
        : await db.prepare("SELECT m.display_name AS name,m.external_user_id FROM airdrop_submissions a JOIN members m ON m.id=a.member_id WHERE a.id=?").bind(Number(body.id)).all<any>()
      ).results;
      await notifyRejection({
        kind: type === "party" ? `${rejected.kind === "loop" ? "ลูป" : "งัดร้าน"} · ${rejected.activity_date}` : `แอร์ดรอปรอบ ${rejected.round_time} · ${rejected.activity_date}`,
        rejectedBy: admin.display_name,
        people: people.map((p: any) => ({ name: p.name, discordId: discordUserId(p.external_user_id) })),
      });
      return json({ ok: true });
    }
    if (body.action === "admin_access") {
      const sam = await requireSam(request), id = Number(body.memberId);
      if (!id || sameId(id, sam.id)) throw Error("ไม่สามารถเปลี่ยนสิทธิ์บัญชีเจ้าของแก๊งได้");
      const target = await db.prepare("SELECT id,active,is_primary_admin FROM members WHERE id=?").bind(id).first<any>();
      if (!target || !target.active) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
      if (target.is_primary_admin) throw Error("บัญชีเจ้าของแก๊งไม่สามารถเปลี่ยนสิทธิ์ได้");
      await db.prepare("UPDATE members SET role=? WHERE id=? AND active=1").bind(body.enabled ? "admin" : "member", id).run();
      return json({ ok: true });
    }
    if (body.action === "leave_request") {
      const requestedId = Number(body.memberId) || Number(me.id);
      if (!sameId(requestedId, me.id)) await requireAdmin(request);
      // Members must link Discord to file their own leave; an admin may still
      // record one on someone's behalf.
      else if (!discordLinked(me)) throw Error(NEEDS_DISCORD);
      const leaveDate = String(body.leaveDate || "").trim();
      const reason = String(body.reason || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) throw Error("เลือกวันที่ไม่ถูกต้อง");
      if (reason.length < 2 || reason.length > 200) throw Error("กรอกเหตุผลการลา 2–200 ตัวอักษร");
      const target = await db.prepare("SELECT id FROM members WHERE id=? AND active=1").bind(requestedId).first();
      if (!target) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
      await db.prepare(
        "INSERT INTO leave_requests (member_id,leave_date,reason,created_by,created_at) VALUES (?,?,?,?,?) ON CONFLICT (member_id,leave_date) DO UPDATE SET reason=EXCLUDED.reason,created_by=EXCLUDED.created_by,created_at=EXCLUDED.created_at"
      ).bind(requestedId, leaveDate, reason, me.id, now()).run();
      return json({ ok: true });
    }
    if (body.action === "member") {
      await requireAdmin(request);
      const name = String(body.name || "").trim();
      if (name.length < 2 || name.length > 60) throw Error("กรอกชื่อสมาชิก 2–60 ตัวอักษร");
      const exists = await db.prepare("SELECT id FROM members WHERE lower(display_name)=lower(?)").bind(name).first();
      if (exists) throw Error("มีชื่อสมาชิกนี้แล้ว");
      await db.prepare("INSERT INTO members (username,display_name,role,active,created_at) VALUES (?,?,'member',1,?)").bind(`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, name, now()).run();
      return json({ ok: true });
    }
    if (body.action === "member_update") {
      await requireAdmin(request);
      const id = Number(body.id), name = String(body.name || "").trim();
      if (!id || name.length < 2 || name.length > 60) throw Error("กรอกชื่อสมาชิก 2–60 ตัวอักษร");
      const target = await db.prepare("SELECT is_primary_admin FROM members WHERE id=?").bind(id).first<any>();
      if (!target) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
      if (target.is_primary_admin) throw Error("ไม่สามารถแก้ชื่อบัญชีเจ้าของแก๊งได้");
      const exists = await db.prepare("SELECT id FROM members WHERE lower(display_name)=lower(?) AND id<>?").bind(name, id).first();
      if (exists) throw Error("มีชื่อสมาชิกนี้แล้ว");
      const r = await db.prepare("UPDATE members SET display_name=? WHERE id=? AND active=1").bind(name, id).run();
      if (!r.meta.changes) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
      return json({ ok: true });
    }
    if (body.action === "member_delete") {
      const admin = await requireAdmin(request), id = Number(body.id);
      if (!id || sameId(id, admin.id)) throw Error("ไม่สามารถเอาบัญชีแอดมินของตัวเองออกได้");
      const target = await db.prepare("SELECT is_primary_admin FROM members WHERE id=?").bind(id).first<any>();
      if (!target || target.is_primary_admin) throw Error("ไม่สามารถปิดใช้งานบัญชีเจ้าของแก๊งได้");
      const parties = await db.prepare("SELECT DISTINCT p.id FROM parties p LEFT JOIN party_members pm ON pm.party_id=p.id AND pm.member_id=? WHERE p.status IN ('open','locked') AND (pm.member_id IS NOT NULL OR p.owner_member_id=?)").bind(id, id).all<any>();
      await db.batch([
        partyLock(),
        ...parties.results.flatMap((row: any) => leaveStatements(row.id, id)),
        db.prepare("DELETE FROM party_members WHERE member_id=?").bind(id),
        db.prepare("DELETE FROM party_invites WHERE invitee_member_id=? OR inviter_member_id=?").bind(id, id),
        db.prepare("UPDATE members SET active=0 WHERE id=?").bind(id),
        db.prepare("DELETE FROM sessions WHERE member_id=?").bind(id),
      ]);
      return json({ ok: true });
    }
    // Undo a wrong Discord claim: the member loses their Discord link and is
    // signed out everywhere, so the real owner can sign in and pick the name.
    if (body.action === "member_discord_unlink") {
      const admin = await requireAdmin(request), id = Number(body.id);
      if (!id || sameId(id, admin.id)) throw Error("ยกเลิกผูก Discord ของตัวเองไม่ได้ (จะเข้าเว็บไม่ได้)");
      const target = await db.prepare("SELECT role,is_primary_admin FROM members WHERE id=?").bind(id).first<any>();
      if (!target || target.is_primary_admin) throw Error("ยกเลิกผูก Discord บัญชีเจ้าของแก๊งไม่ได้");
      if (target.role === "admin" && !admin.is_primary_admin) throw Error("เฉพาะเจ้าของแก๊งที่ยกเลิกผูก Discord ของแอดมินได้");
      await db.batch([
        db.prepare("UPDATE members SET external_user_id=NULL,discord_avatar=NULL WHERE id=?").bind(id),
        db.prepare("DELETE FROM sessions WHERE member_id=?").bind(id),
      ]);
      return json({ ok: true });
    }
    if (body.action === "member_reactivate") {
      await requireAdmin(request);
      // Always comes back as a plain member: removal keeps role='admin', and
      // only Sam may grant admin, so any admin reactivating must not restore it.
      const r = await db.prepare("UPDATE members SET active=1,role='member' WHERE id=? AND active=0").bind(Number(body.id)).run();
      if (!r.meta.changes) throw Error("ไม่พบสมาชิกที่ถูกเอาออก");
      return json({ ok: true });
    }
    if (body.action === "admin_party_dissolve") {
      await requireAdmin(request);
      const partyId = Number(body.partyId);
      const party = await db.prepare("SELECT id FROM parties WHERE id=? AND status IN ('open','locked')").bind(partyId).first<any>();
      if (!party) throw Error("ไม่พบปาร์ตี้ที่กำลังใช้งาน");
      await db.batch([
        partyLock(),
        db.prepare("UPDATE parties SET status='completed',active=0 WHERE id=?").bind(partyId),
        db.prepare("DELETE FROM party_members WHERE party_id=?").bind(partyId),
      ]);
      return json({ ok: true });
    }
    if (body.action === "admin_party_remove_member") {
      await requireAdmin(request);
      const partyId = Number(body.partyId), memberId = Number(body.memberId);
      const party = await db.prepare("SELECT id FROM parties WHERE id=? AND status IN ('open','locked')").bind(partyId).first<any>();
      if (!party) throw Error("ไม่พบปาร์ตี้ที่กำลังใช้งาน");
      // Removing the leader hands the party to the longest-standing member, or
      // closes it when nobody is left, so it never ends up without a leader.
      await db.batch([partyLock(), ...leaveStatements(partyId, memberId)]);
      return json({ ok: true });
    }
    if (body.action === "points_adjust") {
      const admin = await requireAdmin(request);
      const memberId = Number(body.memberId), points = Number(body.points), reason = String(body.reason || "").trim();
      if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 100) throw Error("ใส่แต้มเป็นจำนวนเต็ม -100 ถึง 100 และไม่เป็น 0");
      if (reason.length < 2 || reason.length > 100) throw Error("กรอกเหตุผล 2–100 ตัวอักษร");
      const target = await db.prepare("SELECT id FROM members WHERE id=? AND active=1").bind(memberId).first();
      if (!target) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
      await db.prepare(
        "INSERT INTO point_ledger (member_id,source,source_id,points,note,created_at) VALUES (?,'adjustment',?,?,?,?)"
      ).bind(memberId, adjustmentId(), points,`${reason} · โดย ${admin.display_name}`, now()).run();
      return json({ ok: true });
    }
    if (body.action === "points_undo") {
      await requireAdmin(request);
      const source = String(body.source), sourceId = Number(body.sourceId);
      if (source === "adjustment") {
        const r = await db.prepare("DELETE FROM point_ledger WHERE source='adjustment' AND source_id=?").bind(sourceId).run();
        if (!r.meta.changes) throw Error("ไม่พบรายการแต้มนี้");
        return json({ ok: true });
      }
      const table = validType(source) === "party" ? "party_activities" : "airdrop_submissions";
      // The evidence image was deleted when this was approved, so it can't go
      // back to the review queue — it becomes rejected instead.
      const [revoked] = await db.batch([
        db.prepare(`UPDATE ${table} SET status='rejected',image_key='' WHERE id=? AND status='approved'`).bind(sourceId),
        db.prepare("DELETE FROM point_ledger WHERE source=? AND source_id=?").bind(source, sourceId),
      ]);
      if (!revoked.meta.changes) throw Error("รายการนี้ถูกยกเลิกไปแล้วหรือไม่พบข้อมูล");
      return json({ ok: true });
    }
    if (body.action === "leave_delete") {
      await requireAdmin(request);
      const r = await db.prepare("DELETE FROM leave_requests WHERE id=?").bind(Number(body.id)).run();
      if (!r.meta.changes) throw Error("ไม่พบรายการลานี้");
      return json({ ok: true });
    }
    // Sends one sample round reminder to the reminder channel, tagging only the
    // owner, so admins can check the channel and webhook without pinging anyone.
    if (body.action === "reminder_test") {
      await requireAdmin(request);
      const url = process.env.DISCORD_REMINDER_WEBHOOK_URL || process.env.DISCORD_POINTS_WEBHOOK_URL;
      if (!url) throw Error("ยังไม่ได้ตั้งค่าห้องเตือน");
      const owner = await db.prepare("SELECT external_user_id FROM members WHERE is_primary_admin=1 LIMIT 1").bind().first<any>();
      const ownerId = discordUserId(owner?.external_user_id);
      const ok = await postCard(url, {
        title: "⏰ อีก 30 นาทีเริ่มแอร์ดรอปรอบ 20:00 (ทดสอบ)",
        lines: [
          ["วันที่", thaiDate()],
          ["รอบ", "20:00 · เตรียมตัวแล้วส่งหลักฐานในเว็บ"],
          ["หมายเหตุ", "ข้อความทดสอบ แท็กเฉพาะเจ้าของแก๊ง"],
        ],
        color: 0xf59e0b,
        ...(body.role && /^[0-9]{5,25}$/.test(process.env.DISCORD_REMINDER_ROLE_ID || "")
          ? { mentionRoles: [process.env.DISCORD_REMINDER_ROLE_ID!] }
          : { mention: ownerId ? [ownerId] : [] }),
      });
      if (!ok) throw Error("ส่งเข้า Discord ไม่สำเร็จ ตรวจ Webhook ของห้องเตือน");
      return json({ ok: true });
    }
    throw Error("คำสั่งไม่ถูกต้อง");
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" }, 400);
  }
}
