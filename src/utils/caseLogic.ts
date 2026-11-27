import {
  Applicant,
  CaseOrganizationLink,
  Correspondence,
  Doctor,
  DocumentRequest,
  MedicalCase,
  Organization,
  Patient,
  PermissionAction,
  ReviewAssignment,
  RoleId,
  SystemSettings,
  Task,
  User,
} from '../models/types';

export type DeadlineUrgency = 'overdue' | 'today' | 'soon_1_3' | 'later' | 'none';

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatCaseNumber(
  prefix: string,
  yearFormat: 'YYYY' | 'YY',
  year: number,
  sequenceNumber: number
): string {
  const cleanPrefix = (prefix || 'CASE').trim().toUpperCase();
  const yearPart = yearFormat === 'YY' ? String(year).slice(-2) : String(year);
  const seqPart = String(sequenceNumber).padStart(6, '0');
  return `${cleanPrefix}-${yearPart}-${seqPart}`;
}

export function getNextSequenceForYear(
  existingMaxForYear: number,
  casesInYear: Array<{ sequenceNumber: number }>
): number {
  const maxInCases = casesInYear.reduce(
    (max, item) => (item.sequenceNumber > max ? item.sequenceNumber : max),
    0
  );
  return Math.max(existingMaxForYear, maxInCases) + 1;
}

export function getTbilisiDateISO(date: Date = new Date()): string {
  // Format YYYY-MM-DD in Asia/Tbilisi timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tbilisi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function formatGeorgianDate(
  dateStr?: string | null,
  format: 'DD.MM.YYYY' | 'YYYY-MM-DD' = 'DD.MM.YYYY'
): string {
  if (!dateStr) return '—';
  const datePart = dateStr.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    const iso = getTbilisiDateISO(parsed);
    if (format === 'YYYY-MM-DD') return iso;
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }
  if (format === 'YYYY-MM-DD') return datePart;
  const [y, m, d] = datePart.split('-');
  return `${d}.${m}.${y}`;
}

