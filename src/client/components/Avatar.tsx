import type { SlackUser } from '../types/api';

type AvatarProps = {
  user: SlackUser;
  size?: 'sm' | 'md';
};

const COLOR_PALETTE = [
  'bg-purple-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-red-500',
  'bg-pink-500',
];

function hashDisplayName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getColorClass(displayName: string): string {
  const index = hashDisplayName(displayName) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

export default function Avatar({ user, size = 'md' }: AvatarProps) {
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base';
  const initial = user.displayName.charAt(0).toUpperCase();

  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.displayName}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
      />
    );
  }

  const colorClass = getColorClass(user.displayName);
  return (
    <div
      className={`${sizeClass} ${colorClass} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`}
    >
      {initial}
    </div>
  );
}
