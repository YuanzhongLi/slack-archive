import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const { t } = useTranslation();

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('search.placeholder')}
        className="w-full bg-gray-700 text-gray-100 placeholder-gray-400 text-sm rounded px-3 py-1.5 pr-7 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('search.closeLabel')}
          className="absolute right-2 text-gray-400 hover:text-gray-100 transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
