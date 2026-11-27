import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Columns3,
  Download,
  ExternalLink,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  CaseFilterCriteria,
  filterAndSortCases,
  formatGeorgianDate,
  formatGeorgianDateTime,
  generateCasesCsv,
  getDeadlineUrgency,
  getTbilisiDateISO,
  isCaseOverdue,
  isClosedStatus,
} from '../../utils/caseLogic';
import { EmptyState, StatusLabel, UrgencyChip } from '../../components/ui/CommonUI';

interface ColumnDef {
  id: string;
  label: string;
  defaultVisible: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: 'caseNumber', label: 'შიდა ნომერი', defaultVisible: true },
  { id: 'title', label: 'სათაური / არსი', defaultVisible: true },
  { id: 'applicant', label: 'განმცხადებელი', defaultVisible: true },
  { id: 'patient', label: 'პაციენტი', defaultVisible: true },
  { id: 'clinic', label: 'კლინიკა', defaultVisible: true },
  { id: 'emoh', label: 'eMOH № / თარიღი', defaultVisible: true },
  { id: 'source', label: 'საფუძველი', defaultVisible: true },
  { id: 'assignee', label: 'პასუხისმგებელი', defaultVisible: true },
  { id: 'status', label: 'ეტაპი / სტატუსი', defaultVisible: true },
  { id: 'nextTask', label: 'უახლოესი დავალება / ვადა', defaultVisible: true },
  { id: 'lastActivity', label: 'ბოლო აქტივობა', defaultVisible: true },
];

const COL_PREF_KEY = 'medreg_case_table_columns_v1';

