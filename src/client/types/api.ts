export type Channel = {
  id: string;
  slackChannelId: string;
  name: string;
};

export type SlackUser = {
  slackUserId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type Message = {
  id: string;
  slackTs: string;
  text: string;
  threadTs: string | null;
  replyCount: number;
  user: SlackUser;
};

export type MessagesResponse = {
  messages: Message[];
  hasMore: boolean;
};

export type ThreadReply = {
  id: string;
  slackTs: string;
  text: string;
  user: SlackUser;
};

export type SyncLog = {
  id: string;
  triggeredBy: 'cron' | 'manual';
  userEmail: string | null;
  channelCount: number | null;
  messageCount: number | null;
  status: 'success' | 'error';
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type SyncLogsResponse = {
  logs: SyncLog[];
};

export type SearchResult = {
  id: string;
  slackTs: string;
  text: string;
  threadTs: string | null;
  channel: {
    id: string;
    name: string;
  };
  user: SlackUser;
};

export type SearchResponse = {
  results: SearchResult[];
  hasMore: boolean;
};

export type AppUser = {
  id: string;
  email: string;
  role: 'root' | 'admin' | 'viewer';
  createdAt: string;
  updatedAt: string;
};
