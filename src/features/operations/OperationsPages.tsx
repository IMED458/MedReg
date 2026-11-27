import React, { useMemo, useState } from 'react';
import { BellPlus, Calendar as CalendarIcon, Check, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { dataRepo } from '../../repositories/DataRepository';
import { Reviewer } from '../../models/types';
import {
  formatGeorgianDate,
  generateUuid,
  getDeadlineUrgency,
  getTbilisiDateISO,
} from '../../utils/caseLogic';
import {
  AttachmentList,
  EmptyState,
  FileUploader,
  StatusLabel,
  UrgencyChip,
} from '../../components/ui/CommonUI';

export const VisitsRegistryPage: React.FC = () => {
  const { snapshot, navigate } = useApp();
  const [statusFilter, setStatusFilter] = useState('');
  if (!snapshot) return null;

  const visits = snapshot.visits
    .filter((v) => !v.deletedAt && (!statusFilter || v.status === statusFilter))
    .sort((a, b) => b.plannedDateTime.localeCompare(a.plannedDateTime));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">შემოწმებები და აქტები</h1>
          <p className="text-xs text-slate-600 mt-0.5">ყველა ქეისის ფარგლებში დაგეგმილი და ჩატარებული ვიზიტები</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs"
        >
          <option value="">ყველა სტატუსი</option>
          <option value="planned">დაგეგმილი</option>
          <option value="in_progress">მიმდინარეობს</option>
          <option value="completed">შედგა</option>
          <option value="postponed">გადადებული</option>
        </select>
      </div>

      {visits.length === 0 ? (
        <EmptyState title="ვიზიტები არ არის" description="გახსენით ქეისი და დაამატეთ ვიზიტი „ვიზიტები და აქტები“ ჩანართიდან." />
      ) : (
        <div className="space-y-2.5">
          {visits.map((v) => {
            const c = snapshot.cases.find((x) => x.id === v.caseId);
            const org = snapshot.organizations.find((o) => o.id === v.organizationId);
            const actLabel = snapshot.settings.actStatuses.find((s) => s.id === v.actPrepStatus)?.label || v.actPrepStatus;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => navigate('case_detail', { caseId: v.caseId, tab: 'visits' })}
                className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-sky-300 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-sky-900">{c?.caseNumber}</span>
                    <strong className="text-sm text-slate-900">{v.purpose}</strong>
                  </div>
                  <p className="text-xs text-slate-600">
                    {org?.legalName || 'კლინიკა'} · დაგეგმილი: {v.plannedDateTime.replace('T', ' ')} · აქტი:{' '}
                    {v.actNumber ? `№${v.actNumber}` : '—'} ({actLabel})
                  </p>
                </div>
                <StatusLabel label={v.status === 'completed' ? 'შედგა' : v.status} tone={v.status === 'completed' ? 'emerald' : 'sky'} compact />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const CorrespondenceRegistryPage: React.FC = () => {
  const { snapshot, navigate } = useApp();
  const [filterMode, setFilterMode] = useState<'all' | 'to_send' | 'awaiting_reply'>('all');
  if (!snapshot) return null;

  const letters = snapshot.correspondence
    .filter((l) => {
      if (l.deletedAt) return false;
      if (filterMode === 'to_send') {
        return ['to_prepare', 'draft', 'to_sign'].includes(l.status) || (l.isInterimLetter && !l.interimSent);
      }
      if (filterMode === 'awaiting_reply') {
        return l.status === 'awaiting_reply';
      }
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">წერილები და კორესპონდენციის ჟურნალი</h1>
          <p className="text-xs text-slate-600 mt-0.5">შემოსული, გასული და შუალედური წერილების ერთიანი კონტროლი</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${filterMode === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
          >
            ყველა
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('to_send')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${filterMode === 'to_send' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
          >
            ჯერ გასაგზავნი
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('awaiting_reply')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${filterMode === 'awaiting_reply' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
          >
            პასუხის მოლოდინში
          </button>
        </div>
      </div>

      {letters.length === 0 ? (
        <EmptyState title="წერილები ვერ მოიძებნა" description="დაამატეთ კორესპონდენცია შესაბამისი ქეისის „წერილები“ ჩანართიდან." />
      ) : (
        <div className="space-y-2.5">
          {letters.map((l) => {
            const c = snapshot.cases.find((x) => x.id === l.caseIds[0]);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => c && navigate('case_detail', { caseId: c.id, tab: 'correspondence' })}
                className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-sky-300 flex flex-wrap justify-between gap-2 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    {c && <span className="font-mono font-semibold text-sky-900">{c.caseNumber}</span>}
                    <strong className="text-sm text-slate-900">{l.subject}</strong>
                  </div>
                  <p className="text-slate-600 mt-0.5">
                    №{l.officialNumber || '—'} · {formatGeorgianDate(l.officialDate)} · {l.sender} → {l.recipient}
                  </p>
                </div>
                <StatusLabel
                  label={l.interimSent || l.status === 'sent' ? 'გაგზავნილია' : l.interimPrepared ? 'მომზადებულია' : l.status}
                  tone={l.interimSent || l.status === 'sent' ? 'emerald' : 'amber'}
                  compact
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const DocumentRequestsRegistryPage: React.FC = () => {
  const { snapshot, navigate } = useApp();
  const [onlyOpen, setOnlyOpen] = useState(true);
  if (!snapshot) return null;
  const todayISO = getTbilisiDateISO();

  const reqs = snapshot.documentRequests
    .filter((r) => !r.deletedAt && (!onlyOpen || !['fully_received', 'no_longer_needed'].includes(r.status)))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">გამოთხოვილი დოკუმენტები</h1>
          <p className="text-xs text-slate-600 mt-0.5">მოთხოვნილი, ნაწილობრივ მიღებული და ვადაგადაცილებული დოკუმენტების მონიტორინგი</p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          მხოლოდ ღია მოთხოვნები
        </label>
      </div>

      {reqs.length === 0 ? (
        <EmptyState title="ღია დოკუმენტის მოთხოვნები არ არის" description="ყველა მოთხოვნილი დოკუმენტი დახურულია ან ჯერ არ შექმნილა." />
      ) : (
        <div className="space-y-2.5">
          {reqs.map((r) => {
            const c = snapshot.cases.find((x) => x.id === r.caseId);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate('case_detail', { caseId: r.caseId, tab: 'documents' })}
                className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-sky-300 flex flex-wrap justify-between gap-2 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sky-900">{c?.caseNumber}</span>
                    <strong className="text-sm text-slate-900">{r.documentTitle}</strong>
                  </div>
                  <p className="text-slate-600 mt-0.5">ადრესატი: {r.requestedFromName} · წერილი №{r.outgoingLetterNumber || '—'}</p>
                </div>
                <UrgencyChip urgency={getDeadlineUrgency(r.dueDate, r.status === 'fully_received', todayISO)} date={r.dueDate} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ReviewsRegistryPage: React.FC = () => {
  const { snapshot, currentUser, refreshData, notify, can, navigate } = useApp();
  const [showAddRev, setShowAddRev] = useState(false);
  const [fullName, setFullName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [org, setOrg] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  if (!snapshot || !currentUser) return null;
  const editable = can('edit') || can('create');
  const assignments = snapshot.reviewAssignments.filter((r) => !r.deletedAt);
  const reviewers = snapshot.reviewers.filter((r) => !r.deletedAt);

  const handleAddReviewer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    const now = new Date().toISOString();
    const rev: Reviewer = {
      id: generateUuid(),
      fullName: fullName.trim(),
      specialty: specialty.trim(),
      organization: org.trim(),
      position: 'რეცენზენტი',
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };
    await dataRepo.saveReviewer(rev, currentUser);
    setFullName('');
    setSpecialty('');
    setOrg('');
    setShowAddRev(false);
    await refreshData();
    notify('რეცენზენტი დაემატა ცნობარში.', 'success');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">რეცენზიები და რეცენზენტების ცნობარი</h1>
          <p className="text-xs text-slate-600 mt-0.5">გაგზავნილი რეცენზიების, პასუხების და დამოუკიდებელი ექსპერტების მართვა</p>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => setShowAddRev((p) => !p)}
            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-sky-900 px-3.5 py-2 text-xs font-medium text-white"
          >
            <Plus className="w-4 h-4" />
            ახალი რეცენზენტი
          </button>
        )}
      </div>

      {showAddRev && (
        <form onSubmit={handleAddReviewer} className="rounded-xl border border-sky-200 bg-white p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input type="text" required placeholder="სახელი და გვარი *" value={fullName} onChange={(e) => setFullName(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="text" placeholder="სპეციალობა" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="text" placeholder="ორგანიზაცია" value={org} onChange={(e) => setOrg(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="tel" placeholder="ტელეფონი" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="email" placeholder="ელფოსტა" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">შენახვა</button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">რეცენზიაზე გაგზავნები ({assignments.length})</h2>
          {assignments.length === 0 ? (
            <p className="text-xs text-slate-500">გაგზავნილი რეცენზიები არ არის.</p>
          ) : (
            <div className="space-y-2">
              {assignments.map((a) => {
                const c = snapshot.cases.find((x) => x.id === a.caseId);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => navigate('case_detail', { caseId: a.caseId, tab: 'reviews' })}
                    className="w-full text-left rounded-lg border border-slate-200 p-3 text-xs hover:border-sky-300"
                  >
                    <div className="flex justify-between font-medium">
                      <span>{c?.caseNumber} · {a.reviewerNameSnapshot}</span>
                      <span className="text-sky-800">{a.responses.length} პასუხი</span>
                    </div>
                    <p className="text-slate-500 mt-0.5">წერილი №{a.outgoingLetterNumber || '—'} · ვადა: {formatGeorgianDate(a.dueDate)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">რეცენზენტების ცნობარი ({reviewers.length})</h2>
          {reviewers.length === 0 ? (
            <p className="text-xs text-slate-500">რეცენზენტები არ არის დამატებული.</p>
          ) : (
            <div className="space-y-2">
              {reviewers.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                  <strong className="text-slate-900">{r.fullName}</strong>
                  <p className="text-slate-600">{r.specialty} · {r.organization} · {r.phone || '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const TasksDeadlinesPage: React.FC = () => {
  const { snapshot, currentUser, refreshData, notify, can, navigate } = useApp();
  const [remTitle, setRemTitle] = useState('');
  const [remDate, setRemDate] = useState(getTbilisiDateISO());
  const [showCompleted, setShowCompleted] = useState(false);

  if (!snapshot || !currentUser) return null;
  const editable = can('edit');
  const todayISO = getTbilisiDateISO();

  const tasks = snapshot.tasks
    .filter((t) => !t.deletedAt && (showCompleted || t.status !== 'completed'))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remTitle.trim()) return;
    const now = new Date().toISOString();
    await dataRepo.saveReminder({
      id: generateUuid(),
      userId: currentUser.id,
      title: remTitle.trim(),
      remindAt: remDate,
      isDismissed: false,
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    });
    setRemTitle('');
    await refreshData();
    notify('პირადი შეხსენება დამატებულია.', 'success');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ჩემი დავალებები და ვადები</h1>
          <p className="text-xs text-slate-600 mt-0.5">ვადების ფერადი ინდიკაცია და პირადი შეხსენებების ჩანიშვნა</p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
          დასრულებული დავალებების ჩვენება
        </label>
      </div>

      {/* Personal Reminder Form */}
      <form onSubmit={handleAddReminder} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-2.5">
        <BellPlus className="w-4 h-4 text-sky-800 shrink-0" />
        <input
          type="text"
          placeholder="პირადი შეხსენების ჩანიშვნა..."
          value={remTitle}
          onChange={(e) => setRemTitle(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={remDate}
          onChange={(e) => setRemDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="min-h-[38px] px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
          შეხსენების შენახვა
        </button>
      </form>

      {tasks.length === 0 ? (
        <EmptyState title="ღია დავალებები არ არის" description="დავალებების დამატება შესაძლებელია ნებისმიერი ქეისის ბარათიდან." />
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const c = t.caseId ? snapshot.cases.find((x) => x.id === t.caseId) : null;
            const assignee = snapshot.users.find((u) => u.id === t.assignedTo);
            const done = t.status === 'completed';
            return (
              <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  {editable && (
                    <button
                      type="button"
                      onClick={async () => {
                        await dataRepo.saveTask(
                          { ...t, status: done ? 'open' : 'completed', completedAt: done ? undefined : new Date().toISOString() },
                          currentUser
                        );
                        await refreshData();
                        notify(done ? 'დავალება გაიხსნა.' : 'დავალება შესრულდა.', 'success');
                      }}
                      className={`w-5 h-5 rounded border flex items-center justify-center ${
                        done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-400'
                      }`}
                    >
                      {done && <Check className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <div>
                    <button
                      type="button"
                      onClick={() => c && navigate('case_detail', { caseId: c.id, tab: 'tasks' })}
                      className={`text-sm font-medium text-left hover:underline ${done ? 'line-through text-slate-400' : 'text-slate-900'}`}
                    >
                      {t.title}
                    </button>
                    <p className="text-slate-500">
                      {c ? `${c.caseNumber} · ` : ''}პასუხისმგებელი: {assignee?.fullName || '—'}
                    </p>
                  </div>
                </div>
                <UrgencyChip urgency={getDeadlineUrgency(t.dueDate, done, todayISO)} date={t.dueDate} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const CalendarVisitsPage: React.FC = () => {
  const { snapshot, navigate } = useApp();
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [focusDate, setFocusDate] = useState(getTbilisiDateISO());

  const events = useMemo(() => {
    if (!snapshot) return [];
    const list: Array<{ date: string; kind: string; title: string; caseId?: string; tone: string }> = [];

    for (const v of snapshot.visits) {
      if (!v.deletedAt) {
        list.push({
          date: v.plannedDateTime.slice(0, 10),
          kind: 'ვიზიტი',
          title: v.purpose,
          caseId: v.caseId,
          tone: 'bg-teal-50 border-teal-200 text-teal-900',
        });
      }
    }
    for (const t of snapshot.tasks) {
      if (!t.deletedAt && t.dueDate && t.status !== 'completed') {
        list.push({
          date: t.dueDate.slice(0, 10),
          kind: 'დავალება',
          title: t.title,
          caseId: t.caseId,
          tone: 'bg-sky-50 border-sky-200 text-sky-900',
        });
      }
    }
    for (const d of snapshot.documentRequests) {
      if (!d.deletedAt && d.dueDate && !['fully_received', 'no_longer_needed'].includes(d.status)) {
        list.push({
          date: d.dueDate.slice(0, 10),
          kind: 'დოკუმენტი',
          title: d.documentTitle,
          caseId: d.caseId,
          tone: 'bg-amber-50 border-amber-200 text-amber-900',
        });
      }
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [snapshot]);

  if (!snapshot) return null;

  const yearMonth = focusDate.slice(0, 7);
  const filteredEvents = events.filter((ev) => {
    if (viewMode === 'day') return ev.date === focusDate;
    if (viewMode === 'month') return ev.date.startsWith(yearMonth);
    // Week: +/- 3 days around focusDate
    const t0 = Date.parse(`${focusDate}T00:00:00Z`);
    const t1 = Date.parse(`${ev.date}T00:00:00Z`);
    return Math.abs(t1 - t0) <= 3 * 86400000;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-sky-800" />
          <h1 className="text-xl font-bold text-slate-900">კალენდარი / ვიზიტები და ვადები</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={focusDate}
            onChange={(e) => setFocusDate(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
          />
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {(['day', 'week', 'month'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md ${viewMode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
              >
                {m === 'day' ? 'დღე' : m === 'week' ? 'კვირა' : 'თვე'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <EmptyState title="არჩეულ პერიოდში მოვლენები არ არის" description="შეცვალეთ თარიღი ან ხედის რეჟიმი (დღე / კვირა / თვე)." />
      ) : (
        <div className="space-y-2">
          {filteredEvents.map((ev, idx) => {
            const c = ev.caseId ? snapshot.cases.find((x) => x.id === ev.caseId) : null;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => c && navigate('case_detail', { caseId: c.id })}
                className={`w-full text-left rounded-xl border p-3.5 text-xs flex flex-wrap items-center justify-between gap-2 ${ev.tone}`}
              >
                <div>
                  <span className="font-semibold mr-2">[{ev.kind}]</span>
                  <span className="font-medium">{ev.title}</span>
                  {c && <span className="ml-2 font-mono opacity-80">({c.caseNumber})</span>}
                </div>
                <span className="tabular-nums font-medium">{formatGeorgianDate(ev.date, snapshot.settings.dateFormat)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const DocumentVaultPage: React.FC = () => {
  const { snapshot } = useApp();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  if (!snapshot) return null;

  const files = snapshot.attachments
    .filter((a) => {
      if (a.deletedAt) return false;
      if (categoryFilter && a.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return `${a.title} ${a.fileName} ${a.category} ${a.receivedFrom || ''}`.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const categories = Array.from(new Set(snapshot.attachments.filter((a) => !a.deletedAt).map((a) => a.category)));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">დოკუმენტების საცავი</h1>
        <p className="text-xs text-slate-600 mt-0.5">
          Firebase Storage-ში ატვირთული ფაილების ერთიანი სია, ვერსიების კონტროლი, გადახედვა და ძებნა
        </p>
      </div>

      <FileUploader linkedEntityType="general" defaultCategory="საცავის დოკუმენტი" />

      <div className="flex flex-wrap gap-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ძებნა ფაილის სახელით, აღწერით..."
          className="h-9 w-full sm:w-72 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs"
        >
          <option value="">ყველა კატეგორია</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <AttachmentList attachments={files} emptyText="ატვირთული დოკუმენტები ვერ მოიძებნა." />
      </div>
    </div>
  );
};
