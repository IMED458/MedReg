import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDashboardStats,
  evaluateClosureReadiness,
  filterAndSortCases,
  findMatchingDoctor,
  findMatchingOrganization,
  formatCaseNumber,
  formatGeorgianDate,
  generateCasesCsv,
  getDeadlineUrgency,
  getNextSequenceForYear,
  hasPermission,
  maskPersonalId,
  validateUploadFile,
} from './caseLogic';
import { DEFAULT_SYSTEM_SETTINGS } from '../settings/defaultSettings';
import { DocumentRequest, MedicalCase, ReviewAssignment, Task } from '../models/types';

function makeCase(overrides: Partial<MedicalCase> = {}): MedicalCase {
  return {
    id: 'case-1',
    caseNumber: 'CASE-2026-000001',
    sequenceYear: 2026,
    sequenceNumber: 1,
    title: 'ტესტ ქეისი',
    shortSummary: 'მოკლე აღწერა',
    detailedDescription: 'დეტალური აღწერა',
    categoryId: 'cat_quality',
    priority: 'normal',
    confidentiality: 'standard',
    statusId: 'st_new',
    assignedTo: 'user-1',
    collaboratorIds: [],
    tags: [],
    linkedCaseIds: [],
    sourceId: 'src_complaint',
    startedAt: '2026-11-20',
    needsReview: 'undecided',
    checklistAnswers: [],
    lastActivityAt: '2026-11-25T10:00:00Z',
    createdAt: '2026-11-20T10:00:00Z',
    updatedAt: '2026-11-25T10:00:00Z',
    createdBy: 'user-1',
    updatedBy: 'user-1',
    ...overrides,
  };
}

test('case number formatting and sequential non-reusable sequence generation', () => {
  assert.equal(formatCaseNumber('CASE', 'YYYY', 2026, 1), 'CASE-2026-000001');
  assert.equal(formatCaseNumber('MR', 'YY', 2026, 42), 'MR-26-000042');
  const nextSeq = getNextSequenceForYear(5, [{ sequenceNumber: 2 }, { sequenceNumber: 3 }]);
  assert.equal(nextSeq, 6);
});

test('Georgian date formatting and deadline urgency classification', () => {
  assert.equal(formatGeorgianDate('2026-11-27', 'DD.MM.YYYY'), '27.11.2026');
  assert.equal(formatGeorgianDate('2026-11-27', 'YYYY-MM-DD'), '2026-11-27');
  assert.equal(getDeadlineUrgency('2026-11-25', false, '2026-11-27'), 'overdue');
  assert.equal(getDeadlineUrgency('2026-11-27', false, '2026-11-27'), 'today');
  assert.equal(getDeadlineUrgency('2026-11-29', false, '2026-11-27'), 'soon_1_3');
  assert.equal(getDeadlineUrgency('2026-12-10', false, '2026-11-27'), 'later');
  assert.equal(getDeadlineUrgency('2026-11-25', true, '2026-11-27'), 'none');
});

