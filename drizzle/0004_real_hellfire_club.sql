ALTER TABLE `members` ADD `email` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_email` ON `members` (`email`);