import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Database,
  Download,
  KeyRound,
  Plus,
  Printer,
  ShieldAlert,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { dataRepo } from '../../repositories/DataRepository';
import { authService } from '../../auth/AuthService';
import { storageProvider } from '../../storage/StorageProvider';
import {
  BackupPayload,
  CustomFieldDefinition,
  CustomFieldTargetPage,
  CustomFieldType,
  RoleId,
  User,
} from '../../models/types';
import { PERMISSION_LABELS, ROLE_LABELS } from '../../settings/defaultSettings';
import {
  escapeCsvCell,
  formatGeorgianDate,
  formatGeorgianDateTime,
  generateCasesCsv,
  generateUuid,
  getTbilisiDateISO,
  isCaseOverdue,
  isClosedStatus,
  maskPersonalId,
} from '../../utils/caseLogic';
import { StatusLabel } from '../../components/ui/CommonUI';
import type JSZip from 'jszip';

export const ReportsPage: React.FC = () => {
  const { snapshot, can, notify } = useApp();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedCaseForPrint, setSelectedCaseForPrint] = useState('');

  if (!snapshot) return null;
  const todayISO = getTbilisiDateISO();
  const canViewSensitive = can('view_sensitive');

  const casesInPeriod = useMemo(() => {
    return snapshot.cases.filter((c) => {
      if (c.deletedAt || c.isDraft) return false;
      if (dateFrom && c.startedAt.slice(0, 10) < dateFrom) return false;
      if (dateTo && c.startedAt.slice(0, 10) > dateTo) return false;
      return true;
    });
  }, [snapshot.cases, dateFrom, dateTo]);

  const byStatus = useMemo(() => {
    return snapshot.settings.caseStatuses.map((st) => ({
      id: st.id,
      label: st.label,
      count: casesInPeriod.filter((c) => c.statusId === st.id).length,
    }));
  }, [casesInPeriod, snapshot.settings.caseStatuses]);

  const byEmployee = useMemo(() => {
    return snapshot.users.map((u) => {
      const assigned = casesInPeriod.filter((c) => c.assignedTo === u.id);
      const openTasks = snapshot.tasks.filter(
        (t) => !t.deletedAt && t.assignedTo === u.id && t.status !== 'completed'
      ).length;
      const doneTasks = snapshot.tasks.filter(
        (t) => !t.deletedAt && t.assignedTo === u.id && t.status === 'completed'
      ).length;
      return {
        user: u,
        totalCases: assigned.length,
        overdueCases: assigned.filter((c) =>
          isCaseOverdue(c, snapshot.settings, snapshot.tasks, snapshot.documentRequests, snapshot.reviewAssignments, todayISO)
        ).length,
        openTasks,
        doneTasks,
      };
    });
  }, [casesInPeriod, snapshot, todayISO]);

  const docStats = useMemo(() => {
    const active = snapshot.documentRequests.filter((d) => !d.deletedAt);
    return {
      total: active.length,
      full: active.filter((d) => d.status === 'fully_received').length,
      partial: active.filter((d) => d.status === 'partially_received').length,
      unreceived: active.filter((d) => ['planned', 'requested', 'overdue', 'defective'].includes(d.status)).length,
    };
  }, [snapshot.documentRequests]);

  const letterStats = useMemo(() => {
    const active = snapshot.correspondence.filter((l) => !l.deletedAt);
    return {
      total: active.length,
      incoming: active.filter((l) => l.direction === 'incoming').length,
      outgoing: active.filter((l) => l.direction === 'outgoing').length,
      interim: active.filter((l) => l.isInterimLetter).length,
    };
  }, [snapshot.correspondence]);

  const printCase = snapshot.cases.find((c) => c.id === selectedCaseForPrint);

  const downloadGenericCsv = (filename: string, headers: string[], rows: Array<Array<string | number>>) => {
    if (!can('export')) {
      notify('თქვენს როლს არ აქვს ექსპორტის უფლება.', 'error');
      return;
    }
    const content = `\uFEFF${headers.map(escapeCsvCell).join(',')}\r\n${rows
      .map((r) => r.map(escapeCsvCell).join(','))
      .join('\r\n')}`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    notify(`ფაილი „${filename}“ ჩამოტვირთულია.`, 'success');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ანგარიშები და კონტროლი</h1>
          <p className="text-xs text-slate-600 mt-0.5">ფილტრირებული ანალიტიკა, Excel CSV ექსპორტი და სრული საქმის ბარათის ბეჭდვა</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs" />
          {can('export') && (
            <button
              type="button"
              onClick={() => {
                const csv = generateCasesCsv({
                  cases: casesInPeriod,
                  settings: snapshot.settings,
                  users: snapshot.users,
                  applicants: snapshot.applicants,
                  patients: snapshot.patients,
                  organizations: snapshot.organizations,
                });
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `report_cases_${todayISO}.csv`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
              }}
              className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-sky-900 px-3 text-xs font-medium text-white"
            >
              <Download className="w-3.5 h-3.5" />
              ქეისების რეესტრი (CSV)
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-900">ქეისები სტატუსის მიხედვით ({casesInPeriod.length})</h2>
            <button
              type="button"
              onClick={() =>
                downloadGenericCsv(
                  `status_report_${todayISO}.csv`,
                  ['სტატუსი', 'რაოდენობა'],
                  byStatus.map((s) => [s.label, s.count])
                )
              }
              className="text-xs text-sky-800 hover:underline"
            >
              CSV
            </button>
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {byStatus
              .filter((s) => s.count > 0)
              .map((s) => (
                <div key={s.id} className="py-1.5 flex justify-between">
                  <span>{s.label}</span>
                  <strong className="tabular-nums">{s.count}</strong>
                </div>
              ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">დოკუმენტები, კორესპონდენცია და ვიზიტები</h2>
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div className="rounded-lg bg-slate-50 p-2.5">
              <p className="text-slate-500">მოთხოვნილი დოკუმენტები</p>
              <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                {docStats.total} (მიღ. {docStats.full} / ნაწ. {docStats.partial} / ღია {docStats.unreceived})
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <p className="text-slate-500">წერილები</p>
              <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                {letterStats.total} (შემ. {letterStats.incoming} / გას. {letterStats.outgoing} / შუალ. {letterStats.interim})
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <p className="text-slate-500">ვიზიტები / აქტები</p>
              <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                {snapshot.visits.filter((v) => !v.deletedAt).length} ვიზიტი / {snapshot.inspectionActs.filter((a) => !a.deletedAt).length} აქტი
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <p className="text-slate-500">რეცენზიები</p>
              <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                {snapshot.reviewAssignments.filter((r) => !r.deletedAt).length} გაგზავნილი
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Employee Workload Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 no-print">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-900">თანამშრომლების დატვირთვა და დავალებები</h2>
          <button
            type="button"
            onClick={() =>
              downloadGenericCsv(
                `workload_${todayISO}.csv`,
                ['თანამშრომელი', 'ქეისები', 'ვადაგადაცილებული', 'ღია დავალება', 'დასრულებული დავალება'],
                byEmployee.map((e) => [e.user.fullName, e.totalCases, e.overdueCases, e.openTasks, e.doneTasks])
              )
            }
            className="text-xs text-sky-800 hover:underline"
          >
            CSV ექსპორტი
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3">თანამშრომელი</th>
                <th className="py-2 px-3">ქეისები</th>
                <th className="py-2 px-3">ვადაგადაცილებული</th>
                <th className="py-2 px-3">ღია დავალებები</th>
                <th className="py-2 px-3">შესრულებული დავალებები</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {byEmployee.map((row) => (
                <tr key={row.user.id}>
                  <td className="py-2 pr-3 font-medium text-slate-900">{row.user.fullName}</td>
                  <td className="py-2 px-3">{row.totalCases}</td>
                  <td className="py-2 px-3 text-rose-700 font-semibold">{row.overdueCases}</td>
                  <td className="py-2 px-3">{row.openTasks}</td>
                  <td className="py-2 px-3 text-emerald-700">{row.doneTasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable Full Case Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 no-print">
          <h2 className="text-sm font-semibold text-slate-900">სრული საქმის ბარათი (ბეჭდვა / PDF)</h2>
          <div className="flex items-center gap-2">
            <select
              value={selectedCaseForPrint}
              onChange={(e) => setSelectedCaseForPrint(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
            >
              <option value="">აირჩიეთ ქეისი...</option>
              {snapshot.cases
                .filter((c) => !c.deletedAt && !c.isDraft)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caseNumber} — {c.title}
                  </option>
                ))}
            </select>
            {printCase && (
              <button
                type="button"
                onClick={() => window.print()}
                className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white"
              >
                <Printer className="w-3.5 h-3.5" />
                ბეჭდვა / PDF
              </button>
            )}
          </div>
        </div>

        {printCase && (
          <div className="border-t border-slate-200 pt-4 text-xs space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500">შიდა სამუშაო ბარათი (არაოფიციალური რეესტრი)</p>
                <h3 className="text-lg font-bold text-slate-900">
                  {printCase.caseNumber} — {printCase.title}
                </h3>
              </div>
              <span className="text-slate-500">დაწყება: {formatGeorgianDate(printCase.startedAt)}</span>
            </div>
            <p><strong>შინაარსი:</strong> {printCase.shortSummary}</p>
            <p>
              <strong>eMOH:</strong> {printCase.emohRegNumber || '—'} ({formatGeorgianDate(printCase.emohRegDate)})
            </p>
            {canViewSensitive && (
              <p>
                <strong>პაციენტი:</strong>{' '}
                {snapshot.patients
                  .filter((p) => p.caseId === printCase.id && !p.deletedAt)
                  .map((p) => `${p.fullName} (${maskPersonalId(p.personalId, true, snapshot.settings.maskPersonalIdsByDefault)})`)
                  .join(', ') || '—'}
              </p>
            )}
            <p>
              <strong>ვიზიტები:</strong> {snapshot.visits.filter((v) => v.caseId === printCase.id && !v.deletedAt).length} ·{' '}
              <strong>მოთხოვნილი დოკუმენტები:</strong> {snapshot.documentRequests.filter((d) => d.caseId === printCase.id && !d.deletedAt).length} ·{' '}
              <strong>წერილები:</strong> {snapshot.correspondence.filter((l) => l.caseIds.includes(printCase.id) && !l.deletedAt).length} ·{' '}
              <strong>რეცენზიები:</strong> {snapshot.reviewAssignments.filter((r) => r.caseId === printCase.id && !r.deletedAt).length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export const UsersManagementPage: React.FC = () => {
  const { currentUser, snapshot, refreshData, notify, can } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<RoleId>('inspector');

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  if (!snapshot || !currentUser) return null;
  if (!can('manage_users')) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
        მომხმარებლების მართვა ხელმისაწვდომია მხოლოდ უფლებამოსილი Admin როლისთვის.
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser || password.length < 6 || !fullName.trim()) {
      notify('შეავსეთ სახელი, მომხმარებლის სახელი და პაროლი (მინ. 6 სიმბოლო).', 'error');
      return;
    }
    if (snapshot.users.some((u) => u.username.toLowerCase() === cleanUser)) {
      notify('ეს მომხმარებლის სახელი უკვე დაკავებულია.', 'error');
      return;
    }
    try {
      const { id, passwordHash, passwordSalt } = await authService.createUserAccount(cleanUser, password);
      const now = new Date().toISOString();
      const newUser: User = {
        id,
        username: cleanUser,
        passwordHash,
        passwordSalt,
        fullName: fullName.trim(),
        position: position.trim() || 'ინსპექტორი',
        department: department.trim() || 'კონტროლის დეპარტამენტი',
        phone: phone.trim(),
        role,
        isActive: true,
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
      };
      await dataRepo.saveUser(newUser, currentUser, `შეიქმნა თანამშრომელი ${newUser.username} (${newUser.role})`);
      setUsername('');
      setPassword('');
      setFullName('');
      setShowAdd(false);
      await refreshData();
      notify(`თანამშრომელი „${newUser.fullName}“ დაემატა.`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'მომხმარებლის შექმნა ვერ მოხერხდა.', 'error');
    }
  };

  const handleRoleChange = async (u: User, newRole: RoleId) => {
    await dataRepo.saveUser({ ...u, role: newRole }, currentUser, `მომხმარებლის ${u.username} როლი შეიცვალა: ${u.role} → ${newRole}`);
    await refreshData();
    notify('როლი განახლდა.', 'success');
  };

  const handleToggleActive = async (u: User) => {
    if (u.id === currentUser.id) {
      notify('საკუთარი აქტიური ანგარიშის დეაქტივაცია შეუძლებელია.', 'error');
      return;
    }
    await dataRepo.saveUser(
      { ...u, isActive: !u.isActive },
      currentUser,
      `მომხმარებელი ${u.username} ${u.isActive ? 'დეაქტივირდა (ძველი ქეისები შენარჩუნებულია)' : 'გააქტიურდა'}`
    );
    await refreshData();
    notify(u.isActive ? 'ანგარიში დეაქტივირებულია.' : 'ანგარიში გააქტიურებულია.', 'info');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId) return;
    try {
      await authService.setUserPasswordAdmin(resetUserId, resetPasswordVal, currentUser.id);
      setResetUserId(null);
      setResetPasswordVal('');
      await refreshData();
      notify('პაროლი განახლდა.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'შეცდომა', 'error');
    }
  };

  const actions = Object.keys(PERMISSION_LABELS) as Array<keyof typeof PERMISSION_LABELS>;
  const roles = Object.keys(ROLE_LABELS) as RoleId[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">თანამშრომლები და მომხმარებლები</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            ანგარიშების, როლების და წვდომის უფლებების მართვა (დეაქტივაციისას ძველი ქეისების ავტორი ნარჩუნდება)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((p) => !p)}
          className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-sky-900 px-3.5 py-2 text-xs font-medium text-white"
        >
          <UserPlus className="w-4 h-4" />
          თანამშრომლის დამატება
        </button>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs text-emerald-950 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
        <span>
          <strong>ღია წვდომის რეჟიმი:</strong> პროგრამა ავტორიზაციის გარეშე იხსნება. მომხმარებლების პროფილები და როლები
          Firestore-ში სინქრონდება.
        </span>
      </div>

      {showAdd && (
        <form onSubmit={handleCreateUser} className="rounded-xl border border-sky-200 bg-white p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input type="text" required placeholder="სახელი და გვარი *" value={fullName} onChange={(e) => setFullName(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="text" required placeholder="მომხმარებლის სახელი (login) *" value={username} onChange={(e) => setUsername(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="password" required placeholder="პაროლი (მინ. 6 სიმბ.) *" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="text" placeholder="პოზიცია" value={position} onChange={(e) => setPosition(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="text" placeholder="დეპარტამენტი" value={department} onChange={(e) => setDepartment(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="tel" placeholder="ტელეფონი" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value as RoleId)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-2 text-xs text-slate-600">გაუქმება</button>
            <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">დამატება</button>
          </div>
        </form>
      )}

      {/* Users Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="py-2.5 px-3">სახელი / პოზიცია</th>
              <th className="py-2.5 px-3">მომხმარებელი</th>
              <th className="py-2.5 px-3">როლი</th>
              <th className="py-2.5 px-3">სტატუსი</th>
              <th className="py-2.5 px-3">ბოლო შესვლა</th>
              <th className="py-2.5 px-3 text-right">მოქმედებები</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {snapshot.users.map((u) => (
              <tr key={u.id}>
                <td className="py-2.5 px-3">
                  <strong className="text-slate-900 block">{u.fullName}</strong>
                  <span className="text-slate-500">{u.position} · {u.department}</span>
                </td>
                <td className="py-2.5 px-3 font-mono">{u.username}</td>
                <td className="py-2.5 px-3">
                  <select
                    aria-label={`როლი: ${u.username}`}
                    value={u.role}
                    onChange={(e) => void handleRoleChange(u, e.target.value as RoleId)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 px-3">
                  <StatusLabel label={u.isActive ? 'აქტიური' : 'დეაქტივირებული'} tone={u.isActive ? 'emerald' : 'rose'} compact />
                </td>
                <td className="py-2.5 px-3 tabular-nums text-slate-500">{formatGeorgianDateTime(u.lastLoginAt)}</td>
                <td className="py-2.5 px-3 text-right space-x-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => {
                      setResetUserId(u.id);
                      setResetPasswordVal('');
                    }}
                    className="text-sky-800 hover:underline font-medium"
                  >
                    პაროლის შეცვლა
                  </button>
                  {u.id !== currentUser.id && (
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(u)}
                      className={u.isActive ? 'text-rose-700 hover:underline font-medium' : 'text-emerald-700 hover:underline font-medium'}
                    >
                      {u.isActive ? 'გათიშვა' : 'გააქტიურება'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resetUserId && (
        <form onSubmit={handleResetPassword} className="rounded-xl border border-sky-200 bg-white p-4 flex flex-wrap items-center gap-3">
          <KeyRound className="w-4 h-4 text-sky-800" />
          <input
            type="password"
            required
            placeholder="ახალი პაროლი (მინ. 6 სიმბოლო)"
            value={resetPasswordVal}
            onChange={(e) => setResetPasswordVal(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="button" onClick={() => setResetUserId(null)} className="px-3 py-2 text-xs text-slate-600">გაუქმება</button>
          <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">პაროლის განახლება</button>
        </form>
      )}

      {/* Role Matrix */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">როლების უფლებების მატრიცა</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3">მოქმედება</th>
                {roles.map((r) => (
                  <th key={r} className="py-2 px-3">{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {actions.map((act) => (
                <tr key={act}>
                  <td className="py-2 pr-3 font-medium text-slate-800">{PERMISSION_LABELS[act]}</td>
                  {roles.map((r) => (
                    <td key={r} className="py-2 px-3">
                      {snapshot.settings.rolePermissions[r][act] ? '✓ დაშვებული' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  const { currentUser, snapshot, refreshData, notify, can, confirmAction } = useApp();
  const [activeTab, setActiveTab] = useState<'profile' | 'dictionaries' | 'custom_fields' | 'numbering' | 'backup'>('profile');

  // Password change
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');

  // Dictionary add helpers
  const [dictKey, setDictKey] = useState<'caseStatuses' | 'documentTypes' | 'categories' | 'sources'>('caseStatuses');
  const [newDictLabel, setNewDictLabel] = useState('');

  // Custom field builder
  const [cfLabel, setCfLabel] = useState('');
  const [cfType, setCfType] = useState<CustomFieldType>('text');
  const [cfTarget, setCfTarget] = useState<CustomFieldTargetPage>('case_basic');
  const [cfRequired, setCfRequired] = useState(false);
  const [cfOptionsText, setCfOptionsText] = useState('');
  const [cfDefault, setCfDefault] = useState('');

  // Numbering
  const [prefix, setPrefix] = useState(snapshot?.settings.caseNumberPrefix || 'CASE');
  const [yearFmt, setYearFmt] = useState<'YYYY' | 'YY'>(snapshot?.settings.caseNumberYearFormat || 'YYYY');

  // Backup / Restore
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [inspectedBackup, setInspectedBackup] = useState<{
    payload: BackupPayload;
    zipInstance?: JSZip;
    existingCaseCount: number;
  } | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ usedBytes: number; quotaBytes: number; fileCount: number } | null>(null);

  useEffect(() => {
    void storageProvider.getStorageUsageEstimate().then(setStorageInfo);
  }, [snapshot]);

  if (!snapshot || !currentUser) return null;
  const isAdmin = can('manage_settings');
  const { settings } = snapshot;

  const handleOwnPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authService.changeOwnPassword(currentUser.id, curPass, newPass);
      setCurPass('');
      setNewPass('');
      await refreshData();
      notify('თქვენი პაროლი წარმატებით შეიცვალა.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'შეცდომა', 'error');
    }
  };

  const handleAddDictionaryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDictLabel.trim() || !isAdmin) return;
    const itemId = `custom_${generateUuid().slice(0, 8)}`;
    const nextList = [
      ...settings[dictKey],
      { id: itemId, label: newDictLabel.trim(), color: 'sky' as const, active: true },
    ];
    await dataRepo.saveSettings(
      { ...settings, [dictKey]: nextList },
      currentUser,
      `პარამეტრებში (${dictKey}) დაემატა: ${newDictLabel.trim()}`
    );
    setNewDictLabel('');
    await refreshData();
    notify('ახალი ჩანაწერი დაემატა.', 'success');
  };

  const handleAddCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfLabel.trim() || !isAdmin) return;
    const newField: CustomFieldDefinition = {
      id: `cf_${generateUuid().slice(0, 8)}`,
      key: `field_${Date.now()}`,
      label: cfLabel.trim(),
      type: cfType,
      targetPage: cfTarget,
      required: cfRequired,
      defaultValue: cfDefault || undefined,
      options:
        cfType === 'select' || cfType === 'multiselect'
          ? cfOptionsText.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
      active: true,
      createdAt: new Date().toISOString(),
    };
    await dataRepo.saveSettings(
      { ...settings, customFields: [...settings.customFields, newField] },
      currentUser,
      `დაემატა custom field: ${newField.label} (${newField.type})`
    );
    setCfLabel('');
    setCfOptionsText('');
    setCfDefault('');
    await refreshData();
    notify('ახალი მორგებული ველი დაემატა. ძველი ქეისები უცვლელია.', 'success');
  };

  const handleSaveNumbering = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    await dataRepo.saveSettings(
      { ...settings, caseNumberPrefix: prefix.trim().toUpperCase() || 'CASE', caseNumberYearFormat: yearFmt },
      currentUser,
      `განახლდა შიდა ნომრის ფორმატი: ${prefix}-${yearFmt}`
    );
    await refreshData();
    notify('ნუმერაციის პარამეტრები შენახულია (უკვე არსებული ნომრები არ იცვლება).', 'success');
  };

  const handleExportZip = async () => {
    const blob = await dataRepo.exportFullZipBackup(currentUser);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medreg_backup_${getTbilisiDateISO()}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    notify('სრული ZIP სარეზერვო ასლი ჩამოტვირთულია.', 'success');
  };

  const handleInspectRestore = async (file: File) => {
    try {
      const res = await dataRepo.inspectBackupFile(file);
      setInspectedBackup(res);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'სარეზერვო ფაილის წაკითხვა ვერ მოხერხდა.', 'error');
    }
  };

  const executeRestore = async (mode: 'replace' | 'merge') => {
    if (!inspectedBackup) return;
    const ok = await confirmAction({
      title: mode === 'replace' ? 'სრული ჩანაცვლება სარეზერვო ასლით' : 'შერწყმა არსებულ მონაცემებთან',
      message:
        mode === 'replace'
          ? `ყურადღება: წაიშლება მიმდინარე ${inspectedBackup.existingCaseCount} ქეისი და სრულად ჩანაცვლდება სარეზერვო ფაილით.`
          : 'მონაცემები დაემატება/განახლდება ID-ების მიხედვით.',
      confirmLabel: 'აღდგენის დაწყება',
      danger: mode === 'replace',
    });
    if (!ok) return;
    const res = await dataRepo.restoreFromBackup({
      payload: inspectedBackup.payload,
      zipInstance: inspectedBackup.zipInstance,
      mode,
      user: currentUser,
    });
    setInspectedBackup(null);
    await refreshData();
    notify(`აღდგენილია ${res.restoredCases} ქეისი და ${res.restoredFiles} ფაილი.`, 'success');
  };

  const sampleCasesCount = snapshot.cases.filter((c) => c.isTestSample).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">პარამეტრები და ადმინისტრირება</h1>
        <p className="text-xs text-slate-600 mt-0.5">
          სტატუსები, დოკუმენტის ტიპები, მორგებადი ველები, პროფილი, სარეზერვო ZIP ექსპორტი/აღდგენა და Firebase მზადყოფნა
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        {[
          { id: 'profile', label: 'პროფილი და პაროლი' },
          ...(isAdmin
            ? [
                { id: 'dictionaries', label: 'სტატუსები და ტიპები' },
                { id: 'custom_fields', label: 'მორგებული ველები (Custom Fields)' },
                { id: 'numbering', label: 'ნუმერაცია და ისტორია' },
                { id: 'backup', label: 'ბექაფი, საცავი და Firebase' },
              ]
            : []),
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as typeof activeTab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
              activeTab === t.id ? 'bg-sky-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2 text-xs">
            <h2 className="text-sm font-semibold text-slate-900">მომხმარებლის პროფილი</h2>
            <p><span className="text-slate-500">სახელი:</span> <strong>{currentUser.fullName}</strong></p>
            <p><span className="text-slate-500">მომხმარებელი:</span> <span className="font-mono">{currentUser.username}</span></p>
            <p><span className="text-slate-500">როლი:</span> {ROLE_LABELS[currentUser.role]}</p>
            <p><span className="text-slate-500">ენა / თარიღის ფორმატი:</span> ქართული ({settings.dateFormat})</p>
          </div>

          <form onSubmit={handleOwnPasswordChange} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">პაროლის შეცვლა</h2>
            <input
              type="password"
              required
              placeholder="მიმდინარე პაროლი"
              value={curPass}
              onChange={(e) => setCurPass(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="password"
              required
              placeholder="ახალი პაროლი (მინიმუმ 6 სიმბოლო)"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-900 rounded-lg">
              პაროლის განახლება
            </button>
          </form>
        </div>
      )}

      {activeTab === 'dictionaries' && isAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'caseStatuses', label: 'ქეისის სტატუსები' },
              { id: 'documentTypes', label: 'დოკუმენტის ტიპები' },
              { id: 'categories', label: 'ქეისის კატეგორიები' },
              { id: 'sources', label: 'საქმის წყაროები' },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDictKey(d.id as typeof dictKey)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                  dictKey === d.id ? 'bg-sky-50 border-sky-300 text-sky-900' : 'border-slate-200 text-slate-600'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleAddDictionaryItem} className="flex gap-2">
            <input
              type="text"
              required
              placeholder="ახალი დასახელება..."
              value={newDictLabel}
              onChange={(e) => setNewDictLabel(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="inline-flex items-center gap-1 px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
              <Plus className="w-4 h-4" />
              დამატება
            </button>
          </form>

          <div className="divide-y divide-slate-100 text-xs">
            {settings[dictKey].map((item) => (
              <div key={item.id} className="py-2 flex items-center justify-between">
                <span>{item.label}</span>
                <span className="font-mono text-[11px] text-slate-400">{item.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'custom_fields' && isAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">ახალი მორგებული ველის დამატება (Custom Field)</h2>
          <form onSubmit={handleAddCustomField} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              placeholder="ველის დასახელება *"
              value={cfLabel}
              onChange={(e) => setCfLabel(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={cfType}
              onChange={(e) => setCfType(e.target.value as CustomFieldType)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="text">ტექსტი</option>
              <option value="textarea">გრძელი ტექსტი</option>
              <option value="date">თარიღი</option>
              <option value="number">რიცხვი</option>
              <option value="checkbox">Checkbox</option>
              <option value="select">Dropdown</option>
              <option value="multiselect">მრავალარჩევანი</option>
              <option value="file">ფაილის მითითება</option>
            </select>
            <select
              value={cfTarget}
              onChange={(e) => setCfTarget(e.target.value as CustomFieldTargetPage)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="case_basic">ქეისი — ძირითადი ინფორმაცია</option>
              <option value="case_emoh">ქეისი — წარმოშობა და eMOH</option>
              <option value="case_participants">ქეისი — მონაწილეები</option>
            </select>
            {(cfType === 'select' || cfType === 'multiselect') && (
              <input
                type="text"
                placeholder="ვარიანტები მძიმით გამოყოფილი"
                value={cfOptionsText}
                onChange={(e) => setCfOptionsText(e.target.value)}
                className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            )}
            <input
              type="text"
              placeholder="ნაგულისხმევი მნიშვნელობა"
              value={cfDefault}
              onChange={(e) => setCfDefault(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" checked={cfRequired} onChange={(e) => setCfRequired(e.target.checked)} />
              სავალდებულო ველი
            </label>
            <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
              + ველის დამატება
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
            <h3 className="font-semibold text-slate-700">არსებული მორგებული ველები ({settings.customFields.length})</h3>
            {settings.customFields.map((cf) => (
              <div key={cf.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
                <span>
                  <strong>{cf.label}</strong> ({cf.type}) · გვერდი: {cf.targetPage} {cf.required && '· სავალდებულო'}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await dataRepo.saveSettings(
                      { ...settings, customFields: settings.customFields.filter((x) => x.id !== cf.id) },
                      currentUser,
                      `წაიშალა custom field: ${cf.label}`
                    );
                    await refreshData();
                  }}
                  className="text-rose-700 hover:underline"
                >
                  წაშლა
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'numbering' && isAdmin && (
        <div className="space-y-4">
          <form onSubmit={handleSaveNumbering} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">შიდა ნომრის ფორმატი</h2>
            <p className="text-xs text-slate-600">ცვლილება მოქმედებს მხოლოდ ახალ ქეისებზე; უკვე მინიჭებული ნომრები უცვლელია.</p>
            <div className="flex flex-wrap gap-3">
              <input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
              <select value={yearFmt} onChange={(e) => setYearFmt(e.target.value as 'YYYY' | 'YY')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="YYYY">YYYY (2026)</option>
                <option value="YY">YY (26)</option>
              </select>
              <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">შენახვა</button>
            </div>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">პარამეტრების ცვლილების ისტორია</h3>
            <div className="space-y-1.5 max-h-60 overflow-y-auto text-xs">
              {snapshot.activityLogs
                .filter((l) => l.action === 'settings_change')
                .map((l) => (
                  <div key={l.id} className="border-b border-slate-100 pb-1.5 flex justify-between gap-2">
                    <span>{l.summary} — <strong>{l.performedByName}</strong></span>
                    <span className="text-slate-500 tabular-nums">{formatGeorgianDateTime(l.performedAt)}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'backup' && isAdmin && (
        <div className="space-y-4">
          {/* Backup Export / Restore */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-800" />
              <h2 className="text-sm font-semibold text-slate-900">სრული სარეზერვო ექსპორტი და აღდგენა (JSON / ZIP)</h2>
            </div>
            <p className="text-xs text-slate-600">
              ZIP არქივი შეიცავს Firestore-ის ყველა ჩანაწერსა და მონაცემთა ბაზაში ნაწილებად შენახულ ფაილებს.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => void handleExportZip()}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-sky-900 px-4 py-2 text-xs font-medium text-white"
              >
                <Download className="w-4 h-4" />
                სრული ZIP ექსპორტი
              </button>

              <input
                ref={fileRef}
                type="file"
                accept=".zip,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleInspectRestore(f);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <Upload className="w-4 h-4" />
                სარეზერვო ფაილის იმპორტი / აღდგენა
              </button>
            </div>

            {inspectedBackup && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs space-y-2">
                <p className="font-semibold text-amber-950">
                  ნაპოვნია სარეზერვო ასლი ({formatGeorgianDateTime(inspectedBackup.payload.exportedAt)})
                </p>
                <p>
                  ქეისების რაოდენობა ასლში: <strong>{(inspectedBackup.payload.tables.cases || []).length}</strong> · ფაილები:{' '}
                  <strong>{inspectedBackup.payload.filesManifest.length}</strong> · მიმდინარე გარემოში არსებული ქეისები:{' '}
                  <strong>{inspectedBackup.existingCaseCount}</strong>
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void executeRestore('merge')}
                    className="px-3 py-1.5 rounded bg-sky-800 text-white font-medium"
                  >
                    შერწყმა (Merge)
                  </button>
                  <button
                    type="button"
                    onClick={() => void executeRestore('replace')}
                    className="px-3 py-1.5 rounded bg-rose-700 text-white font-medium"
                  >
                    სრული ჩანაცვლება (Replace)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectedBackup(null)}
                    className="px-3 py-1.5 text-slate-600"
                  >
                    გაუქმება
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sample Test Data Controls */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">ხელოვნური სატესტო მონაცემების მართვა</h2>
            <p className="text-xs text-slate-600">
              ამჟამად სისტემაშია <strong>{sampleCasesCount}</strong> მონიშნული სატესტო ქეისი.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await dataRepo.seedSampleTestData(currentUser);
                    await refreshData();
                    notify('სატესტო მონაცემები ჩაიტვირთა.', 'success');
                  } catch (err) {
                    notify(err instanceof Error ? err.message : 'შეცდომა', 'error');
                  }
                }}
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                სატესტო მონაცემების ჩატვირთვა
              </button>
              {sampleCasesCount > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    const count = await dataRepo.clearSampleTestData(currentUser);
                    await refreshData();
                    notify(`წაიშალა ${count} სატესტო ქეისი და დაკავშირებული სატესტო ჩანაწერები.`, 'info');
                  }}
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-medium text-rose-700 border border-rose-200 bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  სატესტო მონაცემების უსაფრთხო წაშლა
                </button>
              )}
            </div>
          </div>

          {/* Firestore storage and synchronization status */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-xs space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">შენახვის სტატუსი და Firebase ინტეგრაციის მდგომარეობა</h2>
            <p>
              <strong>აქტიური ბაზა:</strong> Cloud Firestore · ატვირთული ფაილები:{' '}
              <strong>{storageInfo?.fileCount ?? 0}</strong> ({((storageInfo?.usedBytes ?? 0) / (1024 * 1024)).toFixed(2)} MB)
            </p>
            <p>
              <strong>Cloud Firestore:</strong>{' '}
              <span className="text-emerald-700 font-medium">Live Sync და ფაილების database storage აქტიურია</span>
            </p>
            <p className="text-slate-500">
              Dexie გამოიყენება მხოლოდ სწრაფი ოფლაინ cache-ისთვის; ცვლილებების source-of-truth არის Firebase.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
