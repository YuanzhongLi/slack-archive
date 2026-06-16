import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  role: text('role').notNull().default('viewer'), // 'root' | 'admin' | 'viewer'
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const channels = sqliteTable(
  'channels',
  {
    id: text('id').primaryKey(),
    slackChannelId: text('slack_channel_id').notNull().unique(),
    name: text('name').notNull(),
    isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
    lastSyncedAt: text('last_synced_at'),
  },
  (t) => [index('idx_channels_slack_id').on(t.slackChannelId)],
);

export const slackUsers = sqliteTable(
  'slack_users',
  {
    id: text('id').primaryKey(),
    slackUserId: text('slack_user_id').notNull().unique(),
    displayName: text('display_name').notNull(),
    realName: text('real_name'),
    avatarUrl: text('avatar_url'),
  },
  (t) => [index('idx_slack_users_slack_id').on(t.slackUserId)],
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    slackTs: text('slack_ts').notNull(),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id),
    userSlackId: text('user_slack_id'),
    text: text('text').notNull().default(''),
    threadTs: text('thread_ts'),
    createdAt: text('created_at').notNull(),
    // populated only for thread parent messages (thread_ts === slack_ts)
    repliesLastSyncedAt: text('replies_last_synced_at'),
  },
  (t) => [
    uniqueIndex('uniq_messages_channel_ts').on(t.channelId, t.slackTs),
    index('idx_messages_thread_ts').on(t.threadTs),
  ],
);

export const threads = sqliteTable(
  'threads',
  {
    id: text('id').primaryKey(),
    parentTs: text('parent_ts').notNull(),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id),
    userSlackId: text('user_slack_id'),
    text: text('text').notNull().default(''),
    slackTs: text('slack_ts').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('uniq_threads_channel_ts').on(t.channelId, t.slackTs),
    index('idx_threads_parent_ts').on(t.channelId, t.parentTs),
  ],
);

export const syncLogs = sqliteTable('sync_logs', {
  id: text('id').primaryKey(),
  triggeredBy: text('triggered_by').notNull(), // 'cron' | 'manual'
  userEmail: text('user_email'),
  channelCount: integer('channel_count'),
  messageCount: integer('message_count'),
  status: text('status').notNull(), // 'success' | 'error'
  errorMessage: text('error_message'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
});

export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type Channel = typeof channels.$inferSelect;
export type SlackUser = typeof slackUsers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Thread = typeof threads.$inferSelect;
export type SyncLog = typeof syncLogs.$inferSelect;
