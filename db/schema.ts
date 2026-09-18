import { bigint, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

// NOTE: this schema is used only for `drizzle-kit generate` when evolving the
// database going forward. The app itself talks to Postgres with raw SQL via
// lib/db.ts, not through Drizzle's query builder.
export const members = pgTable("members", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").notNull(),
  externalUserId: text("external_user_id"),
  email: text("email"),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  isPrimaryAdmin: integer("is_primary_admin").notNull().default(0),
  active: integer("active").notNull().default(1),
  pinHash: text("pin_hash"),
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_members_username").on(table.username),
  uniqueIndex("idx_members_external_user").on(table.externalUserId),
  uniqueIndex("idx_members_email").on(table.email),
]);

export const parties = pgTable("parties", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  shopName: text("shop_name"),
  ownerMemberId: bigint("owner_member_id", { mode: "number" }).references(() => members.id),
  status: text("status", { enum: ["open", "locked", "completed"] }).notNull().default("completed"),
  active: integer("active").notNull().default(1),
});

export const partyMembers = pgTable("party_members", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  partyId: bigint("party_id", { mode: "number" }).notNull().references(() => parties.id),
  memberId: bigint("member_id", { mode: "number" }).notNull().references(() => members.id),
  joinedAt: text("joined_at").notNull(),
}, (table) => [uniqueIndex("idx_party_members_active").on(table.partyId, table.memberId)]);

export const airdropSubmissions = pgTable("airdrop_submissions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  memberId: bigint("member_id", { mode: "number" }).notNull().references(() => members.id),
  activityDate: text("activity_date").notNull(),
  roundTime: text("round_time", { enum: ["20:00", "23:00"] }).notNull(),
  imageKey: text("image_key").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  approvedBy: bigint("approved_by", { mode: "number" }).references(() => members.id),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_airdrop_one_per_round").on(table.memberId, table.activityDate, table.roundTime)]);

export const partyActivities = pgTable("party_activities", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  partyId: bigint("party_id", { mode: "number" }).notNull().references(() => parties.id),
  activityDate: text("activity_date").notNull(),
  imageKey: text("image_key").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  approvedBy: bigint("approved_by", { mode: "number" }).references(() => members.id),
  submittedByMemberId: bigint("submitted_by_member_id", { mode: "number" }).references(() => members.id),
  createdAt: text("created_at").notNull(),
});

export const partyInvites = pgTable("party_invites", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  partyId: bigint("party_id", { mode: "number" }).notNull().references(() => parties.id),
  inviterMemberId: bigint("inviter_member_id", { mode: "number" }).notNull().references(() => members.id),
  inviteeMemberId: bigint("invitee_member_id", { mode: "number" }).notNull().references(() => members.id),
  status: text("status", { enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  respondedAt: text("responded_at"),
}, (table) => [uniqueIndex("idx_party_invites_once").on(table.partyId, table.inviteeMemberId)]);

// A party is assembled for one activity; its members are snapshotted here so
// members can form a different party for the next activity without changing history.
export const partyActivityMembers = pgTable("party_activity_members", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  partyActivityId: bigint("party_activity_id", { mode: "number" }).notNull().references(() => partyActivities.id),
  memberId: bigint("member_id", { mode: "number" }).notNull().references(() => members.id),
}, (table) => [uniqueIndex("idx_party_activity_member_once").on(table.partyActivityId, table.memberId)]);

// Favorites belong to the member choosing a party, so each person can keep a
// different shortlist without changing the other members' views.
export const memberFavorites = pgTable("member_favorites", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  ownerMemberId: bigint("owner_member_id", { mode: "number" }).notNull().references(() => members.id),
  favoriteMemberId: bigint("favorite_member_id", { mode: "number" }).notNull().references(() => members.id),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_member_favorite_once").on(table.ownerMemberId, table.favoriteMemberId)]);

export const pointLedger = pgTable("point_ledger", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  memberId: bigint("member_id", { mode: "number" }).notNull().references(() => members.id),
  source: text("source", { enum: ["airdrop", "party", "adjustment"] }).notNull(),
  sourceId: bigint("source_id", { mode: "number" }).notNull(),
  points: integer("points").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_point_ledger_once").on(table.memberId, table.source, table.sourceId)]);

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  memberId: bigint("member_id", { mode: "number" }).notNull().references(() => members.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});
