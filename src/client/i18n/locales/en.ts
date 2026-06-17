const en = {
  common: {
    loading: 'Loading…',
    back: '← Back',
  },
  app: {
    appName: 'Slack Archive',
    channels: 'Channels',
    management: 'Management',
    selectChannel: 'Select a channel to view messages.',
    accessDenied: 'Access denied. Please contact your administrator.',
  },
  channelList: {
    loading: 'Loading channels...',
    error: 'Failed to load channels',
  },
  messageList: {
    loading: 'Loading...',
    error: 'Failed to load messages.',
    empty: 'No messages yet.',
  },
  messageItem: {
    reply_one: '{{count}} reply',
    reply_other: '{{count}} replies',
  },
  threadPanel: {
    title: 'Thread',
    closeLabel: 'Close thread',
    loading: 'Loading...',
    error: 'Failed to load replies.',
    empty: 'No replies yet.',
  },
  management: {
    title: 'Management',
    manualSync: 'Manual Sync',
    syncing: 'Syncing…',
    runSyncNow: 'Run Sync Now',
    cronSchedule: 'Cron Schedule',
    cronDescription: '— daily at 17:00 UTC',
    cronNote:
      'Also runs a full resync of messages from 90–87 days ago to capture edits and deletions.',
    syncHistory: 'Sync History',
    historyLoading: 'Loading…',
    historyError: 'Failed to load sync history',
    historyEmpty: 'No sync history yet.',
    colStartedAt: 'Started At',
    colTrigger: 'Trigger',
    colUser: 'User',
    colStatus: 'Status',
    colChannels: 'Channels',
    colMessages: 'Messages',
    colError: 'Error',
    statusSuccess: 'success',
    statusError: 'error',
    syncDone: 'Done — {{channelCount}} channels, {{messageCount}} messages',
    syncError: 'Error: {{message}}',
    syncErrorGeneric: 'Error: Request failed',
  },
} as const;

export default en;
