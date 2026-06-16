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
