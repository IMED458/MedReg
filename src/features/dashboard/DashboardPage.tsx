import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckSquare,
  FileCheck2,
  FilePlus2,
  FileWarning,
  Mail,
  Scale,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  CaseFilterCriteria,
  computeDashboardStats,
  formatGeorgianDate,
  getTbilisiDateISO,
  isClosedStatus,
} from '../../utils/caseLogic';
import { CaseTableWidget } from '../cases/CaseTableWidget';
import { dataRepo } from '../../repositories/DataRepository';
import { ReviewAssignment } from '../../models/types';

export const DashboardPage: React.FC = () => {
  const { currentUser, snapshot, navigate, refreshData, notify, can } = useApp();
  const [seeding, setSeeding] = useState(false);
  const todayISO = getTbilisiDateISO();

  const kpis = useMemo(() => {
    if (!snapshot || !currentUser) return null;
    return computeDashboardStats({
      cases: snapshot.cases,
      currentUserId: currentUser.id,
      settings: snapshot.settings,
      tasks: snapshot.tasks,
      docRequests: snapshot.documentRequests,
      reviews: snapshot.reviewAssignments,
      todayISO,
    });
  }, [snapshot, currentUser, todayISO]);

  const operationalQueues = useMemo(() => {
    if (!snapshot || !currentUser) {
      return {
        todayTasks: [],
        upcomingVisits: [],
        docsToRequestOrOverdue: [],
        interimLettersToSend: [],
        reviewsStats: { sent: 0, received: 0, awaiting: [] as ReviewAssignment[] },
        incompleteChecklists: [],
      };
    }

    const todayTasks = snapshot.tasks.filter(
      (t) =>
        !t.deletedAt &&
        (t.status === 'open' || t.status === 'in_progress') &&
        (t.assignedTo === currentUser.id || !t.dueDate || t.dueDate.slice(0, 10) <= todayISO)
    );

    const upcomingVisits = snapshot.visits
      .filter(
        (v) =>
          !v.deletedAt &&
          (v.status === 'planned' || v.status === 'in_progress') &&
          v.plannedDateTime.slice(0, 10) >= todayISO
      )
      .sort((a, b) => a.plannedDateTime.localeCompare(b.plannedDateTime));

    const docsToRequestOrOverdue = snapshot.documentRequests.filter(
      (d) =>
        !d.deletedAt &&
        ['planned', 'requested', 'partially_received', 'defective', 'overdue'].includes(d.status)
    );

    const interimLettersToSend = snapshot.correspondence.filter(
      (l) => !l.deletedAt && l.isInterimLetter && !l.interimSent && l.status !== 'sent'
    );

    const activeReviews = snapshot.reviewAssignments.filter((r) => !r.deletedAt);
    const sentCount = activeReviews.filter((r) => r.status !== 'to_prepare').length;
    const receivedCount = activeReviews.filter((r) =>
      ['response_received', 'completed'].includes(r.status)
    ).length;
    const awaiting = activeReviews.filter((r) =>
      ['sent', 'receipt_confirmed', 'awaiting_response', 'additional_materials_requested'].includes(
        r.status
      )
    );

    const requiredChecklistCount = snapshot.settings.checklistItems.filter(
      (i) => i.active && i.requiredForClose
    ).length;
    const incompleteChecklists = snapshot.cases.filter((c) => {
      if (c.deletedAt || c.isDraft || isClosedStatus(c.statusId, snapshot.settings)) return false;
      const doneCount = c.checklistAnswers.filter((a) => a.checked).length;
      return doneCount < requiredChecklistCount;
    });

    return {
      todayTasks,
      upcomingVisits,
      docsToRequestOrOverdue,
      interimLettersToSend,
      reviewsStats: { sent: sentCount, received: receivedCount, awaiting },
      incompleteChecklists,
    };
  }, [snapshot, currentUser, todayISO]);

  if (!snapshot || !currentUser || !kpis) return null;

  const openPreset = (preset: CaseFilterCriteria['kpiPreset']) => {
    navigate('cases', { preset: { kpiPreset: preset } });
  };

  const handleLoadSampleData = async () => {
    setSeeding(true);
    try {
      await dataRepo.seedSampleTestData(currentUser);
      await refreshData();
      notify('ჩაიტვირთა მონიშნული სატესტო მონაცემები.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'შეცდომა', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const kpiCards: Array<{
    label: string;
    value: number;
    preset: CaseFilterCriteria['kpiPreset'];
    tone?: 'default' | 'danger' | 'warn' | 'success';
  }> = [
    { label: 'ყველა ქეისი', value: kpis.total, preset: 'all' },
    { label: 'ჩემი აქტიური ქეისები', value: kpis.myActive, preset: 'my_active' },
    { label: 'ახალი', value: kpis.newCount, preset: 'new' },
    { label: 'პროცესში', value: kpis.inProgress, preset: 'in_progress' },
    { label: 'ვადაგადაცილებული', value: kpis.overdue, preset: 'overdue', tone: 'danger' },
    { label: 'მომდევნო 7 დღეში', value: kpis.dueNext7Days, preset: 'next_7_days', tone: 'warn' },
    { label: 'დოკუმენტების მოლოდინში', value: kpis.waitingDocs, preset: 'waiting_docs' },
    { label: 'რეცენზიის მოლოდინში', value: kpis.waitingReviews, preset: 'waiting_reviews' },
    { label: 'დასრულებული ამ თვეში', value: kpis.completedThisMonth, preset: 'completed_month', tone: 'success' },
  ];

  const activeCaseCount = snapshot.cases.filter((c) => !c.deletedAt && !c.isDraft).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">სამუშაო პანელი</h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            საქმეების, ვადების, დოკუმენტების მოთხოვნების და რეცენზიების ოპერაციული კონტროლი
          </p>
        </div>
        {can('create') && activeCaseCount === 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={seeding}
              onClick={() => void handleLoadSampleData()}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              {seeding ? 'იტვირთება...' : 'ხელოვნური სატესტო მონაცემების ჩატვირთვა'}
            </button>
            <button
              type="button"
              onClick={() => navigate('case_new')}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-sky-900 rounded-lg hover:bg-sky-950"
            >
              <FilePlus2 className="w-4 h-4" />
              პირველი ქეისის რეგისტრაცია
            </button>
          </div>
        )}
      </div>

      {/* 9 Live KPI Cards */}
      <section aria-label="ძირითადი მაჩვენებლები" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2.5">
        {kpiCards.map((card) => {
          const toneStyle =
            card.tone === 'danger' && card.value > 0
              ? 'border-rose-200 bg-rose-50/50 hover:border-rose-300'
              : card.tone === 'warn' && card.value > 0
                ? 'border-amber-200 bg-amber-50/50 hover:border-amber-300'
                : card.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300'
                  : 'border-slate-200 bg-white hover:border-sky-300';
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => openPreset(card.preset)}
              className={`text-left rounded-xl border p-3 transition-colors flex flex-col justify-between min-h-[82px] ${toneStyle}`}
            >
              <span className="text-[11px] font-medium text-slate-600 leading-tight">{card.label}</span>
              <span className="text-2xl font-bold text-slate-900 tabular-nums mt-2">{card.value}</span>
            </button>
          );
        })}
      </section>

      {/* 6 Actionable Operational Queues */}
      <section aria-label="ყოველდღიური სამუშაო რიგები" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* 1. Today's Tasks */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-sky-800" />
              <h2 className="text-sm font-semibold text-slate-900">დღეს რა მაქვს გასაკეთებელი</h2>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {operationalQueues.todayTasks.length}
            </span>
          </div>
          <div className="mt-2.5 space-y-2 flex-1">
            {operationalQueues.todayTasks.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">მიმდინარე დავალებები არ არის.</p>
            ) : (
              operationalQueues.todayTasks.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => (t.caseId ? navigate('case_detail', { caseId: t.caseId, tab: 'tasks' }) : navigate('tasks'))}
                  className="w-full text-left rounded-lg border border-slate-100 hover:border-sky-200 hover:bg-sky-50/40 px-2.5 py-2 text-xs flex items-center justify-between gap-2"
                >
                  <span className="font-medium text-slate-800 truncate">{t.title}</span>
                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                    {formatGeorgianDate(t.dueDate, snapshot.settings.dateFormat)}
                  </span>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('tasks')}
            className="mt-3 text-xs font-medium text-sky-800 hover:underline self-start"
          >
            ყველა დავალების ნახვა →
          </button>
        </div>

        {/* 2. Upcoming Visits */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-teal-700" />
              <h2 className="text-sm font-semibold text-slate-900">მოახლოებული ვიზიტები</h2>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {operationalQueues.upcomingVisits.length}
            </span>
          </div>
          <div className="mt-2.5 space-y-2 flex-1">
            {operationalQueues.upcomingVisits.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">დაგეგმილი ვიზიტები არ არის.</p>
            ) : (
              operationalQueues.upcomingVisits.slice(0, 4).map((v) => {
                const org = snapshot.organizations.find((o) => o.id === v.organizationId);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => navigate('case_detail', { caseId: v.caseId, tab: 'visits' })}
                    className="w-full text-left rounded-lg border border-slate-100 hover:border-sky-200 hover:bg-sky-50/40 px-2.5 py-2 text-xs flex items-center justify-between gap-2"
                  >
                    <span className="font-medium text-slate-800 truncate">
                      {org?.legalName || v.purpose}
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                      {formatGeorgianDate(v.plannedDateTime, snapshot.settings.dateFormat)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('visits')}
            className="mt-3 text-xs font-medium text-sky-800 hover:underline self-start"
          >
            შემოწმებები და აქტები →
          </button>
        </div>

        {/* 3. Documents to Request / Pending */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-amber-700" />
              <h2 className="text-sm font-semibold text-slate-900">გამოსათხოვი / ღია დოკუმენტები</h2>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {operationalQueues.docsToRequestOrOverdue.length}
            </span>
          </div>
          <div className="mt-2.5 space-y-2 flex-1">
            {operationalQueues.docsToRequestOrOverdue.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">ღია დოკუმენტის მოთხოვნა არ არის.</p>
            ) : (
              operationalQueues.docsToRequestOrOverdue.slice(0, 4).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => navigate('case_detail', { caseId: d.caseId, tab: 'documents' })}
                  className="w-full text-left rounded-lg border border-slate-100 hover:border-sky-200 hover:bg-sky-50/40 px-2.5 py-2 text-xs flex items-center justify-between gap-2"
                >
                  <span className="font-medium text-slate-800 truncate">{d.documentTitle}</span>
                  <span
                    className={`text-[11px] tabular-nums shrink-0 ${
                      d.status === 'overdue' || (d.dueDate && d.dueDate < todayISO)
                        ? 'text-rose-700 font-semibold'
                        : 'text-slate-500'
                    }`}
                  >
                    {formatGeorgianDate(d.dueDate, snapshot.settings.dateFormat)}
                  </span>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('documents_req')}
            className="mt-3 text-xs font-medium text-sky-800 hover:underline self-start"
          >
            ყველა მოთხოვნა →
          </button>
        </div>

        {/* 4. Interim Letters to Send */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-sky-800" />
              <h2 className="text-sm font-semibold text-slate-900">გამოსაგზავნი შუალედური წერილები</h2>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {operationalQueues.interimLettersToSend.length}
            </span>
          </div>
          <div className="mt-2.5 space-y-2 flex-1">
            {operationalQueues.interimLettersToSend.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">გასაგზავნი შუალედური წერილი არ არის.</p>
            ) : (
              operationalQueues.interimLettersToSend.slice(0, 4).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() =>
                    l.caseIds[0]
                      ? navigate('case_detail', { caseId: l.caseIds[0], tab: 'correspondence' })
                      : navigate('correspondence')
                  }
                  className="w-full text-left rounded-lg border border-slate-100 hover:border-sky-200 hover:bg-sky-50/40 px-2.5 py-2 text-xs flex items-center justify-between gap-2"
                >
                  <span className="font-medium text-slate-800 truncate">{l.subject}</span>
                  <span className="text-[11px] text-amber-800 shrink-0">
                    {l.interimPrepared ? 'მომზადებულია' : 'მოსამზადებელია'}
                  </span>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('correspondence')}
            className="mt-3 text-xs font-medium text-sky-800 hover:underline self-start"
          >
            კორესპონდენციის ჟურნალი →
          </button>
        </div>

        {/* 5. Reviews Sent / Received / Awaiting */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-700" />
              <h2 className="text-sm font-semibold text-slate-900">დასაბრუნებელი რეცენზიები</h2>
            </div>
            <span className="text-xs text-slate-600 tabular-nums">
              გაიგზავნა: <strong>{operationalQueues.reviewsStats.sent}</strong> · მიღებულია:{' '}
              <strong>{operationalQueues.reviewsStats.received}</strong>
            </span>
          </div>
          <div className="mt-2.5 space-y-2 flex-1">
            {operationalQueues.reviewsStats.awaiting.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">მოლოდინში მყოფი რეცენზია არ არის.</p>
            ) : (
              operationalQueues.reviewsStats.awaiting.slice(0, 4).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate('case_detail', { caseId: r.caseId, tab: 'reviews' })}
                  className="w-full text-left rounded-lg border border-slate-100 hover:border-sky-200 hover:bg-sky-50/40 px-2.5 py-2 text-xs flex items-center justify-between gap-2"
                >
                  <span className="font-medium text-slate-800 truncate">{r.reviewerNameSnapshot}</span>
                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                    ვადა: {formatGeorgianDate(r.dueDate, snapshot.settings.dateFormat)}
                  </span>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('reviews')}
            className="mt-3 text-xs font-medium text-sky-800 hover:underline self-start"
          >
            რეცენზიების მოდული →
          </button>
        </div>

        {/* 6. Incomplete Checklists */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-slate-700" />
              <h2 className="text-sm font-semibold text-slate-900">დაუსრულებელი ჩეკლისტი</h2>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {operationalQueues.incompleteChecklists.length}
            </span>
          </div>
          <div className="mt-2.5 space-y-2 flex-1">
            {operationalQueues.incompleteChecklists.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">აქტიური დაუსრულებელი ჩეკლისტი არ არის.</p>
            ) : (
              operationalQueues.incompleteChecklists.slice(0, 4).map((c) => {
                const done = c.checklistAnswers.filter((a) => a.checked).length;
                const total = snapshot.settings.checklistItems.filter((i) => i.active).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate('case_detail', { caseId: c.id, tab: 'overview' })}
                    className="w-full text-left rounded-lg border border-slate-100 hover:border-sky-200 hover:bg-sky-50/40 px-2.5 py-2 text-xs flex items-center justify-between gap-2"
                  >
                    <span className="font-medium text-slate-800 truncate">
                      <span className="font-mono text-sky-900 mr-1.5">{c.caseNumber}</span>
                      {c.title}
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                      {done}/{total}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>ჩეკლისტი მოწმდება ქეისის დახურვამდე</span>
          </div>
        </div>
      </section>

      {/* Main Cases Table */}
      <section aria-label="ქეისების მთავარი ცხრილი" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">ქეისების მთავარი ცხრილი</h2>
          <button
            type="button"
            onClick={() => navigate('cases')}
            className="text-xs font-medium text-sky-800 hover:underline"
          >
            სრული რეესტრის გახსნა →
          </button>
        </div>
        <CaseTableWidget compactHeader />
      </section>
    </div>
  );
};
