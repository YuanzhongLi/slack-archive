import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '../hooks/useSearch';
import Avatar from './Avatar';
import Timestamp from './Timestamp';

type SearchResultPanelProps = {
  query: string;
  onClose: () => void;
  onSelectChannel: (channelId: string) => void;
};

export default function SearchResultPanel({
  query,
  onClose,
  onSelectChannel,
}: SearchResultPanelProps) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useSearch(query);

  return (
    <div className="w-80 border-l border-gray-700 bg-gray-800 flex flex-col flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h2 className="font-semibold text-gray-100">{t('search.title')}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('search.closeLabel')}
          className="text-gray-400 hover:text-gray-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-col flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
            {t('search.loading')}
          </div>
        )}

        {error && (
          <div className="flex flex-1 items-center justify-center text-red-400 text-sm">
            {t('search.error')}
          </div>
        )}

        {!isLoading && !error && data && data.results.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-gray-500 text-sm">
            {t('search.empty')}
          </div>
        )}

        {!isLoading &&
          !error &&
          data?.results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => onSelectChannel(result.channel.id)}
              className="flex gap-3 py-2 px-4 hover:bg-gray-700/50 text-left w-full"
            >
              <Avatar user={result.user} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-gray-100 text-sm">
                    {result.user.displayName}
                  </span>
                  <Timestamp slackTs={result.slackTs} />
                </div>
                <p className="text-xs text-blue-400 mb-0.5">
                  {t('search.channelLabel', { name: result.channel.name })}
                </p>
                <p className="text-gray-100 text-sm whitespace-pre-wrap break-words line-clamp-2">
                  {result.text}
                </p>
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}
