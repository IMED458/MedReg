export type UUID = string;
export type ISODateString = string; // YYYY-MM-DD or full ISO timestamp

export type RoleId = 'admin' | 'inspector' | 'supervisor' | 'viewer';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'close'
  | 'reopen'
  | 'delete'
  | 'download_file'
  | 'export'
  | 'manage_users'
  | 'manage_settings'
  | 'view_sensitive';

export interface RolePermissionMatrix {
  admin: Record<PermissionAction, boolean>;
  inspector: Record<PermissionAction, boolean>;
  supervisor: Record<PermissionAction, boolean>;
  viewer: Record<PermissionAction, boolean>;
}

export interface AuditBase {
  id: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  createdBy: UUID;
  updatedBy: UUID;
  deletedAt?: ISODateString | null;
  isArchived?: boolean;
  isTestSample?: boolean;
}

export interface User extends AuditBase {
  username: string;
  passwordHash: string; // Local profile-management compatibility; there is no login gate.
  passwordSalt: string;
  fullName: string;
  position: string;
  department: string;
  phone: string;
  email?: string;
  role: RoleId;
  isActive: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: ISODateString;
}

export interface SafeUser {
  id: UUID;
  username: string;
  fullName: string;
  position: string;
  department: string;
  phone: string;
  email?: string;
  role: RoleId;
  isActive: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: ISODateString;
  createdAt: ISODateString;
}

export interface OptionItem {
  id: string;
  label: string;
  color?: 'slate' | 'sky' | 'teal' | 'amber' | 'rose' | 'emerald' | 'indigo';
  order?: number;
  isDefault?: boolean;
  isClosedState?: boolean;
  active?: boolean;
}

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'multiselect'
  | 'file';

export type CustomFieldTargetPage =
  | 'case_basic'
  | 'case_emoh'
  | 'case_participants'
  | 'visit'
  | 'document_request'
  | 'correspondence'
  | 'review';

export interface CustomFieldDefinition {
  id: UUID;
  key: string;
  label: string;
  type: CustomFieldType;
  targetPage: CustomFieldTargetPage;
  required: boolean;
  defaultValue?: string | boolean | string[];
  options?: string[];
  active: boolean;
  createdAt: ISODateString;
}

export interface CustomFieldValue {
  id: UUID;
  entityType: CustomFieldTargetPage;
  entityId: UUID;
  fieldId: UUID;
  value: string | number | boolean | string[] | null;
  updatedAt: ISODateString;
  updatedBy: UUID;
}

export interface ChecklistItemConfig {
  id: string;
  label: string;
  requiredForClose: boolean;
  order: number;
  active: boolean;
}

export interface TaskTemplate {
  id: string;
  title: string;
  defaultDescription: string;
  defaultPriority: PriorityLevel;
}

export type PriorityLevel = 'low' | 'normal' | 'high' | 'critical';
export type ConfidentialityLevel = 'standard' | 'restricted' | 'strict_medical';

export interface SystemSettings {
  id: 'singleton';
  caseNumberPrefix: string;
  caseNumberYearFormat: 'YYYY' | 'YY';
  language: 'ka';
  dateFormat: 'DD.MM.YYYY' | 'YYYY-MM-DD';
  retentionPolicyDays: number;
  maskPersonalIdsByDefault: boolean;
  categories: OptionItem[];
  sources: OptionItem[];
  priorities: OptionItem[];
  caseStatuses: OptionItem[];
  documentTypes: OptionItem[];
  correspondenceCategories: OptionItem[];
  orderTypes: OptionItem[];
  visitTypes: OptionItem[];
  actStatuses: OptionItem[];
  reviewStatuses: OptionItem[];
  checklistItems: ChecklistItemConfig[];
  taskTemplates: TaskTemplate[];
  customFields: CustomFieldDefinition[];
  rolePermissions: RolePermissionMatrix;
  updatedAt: ISODateString;
  updatedBy: UUID;
}