export function formatGeorgianDateTime(isoStr?: string | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  const datePart = getTbilisiDateISO(d).split('-').reverse().join('.');
  const timePart = new Intl.DateTimeFormat('ka-GE', {
    timeZone: 'Asia/Tbilisi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${datePart} ${timePart}`;
}

export function diffDaysFromToday(dateStr?: string | null, todayISO?: string): number | null {
  if (!dateStr) return null;
  const target = dateStr.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
  const ref = todayISO || getTbilisiDateISO();
  const t1 = Date.parse(`${ref}T00:00:00Z`);
  const t2 = Date.parse(`${target}T00:00:00Z`);
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

export function getDeadlineUrgency(
  dateStr?: string | null,
  isCompleted = false,
  todayISO?: string
): DeadlineUrgency {
  if (isCompleted || !dateStr) return 'none';
  const diff = diffDaysFromToday(dateStr, todayISO);
  if (diff === null) return 'none';
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 3) return 'soon_1_3';
  return 'later';
}

export function isClosedStatus(statusId: string, settings: SystemSettings): boolean {
  const found = settings.caseStatuses.find((s) => s.id === statusId);
  return Boolean(found?.isClosedState);
}

export function isCaseOverdue(
  c: MedicalCase,
  settings: SystemSettings,
  tasks: Task[],
  docRequests: DocumentRequest[],
  reviews: ReviewAssignment[],
  todayISO?: string
): boolean {
  if (isClosedStatus(c.statusId, settings) || c.isDraft) return false;
  const ref = todayISO || getTbilisiDateISO();

  if (c.deadlineDate && c.deadlineDate.slice(0, 10) < ref) return true;
  if (
    tasks.some(
      (t) =>
        t.caseId === c.id &&
        !t.deletedAt &&
        (t.status === 'open' || t.status === 'in_progress') &&
        t.dueDate &&
        t.dueDate.slice(0, 10) < ref
    )
  ) {
    return true;
  }
  if (
    docRequests.some(
      (d) =>
        d.caseId === c.id &&
        !d.deletedAt &&
        (d.status === 'overdue' ||
          (['planned', 'requested', 'partially_received', 'defective'].includes(d.status) &&
            d.dueDate &&
            d.dueDate.slice(0, 10) < ref))
    )
  ) {
    return true;
  }
  if (
    reviews.some(
      (r) =>
        r.caseId === c.id &&
        !r.deletedAt &&
        ['sent', 'receipt_confirmed', 'awaiting_response', 'additional_materials_requested'].includes(
          r.status
        ) &&
        r.dueDate &&
        r.dueDate.slice(0, 10) < ref
    )
  ) {
    return true;
  }
  return false;
}

export interface DashboardKPIs {
  total: number;
  myActive: number;
  newCount: number;
  inProgress: number;
  overdue: number;
  dueNext7Days: number;
  waitingDocs: number;
  waitingReviews: number;
  completedThisMonth: number;
}

export function computeDashboardStats(params: {
  cases: MedicalCase[];
  currentUserId: string;
  settings: SystemSettings;
  tasks: Task[];
  docRequests: DocumentRequest[];
  reviews: ReviewAssignment[];
  todayISO?: string;
}): DashboardKPIs {
  const { cases, currentUserId, settings, tasks, docRequests, reviews } = params;
  const todayISO = params.todayISO || getTbilisiDateISO();
  const currentMonthPrefix = todayISO.slice(0, 7); // YYYY-MM

  const activeCases = cases.filter((c) => !c.deletedAt && !c.isArchived && !c.isDraft);

  let myActive = 0;
  let newCount = 0;
  let inProgress = 0;
  let overdue = 0;
  let dueNext7Days = 0;
  let waitingDocs = 0;
  let waitingReviews = 0;
  let completedThisMonth = 0;

  for (const c of activeCases) {
    const closed = isClosedStatus(c.statusId, settings);
    if (!closed && (c.assignedTo === currentUserId || c.collaboratorIds.includes(currentUserId))) {
      myActive += 1;
    }
    if (c.statusId === 'st_new') {
      newCount += 1;
    }
    if (!closed && c.statusId !== 'st_new') {
      inProgress += 1;
    }
    if (isCaseOverdue(c, settings, tasks, docRequests, reviews, todayISO)) {
      overdue += 1;
    }

    // Due in next 7 days (case deadline or open task/doc/review due in 0..7 days)
    const caseDiff = diffDaysFromToday(c.deadlineDate, todayISO);
    const hasUpcomingTask = tasks.some(
      (t) =>
        t.caseId === c.id &&
        !t.deletedAt &&
        (t.status === 'open' || t.status === 'in_progress') &&
        (() => {
          const d = diffDaysFromToday(t.dueDate, todayISO);
          return d !== null && d >= 0 && d <= 7;
        })()
    );
    if (!closed && ((caseDiff !== null && caseDiff >= 0 && caseDiff <= 7) || hasUpcomingTask)) {
      dueNext7Days += 1;
    }

    const hasPendingDocs = docRequests.some(
      (d) =>
        d.caseId === c.id &&
        !d.deletedAt &&
        ['planned', 'requested', 'partially_received', 'defective', 'overdue'].includes(d.status)
    );
    if (!closed && (hasPendingDocs || c.statusId === 'st_docs_collecting')) {
      waitingDocs += 1;
    }

    const hasPendingReviews = reviews.some(
      (r) =>
        r.caseId === c.id &&
        !r.deletedAt &&
        [
          'to_prepare',
          'sent',
          'receipt_confirmed',
          'awaiting_response',
          'additional_materials_requested',
          'defective',
        ].includes(r.status)
    );
    if (!closed && (hasPendingReviews || c.statusId === 'st_review_stage')) {
      waitingReviews += 1;
    }

    if (closed && c.closureInfo?.closedAt && c.closureInfo.closedAt.slice(0, 7) === currentMonthPrefix) {
      completedThisMonth += 1;
    } else if (closed && !c.closureInfo?.closedAt && c.updatedAt.slice(0, 7) === currentMonthPrefix) {
      completedThisMonth += 1;
    }
  }

  return {
    total: activeCases.length,
    myActive,
    newCount,
    inProgress,
    overdue,
    dueNext7Days,
    waitingDocs,
    waitingReviews,
    completedThisMonth,
  };
}

export interface CaseFilterCriteria {
  search?: string;
  caseNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  organizationId?: string;
  doctorId?: string;
  patientQuery?: string;
  applicantQuery?: string;
  assignedTo?: string;
  statusId?: string;
  sourceId?: string;
  priority?: string;
  commissionId?: string;
  kpiPreset?:
    | 'all'
    | 'my_active'
    | 'new'
    | 'in_progress'
    | 'overdue'
    | 'next_7_days'
    | 'waiting_docs'
    | 'waiting_reviews'
    | 'completed_month';
  onlyOverdue?: boolean;
  onlyWaitingDocs?: boolean;
  onlyWaitingReviews?: boolean;
  includeArchived?: boolean;
  sortBy?: 'caseNumber' | 'startedAt' | 'deadlineDate' | 'lastActivityAt' | 'priority' | 'title';
  sortDir?: 'asc' | 'desc';
}

export interface CaseFilterContext {
  currentUserId: string;
  settings: SystemSettings;
  applicants: Applicant[];
  patients: Patient[];
  organizations: Organization[];
  caseOrgLinks: CaseOrganizationLink[];
  doctors: Doctor[];
  caseDoctors: Array<{ caseId: string; doctorId: string }>;
  caseCommissions: Array<{ caseId: string; commissionId: string }>;
  tasks: Task[];
  docRequests: DocumentRequest[];
  reviews: ReviewAssignment[];
  todayISO?: string;
}

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export function filterAndSortCases(
  cases: MedicalCase[],
  criteria: CaseFilterCriteria,
  ctx: CaseFilterContext
): MedicalCase[] {
  const todayISO = ctx.todayISO || getTbilisiDateISO();
  const currentMonthPrefix = todayISO.slice(0, 7);

  const searchLower = (criteria.search || '').trim().toLowerCase();
  const numLower = (criteria.caseNumber || '').trim().toLowerCase();
  const patLower = (criteria.patientQuery || '').trim().toLowerCase();
  const appLower = (criteria.applicantQuery || '').trim().toLowerCase();

  const filtered = cases.filter((c) => {
    if (c.deletedAt || c.isDraft) return false;
    if (!criteria.includeArchived && c.isArchived) return false;

    const caseApps = ctx.applicants.filter((a) => a.caseId === c.id && !a.deletedAt);
    const casePats = ctx.patients.filter((p) => p.caseId === c.id && !p.deletedAt);
    const orgIds = new Set<string>();
    if (c.primaryOrganizationId) orgIds.add(c.primaryOrganizationId);
    ctx.caseOrgLinks
      .filter((l) => l.caseId === c.id && !l.deletedAt)
      .forEach((l) => orgIds.add(l.organizationId));
    const caseOrgs = ctx.organizations.filter((o) => orgIds.has(o.id));
    const caseDocIds = ctx.caseDoctors.filter((d) => d.caseId === c.id).map((d) => d.doctorId);
    const caseDocObjs = ctx.doctors.filter((d) => caseDocIds.includes(d.id));
    const caseCommIds = ctx.caseCommissions
      .filter((cm) => cm.caseId === c.id)
      .map((cm) => cm.commissionId);

    if (searchLower) {
      const haystack = [
        c.caseNumber,
        c.title,
        c.shortSummary,
        c.emohRegNumber || '',
        c.complaintNumber || '',
        ...caseApps.map((a) => a.name),
        ...casePats.map((p) => p.fullName),
        ...caseOrgs.map((o) => `${o.legalName} ${o.tradeName || ''}`),
        ...caseDocObjs.map((d) => d.fullName),
        ...c.tags,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(searchLower)) return false;
    }

    if (numLower) {
      const numHaystack = `${c.caseNumber} ${c.emohRegNumber || ''} ${c.complaintNumber || ''}`.toLowerCase();
      if (!numHaystack.includes(numLower)) return false;
    }

    if (criteria.dateFrom && c.startedAt.slice(0, 10) < criteria.dateFrom) return false;
    if (criteria.dateTo && c.startedAt.slice(0, 10) > criteria.dateTo) return false;
    if (criteria.organizationId && !orgIds.has(criteria.organizationId)) return false;
    if (criteria.doctorId && !caseDocIds.includes(criteria.doctorId)) return false;
    if (criteria.commissionId && !caseCommIds.includes(criteria.commissionId)) return false;
    if (
      patLower &&
      !casePats.some((p) => p.fullName.toLowerCase().includes(patLower))
    ) {
      return false;
    }
    if (
      appLower &&
      !caseApps.some((a) => a.name.toLowerCase().includes(appLower))
    ) {
      return false;
    }
    if (
      criteria.assignedTo &&
      c.assignedTo !== criteria.assignedTo &&
      !c.collaboratorIds.includes(criteria.assignedTo)
    ) {
      return false;
    }
    if (criteria.statusId && c.statusId !== criteria.statusId) return false;
    if (criteria.sourceId && c.sourceId !== criteria.sourceId) return false;
    if (criteria.priority && c.priority !== criteria.priority) return false;

    const overdue = isCaseOverdue(c, ctx.settings, ctx.tasks, ctx.docRequests, ctx.reviews, todayISO);
    const waitingDocs = ctx.docRequests.some(
      (d) =>
        d.caseId === c.id &&
        !d.deletedAt &&
        ['planned', 'requested', 'partially_received', 'defective', 'overdue'].includes(d.status)
    );
    const waitingReviews = ctx.reviews.some(
      (r) =>
        r.caseId === c.id &&
        !r.deletedAt &&
        [
          'to_prepare',
          'sent',
          'receipt_confirmed',
          'awaiting_response',
          'additional_materials_requested',
          'defective',
        ].includes(r.status)
    );

    if (criteria.onlyOverdue && !overdue) return false;
    if (criteria.onlyWaitingDocs && !waitingDocs) return false;
    if (criteria.onlyWaitingReviews && !waitingReviews) return false;

    const closed = isClosedStatus(c.statusId, ctx.settings);
    switch (criteria.kpiPreset) {
      case 'my_active':
        if (closed || (c.assignedTo !== ctx.currentUserId && !c.collaboratorIds.includes(ctx.currentUserId))) {
          return false;
        }
        break;
      case 'new':
        if (c.statusId !== 'st_new') return false;
        break;
      case 'in_progress':
        if (closed || c.statusId === 'st_new') return false;
        break;
      case 'overdue':
        if (!overdue) return false;
        break;
      case 'next_7_days': {
        const caseDiff = diffDaysFromToday(c.deadlineDate, todayISO);
        const hasUpcomingTask = ctx.tasks.some(
          (t) =>
            t.caseId === c.id &&
            !t.deletedAt &&
            (t.status === 'open' || t.status === 'in_progress') &&
            (() => {
              const d = diffDaysFromToday(t.dueDate, todayISO);
              return d !== null && d >= 0 && d <= 7;
            })()
        );
        if (closed || !((caseDiff !== null && caseDiff >= 0 && caseDiff <= 7) || hasUpcomingTask)) {
          return false;
        }
        break;
      }
      case 'waiting_docs':
        if (closed || (!waitingDocs && c.statusId !== 'st_docs_collecting')) return false;
        break;
      case 'waiting_reviews':
        if (closed || (!waitingReviews && c.statusId !== 'st_review_stage')) return false;
        break;
      case 'completed_month': {
        const closedMonth = (c.closureInfo?.closedAt || c.updatedAt).slice(0, 7);
        if (!closed || closedMonth !== currentMonthPrefix) return false;
        break;
      }
      default:
        break;
    }

    return true;
  });

  const sortBy = criteria.sortBy || 'lastActivityAt';
  const dir = criteria.sortDir === 'asc' ? 1 : -1;

  return filtered.sort((a, b) => {
    if (sortBy === 'priority') {
      return ((PRIORITY_WEIGHT[a.priority] || 0) - (PRIORITY_WEIGHT[b.priority] || 0)) * dir;
    }
    const va = String(a[sortBy] || '');
    const vb = String(b[sortBy] || '');
    return va.localeCompare(vb) * dir;
  });
}

export interface ClosureReadinessResult {
  canCloseDirectly: boolean;
  requiresAdminOverride: boolean;
  uncheckedChecklistLabels: string[];
  openDocumentRequests: DocumentRequest[];
  pendingReviews: ReviewAssignment[];
  openOrOverdueTasks: Task[];
  unsentInterimLetters: Correspondence[];
  warnings: string[];
}

export function evaluateClosureReadiness(params: {
  medicalCase: MedicalCase;
  settings: SystemSettings;
  docRequests: DocumentRequest[];
  reviews: ReviewAssignment[];
  tasks: Task[];
  correspondence: Correspondence[];
}): ClosureReadinessResult {
  const { medicalCase, settings, docRequests, reviews, tasks, correspondence } = params;

  const activeChecklist = settings.checklistItems.filter((item) => item.active && item.requiredForClose);
  const uncheckedChecklistLabels: string[] = [];
  for (const item of activeChecklist) {
    const answer = medicalCase.checklistAnswers.find((a) => a.itemId === item.id);
    if (!answer || !answer.checked) {
      uncheckedChecklistLabels.push(item.label);
    }
  }

  const openDocumentRequests = docRequests.filter(
    (d) =>
      d.caseId === medicalCase.id &&
      !d.deletedAt &&
      !['fully_received', 'no_longer_needed'].includes(d.status)
  );

  const pendingReviews = reviews.filter(
    (r) =>
      r.caseId === medicalCase.id &&
      !r.deletedAt &&
      !['response_received', 'completed'].includes(r.status)
  );

  const openOrOverdueTasks = tasks.filter(
    (t) =>
      t.caseId === medicalCase.id &&
      !t.deletedAt &&
      (t.status === 'open' || t.status === 'in_progress')
  );

  const unsentInterimLetters = correspondence.filter(
    (l) =>
      l.caseIds.includes(medicalCase.id) &&
      !l.deletedAt &&
      l.isInterimLetter &&
      !l.interimSent &&
      l.status !== 'sent' &&
      l.status !== 'completed'
  );

  const warnings: string[] = [];
  if (uncheckedChecklistLabels.length > 0) {
    warnings.push(`დასასრულის ჩეკლისტში მოუნიშნავია ${uncheckedChecklistLabels.length} სავალდებულო პუნქტი.`);
  }
  if (openDocumentRequests.length > 0) {
    warnings.push(`ღიაა ან სრულად არ არის მიღებული ${openDocumentRequests.length} დოკუმენტის მოთხოვნა.`);
  }
  if (pendingReviews.length > 0) {
    warnings.push(`დაუსრულებელია ${pendingReviews.length} რეცენზიის დავალება.`);
  }
  if (openOrOverdueTasks.length > 0) {
    warnings.push(`დარჩენილია ${openOrOverdueTasks.length} დაუსრულებელი დავალება.`);
  }
  if (unsentInterimLetters.length > 0) {
    warnings.push(`მონიშნულია ${unsentInterimLetters.length} გაუგზავნელი შუალედური წერილი.`);
  }

  const hasIssues = warnings.length > 0;
  return {
    canCloseDirectly: !hasIssues,
    requiresAdminOverride: hasIssues,
    uncheckedChecklistLabels,
    openDocumentRequests,
    pendingReviews,
    openOrOverdueTasks,
    unsentInterimLetters,
    warnings,
  };
}

export function hasPermission(
  role: RoleId | undefined,
  action: PermissionAction,
  settings: SystemSettings
): boolean {
  if (!role) return false;
  // The system owner must never lose access because of an accidentally edited
  // permission matrix. Admin is an unconditional superuser.
  if (role === 'admin') return true;
  const matrix = settings.rolePermissions[role];
  if (!matrix) return false;
  return Boolean(matrix[action]);
}

export function maskPersonalId(personalId: string | undefined, canViewSensitive: boolean, maskByDefault: boolean): string {
  if (!personalId) return '—';
  if (!canViewSensitive) return '***********';
  if (!maskByDefault) return personalId;
  if (personalId.length <= 4) return '****';
  return `${personalId.slice(0, 2)}*******${personalId.slice(-2)}`;
}

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'jpg',
  'jpeg',
  'png',
  'txt',
  'csv',
]);

