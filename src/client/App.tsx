import { useEffect, useState } from 'react';

type User = {
  id: string;
  email: string;
  role: 'root' | 'admin' | 'viewer';
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
    <div className="flex h-screen bg-gray-900 text-white">
      <aside className="w-64 bg-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="font-bold text-lg">Slack Archive</h1>
          <p className="text-xs text-gray-400 mt-1">{user.email}</p>
        </div>
        <nav className="flex-1 p-2">
          <p className="text-xs text-gray-500 px-2 py-1 uppercase tracking-wider">Channels</p>
          {/* Phase 3: channel list */}
        </nav>
        {(user.role === 'root' || user.role === 'admin') && (
          <div className="p-4 border-t border-gray-700">
            <a href="/management" className="text-sm text-gray-400 hover:text-white">
              Management
            </a>
          </div>
        )}
      </aside>
      <main className="flex-1 flex items-center justify-center text-gray-500">
        Select a channel to view messages.
      </main>
    </div>
  );
}

export default App;
