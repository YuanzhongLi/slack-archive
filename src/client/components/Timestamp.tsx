type TimestampProps = {
  slackTs: string;
  className?: string;
};

export default function Timestamp({ slackTs, className }: TimestampProps) {
  const ts = parseFloat(slackTs);
  if (Number.isNaN(ts)) {
    return <span className={`text-xs text-gray-400 ${className ?? ''}`}>--:--</span>;
  }

  const date = new Date(ts * 1000);
  const timeString = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const fullString = date.toLocaleString();

  return (
    <time
      dateTime={date.toISOString()}
      title={fullString}
      className={`text-xs text-gray-400 ${className ?? ''}`}
    >
      {timeString}
    </time>
  );
}