export interface Person extends AuditBase {
  fullName: string;
  personalId?: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface Applicant extends AuditBase {
  caseId: UUID;
  personId?: UUID;
  type: 'individual' | 'organization';
  name: string; // სახელი და გვარი ან ორგანიზაცია
  representativeName?: string;
  phone?: string;
  email?: string;
  address?: string;
  personalId?: string;
  preferredChannel?: 'phone' | 'email' | 'post' | 'emoh' | 'in_person';
  comment?: string;
}

export interface Patient extends AuditBase {
  caseId: UUID;
  personId?: UUID;
  fullName: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  address?: string;
  personalId?: string;
  representative?: string;
  isSameAsApplicant: boolean;
  applicantId?: UUID;
  notes?: string;
}

export interface CaseParticipant extends AuditBase {
  caseId: UUID;
  personId?: UUID;
  role: 'complainant_rep' | 'witness' | 'victim' | 'interested_party' | 'other';
  roleLabel?: string;
  fullName: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface Branch {
  id: UUID;
  name: string;
  address: string;
  municipality: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
}

export interface ClinicContact {
  id: UUID;
  fullName: string;
  position: string;
  roleType: 'director' | 'admin' | 'legal' | 'quality' | 'case_contact' | 'other';
  phone?: string;
  email?: string;
  notes?: string;
}

export interface Organization extends AuditBase {
  legalName: string;
  tradeName?: string;
  taxId: string; // საიდენტიფიკაციო კოდი
  address: string;
  municipality: string;
  phone?: string;
  email?: string;
  website?: string;
  directorName?: string;
  adminResponsible?: string;
  legalRepresentative?: string;
  qualityRepresentative?: string;
  branches: Branch[];
  contacts: ClinicContact[];
  notes?: string;
}

export interface Doctor extends AuditBase {
  fullName: string;
  specialty: string;
  position: string;
  organizationIds: UUID[];
  branchNames?: string;
  phone?: string;
  email?: string;
  professionalStatusNote?: string;
  notes?: string;
}

export type CaseDoctorRole =
  | 'attending_physician'
  | 'department_head'
  | 'explanation_author'
  | 'responsible_person'
  | 'other';

export interface CaseDoctor extends AuditBase {
  caseId: UUID;
  doctorId: UUID;
  organizationId?: UUID;
  roleInCase: CaseDoctorRole;
  roleNote?: string;
  snapshotPhone?: string;
  snapshotEmail?: string;
  lastCommunicationAt?: ISODateString;
  nextAction?: string;
  notes?: string;
}

export interface CaseOrganizationLink extends AuditBase {
  caseId: UUID;
  organizationId: UUID;
  branchId?: UUID;
  branchName?: string;
  snapshotAddress?: string;
  responsibleContactName?: string;
  responsibleContactPosition?: string;
  responsibleContactPhone?: string;
  responsibleContactEmail?: string;
  lastCommunicationAt?: ISODateString;
  nextAction?: string;
  notes?: string;
}

export interface CaseLink extends AuditBase {
  sourceCaseId: UUID;
  targetCaseId: UUID;
  relationNote?: string;
}

export interface ClosureChecklistAnswer {
  itemId: string;
  checked: boolean;
  note?: string;
  updatedAt?: ISODateString;
  updatedBy?: UUID;
}

export interface CaseClosureInfo {
  outcome: string;
  summary: string;
  closedAt: ISODateString;
  closedBy: UUID;
  decisionNumber?: string;
  followUpControlNeeded: boolean;
  followUpDate?: string;
  adminOverrideUsed: boolean;
  adminOverrideJustification?: string;
}

export interface MedicalCase extends AuditBase {
  caseNumber: string; // e.g. CASE-2026-000001
  sequenceYear: number;
  sequenceNumber: number;
  title: string;
  shortSummary: string;
  detailedDescription: string;
  categoryId: string;
  priority: PriorityLevel;
  confidentiality: ConfidentialityLevel;
  statusId: string;
  assignedTo: UUID; // პასუხისმგებელი თანამშრომელი
  collaboratorIds: UUID[];
  supervisorId?: UUID;
  tags: string[];
  linkedCaseIds: UUID[];

