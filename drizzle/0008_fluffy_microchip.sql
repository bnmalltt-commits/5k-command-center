CREATE TABLE `party_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`party_id` integer NOT NULL,
	`inviter_member_id` integer NOT NULL,
	`invitee_member_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`responded_at` text,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inviter_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invitee_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_party_invites_once` ON `party_invites` (`party_id`,`invitee_member_id`);--> statement-breakpoint
ALTER TABLE `parties` ADD `owner_member_id` integer REFERENCES members(id);--> statement-breakpoint
ALTER TABLE `parties` ADD `status` text DEFAULT 'completed' NOT NULL;