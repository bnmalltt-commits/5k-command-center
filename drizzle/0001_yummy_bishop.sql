CREATE TABLE `party_activity_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`party_activity_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	FOREIGN KEY (`party_activity_id`) REFERENCES `party_activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_party_activity_member_once` ON `party_activity_members` (`party_activity_id`,`member_id`);