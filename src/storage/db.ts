import Dexie, { Table } from 'dexie';
import {
  ActivityLogEntry,
  Applicant,
  Attachment,
  CaseComment,
  CaseCommission,
  CaseDoctor,
  CaseLink,
  CaseOrganizationLink,
  CaseParticipant,
  Commission,
  Correspondence,
  CustomFieldValue,
  Doctor,
  DocumentRequest,
  EvidenceTransfer,
  InspectionAct,
  MedicalCase,
  Order,
  Organization,
  Patient,
  Person,
  Reminder,
  ReviewAssignment,
  Reviewer,
  SystemSettings,
  Task,
  User,
  Visit,
} from '../models/types';

export interface SequenceCounter {
  year: number;
  lastSequence: number;
}

export interface FileBlobRecord {
  blobKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  data: Blob;
  createdAt: string;
}

export class MedRegDatabase extends Dexie {
  users!: Table<User, string>;
  settings!: Table<SystemSettings, string>;
  counters!: Table<SequenceCounter, number>;
  cases!: Table<MedicalCase, string>;
  case_participants!: Table<CaseParticipant, string>;
  persons!: Table<Person, string>;
  applicants!: Table<Applicant, string>;
  patients!: Table<Patient, string>;
  organizations!: Table<Organization, string>;
  case_organizations!: Table<CaseOrganizationLink, string>;
  doctors!: Table<Doctor, string>;
  case_doctors!: Table<CaseDoctor, string>;
  visits!: Table<Visit, string>;
  inspection_acts!: Table<InspectionAct, string>;
  orders!: Table<Order, string>;
  commissions!: Table<Commission, string>;
  case_commissions!: Table<CaseCommission, string>;
  document_requests!: Table<DocumentRequest, string>;
  evidence_transfers!: Table<EvidenceTransfer, string>;
  correspondence!: Table<Correspondence, string>;
  reviewers!: Table<Reviewer, string>;
  review_assignments!: Table<ReviewAssignment, string>;
  tasks!: Table<Task, string>;
  reminders!: Table<Reminder, string>;
  attachments!: Table<Attachment, string>;
  file_blobs!: Table<FileBlobRecord, string>;
  comments!: Table<CaseComment, string>;
  activity_logs!: Table<ActivityLogEntry, string>;
  custom_field_values!: Table<CustomFieldValue, string>;
  case_links!: Table<CaseLink, string>;

  constructor() {
    super('medreg_workspace_db');

    this.version(1).stores({
      users: 'id, username, role, isActive',
      settings: 'id',
      counters: 'year',
      cases: 'id, &caseNumber, sequenceYear, statusId, assignedTo, sourceId, priority, startedAt, deadlineDate, lastActivityAt, isDraft, isArchived, deletedAt',
      case_participants: 'id, caseId, role, deletedAt',
      persons: 'id, fullName, deletedAt',
      applicants: 'id, caseId, name, deletedAt',
      patients: 'id, caseId, applicantId, fullName, deletedAt',
      organizations: 'id, legalName, taxId, municipality, deletedAt',
      case_organizations: 'id, caseId, organizationId, deletedAt',
      doctors: 'id, fullName, specialty, deletedAt',
      case_doctors: 'id, caseId, doctorId, organizationId, deletedAt',
      visits: 'id, caseId, organizationId, plannedDateTime, status, actPrepStatus, deletedAt',
      inspection_acts: 'id, caseId, visitId, actNumber, prepStatus, deletedAt',
      orders: 'id, caseId, orderNumber, issuedDate, status, deletedAt',
      commissions: 'id, name, type, deletedAt',
      case_commissions: 'id, caseId, commissionId, deletedAt',
      document_requests: 'id, caseId, status, dueDate, responsibleUserId, deletedAt',
      evidence_transfers: 'id, caseId, visitId, documentRequestId, deletedAt',
      correspondence: 'id, *caseIds, direction, categoryId, officialNumber, status, isInterimLetter, deletedAt',
      reviewers: 'id, fullName, specialty, organization, deletedAt',
      review_assignments: 'id, caseId, reviewerId, status, dueDate, deletedAt',
      tasks: 'id, caseId, assignedTo, status, dueDate, priority, deletedAt',
      reminders: 'id, userId, caseId, remindAt, isDismissed, deletedAt',
      attachments: 'id, caseId, linkedEntityType, linkedEntityId, category, deletedAt',
      file_blobs: 'blobKey',
      comments: 'id, caseId, targetType, targetId, fieldKey, createdAt, deletedAt',
      activity_logs: 'id, caseId, entityType, entityId, performedBy, performedAt',
      custom_field_values: 'id, entityType, entityId, fieldId, [entityType+entityId]',
      case_links: 'id, sourceCaseId, targetCaseId, deletedAt',
    });
  }
}

export const db = new MedRegDatabase();