  // Section B: Origin & eMOH
  sourceId: string;
  complaintNumber?: string;
  complaintDate?: string;
  receivedChannel?: string;
  receivingDepartment?: string;
  emohRegNumber?: string;
  emohRegDate?: string;
  emohReferenceLink?: string;
  specialTaskAuthor?: string;
  specialTaskBasis?: string;
  specialTaskNumber?: string;
  specialTaskDate?: string;
  specialTaskDescription?: string;
  startedAt: string;
  deadlineDate?: string;
  deadlineSourceNote?: string;

  // Quick denormalized display helpers (updated on save)
  primaryOrganizationId?: UUID;
  primaryBranchName?: string;

  // Flags & Checklist
  needsReview: 'yes' | 'no' | 'undecided';
  checklistAnswers: ClosureChecklistAnswer[];
  closureInfo?: CaseClosureInfo;
  reopenHistory?: Array<{
    reopenedAt: ISODateString;
    reopenedBy: UUID;
    reason: string;
  }>;
  lastActivityAt: ISODateString;
  isDraft?: boolean;
}

export interface Order extends AuditBase {
  caseId: UUID;
  orderTypeId: string;
  orderNumber: string;
  issuer: string;
  issuedDate: string;
  validFrom?: string;
  validTo?: string;
  basis: string;
  description?: string;
  status: 'active' | 'amended' | 'cancelled';
  cancellationOrChangeNote?: string;
  visitId?: UUID;
  attachmentIds: UUID[];
}

export interface CommissionMember {
  id: UUID;
  userId?: UUID;
  fullName: string;
  position: string;
  roleInGroup: 'chair' | 'member' | 'secretary' | 'expert';
  phone?: string;
  email?: string;
}

export interface Commission extends AuditBase {
  name: string;
  type: string;
  creationBasis: string;
  orderNumber?: string;
  orderDate?: string;
  chairName: string;
  chairUserId?: UUID;
  members: CommissionMember[];
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface CaseCommission extends AuditBase {
  caseId: UUID;
  commissionId: UUID;
  stageNote?: string;
  assignedDate: string;
  endDate?: string;
}

export type VisitStatus = 'planned' | 'postponed' | 'in_progress' | 'completed' | 'cancelled';
export type ActPrepStatus = 'not_started' | 'preparing' | 'drafted' | 'signed' | 'delivered';
export type SeizureStatus = 'yes' | 'no' | 'partial' | 'unknown';

export interface VisitChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface DoctorExplanationRecord {
  id: UUID;
  doctorId?: UUID;
  doctorName: string;
  requested: boolean;
  received: boolean;
  receivedDate?: string;
  signed: boolean;
  attachmentIds: UUID[];
  note?: string;
}

export interface Visit extends AuditBase {
  caseId: UUID;
  organizationId: UUID;
  branchName?: string;
  address: string;
  plannedDateTime: string;
  actualEntryDateTime?: string;
  actualExitDateTime?: string;
  purpose: string;
  visitTypeId: string;
  basis: string;
  orderId?: UUID;
  responsibleUserId: UUID;
  commissionId?: UUID;
  clinicRepresentatives: string;
  status: VisitStatus;
  checklist: VisitChecklistItem[];
  findings?: string;
  freeNotes?: string;
  nextVisitDate?: string;
  unfinishedActionsNote?: string;

  // Inspection Act fields (also mirrored/linked to InspectionAct)
  actPrepStatus: ActPrepStatus;
  actNumber?: string;
  actDate?: string;
  actSignatories?: string;
  actDeliveryStatus?: string;
  actNotes?: string;
  actAttachmentIds: UUID[];

