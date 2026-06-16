CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`slack_channel_id` text NOT NULL,
	`name` text NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	`last_synced_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_slack_channel_id_unique` ON `channels` (`slack_channel_id`);--> statement-breakpoint
CREATE INDEX `idx_channels_slack_id` ON `channels` (`slack_channel_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`slack_ts` text NOT NULL,
	`channel_id` text NOT NULL,
	`user_slack_id` text,
	`text` text DEFAULT '' NOT NULL,
	`thread_ts` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_messages_channel_ts` ON `messages` (`channel_id`,`slack_ts`);--> statement-breakpoint
CREATE INDEX `idx_messages_thread_ts` ON `messages` (`thread_ts`);--> statement-breakpoint
CREATE TABLE `slack_users` (
	`id` text PRIMARY KEY NOT NULL,
	`slack_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`real_name` text,
	`avatar_url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slack_users_slack_user_id_unique` ON `slack_users` (`slack_user_id`);--> statement-breakpoint
CREATE INDEX `idx_slack_users_slack_id` ON `slack_users` (`slack_user_id`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_ts` text NOT NULL,
	`channel_id` text NOT NULL,
	`user_slack_id` text,
	`text` text DEFAULT '' NOT NULL,
	`slack_ts` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_threads_parent_ts` ON `threads` (`channel_id`,`parent_ts`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);