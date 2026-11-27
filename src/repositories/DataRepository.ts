import JSZip from 'jszip';
import { db } from '../storage/db';
import { storageProvider } from '../storage/StorageProvider';
import { authService } from '../auth/AuthService';
import { flushCloudWrites } from '../firebase/cloudSync';
import { doc, runTransaction } from 'firebase/firestore';
import { firestore } from '../firebase/client';
import { DEFAULT_SYSTEM_SETTINGS } from '../settings/defaultSettings';
import {
  ActivityLogEntry,
  Applicant,
  Attachment,
  BackupPayload,
  CaseComment,
  CaseCommission,
  CaseDoctor,
  CaseDoctorRole,
  CaseLink,
  CaseOrganizationLink,
  CaseParticipant,
  Commission,
  Correspondence,
  CustomFieldValue,
  Doctor,
  DocumentDelivery,
  DocumentRequest,
  EvidenceTransfer,
  InspectionAct,
  MedicalCase,
  Order,
  Organization,
  Patient,
  Reminder,
  ReviewAssignment,
  ReviewResponse,
  Reviewer,
  SafeUser,
  SystemSettings,
  Task,
  User,
  Visit,
} from '../models/types';
import {
  findMatchingDoctor,
  findMatchingOrganization,
  formatCaseNumber,
  generateUuid,
  getTbilisiDateISO,
} from '../utils/caseLogic';

export interface WorkspaceSnapshot {
  users: User[];
  settings: SystemSettings;
  cases: MedicalCase[];
  caseParticipants: CaseParticipant[];
  applicants: Applicant[];
  patients: Patient[];
  organizations: Organization[];
  caseOrganizations: CaseOrganizationLink[];
  doctors: Doctor[];
  caseDoctors: CaseDoctor[];
  visits: Visit[];
  inspectionActs: InspectionAct[];
  orders: Order[];
  commissions: Commission[];
  caseCommissions: CaseCommission[];
  documentRequests: DocumentRequest[];
  evidenceTransfers: EvidenceTransfer[];
  correspondence: Correspondence[];
  reviewers: Reviewer[];
  reviewAssignments: ReviewAssignment[];
  tasks: Task[];
  reminders: Reminder[];
  attachments: Attachment[];
  comments: CaseComment[];
  activityLogs: ActivityLogEntry[];
  customFieldValues: CustomFieldValue[];
  caseLinks: CaseLink[];
}

export class DexieRepository {
  async ensureSettings(): Promise<SystemSettings> {
    const existing = await db.settings.get('singleton');
    if (existing) return existing;
    await db.settings.put(DEFAULT_SYSTEM_SETTINGS);
    return DEFAULT_SYSTEM_SETTINGS;
  }

  async loadAll(): Promise<WorkspaceSnapshot> {
    const settings = await this.ensureSettings();
    const [
      users,
      cases,
      caseParticipants,
      applicants,
      patients,
      organizations,
      caseOrganizations,
      doctors,
      caseDoctors,
      visits,
      inspectionActs,
      orders,
      commissions,
      caseCommissions,
      documentRequests,
      evidenceTransfers,
      correspondence,
      reviewers,
      reviewAssignments,
      tasks,
      reminders,
      attachments,
      comments,
      activityLogs,
      customFieldValues,
      caseLinks,
    ] = await Promise.all([
      db.users.toArray(),
      db.cases.toArray(),
      db.case_participants.toArray(),
      db.applicants.toArray(),
      db.patients.toArray(),
      db.organizations.toArray(),
      db.case_organizations.toArray(),
      db.doctors.toArray(),
      db.case_doctors.toArray(),
      db.visits.toArray(),
      db.inspection_acts.toArray(),
      db.orders.toArray(),
      db.commissions.toArray(),
      db.case_commissions.toArray(),
      db.document_requests.toArray(),
      db.evidence_transfers.toArray(),
      db.correspondence.toArray(),
      db.reviewers.toArray(),
      db.review_assignments.toArray(),
      db.tasks.toArray(),
      db.reminders.toArray(),
      db.attachments.toArray(),
      db.comments.toArray(),
      db.activity_logs.orderBy('performedAt').reverse().limit(1000).toArray(),
      db.custom_field_values.toArray(),
      db.case_links.toArray(),
    ]);

    return {
      users,
      settings,
      cases,
      caseParticipants,
      applicants,
      patients,
      organizations,
      caseOrganizations,
      doctors,
      caseDoctors,
      visits,
      inspectionActs,
      orders,
      commissions,
      caseCommissions,
      documentRequests,
      evidenceTransfers,
      correspondence,
      reviewers,
      reviewAssignments,
      tasks,
      reminders,
      attachments,
      comments,
      activityLogs,
      customFieldValues,
      caseLinks,
    };
  }

  async logActivity(entry: Omit<ActivityLogEntry, 'id' | 'performedAt'>): Promise<void> {
    await db.activity_logs.put({
      ...entry,
      id: generateUuid(),
      performedAt: new Date().toISOString(),
    });
  }

  async allocateNextCaseNumber(year?: number): Promise<{ caseNumber: string; sequenceYear: number; sequenceNumber: number }> {
    const targetYear = year || Number(getTbilisiDateISO().slice(0, 4));
    const settings = await this.ensureSettings();
    const counterRef = doc(firestore, 'counters', String(targetYear));
    const nextSeq = await runTransaction(firestore, async (transaction) => {
      const remoteCounter = await transaction.get(counterRef);
      const current = remoteCounter.exists() ? Number(remoteCounter.data().lastSequence || 0) : 0;
      const next = current + 1;
      transaction.set(counterRef, { year: targetYear, lastSequence: next });
      return next;
    });
    await db.counters.put({ year: targetYear, lastSequence: nextSeq });
    return {
      caseNumber: formatCaseNumber(settings.caseNumberPrefix, settings.caseNumberYearFormat, targetYear, nextSeq),
      sequenceYear: targetYear,
      sequenceNumber: nextSeq,
    };
  }

