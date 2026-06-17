import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import ChannelList from './components/ChannelList';
import MessageList from './components/MessageList';
import SearchBar from './components/SearchBar';
import SearchResultPanel from './components/SearchResultPanel';
import ThreadPanel from './components/ThreadPanel';
import AdminDashboardPage from './pages/AdminDashboardPage';
import ManagementPage from './pages/ManagementPage';
import UserManagementPage from './pages/UserManagementPage';

type User = {
  id: string;
  email: string;
  role: 'root' | 'admin' | 'viewer';
};

type ThreadState = {
  channelId: string;
  threadTs: string;
};

function ChannelView({ onThreadOpen }: { onThreadOpen: (channelId: string, ts: string) => void }) {
  const { channelId } = useParams<{ channelId: string }>();
  if (!channelId) return null;
  return <MessageList channelId={channelId} onThreadOpen={(ts) => onThreadOpen(channelId, ts)} />;
}

function App() {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState<ThreadState | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const channelMatch = location.pathname.match(/^\/channels\/([^/]+)/);
  const selectedChannelId = channelMatch ? channelMatch[1] : undefined;

  const changeLanguage = (lang: 'en' | 'ja') => {
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
    setLangMenuOpen(false);
  };

  // Close language menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auth check on mount — acceptable useEffect (external system sync, not SWR-replaceable data fetching)
  useEffect(() => {
    fetch('/api/me')
      .then((r) => {
        if (!r.ok) throw new Error('Unauthorized');
        return r.json() as Promise<User>;
      })
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        {t('common.loading')}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <p>{t('app.accessDenied')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      <aside className="w-64 bg-gray-800 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-700">
          <h1 className="font-bold text-lg">{t('app.appName')}</h1>
          <p className="text-xs text-gray-400 mt-1">{user.email}</p>
          <div className="relative mt-2" ref={langMenuRef}>
            <button
              type="button"
              onClick={() => setLangMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="uppercase">{i18n.language === 'ja' ? 'JA' : 'EN'}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {langMenuOpen && (
              <div className="absolute left-0 top-full mt-1 w-28 bg-gray-700 border border-gray-600 rounded shadow-lg z-10">
                {(['en', 'ja'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => changeLanguage(lang)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-600 transition-colors ${i18n.language === lang ? 'text-white font-semibold' : 'text-gray-300'}`}
                  >
                    {lang === 'en' ? 'English' : '日本語'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="px-2 pt-2 pb-1">
          <SearchBar
            value={searchQuery}
            onChange={(v) => {
              setSearchQuery(v);
              if (v) setThread(null);
            }}
          />
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <p className="text-xs text-gray-500 px-2 py-1 uppercase tracking-wider">
            {t('app.channels')}
          </p>
          <ChannelList
            selectedChannelId={selectedChannelId}
            onSelect={(id) => {
              setThread(null);
              navigate(`/channels/${id}`);
            }}
          />
        </nav>
        {(user.role === 'root' || user.role === 'admin') && (
          <div className="p-4 border-t border-gray-700">
            <button
              type="button"
              onClick={() => navigate('/management')}
              className="text-sm text-gray-400 hover:text-white"
            >
              {t('app.management')}
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/management" element={<AdminDashboardPage currentUser={user} />} />
          <Route path="/management/sync" element={<ManagementPage />} />
          <Route path="/management/user" element={<UserManagementPage currentUser={user} />} />
          <Route
            path="/channels/:channelId"
            element={
              <ChannelView
                onThreadOpen={(cId, ts) => setThread({ channelId: cId, threadTs: ts })}
              />
            }
          />
          <Route
            path="*"
            element={
              <div className="flex flex-1 items-center justify-center text-gray-500">
                {t('app.selectChannel')}
              </div>
            }
          />
        </Routes>
      </main>

      {searchQuery.trim() && (
        <SearchResultPanel
          query={searchQuery}
          onClose={() => setSearchQuery('')}
          onSelectChannel={(channelId) => {
            setSearchQuery('');
            setThread(null);
            navigate(`/channels/${channelId}`);
          }}
        />
      )}

      {!searchQuery.trim() && thread && (
        <ThreadPanel
          channelId={thread.channelId}
          threadTs={thread.threadTs}
          onClose={() => setThread(null)}
        />
      )}
    </div>
  );
}

export default App;
