import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { X, CheckCircle2, AlertCircle, LoaderCircle } from 'lucide-react';
export type User = {
  id: string;
  username: string;
  email: string;
  bio: string;
  role: 'user' | 'moderator' | 'admin';
  hasPassword: boolean;
  onboardingComplete: boolean;
};
export type Team = {
  id: string;
  name: string;
  nickname: string;
  conference: string;
  division: string;
  color: string;
  wins: number;
  losses: number;
  ties: number;
};
export type Player = {
  id: string;
  name: string;
  position: string;
  team_id: string;
  team_name: string;
  color: string;
  season: number;
  stats: Record<string, number>;
  weekly: Record<string, number>[];
};
export async function api<T = any>(url: string, method = 'GET', body?: any): Promise<T> {
  const response = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-StatArena': '1' },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ error: 'The server could not be reached.' }));
  if (!response.ok) throw new Error(result.error || 'Request failed. Please try again.');
  return result.data;
}
type Context = {
  user: User | null;
  season: number;
  setSeason: (n: number) => void;
  meta: any;
  version: number;
  refresh: () => void;
  notify: (s: string, error?: boolean) => void;
  reloadUser: () => Promise<void>;
  requireUser: () => boolean;
  favorites: { teams: string[]; players: string[] };
  follow: (type: 'teams' | 'players', id: string) => Promise<void>;
};
const AppContext = createContext<Context>(null!);
export const useApp = () => useContext(AppContext);
export function Provider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [meta, setMeta] = useState<any>(null),
    [season, setSeason] = useState(2024),
    [version, bump] = useState(0);
  const [favorites, setFavorites] = useState({ teams: [] as string[], players: [] as string[] });
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const navigate = useNavigate();
  const notify = (text: string, error = false) => setToast({ text, error });
  const refresh = () => bump((n) => n + 1);
  const reloadUser = async () => {
    setUser(await api('/auth/me'));
    refresh();
  };
  useEffect(() => {
    api('/auth/me')
      .then(setUser)
      .catch((e) => notify(e.message, true));
    api('/meta')
      .then((m) => {
        setMeta(m);
        if (m.seasons.length) setSeason(m.seasons[0]);
      })
      .catch((e) => notify(e.message, true));
  }, []);
  useEffect(() => {
    if (user)
      api('/favorites')
        .then(setFavorites)
        .catch((e) => notify(e.message, true));
    else setFavorites({ teams: [], players: [] });
  }, [user, version]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const requireUser = () => {
    if (user) return true;
    notify('Sign in to join the conversation.');
    navigate('/login');
    return false;
  };
  const follow = async (type: 'teams' | 'players', id: string) => {
    if (!requireUser()) return;
    try {
      const following = !favorites[type].includes(id);
      await api(`/favorites/${type}/${id}`, 'PUT', { following });
      setFavorites((f) => ({
        ...f,
        [type]: following ? [...f[type], id] : f[type].filter((x) => x !== id),
      }));
      refresh();
    } catch (e) {
      notify((e as Error).message, true);
    }
  };
  return (
    <AppContext.Provider
      value={{
        user,
        season,
        setSeason,
        meta,
        version,
        refresh,
        notify,
        reloadUser,
        requireUser,
        favorites,
        follow,
      }}
    >
      {children}
      {toast && (
        <div
          className={'toast ' + (toast.error ? 'error' : '')}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.text}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
export function useResource<T = any>(url: string | null) {
  const { version } = useApp();
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    if (!url) {
      setLoading(false);
      return;
    }
    api<T>(url)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [url, version]);
  return { data, error, loading };
}
export function Load({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string;
  children: ReactNode;
}) {
  const { refresh } = useApp();
  if (error)
    return (
      <div className="empty error-state">
        <AlertCircle />
        <h3>We couldn’t load this.</h3>
        <p>{error}</p>
        <button className="btn" onClick={refresh}>
          Try again
        </button>
      </div>
    );
  if (loading)
    return (
      <div className="loading" role="status">
        <LoaderCircle className="spin" /> Loading the arena…
      </div>
    );
  return <>{children}</>;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    const handler = (event: Event) => {
      if (close.current) close.current();
      else event.preventDefault();
    };
    el.addEventListener('cancel', handler);
    return () => {
      el.removeEventListener('cancel', handler);
      el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        {onClose && (
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <X />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
export function Badge({
  team,
  size = 'normal',
}: {
  team: Partial<Team> & { id: string };
  size?: 'small' | 'normal' | 'large';
}) {
  return (
    <span
      className={'team-badge ' + size}
      style={{ '--team-color': team.color || '#155e45' } as React.CSSProperties}
    >
      {team.id}
    </span>
  );
}
export const num = (n: number | undefined) =>
  n === undefined ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
export const date = (
  s: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) => new Date(s).toLocaleDateString('en-US', options);
export const metrics: Record<string, string> = {
  passing_yards: 'Passing yards',
  passing_tds: 'Passing TDs',
  rushing_yards: 'Rushing yards',
  rushing_tds: 'Rushing TDs',
  receiving_yards: 'Receiving yards',
  receiving_tds: 'Receiving TDs',
  receptions: 'Receptions',
  completions: 'Completions',
  attempts: 'Pass attempts',
  interceptions: 'Interceptions',
  completion_pct: 'Completion %',
  games: 'Games played',
  carries: 'Carries',
  targets: 'Targets',
};