  async createOrPublishCase(params: {
    draftId?: string;
    caseData: Omit<
      MedicalCase,
      'id' | 'caseNumber' | 'sequenceYear' | 'sequenceNumber' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'lastActivityAt'
    >;
    inlineOrganization?: {
      legalName: string;
      taxId?: string;
      municipality?: string;
      address?: string;
      branchName?: string;
      phone?: string;
      email?: string;
      directorName?: string;
      adminResponsible?: string;
    };
    doctors?: Array<{
      existingDoctorId?: string;
      newDoctor?: {
        fullName: string;
        specialty?: string;
        position?: string;
        phone?: string;
        email?: string;
      };
      roleInCase: CaseDoctorRole;
      nextAction?: string;
    }>;
    applicant?: Omit<Applicant, 'id' | 'caseId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>;
    patients: Array<Omit<Patient, 'id' | 'caseId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>>;
    participants: Array<Omit<CaseParticipant, 'id' | 'caseId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>>;
    customValues?: Record<string, string | number | boolean | string[] | null>;
    user: SafeUser;
  }): Promise<MedicalCase> {
    const now = new Date().toISOString();
    const { draftId, caseData, inlineOrganization, doctors, applicant, patients, participants, customValues, user } = params;
    const year = Number((caseData.startedAt || getTbilisiDateISO()).slice(0, 4)) || new Date().getFullYear();

    const caseId = draftId || generateUuid();
    let allocated = await this.allocateNextCaseNumber(year);

    if (draftId) {
      const existingDraft = await db.cases.get(draftId);
      if (existingDraft && !existingDraft.isDraft) {
        allocated = {
          caseNumber: existingDraft.caseNumber,
          sequenceYear: existingDraft.sequenceYear,
          sequenceNumber: existingDraft.sequenceNumber,
        };
      }
    }

    const newCase: MedicalCase = {
      ...caseData,
      id: caseId,
      caseNumber: allocated.caseNumber,
      sequenceYear: allocated.sequenceYear,
      sequenceNumber: allocated.sequenceNumber,
      isDraft: Boolean(caseData.isDraft),
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    };

    await db.transaction(
      'rw',
      [
        db.cases,
        db.applicants,
        db.patients,
        db.case_participants,
        db.custom_field_values,
        db.activity_logs,
        db.organizations,
        db.case_organizations,
        db.doctors,
        db.case_doctors,
      ],
      async () => {
        // 1. Resolve or auto-create inline clinic/organization
        let resolvedOrgId = caseData.primaryOrganizationId || '';
        const resolvedBranchName = (caseData.primaryBranchName || inlineOrganization?.branchName || '').trim() || undefined;

        if (!resolvedOrgId && inlineOrganization && inlineOrganization.legalName.trim()) {
          const allOrgs = await db.organizations.toArray();
          const matchedOrg = findMatchingOrganization(allOrgs, {
            legalName: inlineOrganization.legalName,
            taxId: inlineOrganization.taxId,
          });
          if (matchedOrg) {
            resolvedOrgId = matchedOrg.id;
          } else {
            resolvedOrgId = generateUuid();
            const newOrg: Organization = {
              id: resolvedOrgId,
              legalName: inlineOrganization.legalName.trim(),
              taxId: (inlineOrganization.taxId || '').trim(),
              address: (inlineOrganization.address || '').trim(),
              municipality: (inlineOrganization.municipality || 'თბილისი').trim(),
              phone: inlineOrganization.phone?.trim() || undefined,
              email: inlineOrganization.email?.trim() || undefined,
              directorName: inlineOrganization.directorName?.trim() || undefined,
              adminResponsible: inlineOrganization.adminResponsible?.trim() || undefined,
              branches: resolvedBranchName
                ? [
                    {
                      id: generateUuid(),
                      name: resolvedBranchName,
                      address: (inlineOrganization.address || '').trim(),
                      municipality: (inlineOrganization.municipality || 'თბილისი').trim(),
                      isPrimary: true,
                    },
                  ]
                : [],
              contacts: [],
              createdAt: now,
              updatedAt: now,
              createdBy: user.id,
              updatedBy: user.id,
            };
            await db.organizations.put(newOrg);
            await db.activity_logs.put({
              id: generateUuid(),
              caseId,
              entityType: 'organization',
              entityId: newOrg.id,
              action: 'create',
              summary: `ქეისის რეგისტრაციისას ავტომატურად დაემატა კლინიკა: ${newOrg.legalName}`,
              performedBy: user.id,
              performedByName: user.fullName,
              performedAt: now,
            });
          }
        }

        newCase.primaryOrganizationId = resolvedOrgId || undefined;
        newCase.primaryBranchName = resolvedBranchName;
        await db.cases.put(newCase);

        if (draftId) {
          await db.applicants.where('caseId').equals(draftId).delete();
          await db.patients.where('caseId').equals(draftId).delete();
          await db.case_participants.where('caseId').equals(draftId).delete();
          await db.case_doctors.where('caseId').equals(draftId).delete();
        }

        let createdApplicantId: string | undefined;
        if (applicant && applicant.name.trim()) {
          createdApplicantId = generateUuid();
          await db.applicants.put({
            ...applicant,
            id: createdApplicantId,
            caseId,
            createdAt: now,
            updatedAt: now,
            createdBy: user.id,
            updatedBy: user.id,
          });
        }

        for (const p of patients) {
          if (!p.fullName.trim()) continue;
          await db.patients.put({
            ...p,
            id: generateUuid(),
            caseId,
            applicantId: p.isSameAsApplicant ? createdApplicantId : undefined,
            createdAt: now,
            updatedAt: now,
            createdBy: user.id,
            updatedBy: user.id,
          });
        }

        for (const part of participants) {
          if (!part.fullName.trim()) continue;
          await db.case_participants.put({
            ...part,
            id: generateUuid(),
            caseId,
            createdAt: now,
            updatedAt: now,
            createdBy: user.id,
            updatedBy: user.id,
          });
        }

        if (resolvedOrgId) {
          const existingLinks = await db.case_organizations.where('caseId').equals(caseId).toArray();
          const alreadyLinked = existingLinks.some((l) => !l.deletedAt && l.organizationId === resolvedOrgId);
          if (!alreadyLinked) {
            const org = await db.organizations.get(resolvedOrgId);
            await db.case_organizations.put({
              id: generateUuid(),
              caseId,
              organizationId: resolvedOrgId,
              branchName: resolvedBranchName,
              snapshotAddress: org?.address,
              responsibleContactName: org?.adminResponsible || org?.directorName,
              responsibleContactPhone: org?.phone,
              responsibleContactEmail: org?.email,
              createdAt: now,
              updatedAt: now,
              createdBy: user.id,
              updatedBy: user.id,
            });
          }
        }

        // 2. Resolve or auto-create doctors & link to case
        if (doctors && doctors.length > 0) {
          const allDoctors = await db.doctors.toArray();
          const linkedDoctorIds = new Set<string>();
          for (const dEntry of doctors) {
            let resolvedDoc: Doctor | undefined;
            if (dEntry.existingDoctorId) {
              resolvedDoc = allDoctors.find((d) => d.id === dEntry.existingDoctorId && !d.deletedAt);
            } else if (dEntry.newDoctor && dEntry.newDoctor.fullName.trim()) {
              resolvedDoc = findMatchingDoctor(allDoctors, dEntry.newDoctor.fullName);
              if (resolvedDoc) {
                if (resolvedOrgId && !resolvedDoc.organizationIds.includes(resolvedOrgId)) {
                  resolvedDoc = {
                    ...resolvedDoc,
                    organizationIds: [...resolvedDoc.organizationIds, resolvedOrgId],
                    updatedAt: now,
                    updatedBy: user.id,
                  };
                  await db.doctors.put(resolvedDoc);
                }
              } else {
                const createdDoc: Doctor = {
                  id: generateUuid(),
                  fullName: dEntry.newDoctor.fullName.trim(),
                  specialty: dEntry.newDoctor.specialty?.trim() || 'ექიმი',
                  position: dEntry.newDoctor.position?.trim() || 'ექიმი',
                  phone: dEntry.newDoctor.phone?.trim() || undefined,
                  email: dEntry.newDoctor.email?.trim() || undefined,
                  organizationIds: resolvedOrgId ? [resolvedOrgId] : [],
                  createdAt: now,
                  updatedAt: now,
                  createdBy: user.id,
                  updatedBy: user.id,
                };
                await db.doctors.put(createdDoc);
                allDoctors.push(createdDoc);
                resolvedDoc = createdDoc;
                await db.activity_logs.put({
                  id: generateUuid(),
                  caseId,
                  entityType: 'doctor',
                  entityId: createdDoc.id,
                  action: 'create',
                  summary: `ქეისის რეგისტრაციისას ავტომატურად დაემატა ექიმი: ${createdDoc.fullName}`,
                  performedBy: user.id,
                  performedByName: user.fullName,
                  performedAt: now,
                });
              }
            }

            if (resolvedDoc && !linkedDoctorIds.has(resolvedDoc.id)) {
              linkedDoctorIds.add(resolvedDoc.id);
              await db.case_doctors.put({
                id: generateUuid(),
                caseId,
                doctorId: resolvedDoc.id,
                organizationId: resolvedOrgId || resolvedDoc.organizationIds[0],
                roleInCase: dEntry.roleInCase,
                snapshotPhone: resolvedDoc.phone,
                snapshotEmail: resolvedDoc.email,
                nextAction: dEntry.nextAction?.trim() || undefined,
                createdAt: now,
                updatedAt: now,
                createdBy: user.id,
                updatedBy: user.id,
              });
            }
          }
        }

        if (customValues) {
          for (const [fieldId, val] of Object.entries(customValues)) {
            await db.custom_field_values.put({
              id: `${caseId}__${fieldId}`,
              entityType: 'case_basic',
              entityId: caseId,
              fieldId,
              value: val,
              updatedAt: now,
              updatedBy: user.id,
            });
          }
        }

        await db.activity_logs.put({
          id: generateUuid(),
          caseId,
          entityType: 'case',
          entityId: caseId,
          action: 'create',
          summary: `${newCase.isDraft ? 'მონახაზი შენახულია' : 'შეიქმნა ახალი ქეისი'}: ${newCase.caseNumber} — ${newCase.title}`,
          performedBy: user.id,
          performedByName: user.fullName,
          performedAt: now,
        });
      }
    );

    return newCase;
  }

