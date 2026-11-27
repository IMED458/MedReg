import React, { useMemo, useState } from 'react';
import {
  Archive,
  BarChart3,
  Bell,
  Building2,
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FilePlus2,
  FileSearch,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { NavPageId, useApp } from '../../context/AppContext';
import { ROLE_LABELS } from '../../settings/defaultSettings';
import { formatGeorgianDate, getTbilisiDateISO } from '../../utils/caseLogic';
import { dataRepo } from '../../repositories/DataRepository';

interface NavItem {
  id: NavPageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredAction?: 'manage_users' | 'manage_settings' | 'create';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'მთავარი / Dashboard', icon: LayoutDashboard },
  { id: 'cases', label: 'ყველა ქეისი', icon: FolderKanban },
  { id: 'case_new', label: 'ახალი ქეისი', icon: FilePlus2, requiredAction: 'create' },
  { id: 'tasks', label: 'ჩემი დავალებები და ვადები', icon: CheckSquare },
  { id: 'calendar', label: 'კალენდარი / ვიზიტები', icon: Calendar },
  { id: 'clinics', label: 'კლინიკები და დაწესებულებები', icon: Building2 },
  { id: 'doctors', label: 'ექიმები და საკონტაქტო პირები', icon: Stethoscope },
  { id: 'visits', label: 'შემოწმებები და აქტები', icon: ClipboardCheck },
  { id: 'correspondence', label: 'წერილები და კორესპონდენცია', icon: Mail },
  { id: 'documents_req', label: 'გამოთხოვილი დოკუმენტები', icon: FileSearch },
  { id: 'reviews', label: 'რეცენზიები', icon: Scale },
  { id: 'commissions', label: 'კომისიები / ჯგუფები', icon: UsersRound },
  { id: 'vault', label: 'დოკუმენტების საცავი', icon: Archive },
  { id: 'reports', label: 'ანგარიშები', icon: BarChart3 },
  { id: 'users', label: 'თანამშრომლები და მომხმარებლები', icon: Users, requiredAction: 'manage_users' },
  { id: 'settings', label: 'პარამეტრები', icon: Settings },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentUser,
    snapshot,
    activePage,
    activeCaseId,
    navigate,
    logout,
    can,
    refreshData,
    notify,
  } = useApp();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);

  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (!item.requiredAction) return true;
      return can(item.requiredAction);
    });
  }, [can]);

  const activeCase = useMemo(() => {
    if (!snapshot || !activeCaseId) return null;
    return snapshot.cases.find((c) => c.id === activeCaseId) || null;
  }, [snapshot, activeCaseId]);

  const breadcrumbs = useMemo<Array<{ label: string; page?: NavPageId }>>(() => {
    const base: Array<{ label: string; page?: NavPageId }> = [{ label: 'მთავარი', page: 'dashboard' }];
    if (activePage === 'dashboard') return base;
    if (activePage === 'case_detail' && activeCase) {
      return [
        ...base,
        { label: 'ყველა ქეისი', page: 'cases' },
        { label: activeCase.caseNumber },
      ];
    }
    const found = NAV_ITEMS.find((i) => i.id === activePage);
    if (found) {
      return [...base, { label: found.label }];
    }
    return base;
  }, [activePage, activeCase]);

  const globalSearchResults = useMemo(() => {
    if (!snapshot || !searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    const results: Array<{ type: string; label: string; sub: string; onClick: () => void }> = [];

    for (const c of snapshot.cases) {
      if (c.deletedAt) continue;
      if (
        c.caseNumber.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (c.emohRegNumber || '').toLowerCase().includes(q) ||
        (c.complaintNumber || '').toLowerCase().includes(q)
      ) {
        results.push({
          type: 'ქეისი',
          label: `${c.caseNumber} — ${c.title}`,
          sub: c.emohRegNumber ? `eMOH: ${c.emohRegNumber}` : c.shortSummary,
          onClick: () => {
            navigate('case_detail', { caseId: c.id });
            setSearchQuery('');
            setSearchFocused(false);
          },
        });
      }
      if (results.length >= 6) break;
    }

    for (const org of snapshot.organizations) {
      if (org.deletedAt) continue;
      if (
        org.legalName.toLowerCase().includes(q) ||
        (org.tradeName || '').toLowerCase().includes(q) ||
        org.taxId.toLowerCase().includes(q)
      ) {
        results.push({
          type: 'კლინიკა',
          label: org.legalName,
          sub: `${org.municipality} · ს/კ ${org.taxId}`,
          onClick: () => {
            navigate('clinics');
            setSearchQuery('');
            setSearchFocused(false);
          },
        });
      }
      if (results.length >= 10) break;
    }

    for (const doc of snapshot.doctors) {
      if (doc.deletedAt) continue;
      if (doc.fullName.toLowerCase().includes(q) || doc.specialty.toLowerCase().includes(q)) {
        results.push({
          type: 'ექიმი',
          label: doc.fullName,
          sub: doc.specialty,
          onClick: () => {
            navigate('doctors');
            setSearchQuery('');
            setSearchFocused(false);
          },
        });
      }
      if (results.length >= 12) break;
    }

    return results;
  }, [snapshot, searchQuery, navigate]);

  const activeRemindersAndAlerts = useMemo(() => {
    if (!snapshot || !currentUser) return [];
    const today = getTbilisiDateISO();
    const list: Array<{
      id: string;
      kind: 'reminder' | 'deadline';
      title: string;
      sub: string;
      caseId?: string;
      urgent: boolean;
    }> = [];

    for (const r of snapshot.reminders) {
      if (!r.deletedAt && !r.isDismissed && r.userId === currentUser.id) {
        list.push({
          id: r.id,
          kind: 'reminder',
          title: r.title,
          sub: `შეხსენება: ${formatGeorgianDate(r.remindAt, snapshot.settings.dateFormat)}`,
          caseId: r.caseId,
          urgent: r.remindAt.slice(0, 10) <= today,
        });
      }
    }

    for (const t of snapshot.tasks) {
      if (
        !t.deletedAt &&
        (t.status === 'open' || t.status === 'in_progress') &&
        t.assignedTo === currentUser.id &&
        t.dueDate &&
        t.dueDate.slice(0, 10) <= today
      ) {
        list.push({
          id: `task-${t.id}`,
          kind: 'deadline',
          title: `დავალება: ${t.title}`,
          sub: `ვადა: ${formatGeorgianDate(t.dueDate, snapshot.settings.dateFormat)}`,
          caseId: t.caseId,
          urgent: t.dueDate.slice(0, 10) < today,
        });
      }
    }

    return list;
  }, [snapshot, currentUser]);

  const dismissReminder = async (id: string) => {
    if (!snapshot) return;
    const rem = snapshot.reminders.find((r) => r.id === id);
    if (!rem) return;
    await dataRepo.saveReminder({ ...rem, isDismissed: true, updatedAt: new Date().toISOString() });
    await refreshData();
    notify('შეხსენება მონიშნულია წაკითხულად.', 'info');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-900">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-slate-200 bg-white shrink-0 transition-all duration-150 no-print ${
          sidebarCollapsed ? 'w-[68px]' : 'w-[280px]'
        }`}
      >
        <div className="h-14 px-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => navigate('dashboard')}
              className="text-left min-w-0"
            >
              <span className="block text-sm font-bold text-sky-950 truncate">მედრეგ · სივრცე</span>
              <span className="block text-[11px] text-slate-500 truncate">ქეისების მართვის MVP</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((p) => !p)}
            aria-label={sidebarCollapsed ? 'მენიუს გაშლა' : 'მენიუს ჩაკეცვა'}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 shrink-0"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" aria-label="ძირითადი ნავიგაცია">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active =
              activePage === item.id || (item.id === 'cases' && activePage === 'case_detail');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'cases') {
                    navigate('cases', { preset: null as unknown as undefined });
                  } else {
                    navigate(item.id);
                  }
                }}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full min-h-[40px] flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-sky-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-500'}`} />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="p-3 border-t border-slate-200 bg-slate-50/70 text-[11px] text-slate-500 leading-snug">
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              <span>ლოკალური IndexedDB რეჟიმი</span>
            </div>
            <p className="mt-1">არ არის ოფიციალური eMOH / სააგენტოს სისტემა.</p>
          </div>
        )}
      </aside>

      {/* Mobile Slide-Over Menu Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between">
              <span className="text-sm font-bold text-sky-950">მედრეგ · მენიუ</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="მენიუს დახურვა"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2.5 space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      navigate(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full min-h-[44px] flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium ${
                      active ? 'bg-sky-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-3 border-t border-slate-200 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">{currentUser?.fullName}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {currentUser ? ROLE_LABELS[currentUser.role] : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                aria-label="სისტემიდან გამოსვლა"
                className="min-h-[44px] px-3 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1"
              >
                <LogOut className="w-4 h-4" />
                გამოსვლა
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-3 sm:px-5 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="ნავიგაციის გახსნა"
              className="md:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Global Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ძებნა: CASE-..., eMOH, კლინიკა, ექიმი..."
                aria-label="გლობალური ძებნა"
                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:bg-white focus:outline-none focus:border-sky-700"
              />
              {searchFocused && searchQuery.trim() && (
                <div className="absolute left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg z-40 max-h-80 overflow-y-auto">
                  {globalSearchResults.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500">შედეგები ვერ მოიძებნა</div>
                  ) : (
                    globalSearchResults.map((res, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          res.onClick();
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-sky-50 border-b border-slate-100 last:border-b-0 flex flex-col"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-900 truncate">{res.label}</span>
                          <span className="text-[11px] font-medium text-sky-800 shrink-0">{res.type}</span>
                        </div>
                        {res.sub && <span className="text-xs text-slate-500 truncate">{res.sub}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {can('create') && (
              <button
                type="button"
                onClick={() => navigate('case_new')}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-sky-900 px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-sky-950 whitespace-nowrap shrink-0"
              >
                <FilePlus2 className="w-4 h-4" />
                <span className="hidden sm:inline">+ ახალი ქეისი</span>
                <span className="sm:hidden">+ ქეისი</span>
              </button>
            )}

            {/* Reminders & Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setRemindersOpen((p) => !p)}
                aria-label="შეხსენებები"
                className="relative min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                <Bell className="w-4 h-4" />
                {activeRemindersAndAlerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-700 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                    {activeRemindersAndAlerts.length}
                  </span>
                )}
              </button>

              {remindersOpen && (
                <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-xl z-40 p-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-semibold text-slate-900">შეხსენებები და ვადები</span>
                    <button
                      type="button"
                      onClick={() => {
                        setRemindersOpen(false);
                        navigate('tasks');
                      }}
                      className="text-xs text-sky-800 hover:underline"
                    >
                      ყველა დავალება
                    </button>
                  </div>
                  <div className="mt-2 max-h-64 overflow-y-auto space-y-2">
                    {activeRemindersAndAlerts.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">აქტიური შეხსენება არ არის.</p>
                    ) : (
                      activeRemindersAndAlerts.map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-lg border p-2.5 text-xs ${
                            item.urgent ? 'border-rose-200 bg-rose-50/70' : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRemindersOpen(false);
                                if (item.caseId) navigate('case_detail', { caseId: item.caseId });
                                else navigate('tasks');
                              }}
                              className="text-left font-medium text-slate-900 hover:underline"
                            >
                              {item.title}
                            </button>
                            {item.kind === 'reminder' && (
                              <button
                                type="button"
                                onClick={() => void dismissReminder(item.id)}
                                className="text-[11px] text-slate-500 hover:text-slate-900 shrink-0"
                              >
                                დახურვა
                              </button>
                            )}
                          </div>
                          <p className="mt-0.5 text-slate-600 tabular-nums">{item.sub}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile & Logout */}
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
              <button
                type="button"
                onClick={() => navigate('settings')}
                className="text-right hover:opacity-80"
                title="პროფილი და პარამეტრები"
              >
                <span className="block text-xs font-semibold text-slate-900 leading-tight">
                  {currentUser?.fullName}
                </span>
                <span className="block text-[11px] text-slate-500 leading-tight">
                  {currentUser ? ROLE_LABELS[currentUser.role] : ''}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                aria-label="სისტემიდან გამოსვლა"
                title="გამოსვლა"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-700"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* First-login weak password advisory (dismissible/navigates to settings) */}
        {currentUser?.mustChangePassword && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2 no-print">
            <span>
              <strong>უსაფრთხოების რეკომენდაცია:</strong> თქვენ შეხვედით საწყისი სატესტო პაროლით (imedo / imed458).
              გთხოვთ შეცვალოთ პაროლი პროფილის პარამეტრებში.
            </span>
            <button
              type="button"
              onClick={() => navigate('settings')}
              className="font-semibold text-amber-900 underline hover:text-amber-700 whitespace-nowrap"
            >
              პაროლის შეცვლა
            </button>
          </div>
        )}

        {/* Breadcrumbs */}
        <div className="px-4 sm:px-6 pt-3 pb-1 flex items-center gap-1.5 text-xs text-slate-500 no-print">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span aria-hidden="true">/</span>}
              {b.page ? (
                <button
                  type="button"
                  onClick={() => navigate(b.page!)}
                  className="hover:text-sky-800 hover:underline"
                >
                  {b.label}
                </button>
              ) : (
                <span className="font-medium text-slate-800 truncate">{b.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Page Body */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>

      {/* Mobile Bottom Navigation Bar (<= 15% mobile sticky cap, 44px touch targets) */}
      <nav
        aria-label="მობილური ნავიგაცია"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 no-print"
      >
        <button
          type="button"
          onClick={() => navigate('dashboard')}
          className={`flex flex-col items-center justify-center text-[10px] font-medium ${
            activePage === 'dashboard' ? 'text-sky-900' : 'text-slate-500'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span>მთავარი</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('cases')}
          className={`flex flex-col items-center justify-center text-[10px] font-medium ${
            activePage === 'cases' || activePage === 'case_detail' ? 'text-sky-900' : 'text-slate-500'
          }`}
        >
          <FolderKanban className="w-5 h-5 mb-0.5" />
          <span>ქეისები</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('tasks')}
          className={`flex flex-col items-center justify-center text-[10px] font-medium ${
            activePage === 'tasks' ? 'text-sky-900' : 'text-slate-500'
          }`}
        >
          <CheckSquare className="w-5 h-5 mb-0.5" />
          <span>დავალებები</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center text-[10px] font-medium text-slate-500"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span>მენიუ</span>
        </button>
      </nav>
    </div>
  );
};
