ALTER TABLE `members` ADD `is_primary_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `members` SET `is_primary_admin` = true WHERE `id` = (SELECT `id` FROM `members` WHERE `display_name` = 'Sam' AND `role` = 'admin' ORDER BY `id` LIMIT 1);

