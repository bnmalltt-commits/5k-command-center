ALTER TABLE `members` ADD `is_primary_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `members` SET `is_primary_admin` = true WHERE `display_name` = 'Sam' AND `role` = 'admin';
