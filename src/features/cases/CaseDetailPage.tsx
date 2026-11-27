import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Printer,
  RotateCcw,
  Save,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { dataRepo } from '../../repositories/DataRepository';
import {
  evaluateClosureReadiness,
  formatGeorgianDate,
  formatGeorgianDateTime,
  generateUuid,
  getDeadlineUrgency,
  getTbilisiDateISO,
  isClosedStatus,
} from '../../utils/caseLogic';
import {
  AttachmentList,
  CustomFieldsSection,
  FieldCommentButton,
  FileUploader,
  StatusLabel,
  UrgencyChip,
} from '../../components/ui/CommonUI';
import {
  CaseClinicsDoctorsTab,
  CaseOrdersCommissionsTab,
  CaseParticipantsTab,
  CaseVisitsTab,
} from './tabs/CaseClinicalTabs';
import {
  CaseCorrespondenceTab,
  CaseDocumentsTab,
  CaseReviewsTab,
  CaseTasksTab,
} from './tabs/CaseWorkflowTabs';

const CASE_TABS = [
  { id: 'overview', label: 'მიმოხილვა' },
  { id: 'participants', label: 'მონაწილეები' },
  { id: 'clinics', label: 'კლინიკები/ექიმები' },
  { id: 'visits', label: 'ვიზიტები და აქტები' },
  { id: 'orders', label: 'ბრძანებები/კომისიები' },
  { id: 'documents', label: 'მოთხოვნილი დოკუმენტები' },
  { id: 'correspondence', label: 'წერილები' },
  { id: 'reviews', label: 'რეცენზიები' },
  { id: 'tasks', label: 'დავალებები/კალენდარი' },
  { id: 'files', label: 'ფაილები' },
  { id: 'history', label: 'კომენტარები/ისტორია' },
] as const;

