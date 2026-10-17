"use client";
import { useState } from "react";
import { Trophy } from "lucide-react";
import { Podium3D } from "../three/podium";
import {
  Avatar,
  Dot,
  EmptyState,
  Panel,
  Row,
  Segmented,
} from "../ui";
import { Medal, PERIODS, monthLabel, openProfile, profileKeys } from "./shared";

export function SquadRanking({
  leaderboard: allTime,
  boards,
  monthBoards,
  compact = false,
  highlightId,
  avatars = {},
}: {
  leaderboard: any[];
  boards?: Record<string, any[]>;
  monthBoards?: Record<string, any[]>;
  compact?: boolean;
  highlightId?: number;
  avatars?: Record<string, string | null>;
}) {
  const [period, setPeriod] = useState("month");
  const months = Object.keys(monthBoards || {}).sort().reverse();
  const [month, setMonth] = useState("");
  const shownMonth = months.includes(month) ? month : months[0];
  const leaderboard =
    period === "month" && shownMonth
      ? monthBoards![shownMonth]
      : period === "all" || !boards?.[period]
        ? allTime
        : boards[period];
  const rows = compact ? leaderboard.slice(0, 5) : leaderboard;
  // Standard competition ranking (10, 10, 7 → 1, 1, 3), matching the rank the
  // server computes for the home tile, so tied members see the same number.
  const ranks: number[] = [];
  leaderboard.forEach((member: any, i: number) => {
    ranks.push(
      i > 0 && Number(member.score || 0) === Number(leaderboard[i - 1].score || 0)
        ? ranks[i - 1]
        : i + 1,
    );
  });
  const myIndex = highlightId
    ? leaderboard.findIndex((member: any) => member.id === highlightId)
    : -1;
  const me = myIndex >= 0 ? leaderboard[myIndex] : null;
  const myRank = myIndex >= 0 ? ranks[myIndex] : 0;
  // The nearest member strictly ahead; beating them takes one point more than
  // the difference, since matching their score only ties.
  const ahead = myRank > 1 ? leaderboard[myRank - 2] : null;
  const toPass = ahead
    ? Number(ahead.score || 0) - Number(me.score || 0) + 1
    : 0;
  return (
    <Panel
      label="SQUAD RANKING"
      title={
        compact
          ? "ตารางคะแนนเดือนนี้"
          : period === "month" && shownMonth
            ? `ตารางคะแนน${monthLabel(shownMonth)}`
            : PERIODS.find((p) => p.id === period)!.title
      }
      subtitle={compact ? undefined : `${leaderboard.length} คน`}
      trailing={<Trophy className="h-4 w-4 text-[var(--ui-red)]" />}
      flush
    >
      {!compact && boards && (
        <div className="px-4 pt-3">
          <Segmented
            label="ช่วงเวลา"
            value={period}
            onChange={setPeriod}
            options={PERIODS.map(({ id, label }) => ({ id, label }))}
          />
          {period === "month" && months.length > 0 && (
            <select
              value={shownMonth}
              onChange={(event) => setMonth(event.target.value)}
              className="ui-input mt-2"
              aria-label="เลือกเดือน"
            >
              {months.map((value, index) => (
                <option key={value} value={value}>
                  {monthLabel(value)}
                  {index === 0 ? " (เดือนนี้)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {!compact && me && (
        <div className="rank-me tilt">
          <span className="rank-me__pos">#{myRank}</span>
          <div className="min-w-0 flex-1">
            <div className="rank-me__label">อันดับของคุณ</div>
            <div className="rank-me__hint">
              {ahead
                ? `อีก ${toPass} แต้มจะแซง ${ahead.display_name}`
                : "คุณอยู่อันดับหนึ่งของแก๊ง"}
            </div>
          </div>
          <span className="rank-me__score">{Number(me.score || 0)}</span>
        </div>
      )}
      {!compact && rows.length > 0 && (
        // Top three on a podium: 2nd, 1st, 3rd from left to right.
        <div className="podium">
          <Podium3D watch={rows.slice(0, 3).map((m: any) => `${m.id}:${m.score}`).join(",")} />
          {[1, 0, 2].map((index) => {
            const member = rows[index];
            if (!member) return <div key={index} className="podium__slot podium__slot--empty" />;
            return (
              <div key={member.id} className={`podium__slot podium__slot--${index + 1} tilt is-link`} {...profileKeys(member.id)}>
                <Medal rank={ranks[index]} className="podium__medal" />
                <Avatar url={avatars[String(member.id)]} name={member.display_name} size={index === 0 ? 76 : 60} />
                <span className="podium__name">
                  {member.display_name}
                  {member.id === highlightId ? " · คุณ" : ""}
                </span>
                <b className="podium__score">{Number(member.score || 0)}</b>
                <span className="podium__base" data-rank={ranks[index]} />
              </div>
            );
          })}
        </div>
      )}
      {rows.length && !compact ? (
        rows.length > 3 && (
          <ol className="rank-list">
            {rows.map((member: any, index: number) => {
              if (index < 3) return null;
              const top = Number(rows[0]?.score || 0);
              const pct = top > 0 ? Math.max(2, Math.min(100, (Number(member.score || 0) / top) * 100)) : 0;
              const isMe = String(member.id) === String(highlightId);
              return (
                <li key={member.id} className={`rank-list__item is-link ${isMe ? "is-me" : ""}`} {...profileKeys(member.id)}>
                  <span className={`rank-num rank-num--${ranks[index]}`}>{ranks[index]}</span>
                  <span className="rank-list__main">
                    <span className="name-with-avatar">
                      <Avatar url={avatars[String(member.id)]} name={member.display_name} size={30} />
                      <span className="truncate">
                        {member.display_name}
                        {isMe ? " · คุณ" : ""}
                      </span>
                      {member.online ? <Dot tone="green" /> : null}
                    </span>
                    <span className="rank-list__bar" aria-hidden="true">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                  <span className="rank-score">{Number(member.score || 0)}</span>
                </li>
              );
            })}
          </ol>
        )
      ) : rows.length ? (
        rows.map((member: any, index: number) => (
          <Row
            key={member.id}
            inset={false}
            onClick={() => openProfile(member.id)}
            leading={
              <span className={`rank-num rank-num--${ranks[index]}`}>
                {ranks[index]}
              </span>
            }
            title={
              <span className="name-with-avatar">
                <span className="avatar-status">
                  <Avatar url={avatars[String(member.id)]} name={member.display_name} size={24} />
                  {member.online ? <Dot tone="green" /> : null}
                </span>
                {member.online ? <span className="sr-only">ออนไลน์</span> : null}
                {member.id === highlightId ? (
                  <span className="text-[var(--ui-red-light)] font-semibold">{member.display_name} · คุณ</span>
                ) : (
                  member.display_name
                )}
              </span>
            }
            trailing={
              <span className="rank-score">{Number(member.score || 0)}</span>
            }
          />
        ))
      ) : (
        <EmptyState
          art="trophy"
          title={
            compact
              ? "ยังไม่มีใครได้แต้มเดือนนี้"
              : period === "all"
              ? "ยังไม่มีคะแนนในตาราง"
              : period === "month" && shownMonth
                ? `ยังไม่มีใครได้แต้มในเดือน${monthLabel(shownMonth)}`
                : `ยังไม่มีใครได้แต้ม${PERIODS.find((p) => p.id === period)!.label}`
          }
          hint="เมื่อหลักฐานตรวจผ่าน คะแนนจะขึ้นที่นี่"
        />
      )}
    </Panel>
  );
}
