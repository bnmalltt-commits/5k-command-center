CREATE TABLE `member_favorites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_member_id` integer NOT NULL,
	`favorite_member_id` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`favorite_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_member_favorite_once` ON `member_favorites` (`owner_member_id`,`favorite_member_id`);