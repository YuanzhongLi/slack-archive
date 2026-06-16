import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import ChannelList from './components/ChannelList';
import MessageList from './components/MessageList';
import ManagementPage from './pages/ManagementPage';
import ThreadPanel from './components/ThreadPanel';

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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState<ThreadState | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const channelMatch = location.pathname.match(/^\/channels\/([^/]+)/);
  const selectedChannelId = channelMatch ? channelMatch[1] : undefined;

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
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <p>Access denied. Please contact your administrator.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      <aside className="w-64 bg-gray-800 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-700">
          <h1 className="font-bold text-lg">Slack Archive</h1>
          <p className="text-xs text-gray-400 mt-1">{user.email}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <p className="text-xs text-gray-500 px-2 py-1 uppercase tracking-wider">Channels</p>
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
              onClick={() => navigate('/management/sync')}
              className="text-sm text-gray-400 hover:text-white"
            >
              Management
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/management" element={<Navigate to="/management/sync" replace />} />
          <Route path="/management/sync" element={<ManagementPage />} />
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
                Select a channel to view messages.
              </div>
            }
          />
        </Routes>
      </main>

      {thread && (
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