const BLOCKED_EXTENSIONS = new Set([
  'html',
  'htm',
  'svg',
  'js',
  'mjs',
  'ts',
  'exe',
  'bat',
  'sh',
  'cmd',
  'php',
]);

export const MAX_LOCAL_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export function validateUploadFile(file: { name: string; size: number; type?: string }): {
  valid: boolean;
  error?: string;
} {
  const parts = file.name.toLowerCase().split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1] : '';

  if (!ext || BLOCKED_EXTENSIONS.has(ext) || !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `ფაილის ტიპი (.${ext || 'უცნობი'}) არ არის დაშვებული. დასაშვებია: PDF, DOCX, XLSX, JPG, PNG, TXT, CSV.`,
    };
  }
  if (file.type && (file.type.includes('html') || file.type.includes('javascript') || file.type.includes('svg'))) {
    return {
      valid: false,
      error: 'უსაფრთხოების მიზნით HTML, SVG და სკრიპტ ფაილების ატვირთვა დაბლოკილია.',
    };
  }
  if (file.size <= 0) {
    return { valid: false, error: 'ცარიელი ფაილის ატვირთვა დაუშვებელია.' };
  }
  if (file.size > MAX_LOCAL_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: 'ფაილის ზომა აღემატება ლოკალური საცავის 15 MB ლიმიტს.',
    };
  }
  return { valid: true };
}