  // Medical Documentation Seizure/Review
  docSeizureStatus: SeizureStatus;
  docSeizureDescription?: string;
  docSeizureQuantity?: string;
  docSeizureDate?: string;
  docSeizureForm?: 'copy' | 'original' | 'mixed';
  docSeizureConfirmed?: boolean;
  docSeizureResponsible?: string;
  docReturnNeeded?: boolean;
  docReturnDate?: string;

  // Doctor Explanations
  doctorExplanations: DoctorExplanationRecord[];

  // Photo/Video/Evidence
  evidenceNote?: string;
  evidenceAttachmentIds: UUID[];
}

export interface InspectionAct extends AuditBase {
  caseId: UUID;
  visitId?: UUID;
  commissionId?: UUID;
  actType: string;
  actNumber: string;
  actDate: string;
  prepStatus: ActPrepStatus;
  signatories: string;
  deliveryStatus: string;
  summary?: string;
  attachmentIds: UUID[];
}

export type DocumentRequestStatus =
  | 'planned'
  | 'requested'
  | 'partially_received'
  | 'fully_received'
  | 'defective'
  | 'overdue'
  | 'no_longer_needed';

export interface DocumentDelivery extends AuditBase {
  requestId: UUID;
  caseId: UUID;
  deliveryDate: string;
  incomingLetterNumber?: string;
  incomingLetterDate?: string;
  receivedByUserId: UUID;
  copyOrOriginal: 'copy' | 'original' | 'electronic';
  pageCount?: number;
  handedFrom?: string;
  handedTo?: string;
  storageLocation?: string;
  returnDueDate?: string;
  stillMissing?: string;
  defectDescription?: string;
  attachmentIds: UUID[];
  notes?: string;
}

export interface DocumentRequest extends AuditBase {
  caseId: UUID;
  documentTypeId: string;
  documentTitle: string;
  requestedFromType: 'clinic' | 'doctor' | 'other';
  requestedFromId?: UUID;
  requestedFromName: string;
  basis: string;
  outgoingLetterNumber?: string;
  outgoingLetterDate?: string;
  sentDate?: string;
  sentMethod?: string;
  addressee?: string;
  dueDate?: string; // User-defined deadline
  status: DocumentRequestStatus;
  missingItemsNote?: string;
  defectNote?: string;
  reRequestDate?: string;
  responsibleUserId: UUID;
  reminderDate?: string;
  deliveries: DocumentDelivery[];
  notes?: string;
}

export interface EvidenceTransfer extends AuditBase {
  caseId: UUID;
  visitId?: UUID;
  documentRequestId?: UUID;
  itemDescription: string;
  fromPerson: string;
  toPerson: string;
  transferDate: string;
  storageLocation: string;
  returnDate?: string;
  notes?: string;
}

export type CorrespondenceDirection = 'incoming' | 'outgoing' | 'internal';
export type CorrespondenceStatus =
  | 'to_prepare'
  | 'draft'
  | 'to_sign'
  | 'sent'
  | 'received'
  | 'awaiting_reply'
  | 'completed';

export interface Correspondence extends AuditBase {
  caseIds: UUID[];
  direction: CorrespondenceDirection;
  categoryId: string;
  officialNumber?: string;
  officialDate?: string;
  emohRegNumber?: string;
  emohRegDate?: string;
  sender: string;
  recipient: string;
  additionalRecipients?: string;
  subject: string;
  shortContent: string;
  draftedDate?: string;
  signedDate?: string;
  sentDate?: string;
  receivedDate?: string;
  deliveryMethod?: string;
  status: CorrespondenceStatus;
  isInterimLetter?: boolean;
  interimPrepared?: boolean;
  interimSigned?: boolean;
  interimSent?: boolean;
  expectedReplyDate?: string;
  linkedReplyLetterId?: UUID;
  responsibleUserId: UUID;
  attachmentIds: UUID[];
  notes?: string;
}

export interface Reviewer extends AuditBase {
  fullName: string;
  specialty: string;
  organization: string;
  position: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export type ReviewAssignmentStatus =
  | 'to_prepare'
  | 'sent'
  | 'receipt_confirmed'
  | 'awaiting_response'
  | 'additional_materials_requested'
  | 'response_received'
  | 'defective'
  | 'completed';

export interface ReviewResponse extends AuditBase {
  assignmentId: UUID;
  caseId: UUID;
  version: number;
  receivedDate: string;
  incomingLetterNumber?: string;
  incomingLetterDate?: string;
  authorName: string;
  shortSummary: string;
  concludingNote?: string;
  followUpActions?: string;
  isDefective?: boolean;
  attachmentIds: UUID[];
}

export interface ReviewAssignment extends AuditBase {
  caseId: UUID;
  reviewerId: UUID;
  reviewerNameSnapshot: string;
  basis: string;
  questionsToAnswer: string;
  materialsList: string;
  attachedDocumentIds: UUID[];
  outgoingLetterNumber?: string;
  outgoingLetterDate?: string;
  addressee?: string;
  sentMethod?: string;
  sentDate?: string;
  dueDate?: string;
  status: ReviewAssignmentStatus;
  additionalMaterialsRequestedNote?: string;
  additionalMaterialsFulfilled?: boolean;
  responses: ReviewResponse[];
  reminderDate?: string;
  notes?: string;
}

export type TaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export interface Task extends AuditBase {
  caseId?: UUID;
  title: string;
  description?: string;
  assignedTo: UUID;
  observerIds: UUID[];
  dueDate?: string;
  dueTime?: string;
  priority: PriorityLevel;
  status: TaskStatus;
  completedAt?: ISODateString;
  resultNote?: string;
  linkedEntityType?: 'visit' | 'document_request' | 'correspondence' | 'review' | 'act';
  linkedEntityId?: UUID;
}

export interface Reminder extends AuditBase {
  userId: UUID;
  caseId?: UUID;
  title: string;
  note?: string;
  remindAt: string; // ISO date or datetime
  isDismissed: boolean;
  linkedEntityType?: string;
  linkedEntityId?: UUID;
}

export interface AttachmentVersion {
  version: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: ISODateString;
  uploadedBy: UUID;
  blobKey: string;
  note?: string;
}

export interface Attachment extends AuditBase {
  caseId?: UUID;
  linkedEntityType:
    | 'case'
    | 'visit'
    | 'act'
    | 'order'
    | 'correspondence'
    | 'document_request'
    | 'document_delivery'
    | 'review_assignment'
    | 'review_response'
    | 'general';
  linkedEntityId?: UUID;
  title: string;
  fileName: string;
  category: string;
  description?: string;
  documentDate?: string;
  receivedFrom?: string;
  mimeType: string;
  sizeBytes: number;
  blobKey: string;
  currentVersion: number;
  versions: AttachmentVersion[];
}

export interface CommentReply {
  id: UUID;
  authorId: UUID;
  authorName: string;
  text: string;
  createdAt: ISODateString;
}

export interface CaseComment extends AuditBase {
  caseId: UUID;
  targetType:
    | 'case'
    | 'field'
    | 'visit'
    | 'act'
    | 'document_request'
    | 'correspondence'
    | 'review'
    | 'task'
    | 'order';
  targetId?: UUID;
  fieldKey?: string;
  fieldLabel?: string;
  authorId: UUID;
  authorName: string;
  text: string;
  replies: CommentReply[];
}

export interface ActivityLogEntry {
  id: UUID;
  caseId?: UUID;
  entityType: string;
  entityId: UUID;
  action: 'create' | 'update' | 'delete' | 'archive' | 'status_change' | 'close' | 'reopen' | 'override' | 'comment' | 'file_upload' | 'settings_change' | 'login' | 'backup';
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  summary: string;
  performedBy: UUID;
  performedByName: string;
  performedAt: ISODateString;
}

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: ISODateString;
  exportedBy: string;
  app: string;
  tables: Record<string, unknown[]>;
  filesManifest: Array<{
    blobKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}
