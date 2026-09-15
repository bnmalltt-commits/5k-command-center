CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`member_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);

