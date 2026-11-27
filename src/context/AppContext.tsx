import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authService } from '../auth/AuthService';
import { dataRepo, WorkspaceSnapshot } from '../repositories/DataRepository';
import { PermissionAction, SafeUser } from '../models/types';
import { CaseFilterCriteria, hasPermission } from '../utils/caseLogic';
import { flushCloudWrites, startLiveSync } from '../firebase/cloudSync';

export type NavPageId =
  | 'dashboard'
  | 'cases'
  | 'case_new'
  | 'case_detail'
  | 'tasks'
  | 'calendar'
  | 'clinics'
  | 'doctors'
  | 'visits'
  | 'correspondence'
  | 'documents_req'
  | 'reviews'
  | 'commissions'
  | 'vault'
  | 'reports'
  | 'users'
  | 'settings';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  text: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface AppContextValue {
  currentUser: SafeUser | null;
  authLoading: boolean;
  snapshot: WorkspaceSnapshot | null;
  dataLoading: boolean;
  activePage: NavPageId;
  activeCaseId: string | null;
  activeCaseTab: string;
  casePresetFilter: CaseFilterCriteria | null;
  setCasePresetFilter: (filter: CaseFilterCriteria | null) => void;
  navigate: (page: NavPageId, options?: { caseId?: string; tab?: string; preset?: CaseFilterCriteria }) => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshData: () => Promise<void>;
  can: (action: PermissionAction) => boolean;
  revealSensitive: boolean;
  setRevealSensitive: (v: boolean) => void;
  toasts: ToastMessage[];
  notify: (text: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;
  confirmAction: (options: ConfirmOptions) => Promise<boolean>;
  pendingConfirm: (ConfirmOptions & { resolve: (v: boolean) => void }) | null;
  resolveConfirm: (val: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<SafeUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  const [activePage, setActivePage] = useState<NavPageId>('dashboard');
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [activeCaseTab, setActiveCaseTab] = useState<string>('overview');
  const [casePresetFilter, setCasePresetFilter] = useState<CaseFilterCriteria | null>(null);
  const [revealSensitive, setRevealSensitive] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const confirmAction = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPendingConfirm({ ...options, resolve });
    });
  }, []);

  const resolveConfirm = useCallback(
    (val: boolean) => {
      if (pendingConfirm) {
        pendingConfirm.resolve(val);
        setPendingConfirm(null);
      }
    },
    [pendingConfirm]
  );

  const refreshData = useCallback(async () => {
    setDataLoading(true);
    try {
      const data = await dataRepo.loadAll();
      setSnapshot(data);
      void flushCloudWrites();
    } catch (err) {
      console.error('Failed loading workspace snapshot');
      notify(err instanceof Error ? err.message : 'მონაცემების ჩატვირთვა ვერ მოხერხდა.', 'error');
    } finally {
      setDataLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const user = await authService.getCurrentUser();
        if (!mounted) return;
        setCurrentUser(user);
        if (user) {
          await refreshData();
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshData]);

  useEffect(() => {
    if (!currentUser) return;
    return startLiveSync(
      () => void refreshData(),
      () => {}
    );
  }, [currentUser, notify, refreshData]);

  const navigate = useCallback(
    (
      page: NavPageId,
      options?: { caseId?: string; tab?: string; preset?: CaseFilterCriteria }
    ) => {
      setActivePage(page);
      if (options?.caseId !== undefined) {
        setActiveCaseId(options.caseId);
      }
      if (options?.tab) {
        setActiveCaseTab(options.tab);
      } else if (page === 'case_detail') {
        setActiveCaseTab('overview');
      }
      if (options?.preset !== undefined) {
        setCasePresetFilter(options.preset);
      } else if (page === 'cases' && !options?.preset) {
        // Keep existing preset only if navigating directly with preset
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  const login = useCallback(
    async (username: string, password: string) => {
      const user = await authService.login(username, password);
      setCurrentUser(user);
      await refreshData();
      setActivePage('dashboard');
      notify(`კეთილი იყოს თქვენი მობრძანება, ${user.fullName}`, 'success');
    },
    [notify, refreshData]
  );

  const logout = useCallback(async () => {
    const user = await authService.getCurrentUser();
    setCurrentUser(user);
    setActiveCaseId(null);
    setActivePage('dashboard');
    setRevealSensitive(false);
  }, []);

  const can = useCallback(
    (action: PermissionAction) => {
      if (!currentUser || !snapshot) return false;
      return hasPermission(currentUser.role, action, snapshot.settings);
    },
    [currentUser, snapshot]
  );

  return (
    <AppContext.Provider
      value={{
        currentUser,
        authLoading,
        snapshot,
        dataLoading,
        activePage,
        activeCaseId,
        activeCaseTab,
        casePresetFilter,
        setCasePresetFilter,
        navigate,
        login,
        logout,
        refreshData,
        can,
        revealSensitive,
        setRevealSensitive,
        toasts,
        notify,
        dismissToast,
        confirmAction,
        pendingConfirm,
        resolveConfirm,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
