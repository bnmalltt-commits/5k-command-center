import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull(),
  externalUserId: text("external_user_id"),
  email: text("email"),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  isPrimaryAdmin: integer("is_primary_admin", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_members_username").on(table.username),
  uniqueIndex("idx_members_external_user").on(table.externalUserId),
  uniqueIndex("idx_members_email").on(table.email),
]);

export const parties = sqliteTable("parties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  shopName: text("shop_name"),
  ownerMemberId: integer("owner_member_id").references(() => members.id),
  status: text("status", { enum: ["open", "locked", "completed"] }).notNull().default("completed"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const partyMembers = sqliteTable("party_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partyId: integer("party_id").notNull().references(() => parties.id),
  memberId: integer("member_id").notNull().references(() => members.id),
  joinedAt: text("joined_at").notNull(),
}, (table) => [uniqueIndex("idx_party_members_active").on(table.partyId, table.memberId)]);

export const airdropSubmissions = sqliteTable("airdrop_submissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull().references(() => members.id),
  activityDate: text("activity_date").notNull(),
  roundTime: text("round_time", { enum: ["20:00", "23:00"] }).notNull(),
  imageKey: text("image_key").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  approvedBy: integer("approved_by").references(() => members.id),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_airdrop_one_per_round").on(table.memberId, table.activityDate, table.roundTime)]);

export const partyActivities = sqliteTable("party_activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partyId: integer("party_id").notNull().references(() => parties.id),
  activityDate: text("activity_date").notNull(),
  imageKey: text("image_key").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  approvedBy: integer("approved_by").references(() => members.id),
  submittedByMemberId: integer("submitted_by_member_id").references(() => members.id),
  createdAt: text("created_at").notNull(),
});

export const partyInvites = sqliteTable("party_invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partyId: integer("party_id").notNull().references(() => parties.id),
  inviterMemberId: integer("inviter_member_id").notNull().references(() => members.id),
  inviteeMemberId: integer("invitee_member_id").notNull().references(() => members.id),
  status: text("status", { enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  respondedAt: text("responded_at"),
}, (table) => [uniqueIndex("idx_party_invites_once").on(table.partyId, table.inviteeMemberId)]);

// A party is assembled for one activity; its 5 members are snapshotted here so
// members can form a different party for the next activity without changing history.
export const partyActivityMembers = sqliteTable("party_activity_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partyActivityId: integer("party_activity_id").notNull().references(() => partyActivities.id),
  memberId: integer("member_id").notNull().references(() => members.id),
}, (table) => [uniqueIndex("idx_party_activity_member_once").on(table.partyActivityId, table.memberId)]);

// Favorites belong to the member choosing a party, so each person can keep a
// different shortlist without changing the other members' views.
export const memberFavorites = sqliteTable("member_favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerMemberId: integer("owner_member_id").notNull().references(() => members.id),
  favoriteMemberId: integer("favorite_member_id").notNull().references(() => members.id),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_member_favorite_once").on(table.ownerMemberId, table.favoriteMemberId)]);

export const pointLedger = sqliteTable("point_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull().references(() => members.id),
  source: text("source", { enum: ["airdrop", "party", "adjustment"] }).notNull(),
  sourceId: integer("source_id").notNull(),
  points: integer("points").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_point_ledger_once").on(table.memberId, table.source, table.sourceId)]);

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  memberId: integer("member_id").notNull().references(() => members.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});