export const CaseDetailPage: React.FC = () => {
  const {
    currentUser,
    snapshot,
    activeCaseId,
    activeCaseTab,
    navigate,
    refreshData,
    notify,
    can,
  } = useApp();

  const [tab, setTab] = useState(activeCaseTab || 'overview');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeOutcome, setCloseOutcome] = useState('დასრულებული — პასუხი გაგზავნილია');
  const [closeSummary, setCloseSummary] = useState('');
  const [closeDecisionNum, setCloseDecisionNum] = useState('');
  const [closeFollowUp, setCloseFollowUp] = useState(false);
  const [closeFollowUpDate, setCloseFollowUpDate] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const [generalComment, setGeneralComment] = useState('');
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  // Sync tab when navigated directly to a tab
  React.useEffect(() => {
    if (activeCaseTab) setTab(activeCaseTab);
  }, [activeCaseTab]);

  const medicalCase = useMemo(
    () => snapshot?.cases.find((c) => c.id === activeCaseId) || null,
    [snapshot, activeCaseId]
  );

  // Overview inline edit state
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editEmohNum, setEditEmohNum] = useState('');
  const [editEmohDate, setEditEmohDate] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editStatusId, setEditStatusId] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [customValMap, setCustomValMap] = useState<
    Record<string, string | number | boolean | string[] | null>
  >({});

  React.useEffect(() => {
    if (!medicalCase || !snapshot) return;
    setEditTitle(medicalCase.title);
    setEditSummary(medicalCase.shortSummary);
    setEditDesc(medicalCase.detailedDescription || '');
    setEditEmohNum(medicalCase.emohRegNumber || '');
    setEditEmohDate(medicalCase.emohRegDate || '');
    setEditDeadline(medicalCase.deadlineDate || '');
    setEditStatusId(medicalCase.statusId);
    setEditAssignee(medicalCase.assignedTo);

    const map: Record<string, string | number | boolean | string[] | null> = {};
    snapshot.customFieldValues
      .filter((cv) => cv.entityId === medicalCase.id)
      .forEach((cv) => {
        map[cv.fieldId] = cv.value;
      });
    setCustomValMap(map);
  }, [medicalCase, snapshot]);

  if (!snapshot || !currentUser) return null;
  if (!medicalCase) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center space-y-3">
        <p className="text-sm text-slate-700">ქეისი ვერ მოიძებნა.</p>
        <button
          type="button"
          onClick={() => navigate('cases')}
          className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg"
        >
          ქეისების სიაში დაბრუნება
        </button>
      </div>
    );
  }

  const { settings } = snapshot;
  const editable = can('edit');
  const closed = isClosedStatus(medicalCase.statusId, settings);
  const todayISO = getTbilisiDateISO();
  const statusObj = settings.caseStatuses.find((s) => s.id === medicalCase.statusId);
  const assigneeUser = snapshot.users.find((u) => u.id === medicalCase.assignedTo);

  const caseAttachments = snapshot.attachments.filter((a) => a.caseId === medicalCase.id && !a.deletedAt);
  const caseComments = snapshot.comments
    .filter((c) => c.caseId === medicalCase.id && !c.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const caseLogs = snapshot.activityLogs
    .filter((l) => l.caseId === medicalCase.id)
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt));

  const openTasks = snapshot.tasks
    .filter((t) => t.caseId === medicalCase.id && !t.deletedAt && (t.status === 'open' || t.status === 'in_progress'))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

  const readiness = evaluateClosureReadiness({
    medicalCase,
    settings,
    docRequests: snapshot.documentRequests,
    reviews: snapshot.reviewAssignments,
    tasks: snapshot.tasks,
    correspondence: snapshot.correspondence,
  });

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable) return;
    await dataRepo.updateCaseFields(
      medicalCase.id,
      {
        title: editTitle.trim(),
        shortSummary: editSummary.trim(),
        detailedDescription: editDesc.trim(),
        emohRegNumber: editEmohNum.trim() || undefined,
        emohRegDate: editEmohDate || undefined,
        deadlineDate: editDeadline || undefined,
        statusId: editStatusId,
        assignedTo: editAssignee,
      },
      currentUser,
      'ძირითადი მონაცემები'
    );
    await dataRepo.saveCustomFieldValues('case_basic', medicalCase.id, customValMap, currentUser);
    await refreshData();
    notify('ცვლილებები შენახულია და აისახა ისტორიაში.', 'success');
  };

  const toggleChecklistItem = async (itemId: string, checked: boolean) => {
    if (!editable) return;
    const now = new Date().toISOString();
    const existing = medicalCase.checklistAnswers.filter((a) => a.itemId !== itemId);
    const updated = [...existing, { itemId, checked, updatedAt: now, updatedBy: currentUser.id }];
    await dataRepo.updateCaseFields(
      medicalCase.id,
      { checklistAnswers: updated },
      currentUser,
      'დასასრულის ჩეკლისტი'
    );
    await refreshData();
  };

  const handleConfirmClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('close')) return;
    if (readiness.requiresAdminOverride) {
      if (currentUser.role !== 'admin') {
        notify('დაუხურავი პუნქტების გამო ქეისის დახურვა შეუძლია მხოლოდ Admin-ს დასაბუთებით.', 'error');
        return;
      }
      if (overrideReason.trim().length < 5) {
        notify('გთხოვთ მიუთითოთ დასაბუთებული გამონაკლისის მიზეზი (მინიმუმ 5 სიმბოლო).', 'error');
        return;
      }
    }

    const closedStatus = settings.caseStatuses.find((s) => s.isClosedState)?.id || 'st_completed';
    await dataRepo.closeCase(
      medicalCase.id,
      {
        outcome: closeOutcome,
        summary: closeSummary.trim() || medicalCase.shortSummary,
        closedAt: new Date().toISOString(),
        closedBy: currentUser.id,
        decisionNumber: closeDecisionNum.trim() || undefined,
        followUpControlNeeded: closeFollowUp,
        followUpDate: closeFollowUpDate || undefined,
        adminOverrideUsed: readiness.requiresAdminOverride,
        adminOverrideJustification: readiness.requiresAdminOverride ? overrideReason.trim() : undefined,
      },
      closedStatus,
      currentUser
    );
    setShowCloseModal(false);
    await refreshData();
    notify('ქეისი დასრულებულად გადაყვანილია.', 'success');
  };

  const handleConfirmReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('reopen') || reopenReason.trim().length < 4) return;
    await dataRepo.reopenCase(medicalCase.id, reopenReason.trim(), 'st_initial_study', currentUser);
    setShowReopenModal(false);
    setReopenReason('');
    await refreshData();
    notify('ქეისი ხელახლა გაიხსნა.', 'success');
  };

  const handleAddGeneralComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!generalComment.trim()) return;
    const now = new Date().toISOString();
    await dataRepo.saveComment(
      {
        id: generateUuid(),
        caseId: medicalCase.id,
        targetType: 'case',
        authorId: currentUser.id,
        authorName: currentUser.fullName,
        text: generalComment.trim(),
        replies: [],
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
      },
      currentUser
    );
    setGeneralComment('');
    await refreshData();
    notify('კომენტარი დაემატა.', 'success');
  };

  const handleReplyComment = async (commentId: string) => {
    const txt = (replyTexts[commentId] || '').trim();
    if (!txt) return;
    const target = caseComments.find((c) => c.id === commentId);
    if (!target) return;
    await dataRepo.saveComment(
      {
        ...target,
        replies: [
          ...target.replies,
          {
            id: generateUuid(),
            authorId: currentUser.id,
            authorName: currentUser.fullName,
            text: txt,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      currentUser
    );
    setReplyTexts((p) => ({ ...p, [commentId]: '' }));
    await refreshData();
  };

  // Build unified Timeline events
  const timelineEvents = [
    { date: medicalCase.createdAt, title: `ქეისი შეიქმნა (${medicalCase.caseNumber})`, targetTab: 'overview' },
    ...snapshot.correspondence
      .filter((l) => l.caseIds.includes(medicalCase.id) && !l.deletedAt)
      .map((l) => ({
        date: l.createdAt,
        title: `წერილი: ${l.subject} (${l.officialNumber || '—'})`,
        targetTab: 'correspondence',
      })),
    ...snapshot.tasks
      .filter((t) => t.caseId === medicalCase.id && !t.deletedAt)
      .map((t) => ({
        date: t.createdAt,
        title: `დავალება: ${t.title} (${t.status === 'completed' ? 'შესრულებული' : 'ღია'})`,
        targetTab: 'tasks',
      })),
    ...snapshot.visits
      .filter((v) => v.caseId === medicalCase.id && !v.deletedAt)
      .map((v) => ({
        date: v.plannedDateTime,
        title: `ვიზიტი / აქტი: ${v.purpose} ${v.actNumber ? `(აქტი №${v.actNumber})` : ''}`,
        targetTab: 'visits',
      })),
    ...snapshot.documentRequests
      .filter((d) => d.caseId === medicalCase.id && !d.deletedAt)
      .map((d) => ({
        date: d.createdAt,
        title: `დოკუმენტის მოთხოვნა: ${d.documentTitle}`,
        targetTab: 'documents',
      })),
    ...snapshot.reviewAssignments
      .filter((r) => r.caseId === medicalCase.id && !r.deletedAt)
      .map((r) => ({
        date: r.createdAt,
        title: `რეცენზია: ${r.reviewerNameSnapshot} (${r.responses.length} პასუხი)`,
        targetTab: 'reviews',
      })),
    ...(medicalCase.closureInfo
      ? [{ date: medicalCase.closureInfo.closedAt, title: `დახურვა: ${medicalCase.closureInfo.outcome}`, targetTab: 'overview' }]
      : []),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      {/* Top Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => navigate('cases')}
            aria-label="უკან ქეისების სიაში"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-sky-900 tabular-nums">{medicalCase.caseNumber}</span>
              <StatusLabel label={statusObj?.label || medicalCase.statusId} tone={statusObj?.color || 'slate'} />
              {medicalCase.isTestSample && <StatusLabel label="სატესტო ჩანაწერი" tone="amber" compact />}
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate mt-0.5">{medicalCase.title}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <Printer className="w-3.5 h-3.5" />
            საქმის ბარათის ბეჭდვა / PDF
          </button>

          {!closed && can('close') && (
            <button
              type="button"
              onClick={() => setShowCloseModal(true)}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              ქეისის დასრულება
            </button>
          )}

          {closed && can('reopen') && (
            <button
              type="button"
              onClick={() => setShowReopenModal(true)}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              ხელახლა გახსნა
            </button>
          )}
        </div>
      </div>

      {/* Persistent Summary Strip (Always visible across tabs) */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <div>
          <span className="block text-[11px] text-slate-500">შიდა ნომერი</span>
          <strong className="font-mono text-sky-900 tabular-nums">{medicalCase.caseNumber}</strong>
        </div>
        <div>
          <span className="block text-[11px] text-slate-500">მიმდინარე სტატუსი</span>
          <strong className="text-slate-900">{statusObj?.label || medicalCase.statusId}</strong>
        </div>
        <div>
          <span className="block text-[11px] text-slate-500">პასუხისმგებელი</span>
          <strong className="text-slate-900">{assigneeUser?.fullName || '—'}</strong>
        </div>
        <div>
          <span className="block text-[11px] text-slate-500">სამუშაო ვადა</span>
          <UrgencyChip urgency={getDeadlineUrgency(medicalCase.deadlineDate, closed, todayISO)} date={medicalCase.deadlineDate} />
        </div>
        <div>
          <span className="block text-[11px] text-slate-500">შემდეგი მოქმედება</span>
          <strong className="text-slate-800 truncate block">{openTasks[0]?.title || '—'}</strong>
        </div>
        <div>
          <span className="block text-[11px] text-slate-500">ბოლო აქტივობა</span>
          <strong className="text-slate-800 tabular-nums">{formatGeorgianDateTime(medicalCase.lastActivityAt)}</strong>
        </div>
      </div>

      {/* 11 Tabs (wrap cleanly on desktop, horizontally scrollable on mobile) */}
      <div className="border-b border-slate-200 flex items-center gap-1 overflow-x-auto md:overflow-visible md:flex-wrap no-print" role="tablist">
        {CASE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[38px] px-2.5 py-2 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
              tab === t.id
                ? 'border-sky-900 text-sky-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <div className="xl:col-span-3 space-y-5">
          {tab === 'overview' && (
            <div className="space-y-5">
              <form onSubmit={handleSaveOverview} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <h2 className="text-sm font-semibold text-slate-900">ქეისის ძირითადი მონაცემები და eMOH რეკვიზიტები</h2>
                  {editable && (
                    <button
                      type="submit"
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-sky-900 rounded-lg hover:bg-sky-950"
                    >
                      <Save className="w-3.5 h-3.5" />
                      ცვლილებების შენახვა
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs font-medium text-slate-700">საქმის სათაური</label>
                      <FieldCommentButton caseId={medicalCase.id} fieldKey="title" fieldLabel="საქმის სათაური" />
                    </div>
                    <input
                      type="text"
                      disabled={!editable}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs font-medium text-slate-700">მოკლე შინაარსი</label>
                      <FieldCommentButton caseId={medicalCase.id} fieldKey="shortSummary" fieldLabel="მოკლე შინაარსი" />
                    </div>
                    <textarea
                      rows={2}
                      disabled={!editable}
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">დეტალური აღწერა</label>
                    <textarea
                      rows={3}
                      disabled={!editable}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">ეტაპი / სტატუსი</label>
                    <select
                      disabled={!editable}
                      value={editStatusId}
                      onChange={(e) => setEditStatusId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                    >
                      {settings.caseStatuses
                        .filter((s) => !s.isClosedState || s.id === medicalCase.statusId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">პასუხისმგებელი თანამშრომელი</label>
                    <select
                      disabled={!editable}
                      value={editAssignee}
                      onChange={(e) => setEditAssignee(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                    >
                      {snapshot.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} {!u.isActive ? '(დეაქტივირებული)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs font-medium text-slate-700">eMOH განცხადების № (ხელით)</label>
                      <FieldCommentButton caseId={medicalCase.id} fieldKey="emohRegNumber" fieldLabel="eMOH ნომერი" />
                    </div>
                    <input
                      type="text"
                      disabled={!editable}
                      value={editEmohNum}
                      onChange={(e) => setEditEmohNum(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">eMOH რეგისტრაციის თარიღი</label>
                    <input
                      type="date"
                      disabled={!editable}
                      value={editEmohDate}
                      onChange={(e) => setEditEmohDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs font-medium text-slate-700">სამუშაო ვადა</label>
                      <FieldCommentButton caseId={medicalCase.id} fieldKey="deadlineDate" fieldLabel="სამუშაო ვადა" />
                    </div>
                    <input
                      type="date"
                      disabled={!editable}
                      value={editDeadline}
                      onChange={(e) => setEditDeadline(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                    />
                  </div>
                </div>

                <CustomFieldsSection
                  targetPage="case_basic"
                  definitions={settings.customFields}
                  values={customValMap}
                  disabled={!editable}
                  onChange={(fid, val) => setCustomValMap((p) => ({ ...p, [fid]: val }))}
                />
              </form>

              {/* Closure Checklist */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">ქეისის დასასრულის შემოწმებადი ჩეკლისტი</h3>
                <div className="space-y-2">
                  {settings.checklistItems
                    .filter((i) => i.active)
                    .sort((a, b) => a.order - b.order)
                    .map((item) => {
                      const ans = medicalCase.checklistAnswers.find((a) => a.itemId === item.id);
                      return (
                        <label
                          key={item.id}
                          className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs text-slate-800 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            disabled={!editable}
                            checked={Boolean(ans?.checked)}
                            onChange={(e) => void toggleChecklistItem(item.id, e.target.checked)}
                            className="mt-0.5"
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                </div>
              </div>

              {medicalCase.closureInfo && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs space-y-1">
                  <p className="font-semibold text-emerald-950">დასრულების ჩანაწერი</p>
                  <p>შედეგი: <strong>{medicalCase.closureInfo.outcome}</strong></p>
                  <p>დახურვის თარიღი: {formatGeorgianDateTime(medicalCase.closureInfo.closedAt)}</p>
                  {medicalCase.closureInfo.decisionNumber && <p>გადაწყვეტილების №: {medicalCase.closureInfo.decisionNumber}</p>}
                  <p>შეჯამება: {medicalCase.closureInfo.summary}</p>
                  {medicalCase.closureInfo.adminOverrideUsed && (
                    <p className="text-amber-900 font-medium">
                      Admin გამონაკლისი: {medicalCase.closureInfo.adminOverrideJustification}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'participants' && <CaseParticipantsTab medicalCase={medicalCase} />}
          {tab === 'clinics' && <CaseClinicsDoctorsTab medicalCase={medicalCase} />}
          {tab === 'visits' && <CaseVisitsTab medicalCase={medicalCase} />}
          {tab === 'orders' && <CaseOrdersCommissionsTab medicalCase={medicalCase} />}
          {tab === 'documents' && <CaseDocumentsTab medicalCase={medicalCase} />}
          {tab === 'correspondence' && <CaseCorrespondenceTab medicalCase={medicalCase} />}
          {tab === 'reviews' && <CaseReviewsTab medicalCase={medicalCase} />}
          {tab === 'tasks' && <CaseTasksTab medicalCase={medicalCase} />}

          {tab === 'files' && (
            <div className="space-y-4">
              <FileUploader caseId={medicalCase.id} linkedEntityType="case" linkedEntityId={medicalCase.id} />
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">ქეისთან დაკავშირებული ყველა ფაილი ({caseAttachments.length})</h3>
                <AttachmentList attachments={caseAttachments} />
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-5">
              {/* Comments */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">კომენტარები და შენიშვნები</h3>
                {editable && (
                  <form onSubmit={handleAddGeneralComment} className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={generalComment}
                      onChange={(e) => setGeneralComment(e.target.value)}
                      placeholder="დაამატეთ კომენტარი ქეისზე..."
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg whitespace-nowrap">
                      გაგზავნა
                    </button>
                  </form>
                )}

                <div className="space-y-2.5">
                  {caseComments.length === 0 ? (
                    <p className="text-xs text-slate-500">კომენტარები ჯერ არ არის.</p>
                  ) : (
                    caseComments.map((c) => (
                      <div key={c.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-2">
                        <div className="flex items-center justify-between text-slate-500">
                          <div>
                            <strong className="text-slate-900">{c.authorName}</strong>
                            {c.fieldLabel && (
                              <span className="ml-2 text-[11px] text-sky-800">[{c.fieldLabel}]</span>
                            )}
                          </div>
                          <span className="tabular-nums">{formatGeorgianDateTime(c.createdAt)}</span>
                        </div>
                        <p className="text-slate-800 whitespace-pre-wrap">{c.text}</p>
                        {c.replies.map((rep) => (
                          <div key={rep.id} className="ml-4 pl-3 border-l border-slate-300 text-slate-700">
                            <strong>{rep.authorName}</strong> ({formatGeorgianDateTime(rep.createdAt)}): {rep.text}
                          </div>
                        ))}
                        {editable && (
                          <div className="flex gap-2 pt-1">
                            <input
                              type="text"
                              placeholder="პასუხის დამატება..."
                              value={replyTexts[c.id] || ''}
                              onChange={(e) => setReplyTexts((p) => ({ ...p, [c.id]: e.target.value }))}
                              className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => void handleReplyComment(c.id)}
                              className="px-2.5 py-1 rounded bg-slate-800 text-white text-[11px]"
                            >
                              პასუხი
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Audit/Change History */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  ცვლილებების ისტორია (ლოკალური ინფორმაციული ჟურნალი)
                </h3>
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {caseLogs.map((log) => (
                    <div key={log.id} className="text-xs border-b border-slate-100 pb-2">
                      <div className="flex items-center justify-between text-slate-500">
                        <strong className="text-slate-800">{log.performedByName}</strong>
                        <span className="tabular-nums">{formatGeorgianDateTime(log.performedAt)}</span>
                      </div>
                      <p className="text-slate-700 mt-0.5">{log.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Interactive Case Timeline */}
        <aside className="rounded-xl border border-slate-200 bg-white p-4 h-fit space-y-3 no-print">
          <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
            ქეისის ქრონოლოგია (Timeline)
          </h3>
          <div className="space-y-2.5">
            {timelineEvents.map((ev, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setTab(ev.targetTab)}
                className="w-full text-left rounded-lg border border-slate-100 hover:border-sky-200 hover:bg-sky-50/40 p-2 text-xs transition-colors"
              >
                <span className="block text-[11px] text-slate-500 tabular-nums">
                  {formatGeorgianDate(ev.date, settings.dateFormat)}
                </span>
                <span className="block font-medium text-slate-800 mt-0.5">{ev.title}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* Close Case Modal with Readiness Checks & Admin Override */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-base font-semibold text-slate-900">ქეისის დასრულება / დახურვა</h3>
              <button type="button" onClick={() => setShowCloseModal(false)} className="p-1 rounded hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {readiness.requiresAdminOverride && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-rose-700" />
                  <span>აღმოჩენილია დაუსრულებელი პუნქტები:</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {readiness.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
                {currentUser.role !== 'admin' && (
                  <p className="font-semibold pt-1 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" />
                    ჩვეულებრივ მომხმარებელს არ შეუძლია ღია პუნქტების იგნორირება. დაასრულეთ ისინი ან მიმართეთ Admin-ს.
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleConfirmClose} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">საბოლოო შედეგი</label>
                <input
                  type="text"
                  required
                  value={closeOutcome}
                  onChange={(e) => setCloseOutcome(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">გადაწყვეტილების / პასუხის ნომერი</label>
                <input
                  type="text"
                  value={closeDecisionNum}
                  onChange={(e) => setCloseDecisionNum(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">მოკლე შეჯამება</label>
                <textarea
                  rows={2}
                  value={closeSummary}
                  onChange={(e) => setCloseSummary(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" checked={closeFollowUp} onChange={(e) => setCloseFollowUp(e.target.checked)} />
                <span>საჭიროა შემდგომი კონტროლი</span>
              </label>
              {closeFollowUp && (
                <input
                  type="date"
                  value={closeFollowUpDate}
                  onChange={(e) => setCloseFollowUpDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              )}

              {readiness.requiresAdminOverride && currentUser.role === 'admin' && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-amber-950">
                    <ShieldAlert className="w-4 h-4" />
                    Admin დასაბუთებული გამონაკლისი (სავალდებულოა)
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="მიუთითეთ რატომ იხურება ქეისი ღია მოთხოვნების/ჩეკლისტის მიუხედავად..."
                    className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg"
                >
                  გაუქმება
                </button>
                <button
                  type="submit"
                  disabled={readiness.requiresAdminOverride && currentUser.role !== 'admin'}
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg disabled:opacity-40"
                >
                  დახურვის დადასტურება
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reopen Modal */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">დასრულებული ქეისის ხელახლა გახსნა</h3>
            <form onSubmit={handleConfirmReopen} className="space-y-3">
              <textarea
                rows={3}
                required
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="მიუთითეთ ხელახლა გახსნის მიზეზი..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg"
                >
                  გაუქმება
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-amber-700 rounded-lg">
                  გახსნის დადასტურება
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
