import React, { useState } from 'react';
import { Lock, ShieldAlert, User as UserIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const LoginPage: React.FC = () => {
  const { login } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ავტორიზაცია ვერ მოხერხდა.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <p className="text-xs font-semibold tracking-wide text-teal-800 uppercase">
            შიდა სამუშაო სივრცე
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            მედრეგ — ქეისების მართვის სისტემა
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            სამედიცინო დაწესებულებებთან დაკავშირებული საქმეების, ვადების და დოკუმენტაციის კონტროლი
          </p>
        </div>

        <div className="mt-6 bg-white py-7 px-6 rounded-xl border border-slate-200 shadow-xs sm:px-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-900 flex items-start gap-2"
              >
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-rose-700" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="login-username" className="block text-sm font-medium text-slate-700 mb-1">
                მომხმარებლის სახელი
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="მაგ: imedo"
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-sky-700 focus:ring-1 focus:ring-sky-700"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1">
                პაროლი
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="შეიყვანეთ პაროლი"
                  className="w-full min-h-[44px] rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-sky-700 focus:ring-1 focus:ring-sky-700"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] rounded-lg bg-sky-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'მოწმდება...' : 'შესვლა'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-1.5 leading-relaxed">
            <p className="font-medium text-slate-700">ლოკალური MVP რეჟიმის შენიშვნა:</p>
            <p>
              ეს აპლიკაცია არის შიდა სამუშაო სივრცე და არ წარმოადგენს საქართველოს სსიპ სამედიცინო და
              ფარმაცევტული საქმიანობის რეგულირების სააგენტოს ან eMOH-ის ოფიციალურ სისტემას.
            </p>
            <p>
              მონაცემები დროებით ინახება მხოლოდ ამ ბრაუზერში (IndexedDB). რეალური პაციენტების მონაცემების
              შეყვანამდე საჭიროა დაცულ Firebase სერვერზე გადაყვანა.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
