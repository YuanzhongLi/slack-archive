import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

type Props = {
  currentUser: {
    role: 'root' | 'admin' | 'viewer';
  };
};

function SyncIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

type CardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
};

function DashboardCard({ icon, title, description, onClick }: CardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full p-5 bg-gray-800 border border-gray-700 rounded-lg hover:border-indigo-500 transition-colors group flex items-start gap-4"
    >
      <span className="mt-0.5 text-gray-400 group-hover:text-indigo-400 transition-colors flex-shrink-0">
        {icon}
      </span>
      <div>
        <h2 className="font-semibold text-white group-hover:text-indigo-400 transition-colors mb-1">
          {title}
        </h2>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
    </button>
  );
}

export default function AdminDashboardPage({ currentUser }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <header className="p-4 border-b border-gray-700 flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-gray-400 hover:text-white text-sm"
        >
          {t('common.back')}
        </button>
        <h1 className="font-bold text-lg">{t('adminDashboard.title')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl space-y-3">
          <DashboardCard
            icon={<SyncIcon />}
            title={t('adminDashboard.syncTitle')}
            description={t('adminDashboard.syncDescription')}
            onClick={() => navigate('/management/sync')}
          />
          {(currentUser.role === 'root' || currentUser.role === 'admin') && (
            <DashboardCard
              icon={<UsersIcon />}
              title={t('adminDashboard.userTitle')}
              description={t('adminDashboard.userDescription')}
              onClick={() => navigate('/management/user')}
            />
          )}
          {(currentUser.role === 'root' || currentUser.role === 'admin') && (
            <DashboardCard
              icon={<TrashIcon />}
              title={t('adminDashboard.channelTitle')}
              description={t('adminDashboard.channelDescription')}
              onClick={() => navigate('/management/channel')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