test('dashboard KPIs count overdue, waiting docs, waiting reviews, and completed accurately', () => {
  const c1 = makeCase({ id: 'c1', statusId: 'st_new', deadlineDate: '2026-11-29' });
  const c2 = makeCase({ id: 'c2', statusId: 'st_docs_collecting', assignedTo: 'user-2' });
  const c3 = makeCase({
    id: 'c3',
    statusId: 'st_completed',
    closureInfo: {
      outcome: 'დასრულებული',
      summary: 'შეჯამება',
      closedAt: '2026-11-26T12:00:00Z',
      closedBy: 'user-1',
      followUpControlNeeded: false,
      adminOverrideUsed: false,
    },
  });

  const docRequests: DocumentRequest[] = [
    {
      id: 'dr-1',
      caseId: 'c2',
      documentTypeId: 'doc_history',
      documentTitle: 'ისტორია',
      requestedFromType: 'clinic',
      requestedFromName: 'კლინიკა 1',
      basis: 'საფუძველი',
      dueDate: '2026-11-20',
      status: 'overdue',
      responsibleUserId: 'user-1',
      deliveries: [],
      createdAt: '2026-11-15T00:00:00Z',
      updatedAt: '2026-11-15T00:00:00Z',
      createdBy: 'user-1',
      updatedBy: 'user-1',
    },
  ];

  const reviews: ReviewAssignment[] = [
    {
      id: 'rev-1',
      caseId: 'c1',
      reviewerId: 'r-1',
      reviewerNameSnapshot: 'ექსპერტი',
      basis: 'ბრძანება',
      questionsToAnswer: 'კითხვა',
      materialsList: 'მასალა',
      attachedDocumentIds: [],
      status: 'awaiting_response',
      responses: [],
      createdAt: '2026-11-21T00:00:00Z',
      updatedAt: '2026-11-21T00:00:00Z',
      createdBy: 'user-1',
      updatedBy: 'user-1',
    },
  ];

  const kpis = computeDashboardStats({
    cases: [c1, c2, c3],
    currentUserId: 'user-1',
    settings: DEFAULT_SYSTEM_SETTINGS,
    tasks: [],
    docRequests,
    reviews,
    todayISO: '2026-11-27',
  });

  assert.equal(kpis.total, 3);
  assert.equal(kpis.myActive, 1);
  assert.equal(kpis.newCount, 1);
  assert.equal(kpis.overdue, 1);
  assert.equal(kpis.dueNext7Days, 1);
  assert.equal(kpis.waitingDocs, 1);
  assert.equal(kpis.waitingReviews, 1);
  assert.equal(kpis.completedThisMonth, 1);
});

test('closure readiness warns on open documents, pending reviews, and unchecked checklist', () => {
  const c1 = makeCase({ id: 'c1', checklistAnswers: [] });
  const docs: DocumentRequest[] = [
    {
      id: 'dr-1',
      caseId: 'c1',
      documentTypeId: 'doc_history',
      documentTitle: 'ისტორია',
      requestedFromType: 'clinic',
      requestedFromName: 'კლინიკა',
      basis: 'ბრძანება',
      status: 'partially_received',
      responsibleUserId: 'user-1',
      deliveries: [],
      createdAt: '2026-11-20T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
      createdBy: 'user-1',
      updatedBy: 'user-1',
    },
  ];
  const tasks: Task[] = [
    {
      id: 't-1',
      caseId: 'c1',
      title: 'დავალება',
      assignedTo: 'user-1',
      observerIds: [],
      priority: 'normal',
      status: 'open',
      createdAt: '2026-11-20T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
      createdBy: 'user-1',
      updatedBy: 'user-1',
    },
  ];

  const readiness = evaluateClosureReadiness({
    medicalCase: c1,
    settings: DEFAULT_SYSTEM_SETTINGS,
    docRequests: docs,
    reviews: [],
    tasks,
    correspondence: [],
  });

  assert.equal(readiness.canCloseDirectly, false);
  assert.equal(readiness.requiresAdminOverride, true);
  assert.equal(readiness.openDocumentRequests.length, 1);
  assert.equal(readiness.openOrOverdueTasks.length, 1);
  assert.ok(readiness.uncheckedChecklistLabels.length > 0);
});

test('file upload validation blocks dangerous html/svg/exe and oversized files', () => {
  assert.equal(validateUploadFile({ name: 'act.pdf', size: 1024, type: 'application/pdf' }).valid, true);
  assert.equal(validateUploadFile({ name: 'evil.html', size: 512, type: 'text/html' }).valid, false);
  assert.equal(validateUploadFile({ name: 'vector.svg', size: 512, type: 'image/svg+xml' }).valid, false);
  assert.equal(validateUploadFile({ name: 'huge.pdf', size: 20 * 1024 * 1024 }).valid, false);
});

