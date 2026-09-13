CREATE TABLE `airdrop_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`activity_date` text NOT NULL,
	`round_time` text NOT NULL,
	`image_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_airdrop_one_per_round` ON `airdrop_submissions` (`member_id`,`activity_date`,`round_time`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_username` ON `members` (`username`);--> statement-breakpoint
CREATE TABLE `parties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`shop_name` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `party_activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`party_id` integer NOT NULL,
	`activity_date` text NOT NULL,
	`image_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `party_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`party_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_party_members_active` ON `party_members` (`party_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `point_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`source` text NOT NULL,
	`source_id` integer NOT NULL,
	`points` integer NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_point_ledger_once` ON `point_ledger` (`member_id`,`source`,`source_id`);