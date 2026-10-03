// Airdrop rounds, and which date a round's evidence belongs to. Shared by the
// upload route and the page so the server and the mission card always agree.
export const ROUNDS = ["17:00", "20:00", "23:00", "01:00"] as const;

// 01:00 is the early hours of its own date. The evening rounds (17:00, 20:00,
// 23:00) sent after midnight but before this hour are late evidence for the
// night before, not for the coming evening: otherwise a 23:00 sent at 00:07
// took the next night's 23:00 slot (blocking the real one) and left the night
// it was for without it.
export const LATE_ROUND_UNTIL_HOUR = 5;

export const bangkokHour = (at = new Date()) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", hourCycle: "h23" }).format(at)) % 24;

export const dayBefore = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

// The date a round sent now counts for, given today's Bangkok date.
export const roundDate = (round: string, today: string, hour = bangkokHour()) =>
  round !== "01:00" && hour < LATE_ROUND_UNTIL_HOUR ? dayBefore(today) : today;