export function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  const sanitized = /^[=+\-@]/.test(str) ? `'${str}` : str; // Formula injection protection
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export function generateCasesCsv(params: {
  cases: MedicalCase[];
  settings: SystemSettings;
  users: User[];
  applicants: Applicant[];
  patients: Patient[];
  organizations: Organization[];
}): string {
  const { cases, settings, users, applicants, patients, organizations } = params;
  const headers = [
    'შიდა ნომერი',
    'სათაური',
    'სტატუსი',
    'პრიორიტეტი',
    'საფუძველი',
    'eMOH ნომერი',
    'eMOH თარიღი',
    'განმცხადებელი',
    'პაციენტი',
    'კლინიკა',
    'პასუხისმგებელი თანამშრომელი',
    'დაწყების თარიღი',
    'ვადა',
    'ბოლო აქტივობა',
  ];

  const rows = cases.map((c) => {
    const statusLabel = settings.caseStatuses.find((s) => s.id === c.statusId)?.label || c.statusId;
    const priorityLabel = settings.priorities.find((p) => p.id === c.priority)?.label || c.priority;
    const sourceLabel = settings.sources.find((s) => s.id === c.sourceId)?.label || c.sourceId;
    const assignee = users.find((u) => u.id === c.assignedTo)?.fullName || '—';
    const appNames = applicants
      .filter((a) => a.caseId === c.id && !a.deletedAt)
      .map((a) => a.name)
      .join('; ');
    const patNames = patients
      .filter((p) => p.caseId === c.id && !p.deletedAt)
      .map((p) => (p.isSameAsApplicant ? `${p.fullName} (იგივე პირი)` : p.fullName))
      .join('; ');
    const orgName =
      organizations.find((o) => o.id === c.primaryOrganizationId)?.legalName || '—';

    return [
      c.caseNumber,
      c.title,
      statusLabel,
      priorityLabel,
      sourceLabel,
      c.emohRegNumber || '',
      formatGeorgianDate(c.emohRegDate, settings.dateFormat),
      appNames || '—',
      patNames || '—',
      orgName,
      assignee,
      formatGeorgianDate(c.startedAt, settings.dateFormat),
      formatGeorgianDate(c.deadlineDate, settings.dateFormat),
      formatGeorgianDateTime(c.lastActivityAt),
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  // UTF-8 BOM for clean Georgian rendering in Excel
  return `\uFEFF${headers.map(escapeCsvCell).join(',')}\r\n${rows.join('\r\n')}`;
}

export function normalizeEntityText(value?: string | null): string {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findMatchingOrganization(
  organizations: Organization[],
  query: { legalName?: string; taxId?: string }
): Organization | undefined {
  const normTax = normalizeEntityText(query.taxId);
  const normName = normalizeEntityText(query.legalName);
  const active = organizations.filter((o) => !o.deletedAt);

  if (normTax) {
    const byTax = active.find((o) => normalizeEntityText(o.taxId) === normTax);
    if (byTax) return byTax;
  }
  if (normName) {
    return active.find((o) => normalizeEntityText(o.legalName) === normName);
  }
  return undefined;
}

export function findMatchingDoctor(
  doctors: Doctor[],
  fullName?: string
): Doctor | undefined {
  const normName = normalizeEntityText(fullName);
  if (!normName) return undefined;
  return doctors.find((d) => !d.deletedAt && normalizeEntityText(d.fullName) === normName);
}
