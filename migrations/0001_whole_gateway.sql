DROP INDEX `idx_messages_channel_ts`;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_messages_channel_ts` ON `messages` (`channel_id`,`slack_ts`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_threads_channel_ts` ON `threads` (`channel_id`,`slack_ts`);