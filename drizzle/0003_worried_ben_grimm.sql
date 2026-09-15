ALTER TABLE `members` ADD `external_user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_external_user` ON `members` (`external_user_id`);
