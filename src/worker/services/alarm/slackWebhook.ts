export interface AlarmPayload {
  level: 'error' | 'warn' | 'info';
  title: string;
  message: string;
  fields?: Record<string, string>;
}

export async function sendAlarm(webhookUrl: string, payload: AlarmPayload): Promise<void> {
  const icon =
    payload.level === 'error'
      ? ':red_circle:'
      : payload.level === 'warn'
        ? ':warning:'
        : ':information_source:';
  const fields = payload.fields
    ? Object.entries(payload.fields)
        .map(([k, v]) => `*${k}*: ${v}`)
        .join('\n')
    : '';
  const text = [`${icon} *${payload.title}*`, payload.message, fields].filter(Boolean).join('\n');

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status} - ${body}`);
  }
}
