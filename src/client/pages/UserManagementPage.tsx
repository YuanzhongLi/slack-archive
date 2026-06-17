import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import type { AppUser } from '../types/api';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Request failed');
    return r.json() as Promise<AppUser[]>;
  });

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

type Props = {
  currentUser: {
    id: string;
    email: string;
    role: 'root' | 'admin' | 'viewer';
  };
};

export default function UserManagementPage({ currentUser }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: users, error, isLoading, mutate } = useSWR<AppUser[]>('/api/users', fetcher);

  // Add user form state
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'viewer'>('viewer');
  const [adding, setAdding] = useState(false);

  // Feedback messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Transfer root dialog state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);

  if (currentUser.role === 'viewer') {
    return <Navigate to="/" replace />;
  }

  function clearMessages() {
    setErrorMsg(null);
    setSuccessMsg(null);
  }

  async function handleAddUser() {
    if (!newEmail.trim()) return;
    clearMessages();
    setAdding(true);
    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), role: newRole }),
      }).then((r) => {
        if (!r.ok) throw new Error('Request failed');
        return r.json() as Promise<AppUser>;
      });
      setSuccessMsg(t('userManagement.addSuccess'));
      setNewEmail('');
      setNewRole('viewer');
      await mutate();
    } catch {
      setErrorMsg(t('userManagement.errorGeneric'));
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteUser(user: AppUser) {
    if (!window.confirm(t('userManagement.confirmDelete', { email: user.email }))) return;
    clearMessages();
    try {
      await fetch(`/api/users/${user.id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error('Request failed');
        return r.json() as Promise<unknown>;
      });
      setSuccessMsg(t('userManagement.deleteSuccess'));
      await mutate();
    } catch {
      setErrorMsg(t('userManagement.errorGeneric'));
    }
  }

  async function handleRoleChange(user: AppUser, role: 'admin' | 'viewer') {
    clearMessages();
    try {
      await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      }).then((r) => {
        if (!r.ok) throw new Error('Request failed');
        return r.json() as Promise<AppUser>;
      });
      setSuccessMsg(t('userManagement.roleChangeSuccess'));
      await mutate();
    } catch {
      setErrorMsg(t('userManagement.errorGeneric'));
    }
  }

  async function handleTransferRoot() {
    if (!transferTargetId) return;
    clearMessages();
    setTransferring(true);
    try {
      await fetch('/api/users/transfer-root', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newRootId: transferTargetId }),
      }).then((r) => {
        if (!r.ok) throw new Error('Request failed');
        return r.json() as Promise<unknown>;
      });
      setSuccessMsg(t('userManagement.transferRootSuccess'));
      setTransferDialogOpen(false);
      setTransferTargetId('');
      await mutate();
    } catch {
      setErrorMsg(t('userManagement.errorGeneric'));
    } finally {
      setTransferring(false);
    }
  }

  const nonRootUsers = users?.filter((u) => u.role === 'admin') ?? [];

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <header className="p-4 border-b border-gray-700 flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/management')}
          className="text-gray-400 hover:text-white text-sm"
        >
          {t('common.back')}
        </button>
        <h1 className="font-bold text-lg">{t('userManagement.title')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Feedback messages */}
        {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
        {successMsg && <p className="text-sm text-green-400">{successMsg}</p>}

        {/* Transfer root button (root only) */}
        {currentUser.role === 'root' && (
          <section>
            <button
              type="button"
              onClick={() => {
                setTransferTargetId('');
                setTransferDialogOpen(true);
              }}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-medium transition-colors"
            >
              {t('userManagement.transferRoot')}
            </button>
          </section>
        )}

        {/* Add user form */}
        <section>
          <h2 className="text-base font-semibold mb-3">{t('userManagement.addUser')}</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t('userManagement.email')}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-64"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'admin' | 'viewer')}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="admin">admin</option>
              <option value="viewer">viewer</option>
            </select>
            <button
              type="button"
              onClick={handleAddUser}
              disabled={adding || !newEmail.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
            >
              {t('userManagement.addUser')}
            </button>
          </div>
        </section>

        {/* User list table */}
        <section>
          {isLoading && <p className="text-sm text-gray-400">{t('userManagement.loading')}</p>}
          {error && <p className="text-sm text-red-400">{t('userManagement.loadError')}</p>}
          {users && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider">
                    <th className="py-2 px-3">{t('userManagement.email')}</th>
                    <th className="py-2 px-3">{t('userManagement.role')}</th>
                    <th className="py-2 px-3">{t('userManagement.createdAt')}</th>
                    <th className="py-2 px-3" />
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 px-3 text-sm text-gray-500">
                        {t('userManagement.empty')}
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => {
                      const isSelf = user.id === currentUser.id;
                      const isRoot = user.role === 'root';
                      const disableControls = isSelf || isRoot;

                      return (
                        <tr key={user.id} className="border-t border-gray-700 text-sm">
                          <td className="py-2 px-3 text-gray-300">
                            <span>{user.email}</span>
                            {isRoot && (
                              <span className="ml-2 text-xs font-bold text-yellow-400">root</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-300">{user.role}</td>
                          <td className="py-2 px-3 text-gray-300">{formatDate(user.createdAt)}</td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <select
                                value={user.role === 'root' ? 'admin' : user.role}
                                disabled={disableControls}
                                onChange={(e) =>
                                  handleRoleChange(user, e.target.value as 'admin' | 'viewer')
                                }
                                className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-white disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-indigo-500"
                              >
                                <option value="admin">admin</option>
                                <option value="viewer">viewer</option>
                              </select>
                              <button
                                type="button"
                                disabled={isRoot || isSelf}
                                onClick={() => handleDeleteUser(user)}
                                className="px-2 py-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs transition-colors"
                              >
                                {t('userManagement.deleteUser')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Transfer root dialog */}
      {transferDialogOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-base font-semibold">{t('userManagement.transferRootTitle')}</h2>
            <p className="text-sm text-gray-400">{t('userManagement.transferRootDescription')}</p>
            <select
              value={transferTargetId}
              onChange={(e) => setTransferTargetId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">{t('userManagement.selectUser')}</option>
              {nonRootUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email} ({u.role})
                </option>
              ))}
            </select>
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setTransferDialogOpen(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
              >
                {t('userManagement.transferRootCancel')}
              </button>
              <button
                type="button"
                disabled={!transferTargetId || transferring}
                onClick={handleTransferRoot}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
              >
                {t('userManagement.transferRootConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