export const CaseTableWidget: React.FC<{
  initialCriteria?: CaseFilterCriteria | null;
  compactHeader?: boolean;
}> = ({ initialCriteria, compactHeader }) => {
  const { currentUser, snapshot, navigate, can, notify } = useApp();

  const [criteria, setCriteria] = useState<CaseFilterCriteria>(
    initialCriteria || { sortBy: 'lastActivityAt', sortDir: 'desc' }
  );
  const [showFilters, setShowFilters] = useState(Boolean(initialCriteria));
  const [showColMenu, setShowColMenu] = useState(false);

  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(COL_PREF_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
  });

  useEffect(() => {
    if (initialCriteria) {
      setCriteria((prev) => ({ ...prev, ...initialCriteria }));
    }
  }, [initialCriteria]);

  const toggleColumn = (id: string) => {
    setVisibleCols((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
      if (next.length === 0) return prev;
      localStorage.setItem(COL_PREF_KEY, JSON.stringify(next));
      return next;
    });
  };

  const todayISO = getTbilisiDateISO();

  const filteredCases = useMemo(() => {
    if (!snapshot || !currentUser) return [];
    return filterAndSortCases(snapshot.cases, criteria, {
      currentUserId: currentUser.id,
      settings: snapshot.settings,
      applicants: snapshot.applicants,
      patients: snapshot.patients,
      organizations: snapshot.organizations,
      caseOrgLinks: snapshot.caseOrganizations,
      doctors: snapshot.doctors,
      caseDoctors: snapshot.caseDoctors,
      caseCommissions: snapshot.caseCommissions,
      tasks: snapshot.tasks,
      docRequests: snapshot.documentRequests,
      reviews: snapshot.reviewAssignments,
      todayISO,
    });
  }, [snapshot, currentUser, criteria, todayISO]);

  if (!snapshot || !currentUser) return null;

  const { settings } = snapshot;

  const handleSort = (field: CaseFilterCriteria['sortBy']) => {
    setCriteria((prev) => ({
      ...prev,
      sortBy: field,
      sortDir: prev.sortBy === field && prev.sortDir === 'desc' ? 'asc' : 'desc',
    }));
  };

  const handleExportCsv = () => {
    if (!can('export')) {
      notify('თქვენს როლს არ აქვს ექსპორტის უფლება.', 'error');
      return;
    }
    const csv = generateCasesCsv({
      cases: filteredCases,
      settings,
      users: snapshot.users,
      applicants: snapshot.applicants,
      patients: snapshot.patients,
      organizations: snapshot.organizations,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cases_export_${todayISO}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    notify(`ექსპორტირებულია ${filteredCases.length} ქეისი (Excel UTF-8 CSV).`, 'success');
  };

  const resetFilters = () => {
    setCriteria({ sortBy: 'lastActivityAt', sortDir: 'desc' });
  };

  const canViewSensitive = can('view_sensitive');

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <input
            type="text"
            value={criteria.search || ''}
            onChange={(e) => setCriteria((p) => ({ ...p, search: e.target.value }))}
            placeholder="ტექსტური ძებნა ქეისებში..."
            aria-label="ტექსტური ძებნა ქეისებში"
            className="h-9 w-full sm:w-64 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:border-sky-700"
          />
          <button
            type="button"
            onClick={() => setShowFilters((p) => !p)}
            className={`h-9 inline-flex items-center gap-1.5 rounded-lg border px-3 text-xs font-medium whitespace-nowrap ${
              showFilters
                ? 'border-sky-700 bg-sky-50 text-sky-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            ფილტრები
          </button>
          {(criteria.kpiPreset ||
            criteria.statusId ||
            criteria.organizationId ||
            criteria.doctorId ||
            criteria.assignedTo ||
            criteria.onlyOverdue ||
            criteria.onlyWaitingDocs ||
            criteria.onlyWaitingReviews ||
            criteria.search ||
            criteria.caseNumber) && (
            <button
              type="button"
              onClick={resetFilters}
              className="h-9 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600 hover:text-slate-900 whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              გასუფთავება
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!compactHeader && (
            <span className="text-xs text-slate-500 tabular-nums">
              ნაპოვნია: <strong className="text-slate-900">{filteredCases.length}</strong>
            </span>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColMenu((p) => !p)}
              className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Columns3 className="w-3.5 h-3.5" />
              სვეტები
            </button>
            {showColMenu && (
              <div className="absolute right-0 mt-1 w-56 rounded-xl border border-slate-200 bg-white shadow-lg p-2.5 z-30 space-y-1">
                <p className="text-[11px] font-semibold text-slate-500 px-1 pb-1 border-b border-slate-100">
                  სვეტების ჩვენება
                </p>
                {ALL_COLUMNS.map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 text-xs text-slate-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.includes(col.id)}
                      onChange={() => toggleColumn(col.id)}
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {can('export') && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              CSV ექსპორტი
            </button>
          )}
        </div>
      </div>

      {/* Expandable Multi-Criteria Filter Panel */}
      {showFilters && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">ნომერი (CASE / eMOH / საჩივარი)</label>
            <input
              type="text"
              value={criteria.caseNumber || ''}
              onChange={(e) => setCriteria((p) => ({ ...p, caseNumber: e.target.value }))}
              className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">დაწყების პერიოდი (-დან)</label>
            <input
              type="date"
              value={criteria.dateFrom || ''}
              onChange={(e) => setCriteria((p) => ({ ...p, dateFrom: e.target.value }))}
              className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">დაწყების პერიოდი (-მდე)</label>
            <input
              type="date"
              value={criteria.dateTo || ''}
              onChange={(e) => setCriteria((p) => ({ ...p, dateTo: e.target.value }))}
              className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">კლინიკა / დაწესებულება</label>
            <select
              value={criteria.organizationId || ''}
              onChange={(e) => setCriteria((p) => ({ ...p, organizationId: e.target.value }))}
              className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-sm bg-white"
            >
              <option value="">ყველა კლინიკა</option>
              {snapshot.organizations
                .filter((o) => !o.deletedAt)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.legalName}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">ექიმი</label>
            <select
              value={criteria.doctorId || ''}
              onChange={(e) => setCriteria((p) => ({ ...p, doctorId: e.target.value }))}
              className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-sm bg-white"
            >
              <option value="">ყველა ექიმი</option>
              {snapshot.doctors
                .filter((d) => !d.deletedAt)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">განმცხადებელი</label>
            <input
              type="text"
              value={criteria.applicantQuery || ''}
              onChange={(e) => setCriteria((p) => ({ ...p, applicantQuery: e.target.value }))}
              className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-sm"
            />
          </div>
          {canViewSensitive && (
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">პაციენტი</label>
              <input
                type="text"
                value={criteria.patientQuery || ''}
                onChange={(e) => setCriteria((p) => ({ ...p, patientQuery: e.target.value }))}
                className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-sm"
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">თანამშრომელი</label>
            <select
              value={criteria.assignedTo || ''}
              onChange={(e) => setCriteria((p) => ({ ...p, assignedTo: e.target.value }))}
              className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-sm bg-white"
            >
              <option value="">ყველა თანამშრომელი</option>
              {snapshot.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">სტატუსი</label>
            <select
              value={criteria.statusId || ''}
              onChange={(e) => setCriteria((p) => ({ ...p, statusId: e.target.value }))}
              className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-sm bg-white"
            >
              <option value="">ყველა სტატუსი</option>
              {settings.caseStatuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">წყარო / საფუძველი</label>
            <select
              value={criteria.sourceId || ''}
              onChange={(e) => setCriteria((p) => ({ ...p, sourceId: e.target.value }))}
              className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-sm bg-white"
            >
              <option value="">ყველა საფუძველი</option>
              {settings.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">პრიორიტეტი</label>
            <select
              value={criteria.priority || ''}
              onChange={(e) => setCriteria((p) => ({ ...p, priority: e.target.value }))}
              className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-sm bg-white"
            >
              <option value="">ყველა</option>
              {settings.priorities.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">კომისია / ჯგუფი</label>
            <select
              value={criteria.commissionId || ''}
              onChange={(e) => setCriteria((p) => ({ ...p, commissionId: e.target.value }))}
              className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-sm bg-white"
            >
              <option value="">ყველა კომისია</option>
              {snapshot.commissions
                .filter((cm) => !cm.deletedAt)
                .map((cm) => (
                  <option key={cm.id} value={cm.id}>
                    {cm.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-4 pt-1 border-t border-slate-100">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(criteria.onlyOverdue)}
                onChange={(e) => setCriteria((p) => ({ ...p, onlyOverdue: e.target.checked }))}
              />
              მხოლოდ ვადაგადაცილებული
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(criteria.onlyWaitingDocs)}
                onChange={(e) => setCriteria((p) => ({ ...p, onlyWaitingDocs: e.target.checked }))}
              />
              დოკუმენტის მოლოდინში
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(criteria.onlyWaitingReviews)}
                onChange={(e) => setCriteria((p) => ({ ...p, onlyWaitingReviews: e.target.checked }))}
              />
              რეცენზიის მოლოდინში
            </label>
          </div>
        </div>
      )}

      {filteredCases.length === 0 ? (
        <EmptyState
          title="ქეისები ვერ მოიძებნა"
          description="მიმდინარე ფილტრებით ჩანაწერები არ არის. შეგიძლიათ გაასუფთაოთ ფილტრი ან დაარეგისტრიროთ ახალი ქეისი."
          actionLabel={can('create') ? '+ ახალი ქეისი' : undefined}
          onAction={can('create') ? () => navigate('case_new') : undefined}
          secondaryLabel="ფილტრების გასუფთავება"
          onSecondary={resetFilters}
        />
      ) : (
        <>
          {/* Desktop Data Table */}
          <div className="hidden md:block rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600">
                  {visibleCols.includes('caseNumber') && (
                    <th className="py-2.5 px-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSort('caseNumber')}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        შიდა ნომერი
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  )}
                  {visibleCols.includes('title') && (
                    <th className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => handleSort('title')}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        ქეისის სათაური / არსი
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  )}
                  {visibleCols.includes('applicant') && <th className="py-2.5 px-3">განმცხადებელი</th>}
                  {visibleCols.includes('patient') && <th className="py-2.5 px-3">პაციენტი</th>}
                  {visibleCols.includes('clinic') && <th className="py-2.5 px-3">კლინიკა</th>}
                  {visibleCols.includes('emoh') && <th className="py-2.5 px-3 whitespace-nowrap">eMOH № / თარიღი</th>}
                  {visibleCols.includes('source') && <th className="py-2.5 px-3">საფუძველი</th>}
                  {visibleCols.includes('assignee') && <th className="py-2.5 px-3">პასუხისმგებელი</th>}
                  {visibleCols.includes('status') && <th className="py-2.5 px-3">ეტაპი / სტატუსი</th>}
                  {visibleCols.includes('nextTask') && (
                    <th className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => handleSort('deadlineDate')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 whitespace-nowrap"
                      >
                        უახლოესი დავალება / ვადა
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  )}
                  {visibleCols.includes('lastActivity') && (
                    <th className="py-2.5 px-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSort('lastActivityAt')}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        ბოლო აქტივობა
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  )}
                  <th className="py-2.5 px-3 text-right">გახსნა</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredCases.map((c) => {
                  const statusObj = settings.caseStatuses.find((s) => s.id === c.statusId);
                  const sourceObj = settings.sources.find((s) => s.id === c.sourceId);
                  const assignee = snapshot.users.find((u) => u.id === c.assignedTo);
                  const app = snapshot.applicants.find((a) => a.caseId === c.id && !a.deletedAt);
                  const pats = snapshot.patients.filter((p) => p.caseId === c.id && !p.deletedAt);
                  const org = snapshot.organizations.find((o) => o.id === c.primaryOrganizationId);
                  const openTasks = snapshot.tasks
                    .filter((t) => t.caseId === c.id && !t.deletedAt && (t.status === 'open' || t.status === 'in_progress'))
                    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
                  const nextTask = openTasks[0];
                  const overdue = isCaseOverdue(
                    c,
                    settings,
                    snapshot.tasks,
                    snapshot.documentRequests,
                    snapshot.reviewAssignments,
                    todayISO
                  );
                  const closed = isClosedStatus(c.statusId, settings);
                  const refDue = nextTask?.dueDate || c.deadlineDate;
                  const urgency = getDeadlineUrgency(refDue, closed, todayISO);

                  return (
                    <tr
                      key={c.id}
                      onClick={() => navigate('case_detail', { caseId: c.id })}
                      className="hover:bg-sky-50/40 cursor-pointer transition-colors"
                    >
                      {visibleCols.includes('caseNumber') && (
                        <td className="py-2.5 px-3 font-mono font-medium text-sky-900 tabular-nums whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{c.caseNumber}</span>
                            {c.isTestSample && (
                              <span className="text-[10px] font-sans text-amber-800 bg-amber-50 border border-amber-200 px-1 rounded">
                                სატესტო
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleCols.includes('title') && (
                        <td className="py-2.5 px-3 max-w-[240px]">
                          <p className="font-medium text-slate-900 truncate">{c.title}</p>
                          <p className="text-[11px] text-slate-500 truncate">{c.shortSummary}</p>
                        </td>
                      )}
                      {visibleCols.includes('applicant') && (
                        <td className="py-2.5 px-3 text-slate-700 max-w-[160px] truncate">
                          {app?.name || '—'}
                        </td>
                      )}
                      {visibleCols.includes('patient') && (
                        <td className="py-2.5 px-3 text-slate-700 max-w-[160px] truncate">
                          {!canViewSensitive
                            ? 'დაფარული'
                            : pats.length === 0
                              ? '—'
                              : pats[0].isSameAsApplicant
                                ? `${pats[0].fullName} · იგივე პირი`
                                : pats.map((p) => p.fullName).join(', ')}
                        </td>
                      )}
                      {visibleCols.includes('clinic') && (
                        <td className="py-2.5 px-3 text-slate-700 max-w-[180px] truncate">
                          {org?.legalName || '—'}
                        </td>
                      )}
                      {visibleCols.includes('emoh') && (
                        <td className="py-2.5 px-3 text-slate-700 tabular-nums whitespace-nowrap">
                          {c.emohRegNumber ? (
                            <div>
                              <span className="font-mono text-[11px]">{c.emohRegNumber}</span>
                              {c.emohRegDate && (
                                <span className="block text-[11px] text-slate-500">
                                  {formatGeorgianDate(c.emohRegDate, settings.dateFormat)}
                                </span>
                              )}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                      {visibleCols.includes('source') && (
                        <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                          {sourceObj?.label || c.sourceId}
                        </td>
                      )}
                      {visibleCols.includes('assignee') && (
                        <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                          {assignee?.fullName || '—'}
                        </td>
                      )}
                      {visibleCols.includes('status') && (
                        <td className="py-2.5 px-3">
                          <StatusLabel
                            label={statusObj?.label || c.statusId}
                            tone={statusObj?.color || 'slate'}
                            compact
                          />
                        </td>
                      )}
                      {visibleCols.includes('nextTask') && (
                        <td className="py-2.5 px-3">
                          <div className="space-y-0.5">
                            {nextTask && (
                              <p className="text-[11px] text-slate-800 truncate max-w-[160px]">{nextTask.title}</p>
                            )}
                            <div className="flex items-center gap-1">
                              <UrgencyChip urgency={urgency} date={refDue} />
                              {overdue && (
                                <AlertTriangle
                                  className="w-3.5 h-3.5 text-rose-700 shrink-0"
                                  aria-label="ვადაგადაცილებული"
                                />
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleCols.includes('lastActivity') && (
                        <td className="py-2.5 px-3 text-slate-500 tabular-nums whitespace-nowrap">
                          {formatGeorgianDateTime(c.lastActivityAt)}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('case_detail', { caseId: c.id });
                          }}
                          aria-label={`ქეისის გახსნა: ${c.caseNumber}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-xs font-medium text-sky-800 hover:bg-sky-50 whitespace-nowrap"
                        >
                          გახსნა
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden space-y-2.5">
            {filteredCases.map((c) => {
              const statusObj = settings.caseStatuses.find((s) => s.id === c.statusId);
              const org = snapshot.organizations.find((o) => o.id === c.primaryOrganizationId);
              const app = snapshot.applicants.find((a) => a.caseId === c.id && !a.deletedAt);
              const assignee = snapshot.users.find((u) => u.id === c.assignedTo);
              const overdue = isCaseOverdue(
                c,
                settings,
                snapshot.tasks,
                snapshot.documentRequests,
                snapshot.reviewAssignments,
                todayISO
              );
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate('case_detail', { caseId: c.id })}
                  className="w-full text-left rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 active:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-sky-900 tabular-nums">
                      {c.caseNumber}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {overdue && <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />}
                      <StatusLabel
                        label={statusObj?.label || c.statusId}
                        tone={statusObj?.color || 'slate'}
                        compact
                      />
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 line-clamp-2">{c.title}</p>
                  <div className="text-xs text-slate-600 space-y-0.5">
                    {org && <p className="truncate">კლინიკა: {org.legalName}</p>}
                    {app && <p className="truncate">განმცხადებელი: {app.name}</p>}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                      <span>{assignee?.fullName || '—'}</span>
                      <span className="tabular-nums">{formatGeorgianDate(c.deadlineDate, settings.dateFormat)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