  async updateCaseFields(
    caseId: string,
    patch: Partial<MedicalCase>,
    user: SafeUser,
    fieldChangeLabel?: string
  ): Promise<void> {
    const existing = await db.cases.get(caseId);
    if (!existing) throw new Error('ქეისი ვერ მოიძებნა.');
    const now = new Date().toISOString();

    const changedEntries: Array<{ key: string; oldVal: string; newVal: string }> = [];
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'updatedAt' || k === 'updatedBy' || k === 'lastActivityAt') continue;
      const prevStr = JSON.stringify((existing as unknown as Record<string, unknown>)[k] ?? '');
      const nextStr = JSON.stringify(v ?? '');
      if (prevStr !== nextStr) {
        changedEntries.push({
          key: k,
          oldVal: String((existing as unknown as Record<string, unknown>)[k] ?? '—'),
          newVal: String(v ?? '—'),
        });
      }
    }

    await db.cases.update(caseId, {
      ...patch,
      updatedAt: now,
      updatedBy: user.id,
      lastActivityAt: now,
    });

    for (const ch of changedEntries) {
      await this.logActivity({
        caseId,
        entityType: 'case',
        entityId: caseId,
        action: ch.key === 'statusId' ? 'status_change' : 'update',
        fieldName: fieldChangeLabel || ch.key,
        oldValue: ch.oldVal.slice(0, 200),
        newValue: ch.newVal.slice(0, 200),
        summary: `განახლდა ველი (${fieldChangeLabel || ch.key}): „${ch.oldVal.slice(0, 60)}“ → „${ch.newVal.slice(0, 60)}“`,
        performedBy: user.id,
        performedByName: user.fullName,
      });
    }
  }

  async saveCustomFieldValues(
    entityType: CustomFieldValue['entityType'],
    entityId: string,
    values: Record<string, string | number | boolean | string[] | null>,
    user: SafeUser
  ): Promise<void> {
    const now = new Date().toISOString();
    for (const [fieldId, val] of Object.entries(values)) {
      await db.custom_field_values.put({
        id: `${entityId}__${fieldId}`,
        entityType,
        entityId,
        fieldId,
        value: val,
        updatedAt: now,
        updatedBy: user.id,
      });
    }
  }

  async addApplicantOrUpdate(item: Applicant, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.applicants.get(item.id);
    await db.applicants.put({ ...item, updatedAt: now, updatedBy: user.id });
    if (existing && existing.name !== item.name) {
      await this.logActivity({
        caseId: item.caseId,
        entityType: 'applicant',
        entityId: item.id,
        action: 'update',
        fieldName: 'განმცხადებელი',
        oldValue: existing.name,
        newValue: item.name,
        summary: `განმცხადებლის სახელი შეიცვალა: „${existing.name}“ → „${item.name}“`,
        performedBy: user.id,
        performedByName: user.fullName,
      });
    }
    await db.cases.update(item.caseId, { lastActivityAt: now });
  }

  async savePatient(item: Patient, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.patients.get(item.id);
    await db.patients.put({ ...item, updatedAt: now, updatedBy: user.id });
    if (existing && existing.fullName !== item.fullName) {
      await this.logActivity({
        caseId: item.caseId,
        entityType: 'patient',
        entityId: item.id,
        action: 'update',
        fieldName: 'პაციენტი',
        oldValue: existing.fullName,
        newValue: item.fullName,
        summary: `პაციენტის მონაცემი შეიცვალა: „${existing.fullName}“ → „${item.fullName}“`,
        performedBy: user.id,
        performedByName: user.fullName,
      });
    } else if (!existing) {
      await this.logActivity({
        caseId: item.caseId,
        entityType: 'patient',
        entityId: item.id,
        action: 'create',
        summary: `დაემატა პაციენტი: ${item.fullName}`,
        performedBy: user.id,
        performedByName: user.fullName,
      });
    }
    await db.cases.update(item.caseId, { lastActivityAt: now });
  }

  async saveParticipant(item: CaseParticipant, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    await db.case_participants.put({ ...item, updatedAt: now, updatedBy: user.id });
    await this.logActivity({
      caseId: item.caseId,
      entityType: 'participant',
      entityId: item.id,
      action: 'update',
      summary: `შენახულია მონაწილე: ${item.fullName}`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
    await db.cases.update(item.caseId, { lastActivityAt: now });
  }

  async saveOrganization(org: Organization, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.organizations.get(org.id);
    await db.organizations.put({ ...org, updatedAt: now, updatedBy: user.id });
    await this.logActivity({
      entityType: 'organization',
      entityId: org.id,
      action: existing ? 'update' : 'create',
      summary: `${existing ? 'განახლდა' : 'დაემატა'} კლინიკა: ${org.legalName}`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async linkOrganizationToCase(link: CaseOrganizationLink, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    await db.case_organizations.put({ ...link, updatedAt: now, updatedBy: user.id });
    const c = await db.cases.get(link.caseId);
    if (c && !c.primaryOrganizationId) {
      await db.cases.update(c.id, {
        primaryOrganizationId: link.organizationId,
        primaryBranchName: link.branchName,
        lastActivityAt: now,
      });
    } else {
      await db.cases.update(link.caseId, { lastActivityAt: now });
    }
    await this.logActivity({
      caseId: link.caseId,
      entityType: 'case_organization',
      entityId: link.id,
      action: 'create',
      summary: `ქეისს დაუკავშირდა კლინიკა/ფილიალი (${link.branchName || 'ძირითადი'})`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async saveDoctor(doc: Doctor, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.doctors.get(doc.id);
    await db.doctors.put({ ...doc, updatedAt: now, updatedBy: user.id });
    await this.logActivity({
      entityType: 'doctor',
      entityId: doc.id,
      action: existing ? 'update' : 'create',
      summary: `${existing ? 'განახლდა' : 'დაემატა'} ექიმი: ${doc.fullName}`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async linkDoctorToCase(link: CaseDoctor, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    await db.case_doctors.put({ ...link, updatedAt: now, updatedBy: user.id });
    await db.cases.update(link.caseId, { lastActivityAt: now });
    await this.logActivity({
      caseId: link.caseId,
      entityType: 'case_doctor',
      entityId: link.id,
      action: 'create',
      summary: `ქეისს დაუკავშირდა ექიმი/პერსონალი`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async createAndLinkOrganization(params: {
    caseId: string;
    orgData: {
      legalName: string;
      taxId?: string;
      municipality?: string;
      address?: string;
      branchName?: string;
      phone?: string;
      email?: string;
      directorName?: string;
      adminResponsible?: string;
      contactName?: string;
      contactPhone?: string;
      nextAction?: string;
    };
    user: SafeUser;
  }): Promise<{ org: Organization; link: CaseOrganizationLink; createdNew: boolean }> {
    const { caseId, orgData, user } = params;
    const now = new Date().toISOString();
    const allOrgs = await db.organizations.toArray();
    let org = findMatchingOrganization(allOrgs, {
      legalName: orgData.legalName,
      taxId: orgData.taxId,
    });
    let createdNew = false;

    if (!org) {
      createdNew = true;
      org = {
        id: generateUuid(),
        legalName: orgData.legalName.trim(),
        taxId: (orgData.taxId || '').trim(),
        address: (orgData.address || '').trim(),
        municipality: (orgData.municipality || 'თბილისი').trim(),
        phone: orgData.phone?.trim() || undefined,
        email: orgData.email?.trim() || undefined,
        directorName: orgData.directorName?.trim() || undefined,
        adminResponsible: orgData.adminResponsible?.trim() || orgData.contactName?.trim() || undefined,
        branches: orgData.branchName?.trim()
          ? [
              {
                id: generateUuid(),
                name: orgData.branchName.trim(),
                address: (orgData.address || '').trim(),
                municipality: (orgData.municipality || 'თბილისი').trim(),
                isPrimary: true,
              },
            ]
          : [],
        contacts: [],
        createdAt: now,
        updatedAt: now,
        createdBy: user.id,
        updatedBy: user.id,
      };
      await this.saveOrganization(org, user);
    }

    const link: CaseOrganizationLink = {
      id: generateUuid(),
      caseId,
      organizationId: org.id,
      branchName: orgData.branchName?.trim() || org.branches[0]?.name || undefined,
      snapshotAddress: org.address,
      responsibleContactName: orgData.contactName?.trim() || org.adminResponsible || org.directorName,
      responsibleContactPhone: orgData.contactPhone?.trim() || org.phone,
      responsibleContactEmail: org.email,
      nextAction: orgData.nextAction?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    };
    await this.linkOrganizationToCase(link, user);
    return { org, link, createdNew };
  }

  async createAndLinkDoctor(params: {
    caseId: string;
    doctorData: {
      fullName: string;
      specialty?: string;
      position?: string;
      phone?: string;
      email?: string;
      organizationId?: string;
      roleInCase: CaseDoctorRole;
      nextAction?: string;
    };
    user: SafeUser;
  }): Promise<{ doctor: Doctor; link: CaseDoctor; createdNew: boolean }> {
    const { caseId, doctorData, user } = params;
    const now = new Date().toISOString();
    const allDoctors = await db.doctors.toArray();
    let matchedDoc = findMatchingDoctor(allDoctors, doctorData.fullName);
    let createdNew = false;
    let resolvedDoc: Doctor;

    if (!matchedDoc) {
      createdNew = true;
      resolvedDoc = {
        id: generateUuid(),
        fullName: doctorData.fullName.trim(),
        specialty: doctorData.specialty?.trim() || 'ექიმი',
        position: doctorData.position?.trim() || 'ექიმი',
        phone: doctorData.phone?.trim() || undefined,
        email: doctorData.email?.trim() || undefined,
        organizationIds: doctorData.organizationId ? [doctorData.organizationId] : [],
        createdAt: now,
        updatedAt: now,
        createdBy: user.id,
        updatedBy: user.id,
      };
      await this.saveDoctor(resolvedDoc, user);
    } else if (doctorData.organizationId && !matchedDoc.organizationIds.includes(doctorData.organizationId)) {
      resolvedDoc = {
        ...matchedDoc,
        organizationIds: [...matchedDoc.organizationIds, doctorData.organizationId],
      };
      await this.saveDoctor(resolvedDoc, user);
    } else {
      resolvedDoc = matchedDoc;
    }

    const link: CaseDoctor = {
      id: generateUuid(),
      caseId,
      doctorId: resolvedDoc.id,
      organizationId: doctorData.organizationId || resolvedDoc.organizationIds[0],
      roleInCase: doctorData.roleInCase,
      snapshotPhone: resolvedDoc.phone,
      snapshotEmail: resolvedDoc.email,
      nextAction: doctorData.nextAction?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    };
    await this.linkDoctorToCase(link, user);
    return { doctor: resolvedDoc, link, createdNew };
  }

  async softDeleteCaseOrganization(linkId: string, user: SafeUser): Promise<void> {
    const link = await db.case_organizations.get(linkId);
    if (!link) return;
    const now = new Date().toISOString();
    await db.case_organizations.update(linkId, { deletedAt: now, updatedAt: now, updatedBy: user.id });
    await db.cases.update(link.caseId, { lastActivityAt: now });
  }

  async softDeleteCaseDoctor(linkId: string, user: SafeUser): Promise<void> {
    const link = await db.case_doctors.get(linkId);
    if (!link) return;
    const now = new Date().toISOString();
    await db.case_doctors.update(linkId, { deletedAt: now, updatedAt: now, updatedBy: user.id });
    await db.cases.update(link.caseId, { lastActivityAt: now });
  }

  async saveOrder(order: Order, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.orders.get(order.id);
    await db.orders.put({ ...order, updatedAt: now, updatedBy: user.id });
    await db.cases.update(order.caseId, { lastActivityAt: now });
    await this.logActivity({
      caseId: order.caseId,
      entityType: 'order',
      entityId: order.id,
      action: existing ? 'update' : 'create',
      summary: `${existing ? 'განახლდა' : 'დაემატა'} ბრძანება/აქტი №${order.orderNumber}`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async saveCommission(commission: Commission, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.commissions.get(commission.id);
    await db.commissions.put({ ...commission, updatedAt: now, updatedBy: user.id });
    await this.logActivity({
      entityType: 'commission',
      entityId: commission.id,
      action: existing ? 'update' : 'create',
      summary: `${existing ? 'განახლდა' : 'შეიქმნა'} კომისია/ჯგუფი: ${commission.name}`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async linkCommissionToCase(link: CaseCommission, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    await db.case_commissions.put({ ...link, updatedAt: now, updatedBy: user.id });
    await db.cases.update(link.caseId, { lastActivityAt: now });
    await this.logActivity({
      caseId: link.caseId,
      entityType: 'case_commission',
      entityId: link.id,
      action: 'create',
      summary: `ქეისს მიენიჭა შემოწმების ჯგუფი/კომისია`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async createAndLinkCommission(params: {
    caseId: string;
    commissionData: {
      name: string;
      type?: string;
      chairName?: string;
      membersText?: string;
      stageNote?: string;
    };
    user: SafeUser;
  }): Promise<{ commission: Commission; link: CaseCommission }> {
    const { caseId, commissionData, user } = params;
    const now = new Date().toISOString();
    const memberNames = (commissionData.membersText || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const commission: Commission = {
      id: generateUuid(),
      name: commissionData.name.trim(),
      type: commissionData.type?.trim() || 'შემოწმების ჯგუფი',
      creationBasis: commissionData.stageNote?.trim() || 'ქეისის ფარგლებში შექმნილი ჯგუფი',
      chairName: commissionData.chairName?.trim() || user.fullName,
      members: memberNames.map((fullName) => ({
        id: generateUuid(),
        fullName,
        position: 'სპეციალისტი',
        roleInGroup: 'member',
      })),
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    };
    await this.saveCommission(commission, user);

    const link: CaseCommission = {
      id: generateUuid(),
      caseId,
      commissionId: commission.id,
      stageNote: commissionData.stageNote?.trim() || undefined,
      assignedDate: getTbilisiDateISO(),
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    };
    await this.linkCommissionToCase(link, user);
    return { commission, link };
  }

  async saveVisit(visit: Visit, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.visits.get(visit.id);
    await db.visits.put({ ...visit, updatedAt: now, updatedBy: user.id });

    // Mirror/sync InspectionAct if user entered actNumber or act status beyond not_started
    if (visit.actNumber || visit.actPrepStatus !== 'not_started') {
      const existingAct = (await db.inspection_acts.where('visitId').equals(visit.id).toArray())[0];
      const act: InspectionAct = {
        id: existingAct?.id || generateUuid(),
        caseId: visit.caseId,
        visitId: visit.id,
        commissionId: visit.commissionId,
        actType: visit.visitTypeId,
        actNumber: visit.actNumber || existingAct?.actNumber || '',
        actDate: visit.actDate || existingAct?.actDate || '',
        prepStatus: visit.actPrepStatus,
        signatories: visit.actSignatories || '',
        deliveryStatus: visit.actDeliveryStatus || '',
        summary: visit.actNotes || visit.findings,
        attachmentIds: visit.actAttachmentIds,
        createdAt: existingAct?.createdAt || now,
        updatedAt: now,
        createdBy: existingAct?.createdBy || user.id,
        updatedBy: user.id,
      };
      await db.inspection_acts.put(act);
    }

    await db.cases.update(visit.caseId, { lastActivityAt: now });
    await this.logActivity({
      caseId: visit.caseId,
      entityType: 'visit',
      entityId: visit.id,
      action: existing ? 'update' : 'create',
      oldValue: existing?.status,
      newValue: visit.status,
      summary: `${existing ? 'განახლდა' : 'დაემატა'} ვიზიტი/შემოწმება (${visit.purpose || 'ვიზიტი'})`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async saveInspectionAct(act: InspectionAct, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.inspection_acts.get(act.id);
    await db.inspection_acts.put({ ...act, updatedAt: now, updatedBy: user.id });
    await db.cases.update(act.caseId, { lastActivityAt: now });
    await this.logActivity({
      caseId: act.caseId,
      entityType: 'inspection_act',
      entityId: act.id,
      action: existing ? 'update' : 'create',
      summary: `${existing ? 'განახლდა' : 'დაემატა'} შემოწმების აქტი №${act.actNumber || '—'}`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async saveDocumentRequest(req: DocumentRequest, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.document_requests.get(req.id);
    await db.document_requests.put({ ...req, updatedAt: now, updatedBy: user.id });
    await db.cases.update(req.caseId, { lastActivityAt: now });
    await this.logActivity({
      caseId: req.caseId,
      entityType: 'document_request',
      entityId: req.id,
      action: existing ? 'update' : 'create',
      oldValue: existing?.status,
      newValue: req.status,
      summary: `${existing ? 'განახლდა' : 'დაემატა'} დოკუმენტის მოთხოვნა: ${req.documentTitle} (${req.status})`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async addDocumentDelivery(requestId: string, delivery: DocumentDelivery, newStatus: DocumentRequest['status'], user: SafeUser): Promise<void> {
    const req = await db.document_requests.get(requestId);
    if (!req) throw new Error('მოთხოვნა ვერ მოიძებნა.');
    const now = new Date().toISOString();
    const updatedDeliveries = [...req.deliveries, delivery];
    await db.document_requests.update(requestId, {
      deliveries: updatedDeliveries,
      status: newStatus,
      missingItemsNote: delivery.stillMissing || req.missingItemsNote,
      defectNote: delivery.defectDescription || req.defectNote,
      updatedAt: now,
      updatedBy: user.id,
    });
    await db.cases.update(req.caseId, { lastActivityAt: now });
    await this.logActivity({
      caseId: req.caseId,
      entityType: 'document_request',
      entityId: requestId,
      action: 'update',
      oldValue: req.status,
      newValue: newStatus,
      summary: `დაფიქსირდა დოკუმენტის მიწოდება („${req.documentTitle}“) — სტატუსი: ${newStatus}`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async saveCorrespondence(letter: Correspondence, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.correspondence.get(letter.id);
    await db.correspondence.put({ ...letter, updatedAt: now, updatedBy: user.id });
    for (const cId of letter.caseIds) {
      await db.cases.update(cId, { lastActivityAt: now });
    }
    await this.logActivity({
      caseId: letter.caseIds[0],
      entityType: 'correspondence',
      entityId: letter.id,
      action: existing ? 'update' : 'create',
      oldValue: existing?.status,
      newValue: letter.status,
      summary: `${existing ? 'განახლდა' : 'დარეგისტრირდა'} წერილი: ${letter.subject} (${letter.officialNumber || 'ნომრის გარეშე'})`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async saveReviewer(rev: Reviewer, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    await db.reviewers.put({ ...rev, updatedAt: now, updatedBy: user.id });
  }

  async saveReviewAssignment(assignment: ReviewAssignment, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.review_assignments.get(assignment.id);
    await db.review_assignments.put({ ...assignment, updatedAt: now, updatedBy: user.id });
    await db.cases.update(assignment.caseId, { lastActivityAt: now });
    await this.logActivity({
      caseId: assignment.caseId,
      entityType: 'review_assignment',
      entityId: assignment.id,
      action: existing ? 'update' : 'create',
      oldValue: existing?.status,
      newValue: assignment.status,
      summary: `${existing ? 'განახლდა' : 'გაიგზავნა'} რეცენზია: ${assignment.reviewerNameSnapshot} (${assignment.outgoingLetterNumber || '—'})`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async addReviewResponse(assignmentId: string, response: ReviewResponse, newStatus: ReviewAssignment['status'], user: SafeUser): Promise<void> {
    const assign = await db.review_assignments.get(assignmentId);
    if (!assign) throw new Error('რეცენზიის დავალება ვერ მოიძებნა.');
    const now = new Date().toISOString();
    const responses = [...assign.responses, response];
    await db.review_assignments.update(assignmentId, {
      responses,
      status: newStatus,
      updatedAt: now,
      updatedBy: user.id,
    });
    await db.cases.update(assign.caseId, { lastActivityAt: now });
    await this.logActivity({
      caseId: assign.caseId,
      entityType: 'review_assignment',
      entityId: assignmentId,
      action: 'update',
      oldValue: assign.status,
      newValue: newStatus,
      summary: `მიღებულია რეცენზიის პასუხი (ვერსია ${response.version}) — ავტორი: ${response.authorName}`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async saveTask(task: Task, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.tasks.get(task.id);
    await db.tasks.put({ ...task, updatedAt: now, updatedBy: user.id });
    if (task.caseId) {
      await db.cases.update(task.caseId, { lastActivityAt: now });
    }
    await this.logActivity({
      caseId: task.caseId,
      entityType: 'task',
      entityId: task.id,
      action: existing ? 'update' : 'create',
      oldValue: existing?.status,
      newValue: task.status,
      summary: `${existing ? 'განახლდა' : 'დაემატა'} დავალება: ${task.title} (${task.status})`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async saveReminder(rem: Reminder): Promise<void> {
    await db.reminders.put(rem);
  }

  async saveAttachment(att: Attachment, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.attachments.get(att.id);
    await db.attachments.put({ ...att, updatedAt: now, updatedBy: user.id });
    if (att.caseId) {
      await db.cases.update(att.caseId, { lastActivityAt: now });
    }
    await this.logActivity({
      caseId: att.caseId,
      entityType: 'attachment',
      entityId: att.id,
      action: 'file_upload',
      summary: `${existing ? 'განახლდა ფაილის ვერსია' : 'აიტვირთა ფაილი'}: ${att.fileName}`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async softDeleteAttachment(attId: string, user: SafeUser): Promise<void> {
    const att = await db.attachments.get(attId);
    if (!att) return;
    const now = new Date().toISOString();
    await db.attachments.update(attId, { deletedAt: now, updatedAt: now, updatedBy: user.id });
    await this.logActivity({
      caseId: att.caseId,
      entityType: 'attachment',
      entityId: attId,
      action: 'delete',
      summary: `წაიშალა/არქივში გადავიდა ფაილი: ${att.fileName}`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async saveComment(comment: CaseComment, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    await db.comments.put({ ...comment, updatedAt: now, updatedBy: user.id });
    await db.cases.update(comment.caseId, { lastActivityAt: now });
    await this.logActivity({
      caseId: comment.caseId,
      entityType: 'comment',
      entityId: comment.id,
      action: 'comment',
      fieldName: comment.fieldLabel,
      summary: `კომენტარი${comment.fieldLabel ? ` (${comment.fieldLabel})` : ''}: ${comment.text.slice(0, 80)}`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async closeCase(
    caseId: string,
    closureInfo: MedicalCase['closureInfo'],
    closedStatusId: string,
    user: SafeUser
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.cases.get(caseId);
    if (!existing) throw new Error('ქეისი ვერ მოიძებნა.');
    await db.cases.update(caseId, {
      statusId: closedStatusId,
      closureInfo,
      updatedAt: now,
      updatedBy: user.id,
      lastActivityAt: now,
    });
    await this.logActivity({
      caseId,
      entityType: 'case',
      entityId: caseId,
      action: closureInfo?.adminOverrideUsed ? 'override' : 'close',
      oldValue: existing.statusId,
      newValue: closedStatusId,
      summary: closureInfo?.adminOverrideUsed
        ? `ქეისი დაიხურა Admin გამონაკლისით: ${closureInfo.adminOverrideJustification}`
        : `ქეისი დასრულდა/დაიხურა (${closureInfo?.outcome || 'დასრულებული'})`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async reopenCase(caseId: string, reason: string, targetStatusId: string, user: SafeUser): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.cases.get(caseId);
    if (!existing) throw new Error('ქეისი ვერ მოიძებნა.');
    const history = [...(existing.reopenHistory || []), { reopenedAt: now, reopenedBy: user.id, reason }];
    await db.cases.update(caseId, {
      statusId: targetStatusId,
      reopenHistory: history,
      updatedAt: now,
      updatedBy: user.id,
      lastActivityAt: now,
    });
    await this.logActivity({
      caseId,
      entityType: 'case',
      entityId: caseId,
      action: 'reopen',
      oldValue: existing.statusId,
      newValue: targetStatusId,
      summary: `დახურული ქეისი ხელახლა გაიხსნა. მიზეზი: ${reason}`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async saveSettings(newSettings: SystemSettings, user: SafeUser, changeSummary: string): Promise<void> {
    const now = new Date().toISOString();
    await db.settings.put({ ...newSettings, updatedAt: now, updatedBy: user.id });
    await this.logActivity({
      entityType: 'settings',
      entityId: 'singleton',
      action: 'settings_change',
      summary: changeSummary,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async saveUser(targetUser: User, actor: SafeUser, actionSummary: string): Promise<void> {
    const now = new Date().toISOString();
    await db.users.put({ ...targetUser, updatedAt: now, updatedBy: actor.id });
    await this.logActivity({
      entityType: 'user',
      entityId: targetUser.id,
      action: 'update',
      summary: actionSummary,
      performedBy: actor.id,
      performedByName: actor.fullName,
    });
  }

  async exportFullZipBackup(user: SafeUser): Promise<Blob> {
    const zip = new JSZip();
    const tables: Record<string, unknown[]> = {};

    const tableList = [
      'users',
      'settings',
      'counters',
      'cases',
      'case_participants',
      'persons',
      'applicants',
      'patients',
      'organizations',
      'case_organizations',
      'doctors',
      'case_doctors',
      'visits',
      'inspection_acts',
      'orders',
      'commissions',
      'case_commissions',
      'document_requests',
      'evidence_transfers',
      'correspondence',
      'reviewers',
      'review_assignments',
      'tasks',
      'reminders',
      'attachments',
      'comments',
      'activity_logs',
      'custom_field_values',
      'case_links',
    ] as const;

    for (const name of tableList) {
      tables[name] = await db.table(name).toArray();
    }

    const filesFolder = zip.folder('files');
    const filesManifest: BackupPayload['filesManifest'] = [];
    const cloudFiles = new Map<string, { blobKey: string; fileName: string; mimeType: string; sizeBytes: number }>();
    for (const attachment of await db.attachments.toArray()) {
      for (const version of attachment.versions || []) {
        cloudFiles.set(version.blobKey, {
          blobKey: version.blobKey,
          fileName: version.fileName,
          mimeType: version.mimeType,
          sizeBytes: version.sizeBytes,
        });
      }
    }

    for (const meta of cloudFiles.values()) {
      const blob = await storageProvider.getFileBlob(meta.blobKey);
      if (!blob) continue;
      filesManifest.push(meta);
      if (filesFolder) filesFolder.file(meta.blobKey, blob);
    }

    const payload: BackupPayload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: user.username,
      app: 'medreg_workspace_mvp',
      tables,
      filesManifest,
    };

    zip.file('backup.json', JSON.stringify(payload, null, 2));

    await this.logActivity({
      entityType: 'backup',
      entityId: 'export',
      action: 'backup',
      summary: `შეიქმნა სრული ZIP სარეზერვო ასლი (${filesManifest.length} ფაილით).`,
      performedBy: user.id,
      performedByName: user.fullName,
    });

    return zip.generateAsync({ type: 'blob' });
  }

  async inspectBackupFile(file: File): Promise<{
    payload: BackupPayload;
    zipInstance?: JSZip;
    existingCaseCount: number;
  }> {
    let payload: BackupPayload;
    let zipInstance: JSZip | undefined;

    if (file.name.toLowerCase().endsWith('.zip')) {
      zipInstance = await JSZip.loadAsync(file);
      const jsonFile = zipInstance.file('backup.json');
      if (!jsonFile) {
        throw new Error('ZIP არქივში ვერ მოიძებნა backup.json ფაილი.');
      }
      const rawText = await jsonFile.async('string');
      payload = JSON.parse(rawText) as BackupPayload;
    } else if (file.name.toLowerCase().endsWith('.json')) {
      const rawText = await file.text();
      payload = JSON.parse(rawText) as BackupPayload;
    } else {
      throw new Error('გთხოვთ აირჩიოთ .zip ან .json სარეზერვო ფაილი.');
    }

    if (!payload || payload.app !== 'medreg_workspace_mvp' || !payload.tables) {
      throw new Error('სარეზერვო ფაილის ფორმატი არასწორია ან დაზიანებულია.');
    }

    const existingCaseCount = await db.cases.count();
    return { payload, zipInstance, existingCaseCount };
  }

  async restoreFromBackup(params: {
    payload: BackupPayload;
    zipInstance?: JSZip;
    mode: 'replace' | 'merge';
    user: SafeUser;
  }): Promise<{ restoredCases: number; restoredFiles: number }> {
    const { payload, zipInstance, mode, user } = params;
    const tableNames = Object.keys(payload.tables);

    if (mode === 'replace') {
      for (const name of tableNames) {
        const tbl = db.tables.find((t) => t.name === name);
        if (tbl) await tbl.clear();
      }
      await db.file_blobs.clear();
    }

    for (const name of tableNames) {
      const tbl = db.tables.find((t) => t.name === name);
      const rows = payload.tables[name];
      if (tbl && Array.isArray(rows) && rows.length > 0) {
        await tbl.bulkPut(rows);
      }
    }

    let restoredFiles = 0;
    if (zipInstance && Array.isArray(payload.filesManifest)) {
      for (const meta of payload.filesManifest) {
        const zipEntry = zipInstance.file(`files/${meta.blobKey}`);
        if (zipEntry) {
          const blob = await zipEntry.async('blob');
          await storageProvider.saveBlob(meta.blobKey, meta.fileName, meta.mimeType, blob);
          restoredFiles += 1;
        }
      }
    }

    await this.logActivity({
      entityType: 'backup',
      entityId: 'restore',
      action: 'backup',
      summary: `განხორციელდა მონაცემების აღდგენა (${mode === 'replace' ? 'სრული ჩანაცვლება' : 'შერწყმა'}) — ${restoredFiles} ფაილი.`,
      performedBy: user.id,
      performedByName: user.fullName,
    });

    return {
      restoredCases: Array.isArray(payload.tables.cases) ? payload.tables.cases.length : 0,
      restoredFiles,
    };
  }

  /**
   * მკაფიოდ მონიშნული ხელოვნური სატესტო მონაცემების შექმნა და უსაფრთხო წაშლა.
   */
  async seedSampleTestData(user: SafeUser): Promise<void> {
    const existingSample = await db.cases.filter((c) => Boolean(c.isTestSample)).count();
    if (existingSample > 0) {
      throw new Error('სატესტო მონაცემები უკვე ჩატვირთულია.');
    }

    const now = new Date().toISOString();
    const today = getTbilisiDateISO();
    const orgId = generateUuid();
    const docId = generateUuid();
    const revId = generateUuid();
    const commId = generateUuid();

    await db.organizations.put({
      id: orgId,
      legalName: 'შპს „სატესტო მრავალპროფილური კლინიკა“',
      tradeName: 'სატესტო კლინიკა №1',
      taxId: '204999001',
      address: 'ქ. თბილისი, ჭავჭავაძის გამზ. №10 (სატესტო)',
      municipality: 'თბილისი',
      phone: '032 200 00 00',
      email: 'test-clinic@example.ge',
      directorName: 'გ. ბერიძე (სატესტო)',
      adminResponsible: 'მ. კაპანაძე (სატესტო)',
      qualityRepresentative: 'ნ. ლომიძე',
      branches: [
        {
          id: generateUuid(),
          name: 'ცენტრალური ფილიალი',
          address: 'ქ. თბილისი, ჭავჭავაძის გამზ. №10',
          municipality: 'თბილისი',
          isPrimary: true,
        },
      ],
      contacts: [
        {
          id: generateUuid(),
          fullName: 'მ. კაპანაძე',
          position: 'ხარისხის მართვის მენეჯერი',
          roleType: 'quality',
          phone: '599 00 00 01',
          email: 'quality@example.ge',
        },
      ],
      notes: 'ხელოვნური სატესტო ჩანაწერი',
      isTestSample: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    });

    await db.doctors.put({
      id: docId,
      fullName: 'დოქტ. ალექსანდრე მაისურაძე (სატესტო)',
      specialty: 'ქირურგია',
      position: 'განყოფილების ხელმძღვანელი',
      organizationIds: [orgId],
      phone: '599 11 22 33',
      email: 'doctor-test@example.ge',
      professionalStatusNote: 'სატესტო ჩანაწერი',
      isTestSample: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    });

    await db.reviewers.put({
      id: revId,
      fullName: 'პროფ. თამარ გელაშვილი (სატესტო რეცენზენტი)',
      specialty: 'ზოგადი ქირურგია',
      organization: 'დამოუკიდებელი ექსპერტთა კოლეგია',
      position: 'ექსპერტ-რეცენზენტი',
      phone: '577 00 11 22',
      email: 'reviewer@example.ge',
      isTestSample: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    });

    await db.commissions.put({
      id: commId,
      name: 'თბილისის სტაციონარული შემოწმების ჯგუფი №1 (სატესტო)',
      type: 'არაგეგმური შემოწმების ჯგუფი',
      creationBasis: 'სატესტო ბრძანება №01/ტ',
      orderNumber: 'ბრძ-2026-015',
      orderDate: today,
      chairName: user.fullName,
      chairUserId: user.id,
      members: [
        {
          id: generateUuid(),
          userId: user.id,
          fullName: user.fullName,
          position: user.position,
          roleInGroup: 'chair',
        },
      ],
      startDate: today,
      isTestSample: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    });

    const allocated1 = await this.allocateNextCaseNumber();
    const caseId1 = generateUuid();

    await db.cases.put({
      id: caseId1,
      caseNumber: allocated1.caseNumber,
      sequenceYear: allocated1.sequenceYear,
      sequenceNumber: allocated1.sequenceNumber,
      title: '[სატესტო] სტაციონარული მომსახურების ხარისხის შესწავლა',
      shortSummary: 'სატესტო ქეისი სამუშაო პროცესების შესამოწმებლად.',
      detailedDescription: 'ეს არის ხელოვნური სატესტო ჩანაწერი, რომელიც შეგიძლიათ უსაფრთხოდ წაშალოთ პარამეტრებიდან.',
      categoryId: 'cat_quality',
      priority: 'high',
      confidentiality: 'standard',
      statusId: 'st_docs_collecting',
      assignedTo: user.id,
      collaboratorIds: [],
      tags: ['სატესტო'],
      linkedCaseIds: [],
      sourceId: 'src_complaint',
      complaintNumber: 'სჩ-2026/101',
      complaintDate: today,
      receivedChannel: 'eMOH / წერილი',
      emohRegNumber: 'EMOH-2026-8841',
      emohRegDate: today,
      startedAt: today,
      deadlineDate: today,
      primaryOrganizationId: orgId,
      primaryBranchName: 'ცენტრალური ფილიალი',
      needsReview: 'yes',
      checklistAnswers: [],
      lastActivityAt: now,
      isTestSample: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    });

    const appId = generateUuid();
    await db.applicants.put({
      id: appId,
      caseId: caseId1,
      type: 'individual',
      name: 'გიორგი ქავთარაძე (სატესტო)',
      phone: '555 12 34 56',
      preferredChannel: 'phone',
      isTestSample: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    });

    await db.patients.put({
      id: generateUuid(),
      caseId: caseId1,
      fullName: 'გიორგი ქავთარაძე (სატესტო)',
      isSameAsApplicant: true,
      applicantId: appId,
      isTestSample: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    });

    await db.case_organizations.put({
      id: generateUuid(),
      caseId: caseId1,
      organizationId: orgId,
      branchName: 'ცენტრალური ფილიალი',
      responsibleContactName: 'მ. კაპანაძე',
      responsibleContactPhone: '599 00 00 01',
      isTestSample: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    });

    await db.case_doctors.put({
      id: generateUuid(),
      caseId: caseId1,
      doctorId: docId,
      organizationId: orgId,
      roleInCase: 'attending_physician',
      isTestSample: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    });

    await db.document_requests.put({
      id: generateUuid(),
      caseId: caseId1,
      documentTypeId: 'doc_history',
      documentTitle: 'სტაციონარული სამედიცინო ისტორია (სატესტო)',
      requestedFromType: 'clinic',
      requestedFromId: orgId,
      requestedFromName: 'შპს „სატესტო მრავალპროფილური კლინიკა“',
      basis: 'სატესტო გამოთხოვა',
      outgoingLetterNumber: 'გას-2026/01',
      outgoingLetterDate: today,
      dueDate: today,
      status: 'requested',
      responsibleUserId: user.id,
      deliveries: [],
      isTestSample: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    });

    await db.tasks.put({
      id: generateUuid(),
      caseId: caseId1,
      title: 'შუალედური წერილის მომზადება (სატესტო)',
      description: 'განმცხადებლის ინფორმირება საქმის განხილვის მიმდინარეობის შესახებ.',
      assignedTo: user.id,
      observerIds: [],
      dueDate: today,
      priority: 'high',
      status: 'open',
      isTestSample: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    });

    await this.logActivity({
      caseId: caseId1,
      entityType: 'case',
      entityId: caseId1,
      action: 'create',
      summary: `ჩაიტვირთა ხელოვნური სატესტო მონაცემები (${allocated1.caseNumber}).`,
      performedBy: user.id,
      performedByName: user.fullName,
    });
  }

  async clearSampleTestData(user: SafeUser): Promise<number> {
    const sampleCases = await db.cases.filter((c) => Boolean(c.isTestSample)).toArray();
    const tablesToClean = [
      db.cases,
      db.case_participants,
      db.applicants,
      db.patients,
      db.organizations,
      db.case_organizations,
      db.doctors,
      db.case_doctors,
      db.visits,
      db.inspection_acts,
      db.orders,
      db.commissions,
      db.case_commissions,
      db.document_requests,
      db.evidence_transfers,
      db.correspondence,
      db.reviewers,
      db.review_assignments,
      db.tasks,
      db.reminders,
      db.comments,
    ];

    for (const tbl of tablesToClean) {
      const items = await tbl.filter((item: { isTestSample?: boolean }) => Boolean(item.isTestSample)).toArray();
      if (items.length > 0) {
        await tbl.bulkDelete(items.map((i: { id: string }) => i.id));
      }
    }

    await this.logActivity({
      entityType: 'settings',
      entityId: 'sample_clear',
      action: 'delete',
      summary: `წაიშალა ხელოვნური სატესტო მონაცემები (${sampleCases.length} სატესტო ქეისი).`,
      performedBy: user.id,
      performedByName: user.fullName,
    });

    return sampleCases.length;
  }
}

const dexieRepository = new DexieRepository();
const READ_ONLY_METHODS = new Set(['loadAll', 'inspectBackupFile']);

/**
 * Dexie remains the fast offline cache. Every completed mutation is durably
 * flushed to Firestore before the UI is told that the operation succeeded.
 */
export const dataRepo: DexieRepository = new Proxy(dexieRepository, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== 'function') return value;
    const methodName = String(property);
    if (READ_ONLY_METHODS.has(methodName)) return value.bind(target);
    return async (...args: unknown[]) => {
      const result = await value.apply(target, args);
      await flushCloudWrites();
      return result;
    };
  },
});