test('CSV export includes UTF-8 BOM and protects against formula injection', () => {
  const csv = generateCasesCsv({
    cases: [makeCase({ title: '=SUM(A1:A2)', emohRegNumber: 'EMOH-99' })],
    settings: DEFAULT_SYSTEM_SETTINGS,
    users: [],
    applicants: [],
    patients: [],
    organizations: [],
  });
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes(`"'=SUM(A1:A2)"`));
  assert.ok(csv.includes('EMOH-99'));
});

test('permissions and PII masking enforce role boundaries', () => {
  assert.equal(hasPermission('admin', 'manage_users', DEFAULT_SYSTEM_SETTINGS), true);
  assert.equal(hasPermission('viewer', 'edit', DEFAULT_SYSTEM_SETTINGS), false);
  assert.equal(maskPersonalId('01001012345', false, true), '***********');
  assert.equal(maskPersonalId('01001012345', true, true), '01*******45');
  assert.equal(maskPersonalId('01001012345', true, false), '01001012345');
});

test('admin remains an unconditional superuser even if the editable permission matrix is corrupted', () => {
  const settings = structuredClone(DEFAULT_SYSTEM_SETTINGS);
  settings.rolePermissions.admin.delete = false;
  settings.rolePermissions.admin.manage_settings = false;
  assert.equal(hasPermission('admin', 'delete', settings), true);
  assert.equal(hasPermission('admin', 'manage_settings', settings), true);
});

test('case filtering matches applicant, patient, clinic, and case number', () => {
  const c1 = makeCase({ id: 'c1', caseNumber: 'CASE-2026-000010', primaryOrganizationId: 'org-1' });
  const c2 = makeCase({ id: 'c2', caseNumber: 'CASE-2026-000011', primaryOrganizationId: 'org-2' });
  const res = filterAndSortCases(
    [c1, c2],
    { search: 'თბილისის კლინიკა' },
    {
      currentUserId: 'user-1',
      settings: DEFAULT_SYSTEM_SETTINGS,
      applicants: [],
      patients: [],
      organizations: [
        {
          id: 'org-1',
          legalName: 'თბილისის კლინიკა №1',
          taxId: '123456789',
          address: 'თბილისი',
          municipality: 'თბილისი',
          branches: [],
          contacts: [],
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
          createdBy: 'u',
          updatedBy: 'u',
        },
      ],
      caseOrgLinks: [],
      doctors: [],
      caseDoctors: [],
      caseCommissions: [],
      tasks: [],
      docRequests: [],
      reviews: [],
    }
  );
  assert.equal(res.length, 1);
  assert.equal(res[0].id, 'c1');
});

test('inline directory matching reuses existing clinic by taxId or name and doctor by name', () => {
  const orgs = [
    {
      id: 'org-1',
      legalName: 'შპს ევრომედ კლინიკა',
      taxId: '405123456',
      address: 'თბილისი',
      municipality: 'თბილისი',
      branches: [],
      contacts: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      createdBy: 'u',
      updatedBy: 'u',
    },
  ];
  assert.equal(findMatchingOrganization(orgs, { legalName: '  შპს   ევრომედ კლინიკა ' })?.id, 'org-1');
  assert.equal(findMatchingOrganization(orgs, { legalName: 'სხვა სახელი', taxId: '405123456' })?.id, 'org-1');
  assert.equal(findMatchingOrganization(orgs, { legalName: 'ახალი კლინიკა', taxId: '999888777' }), undefined);

  const docs = [
    {
      id: 'doc-1',
      fullName: 'გიორგი ვაშაძე',
      specialty: 'ქირურგი',
      position: 'ქირურგი',
      organizationIds: ['org-1'],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      createdBy: 'u',
      updatedBy: 'u',
    },
  ];
  assert.equal(findMatchingDoctor(docs, ' გიორგი  ვაშაძე ')?.id, 'doc-1');
  assert.equal(findMatchingDoctor(docs, 'ნინო ბერიძე'), undefined);
});
