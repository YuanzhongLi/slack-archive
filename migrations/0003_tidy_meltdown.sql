CREATE TABLE `sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`triggered_by` text NOT NULL,
	`user_email` text,
	`channel_count` integer,
	`message_count` integer,
	`status` text NOT NULL,
	`error_message` text,
	`started_at` text NOT NULL,
	`completed_at` text
);
