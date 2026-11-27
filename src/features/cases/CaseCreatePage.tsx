import React, { useEffect, useState } from 'react';
import { z } from 'zod';
import { Building2, Check, ChevronLeft, ChevronRight, Plus, Save, Stethoscope, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { dataRepo } from '../../repositories/DataRepository';
import {
  CaseDoctorRole,
  CaseParticipant,
  ConfidentialityLevel,
  PriorityLevel,
} from '../../models/types';
import { generateUuid, getTbilisiDateISO } from '../../utils/caseLogic';
import {
  CustomFieldsSection,
  PendingFilePicker,
  PendingUploadItem,
  SearchableSelect,
  uploadAttachmentBatch,
} from '../../components/ui/CommonUI';

const DRAFT_LOCAL_KEY = 'medreg_new_case_autosave_v1';

const casePublishSchema = z.object({
  title: z.string().trim().min(3, 'საქმის სათაური უნდა შეიცავდეს მინიმუმ 3 სიმბოლოს.'),
  shortSummary: z.string().trim().min(3, 'შეიყვანეთ მოკლე შინაარსი.'),
  startedAt: z.string().min(8, 'მიუთითეთ საქმის დაწყების თარიღი.'),
  assignedTo: z.string().min(1, 'აირჩიეთ პასუხისმგებელი თანამშრომელი.'),
});

interface PatientDraft {
  tempId: string;
  fullName: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  personalId: string;
  representative: string;
  isSameAsApplicant: boolean;
  notes: string;
}

interface ParticipantDraft {
  tempId: string;
  role: CaseParticipant['role'];
  roleLabel: string;
  fullName: string;
  phone: string;
  email: string;
  notes: string;
}

interface DoctorDraft {
  tempId: string;
  existingDoctorId?: string;
  displayName: string;
  specialty?: string;
  position?: string;
  phone?: string;
  roleInCase: CaseDoctorRole;
}

const DOC_ROLE_LABELS: Record<CaseDoctorRole, string> = {
  attending_physician: 'მკურნალი ექიმი',
  department_head: 'განყოფილების ხელმძღვანელი',
  explanation_author: 'ახსნა-განმარტების ავტორი',
  responsible_person: 'პასუხისმგებელი პირი',
  other: 'სხვა',
};

const SECTIONS = [
  { id: 'A', title: 'A. ძირითადი, კლინიკა, ექიმი და ფაილები' },
  { id: 'B', title: 'B. საქმის წარმოშობა და eMOH' },
  { id: 'C', title: 'C. განმცხადებელი' },
  { id: 'D', title: 'D. პაციენტი' },
  { id: 'E', title: 'E. სხვა მონაწილეები' },
] as const;

export const CaseCreatePage: React.FC = () => {
  const { currentUser, snapshot, navigate, refreshData, notify, can } = useApp();
  const [stepIdx, setStepIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Section A
  const [title, setTitle] = useState('');
  const [shortSummary, setShortSummary] = useState('');
  const [detailedDescription, setDetailedDescription] = useState('');
  const [categoryId, setCategoryId] = useState('cat_quality');
  const [priority, setPriority] = useState<PriorityLevel>('normal');
  const [confidentiality, setConfidentiality] = useState<ConfidentialityLevel>('standard');
  const [statusId, setStatusId] = useState('st_new');
  const [assignedTo, setAssignedTo] = useState(currentUser?.id || '');
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
  const [supervisorId, setSupervisorId] = useState('');
  const [linkedCaseIds, setLinkedCaseIds] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState('');

  // Clinic (select existing OR enter new inline)
  const [orgMode, setOrgMode] = useState<'existing' | 'new'>('existing');
  const [primaryOrganizationId, setPrimaryOrganizationId] = useState('');
  const [primaryBranchName, setPrimaryBranchName] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgTaxId, setNewOrgTaxId] = useState('');
  const [newOrgMunicipality, setNewOrgMunicipality] = useState('თბილისი');
  const [newOrgAddress, setNewOrgAddress] = useState('');
  const [newOrgBranch, setNewOrgBranch] = useState('');
  const [newOrgDirector, setNewOrgDirector] = useState('');
  const [newOrgPhone, setNewOrgPhone] = useState('');

  // Doctors (select existing OR enter new inline)
  const [docMode, setDocMode] = useState<'existing' | 'new'>('existing');
  const [draftDoctors, setDraftDoctors] = useState<DoctorDraft[]>([]);
  const [pickDoctorId, setPickDoctorId] = useState('');
  const [pickDoctorRole, setPickDoctorRole] = useState<CaseDoctorRole>('attending_physician');
  const [newDocName, setNewDocName] = useState('');
  const [newDocSpecialty, setNewDocSpecialty] = useState('');
  const [newDocPosition, setNewDocPosition] = useState('');
  const [newDocPhone, setNewDocPhone] = useState('');
  const [newDocRole, setNewDocRole] = useState<CaseDoctorRole>('attending_physician');

  // Initial Files queued during creation
  const [pendingFiles, setPendingFiles] = useState<PendingUploadItem[]>([]);

  // Section B
  const [sourceId, setSourceId] = useState('src_complaint');
  const [complaintNumber, setComplaintNumber] = useState('');
  const [complaintDate, setComplaintDate] = useState('');
  const [receivedChannel, setReceivedChannel] = useState('');
  const [receivingDepartment, setReceivingDepartment] = useState('');
  const [emohRegNumber, setEmohRegNumber] = useState('');
  const [emohRegDate, setEmohRegDate] = useState('');
  const [emohReferenceLink, setEmohReferenceLink] = useState('');
  const [specialTaskAuthor, setSpecialTaskAuthor] = useState('');
  const [specialTaskBasis, setSpecialTaskBasis] = useState('');
  const [specialTaskNumber, setSpecialTaskNumber] = useState('');
  const [specialTaskDate, setSpecialTaskDate] = useState('');
  const [specialTaskDescription, setSpecialTaskDescription] = useState('');
  const [startedAt, setStartedAt] = useState(getTbilisiDateISO());
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineSourceNote, setDeadlineSourceNote] = useState('');

  // Section C: Applicant
  const [applicantType, setApplicantType] = useState<'individual' | 'organization'>('individual');
  const [applicantName, setApplicantName] = useState('');
  const [applicantRep, setApplicantRep] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantAddress, setApplicantAddress] = useState('');
  const [applicantPersonalId, setApplicantPersonalId] = useState('');
  const [applicantShowSensitiveId, setApplicantShowSensitiveId] = useState(false);
  const [applicantChannel, setApplicantChannel] = useState<'phone' | 'email' | 'post' | 'emoh' | 'in_person'>('phone');
  const [applicantComment, setApplicantComment] = useState('');

  // Section D: Patients
  const [patients, setPatients] = useState<PatientDraft[]>([
    {
      tempId: 'pat-1',
      fullName: '',
      birthDate: '',
      phone: '',
      email: '',
      address: '',
      personalId: '',
      representative: '',
      isSameAsApplicant: false,
      notes: '',
    },
  ]);

  // Section E: Other Participants
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);

  // Custom fields
  const [customValues, setCustomValues] = useState<Record<string, string | number | boolean | string[] | null>>({});

  // Restore local autosave once on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_LOCAL_KEY);
      if (!saved) return;
      const d = JSON.parse(saved);
      if (d.title) setTitle(d.title);
      if (d.shortSummary) setShortSummary(d.shortSummary);
      if (d.detailedDescription) setDetailedDescription(d.detailedDescription);
      if (d.categoryId) setCategoryId(d.categoryId);
      if (d.priority) setPriority(d.priority);
      if (d.sourceId) setSourceId(d.sourceId);
      if (d.emohRegNumber) setEmohRegNumber(d.emohRegNumber);
      if (d.emohRegDate) setEmohRegDate(d.emohRegDate);
      if (d.applicantName) setApplicantName(d.applicantName);
      if (d.applicantPhone) setApplicantPhone(d.applicantPhone);
      if (d.applicantEmail) setApplicantEmail(d.applicantEmail);
      if (d.applicantAddress) setApplicantAddress(d.applicantAddress);
      if (d.orgMode === 'existing' || d.orgMode === 'new') setOrgMode(d.orgMode);
      if (d.primaryOrganizationId) setPrimaryOrganizationId(d.primaryOrganizationId);
      if (d.newOrgName) setNewOrgName(d.newOrgName);
      if (d.newOrgTaxId) setNewOrgTaxId(d.newOrgTaxId);
      if (d.newOrgMunicipality) setNewOrgMunicipality(d.newOrgMunicipality);
      if (d.newOrgAddress) setNewOrgAddress(d.newOrgAddress);
      if (d.newOrgPhone) setNewOrgPhone(d.newOrgPhone);
      if (d.newOrgDirector) setNewOrgDirector(d.newOrgDirector);
      if (Array.isArray(d.draftDoctors)) setDraftDoctors(d.draftDoctors);
      if (Array.isArray(d.patients) && d.patients.length > 0) setPatients(d.patients);
    } catch {
      // ignore corrupted autosave
    }
  }, []);

  // Autosave form progress locally
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_LOCAL_KEY,
          JSON.stringify({
            title,
            shortSummary,
            detailedDescription,
            categoryId,
            priority,
            sourceId,
            emohRegNumber,
            emohRegDate,
            applicantName,
            applicantPhone,
            applicantEmail,
            applicantAddress,
            orgMode,
            primaryOrganizationId,
            newOrgName,
            newOrgTaxId,
            newOrgMunicipality,
            newOrgAddress,
            newOrgPhone,
            newOrgDirector,
            draftDoctors,
            patients,
          })
        );
      } catch {
        // ignore quota issues
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [
    title,
    shortSummary,
    detailedDescription,
    categoryId,
    priority,
    sourceId,
    emohRegNumber,
    emohRegDate,
    applicantName,
    applicantPhone,
    applicantEmail,
    applicantAddress,
    orgMode,
    primaryOrganizationId,
    newOrgName,
    newOrgTaxId,
    newOrgMunicipality,
    newOrgAddress,
    newOrgPhone,
    newOrgDirector,
    draftDoctors,
    patients,
  ]);

  if (!snapshot || !currentUser) return null;
  if (!can('create')) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
        თქვენს როლს არ აქვს ახალი ქეისის შექმნის უფლება.
      </div>
    );
  }

  const { settings } = snapshot;

  const toggleSameAsApplicant = (tempId: string, checked: boolean) => {
    setPatients((prev) =>
      prev.map((p) => {
        if (p.tempId !== tempId) return p;
        if (checked) {
          return {
            ...p,
            isSameAsApplicant: true,
            fullName: applicantName,
            phone: applicantPhone,
            email: applicantEmail,
            address: applicantAddress,
            personalId: applicantPersonalId,
            representative: applicantRep,
          };
        }
        // When unchecked, keep current values editable independently!
        return { ...p, isSameAsApplicant: false };
      })
    );
  };

  const handleSave = async (asDraft: boolean) => {
    setValidationError('');
    if (!asDraft) {
      const check = casePublishSchema.safeParse({
        title,
        shortSummary,
        startedAt,
        assignedTo: assignedTo || currentUser.id,
      });
      if (!check.success) {
        const msg = check.error.issues[0]?.message || 'შეავსეთ სავალდებულო ველები.';
        setValidationError(msg);
        setStepIdx(0);
        return;
      }

      // Check required custom fields on case_basic / case_emoh / case_participants
      const reqCustom = settings.customFields.filter(
        (cf) =>
          cf.active &&
          cf.required &&
          ['case_basic', 'case_emoh', 'case_participants'].includes(cf.targetPage)
      );
      for (const cf of reqCustom) {
        const val = customValues[cf.id];
        if (val === undefined || val === null || val === '') {
          setValidationError(`შეავსეთ სავალდებულო მორგებული ველი: ${cf.label}`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      // Include any doctor currently filled in inputs even if user didn't click "+ სიაში დამატება"
      const combinedDoctors: DoctorDraft[] = [...draftDoctors];
      if (docMode === 'existing' && pickDoctorId) {
        const picked = snapshot.doctors.find((d) => d.id === pickDoctorId);
        if (picked && !combinedDoctors.some((d) => d.existingDoctorId === picked.id)) {
          combinedDoctors.push({
            tempId: generateUuid(),
            existingDoctorId: picked.id,
            displayName: picked.fullName,
            specialty: picked.specialty,
            roleInCase: pickDoctorRole,
          });
        }
      } else if (docMode === 'new' && newDocName.trim()) {
        combinedDoctors.push({
          tempId: generateUuid(),
          displayName: newDocName.trim(),
          specialty: newDocSpecialty.trim() || undefined,
          position: newDocPosition.trim() || undefined,
          phone: newDocPhone.trim() || undefined,
          roleInCase: newDocRole,
        });
      }

      const created = await dataRepo.createOrPublishCase({
        caseData: {
          title: title.trim() || 'მონახაზი ქეისი',
          shortSummary: shortSummary.trim() || 'მონახაზი',
          detailedDescription: detailedDescription.trim(),
          categoryId,
          priority,
          confidentiality,
          statusId,
          assignedTo: assignedTo || currentUser.id,
          collaboratorIds,
          supervisorId: supervisorId || undefined,
          tags,
          linkedCaseIds,
          sourceId,
          complaintNumber: complaintNumber.trim() || undefined,
          complaintDate: complaintDate || undefined,
          receivedChannel: receivedChannel.trim() || undefined,
          receivingDepartment: receivingDepartment.trim() || undefined,
          emohRegNumber: emohRegNumber.trim() || undefined,
          emohRegDate: emohRegDate || undefined,
          emohReferenceLink: emohReferenceLink.trim() || undefined,
          specialTaskAuthor: specialTaskAuthor.trim() || undefined,
          specialTaskBasis: specialTaskBasis.trim() || undefined,
          specialTaskNumber: specialTaskNumber.trim() || undefined,
          specialTaskDate: specialTaskDate || undefined,
          specialTaskDescription: specialTaskDescription.trim() || undefined,
          startedAt: startedAt || getTbilisiDateISO(),
          deadlineDate: deadlineDate || undefined,
          deadlineSourceNote: deadlineSourceNote.trim() || undefined,
          primaryOrganizationId: orgMode === 'existing' ? primaryOrganizationId || undefined : undefined,
          primaryBranchName: orgMode === 'existing' ? primaryBranchName || undefined : newOrgBranch.trim() || undefined,
          needsReview: 'undecided',
          checklistAnswers: [],
          isDraft: asDraft,
        },
        inlineOrganization:
          orgMode === 'new' && newOrgName.trim()
            ? {
                legalName: newOrgName.trim(),
                taxId: newOrgTaxId.trim() || undefined,
                municipality: newOrgMunicipality.trim() || 'თბილისი',
                address: newOrgAddress.trim() || undefined,
                branchName: newOrgBranch.trim() || undefined,
                directorName: newOrgDirector.trim() || undefined,
                phone: newOrgPhone.trim() || undefined,
              }
            : undefined,
        doctors: combinedDoctors.map((d) => ({
          existingDoctorId: d.existingDoctorId,
          newDoctor: d.existingDoctorId
            ? undefined
            : {
                fullName: d.displayName,
                specialty: d.specialty,
                position: d.position,
                phone: d.phone,
              },
          roleInCase: d.roleInCase,
        })),
        applicant: applicantName.trim()
          ? {
              type: applicantType,
              name: applicantName.trim(),
              representativeName: applicantRep.trim() || undefined,
              phone: applicantPhone.trim() || undefined,
              email: applicantEmail.trim() || undefined,
              address: applicantAddress.trim() || undefined,
              personalId: applicantPersonalId.trim() || undefined,
              preferredChannel: applicantChannel,
              comment: applicantComment.trim() || undefined,
            }
          : undefined,
        patients: patients
          .filter((p) => p.fullName.trim())
          .map((p) => ({
            fullName: p.fullName.trim(),
            birthDate: p.birthDate || undefined,
            phone: p.phone.trim() || undefined,
            email: p.email.trim() || undefined,
            address: p.address.trim() || undefined,
            personalId: p.personalId.trim() || undefined,
            representative: p.representative.trim() || undefined,
            isSameAsApplicant: p.isSameAsApplicant,
            notes: p.notes.trim() || undefined,
          })),
        participants: participants
          .filter((pt) => pt.fullName.trim())
          .map((pt) => ({
            role: pt.role,
            roleLabel: pt.roleLabel.trim() || undefined,
            fullName: pt.fullName.trim(),
            phone: pt.phone.trim() || undefined,
            email: pt.email.trim() || undefined,
            notes: pt.notes.trim() || undefined,
          })),
        customValues,
        user: currentUser,
      });

      if (pendingFiles.length > 0) {
        await uploadAttachmentBatch({
          items: pendingFiles,
          caseId: created.id,
          linkedEntityType: 'case',
          linkedEntityId: created.id,
          user: currentUser,
        });
      }

      localStorage.removeItem(DRAFT_LOCAL_KEY);
      await refreshData();
      notify(
        asDraft
          ? `მონახაზი შენახულია (${created.caseNumber})`
          : `ქეისი დარეგისტრირდა ნომრით ${created.caseNumber}`,
        'success'
      );
      navigate('case_detail', { caseId: created.id });
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'შენახვა ვერ მოხერხდა.');
    } finally {
      setSubmitting(false);
    }
  };

  const addExistingDoctorToDraft = () => {
    if (!pickDoctorId) return;
    const doc = snapshot.doctors.find((d) => d.id === pickDoctorId);
    if (!doc) return;
    if (draftDoctors.some((d) => d.existingDoctorId === doc.id)) {
      notify('ეს ექიმი უკვე დამატებულია ქეისის სიაში.', 'warning');
      return;
    }
    setDraftDoctors((prev) => [
      ...prev,
      {
        tempId: generateUuid(),
        existingDoctorId: doc.id,
        displayName: doc.fullName,
        specialty: doc.specialty,
        phone: doc.phone,
        roleInCase: pickDoctorRole,
      },
    ]);
    setPickDoctorId('');
  };

  const addNewDoctorToDraft = () => {
    if (!newDocName.trim()) {
      notify('მიუთითეთ ექიმის სახელი და გვარი.', 'warning');
      return;
    }
    setDraftDoctors((prev) => [
      ...prev,
      {
        tempId: generateUuid(),
        displayName: newDocName.trim(),
        specialty: newDocSpecialty.trim() || undefined,
        position: newDocPosition.trim() || undefined,
        phone: newDocPhone.trim() || undefined,
        roleInCase: newDocRole,
      },
    ]);
    setNewDocName('');
    setNewDocSpecialty('');
    setNewDocPosition('');
    setNewDocPhone('');
  };

  const selectedOrg = snapshot.organizations.find((o) => o.id === primaryOrganizationId);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ახალი ქეისის რეგისტრაცია</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            შიდა სამუშაო ნომერი ({settings.caseNumberPrefix}-YYYY-XXXXXX) მიენიჭება ავტომატურად. შიდა ნომერი არ არის eMOH-ის ოფიციალური ნომერი.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSave(true)}
            className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            შენახვა როგორც მონახაზი
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSave(false)}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-sky-900 rounded-lg hover:bg-sky-950 whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            {submitting ? 'ინახება...' : 'ქეისის რეგისტრაცია'}
          </button>
        </div>
      </div>

      {validationError && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {validationError}
        </div>
      )}

      {/* Section Stepper */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {SECTIONS.map((sec, idx) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => setStepIdx(idx)}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
              stepIdx === idx
                ? 'bg-sky-900 text-white border-sky-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {sec.title}
          </button>
        ))}
      </div>

      {/* Form Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
        {stepIdx === 0 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
              A. ძირითადი ინფორმაცია
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label htmlFor="case-title" className="block text-xs font-medium text-slate-700 mb-1">
                  საქმის სათაური <span className="text-rose-600">*</span>
                </label>
                <input
                  id="case-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="მაგ: სტაციონარული მკურნალობის ხარისხის შესწავლა"
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="case-short-summary" className="block text-xs font-medium text-slate-700 mb-1">
                  მოკლე შინაარსი / არსი <span className="text-rose-600">*</span>
                </label>
                <input
                  id="case-short-summary"
                  type="text"
                  required
                  value={shortSummary}
                  onChange={(e) => setShortSummary(e.target.value)}
                  placeholder="ქეისის მთავარი არსი ერთ-ორ წინადადებად"
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="case-desc" className="block text-xs font-medium text-slate-700 mb-1">
                  დეტალური აღწერა
                </label>
                <textarea
                  id="case-desc"
                  rows={3}
                  value={detailedDescription}
                  onChange={(e) => setDetailedDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="case-category" className="block text-xs font-medium text-slate-700 mb-1">
                  ქეისის კატეგორია
                </label>
                <select
                  id="case-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {settings.categories.filter((c) => c.active !== false).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="case-priority" className="block text-xs font-medium text-slate-700 mb-1">
                  პრიორიტეტი
                </label>
                <select
                  id="case-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {settings.priorities.filter((p) => p.active !== false).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="case-status" className="block text-xs font-medium text-slate-700 mb-1">
                  საწყისი ეტაპი / სტატუსი
                </label>
                <select
                  id="case-status"
                  value={statusId}
                  onChange={(e) => setStatusId(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {settings.caseStatuses.filter((s) => s.active !== false && !s.isClosedState).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="case-conf" className="block text-xs font-medium text-slate-700 mb-1">
                  კონფიდენციალურობის დონე
                </label>
                <select
                  id="case-conf"
                  value={confidentiality}
                  onChange={(e) => setConfidentiality(e.target.value as ConfidentialityLevel)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="standard">სტანდარტული შიდა</option>
                  <option value="restricted">შეზღუდული წვდომა</option>
                  <option value="strict_medical">განსაკუთრებული სამედიცინო საიდუმლოება</option>
                </select>
              </div>

              <div>
                <label htmlFor="case-assignee" className="block text-xs font-medium text-slate-700 mb-1">
                  პასუხისმგებელი თანამშრომელი <span className="text-rose-600">*</span>
                </label>
                <select
                  id="case-assignee"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {snapshot.users
                    .filter((u) => u.isActive && !u.deletedAt)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.position})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label htmlFor="case-supervisor" className="block text-xs font-medium text-slate-700 mb-1">
                  ზედამხედველი
                </label>
                <select
                  id="case-supervisor"
                  value={supervisorId}
                  onChange={(e) => setSupervisorId(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">არ არის მითითებული</option>
                  {snapshot.users
                    .filter((u) => u.isActive && !u.deletedAt)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                </select>
              </div>

              {/* Clinic: Select existing OR create new inline */}
              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-sky-800" />
                    <span className="text-xs font-semibold text-slate-900">
                      კლინიკა / სამედიცინო დაწესებულება
                    </span>
                  </div>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setOrgMode('existing')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        orgMode === 'existing' ? 'bg-sky-900 text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      არსებულიდან არჩევა
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrgMode('new')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        orgMode === 'new' ? 'bg-sky-900 text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      + ახალი კლინიკის შეყვანა
                    </button>
                  </div>
                </div>

                {orgMode === 'existing' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <SearchableSelect
                      id="case-clinic"
                      label="შენახული კლინიკები"
                      value={primaryOrganizationId}
                      onChange={(val) => {
                        setPrimaryOrganizationId(val);
                        setPrimaryBranchName('');
                      }}
                      options={snapshot.organizations
                        .filter((o) => !o.deletedAt)
                        .map((o) => ({
                          value: o.id,
                          label: o.legalName,
                          sublabel: `${o.municipality}${o.taxId ? ` · ს/კ ${o.taxId}` : ''}`,
                        }))}
                      placeholder="აირჩიეთ კლინიკა ან გადართეთ ახლის შეყვანაზე..."
                    />
                    {selectedOrg && selectedOrg.branches.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">ფილიალი</label>
                        <select
                          value={primaryBranchName}
                          onChange={(e) => setPrimaryBranchName(e.target.value)}
                          className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        >
                          <option value="">ძირითადი მისამართი</option>
                          {selectedOrg.branches.map((b) => (
                            <option key={b.id} value={b.name}>
                              {b.name} — {b.address}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[11px] text-sky-900">
                      შეყვანილი კლინიკა ავტომატურად შეინახება ცნობარში და შემდეგ ქეისებში სიიდან აირჩევა.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        placeholder="კლინიკის დასახელება *"
                        value={newOrgName}
                        onChange={(e) => setNewOrgName(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="საიდენტიფიკაციო კოდი (ს/კ)"
                        value={newOrgTaxId}
                        onChange={(e) => setNewOrgTaxId(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                      />
                      <input
                        type="text"
                        placeholder="ქალაქი / მუნიციპალიტეტი"
                        value={newOrgMunicipality}
                        onChange={(e) => setNewOrgMunicipality(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="მისამართი"
                        value={newOrgAddress}
                        onChange={(e) => setNewOrgAddress(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="ფილიალი (არასავალდებულო)"
                        value={newOrgBranch}
                        onChange={(e) => setNewOrgBranch(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="დირექტორი / საკონტაქტო პირი"
                        value={newOrgDirector}
                        onChange={(e) => setNewOrgDirector(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="tel"
                        placeholder="კლინიკის ტელეფონი"
                        value={newOrgPhone}
                        onChange={(e) => setNewOrgPhone(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Doctors: Select existing OR enter new inline */}
              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-teal-700" />
                    <span className="text-xs font-semibold text-slate-900">
                      საქმეში მონაწილე ექიმ(ებ)ი
                    </span>
                  </div>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setDocMode('existing')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        docMode === 'existing' ? 'bg-sky-900 text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      არსებული ექიმი
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocMode('new')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        docMode === 'new' ? 'bg-sky-900 text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      + ახალი ექიმის შეყვანა
                    </button>
                  </div>
                </div>

                {draftDoctors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {draftDoctors.map((d) => (
                      <div
                        key={d.tempId}
                        className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-xs"
                      >
                        <strong className="text-slate-900">{d.displayName}</strong>
                        {d.specialty && <span className="text-slate-500">({d.specialty})</span>}
                        <span className="text-sky-800 font-medium">{DOC_ROLE_LABELS[d.roleInCase]}</span>
                        <button
                          type="button"
                          onClick={() => setDraftDoctors((prev) => prev.filter((x) => x.tempId !== d.tempId))}
                          className="text-rose-700 hover:underline"
                          aria-label={`ექიმის მოხსნა: ${d.displayName}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {docMode === 'existing' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                    <div className="sm:col-span-6">
                      <SearchableSelect
                        id="case-doctor-select"
                        label="შენახული ექიმები"
                        value={pickDoctorId}
                        onChange={setPickDoctorId}
                        options={snapshot.doctors
                          .filter((d) => !d.deletedAt)
                          .map((d) => ({
                            value: d.id,
                            label: d.fullName,
                            sublabel: d.specialty,
                          }))}
                        placeholder="აირჩიეთ ექიმი ან გადართეთ ახალზე..."
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-xs font-medium text-slate-700 mb-1">როლი საქმეში</label>
                      <select
                        value={pickDoctorRole}
                        onChange={(e) => setPickDoctorRole(e.target.value as CaseDoctorRole)}
                        className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        {Object.entries(DOC_ROLE_LABELS).map(([k, lbl]) => (
                          <option key={k} value={k}>
                            {lbl}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        disabled={!pickDoctorId}
                        onClick={addExistingDoctorToDraft}
                        className="w-full min-h-[40px] rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-medium text-sky-900 hover:bg-sky-50 disabled:opacity-40"
                      >
                        + დამატება
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-[11px] text-sky-900">
                      ახალი ექიმი ავტომატურად შეინახება ცნობარში და დაუკავშირდება ამ ქეისს.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        placeholder="ექიმის სახელი და გვარი *"
                        value={newDocName}
                        onChange={(e) => setNewDocName(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="სპეციალობა (მაგ: ქირურგი)"
                        value={newDocSpecialty}
                        onChange={(e) => setNewDocSpecialty(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="პოზიცია / განყოფილება"
                        value={newDocPosition}
                        onChange={(e) => setNewDocPosition(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="tel"
                        placeholder="ტელეფონი"
                        value={newDocPhone}
                        onChange={(e) => setNewDocPhone(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <select
                        value={newDocRole}
                        onChange={(e) => setNewDocRole(e.target.value as CaseDoctorRole)}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                      >
                        {Object.entries(DOC_ROLE_LABELS).map(([k, lbl]) => (
                          <option key={k} value={k}>
                            {lbl}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={addNewDoctorToDraft}
                        className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        კიდევ ერთი ექიმის დამატება სიაში
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Initial Files Upload right during Case Creation */}
              <div className="md:col-span-2">
                <PendingFilePicker
                  items={pendingFiles}
                  onChange={setPendingFiles}
                  defaultCategory="საჩივარი / საწყისი დოკუმენტი"
                  label="ქეისის საწყისი დოკუმენტები და ფაილები (ატვირთვა რეგისტრაციისთანავე)"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  შიდა ტეგები (მძიმით გამოყოფილი)
                </label>
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="მაგ: გადაუდებელი, სტაციონარი, რეანიმაცია"
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              {snapshot.users.length > 1 && (
                <div className="md:col-span-2">
                  <span className="block text-xs font-medium text-slate-700 mb-1">თანამონაწილე თანამშრომლები</span>
                  <div className="flex flex-wrap gap-2">
                    {snapshot.users
                      .filter((u) => u.isActive && u.id !== assignedTo)
                      .map((u) => (
                        <label
                          key={u.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={collaboratorIds.includes(u.id)}
                            onChange={(e) =>
                              setCollaboratorIds((prev) =>
                                e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                              )
                            }
                          />
                          <span>{u.fullName}</span>
                        </label>
                      ))}
                  </div>
                </div>
              )}

              {snapshot.cases.filter((c) => !c.deletedAt && !c.isDraft).length > 0 && (
                <div className="md:col-span-2">
                  <span className="block text-xs font-medium text-slate-700 mb-1">დაკავშირებული ძველი ქეისები</span>
                  <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto p-2 rounded-lg border border-slate-200 bg-slate-50">
                    {snapshot.cases
                      .filter((c) => !c.deletedAt && !c.isDraft)
                      .map((c) => (
                        <label key={c.id} className="inline-flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={linkedCaseIds.includes(c.id)}
                            onChange={(e) =>
                              setLinkedCaseIds((prev) =>
                                e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)
                              )
                            }
                          />
                          <span className="font-mono text-sky-900">{c.caseNumber}</span>
                          <span className="text-slate-600 truncate max-w-[160px]">{c.title}</span>
                        </label>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <CustomFieldsSection
              targetPage="case_basic"
              definitions={settings.customFields}
              values={customValues}
              onChange={(fid, val) => setCustomValues((p) => ({ ...p, [fid]: val }))}
            />
          </div>
        )}

        {stepIdx === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
              B. საქმის წარმოშობა და eMOH
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">საქმის საფუძველი</label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {settings.sources.filter((s) => s.active !== false).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">საქმის დაწყების თარიღი *</label>
                <input
                  type="date"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">საჩივრის / წერილის ნომერი</label>
                <input
                  type="text"
                  value={complaintNumber}
                  onChange={(e) => setComplaintNumber(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">საჩივრის / წერილის თარიღი</label>
                <input
                  type="date"
                  value={complaintDate}
                  onChange={(e) => setComplaintDate(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">მიღების არხი</label>
                <input
                  type="text"
                  value={receivedChannel}
                  onChange={(e) => setReceivedChannel(e.target.value)}
                  placeholder="მაგ: eMOH, ელფოსტა, კანცელარია"
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">მიმღები უწყება</label>
                <input
                  type="text"
                  value={receivingDepartment}
                  onChange={(e) => setReceivingDepartment(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              {/* eMOH Manual Entry */}
              <div className="md:col-span-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3.5 space-y-3">
                <p className="text-xs font-semibold text-sky-950">
                  eMOH-ის ხელით შეყვანილი რეკვიზიტები (არ არის ავტომატური ინტეგრაცია)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="emoh-num" className="block text-xs font-medium text-slate-700 mb-1">
                      eMOH რეგისტრაციის №
                    </label>
                    <input
                      id="emoh-num"
                      type="text"
                      value={emohRegNumber}
                      onChange={(e) => setEmohRegNumber(e.target.value)}
                      className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="emoh-date" className="block text-xs font-medium text-slate-700 mb-1">
                      eMOH რეგისტრაციის თარიღი
                    </label>
                    <input
                      id="emoh-date"
                      type="date"
                      value={emohRegDate}
                      onChange={(e) => setEmohRegDate(e.target.value)}
                      className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">ბმული / მითითება</label>
                    <input
                      type="text"
                      value={emohReferenceLink}
                      onChange={(e) => setEmohReferenceLink(e.target.value)}
                      placeholder="შიდა მითითება"
                      className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Special Task Fields */}
              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
                <p className="text-xs font-semibold text-slate-800">სპეციალური დავალების რეკვიზიტები (არსებობის შემთხვევაში)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="დავალების ავტორი"
                    value={specialTaskAuthor}
                    onChange={(e) => setSpecialTaskAuthor(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="დავალების საფუძველი"
                    value={specialTaskBasis}
                    onChange={(e) => setSpecialTaskBasis(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="დავალების ნომერი"
                    value={specialTaskNumber}
                    onChange={(e) => setSpecialTaskNumber(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    aria-label="დავალების თარიღი"
                    value={specialTaskDate}
                    onChange={(e) => setSpecialTaskDate(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <textarea
                    rows={2}
                    placeholder="სპეციალური დავალების აღწერა"
                    value={specialTaskDescription}
                    onChange={(e) => setSpecialTaskDescription(e.target.value)}
                    className="sm:col-span-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  სამუშაო ვადა (მომხმარებლის მიერ განსაზღვრული)
                </label>
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ვადის წყარო და შენიშვნა</label>
                <input
                  type="text"
                  value={deadlineSourceNote}
                  onChange={(e) => setDeadlineSourceNote(e.target.value)}
                  placeholder="მაგ: მითითებულია ხელმძღვანელის დავალებაში"
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <CustomFieldsSection
              targetPage="case_emoh"
              definitions={settings.customFields}
              values={customValues}
              onChange={(fid, val) => setCustomValues((p) => ({ ...p, [fid]: val }))}
            />
          </div>
        )}

        {stepIdx === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
              C. განმცხადებელი
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">განმცხადებლის ტიპი</label>
                <select
                  value={applicantType}
                  onChange={(e) => setApplicantType(e.target.value as 'individual' | 'organization')}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="individual">ფიზიკური პირი</option>
                  <option value="organization">ორგანიზაცია / უწყება</option>
                </select>
              </div>
              <div>
                <label htmlFor="applicant-name" className="block text-xs font-medium text-slate-700 mb-1">
                  სახელი და გვარი / სრული დასახელება
                </label>
                <input
                  id="applicant-name"
                  type="text"
                  value={applicantName}
                  onChange={(e) => setApplicantName(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">წარმომადგენლის სახელი</label>
                <input
                  type="text"
                  value={applicantRep}
                  onChange={(e) => setApplicantRep(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="applicant-phone" className="block text-xs font-medium text-slate-700 mb-1">
                  ტელეფონი
                </label>
                <input
                  id="applicant-phone"
                  type="tel"
                  value={applicantPhone}
                  onChange={(e) => setApplicantPhone(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ელფოსტა</label>
                <input
                  type="email"
                  value={applicantEmail}
                  onChange={(e) => setApplicantEmail(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">კომუნიკაციის სასურველი არხი</label>
                <select
                  value={applicantChannel}
                  onChange={(e) => setApplicantChannel(e.target.value as typeof applicantChannel)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="phone">ტელეფონი</option>
                  <option value="email">ელფოსტა</option>
                  <option value="post">ფოსტა</option>
                  <option value="emoh">eMOH</option>
                  <option value="in_person">პირადი ჩაბარება</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">მისამართი</label>
                <input
                  type="text"
                  value={applicantAddress}
                  onChange={(e) => setApplicantAddress(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applicantShowSensitiveId}
                    onChange={(e) => setApplicantShowSensitiveId(e.target.checked)}
                  />
                  <span>პირადი ნომრის მითითება (მხოლოდ უფლებამოსილი და აუცილებელი საჭიროებისას)</span>
                </label>
                {applicantShowSensitiveId && (
                  <input
                    type="text"
                    value={applicantPersonalId}
                    onChange={(e) => setApplicantPersonalId(e.target.value)}
                    placeholder="11-ნიშნა პირადი ნომერი"
                    className="mt-2 w-full sm:w-64 min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">დამატებითი კომენტარი</label>
                <textarea
                  rows={2}
                  value={applicantComment}
                  onChange={(e) => setApplicantComment(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {stepIdx === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-base font-semibold text-slate-900">D. პაციენტი</h2>
              <button
                type="button"
                onClick={() =>
                  setPatients((p) => [
                    ...p,
                    {
                      tempId: generateUuid(),
                      fullName: '',
                      birthDate: '',
                      phone: '',
                      email: '',
                      address: '',
                      personalId: '',
                      representative: '',
                      isSameAsApplicant: false,
                      notes: '',
                    },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-sky-800 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                კიდევ ერთი პაციენტის დამატება
              </button>
            </div>

            {patients.map((pat, index) => (
              <div key={pat.tempId} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-sky-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pat.isSameAsApplicant}
                      onChange={(e) => toggleSameAsApplicant(pat.tempId, e.target.checked)}
                    />
                    <span>განმცხადებელი იგივე პირია</span>
                  </label>
                  {patients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPatients((prev) => prev.filter((x) => x.tempId !== pat.tempId))}
                      className="text-xs text-rose-700 hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      წაშლა
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      პაციენტის სახელი და გვარი {index === 0 ? '' : `(#${index + 1})`}
                    </label>
                    <input
                      type="text"
                      value={pat.fullName}
                      onChange={(e) =>
                        setPatients((prev) =>
                          prev.map((x) => (x.tempId === pat.tempId ? { ...x, fullName: e.target.value } : x))
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      დაბადების თარიღი (სურვილისამებრ)
                    </label>
                    <input
                      type="date"
                      value={pat.birthDate}
                      onChange={(e) =>
                        setPatients((prev) =>
                          prev.map((x) => (x.tempId === pat.tempId ? { ...x, birthDate: e.target.value } : x))
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">ტელეფონი</label>
                    <input
                      type="tel"
                      value={pat.phone}
                      onChange={(e) =>
                        setPatients((prev) =>
                          prev.map((x) => (x.tempId === pat.tempId ? { ...x, phone: e.target.value } : x))
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">წარმომადგენელი</label>
                    <input
                      type="text"
                      value={pat.representative}
                      onChange={(e) =>
                        setPatients((prev) =>
                          prev.map((x) =>
                            x.tempId === pat.tempId ? { ...x, representative: e.target.value } : x
                          )
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">მისამართი</label>
                    <input
                      type="text"
                      value={pat.address}
                      onChange={(e) =>
                        setPatients((prev) =>
                          prev.map((x) => (x.tempId === pat.tempId ? { ...x, address: e.target.value } : x))
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {stepIdx === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-base font-semibold text-slate-900">E. სხვა მონაწილეები</h2>
              <button
                type="button"
                onClick={() =>
                  setParticipants((p) => [
                    ...p,
                    {
                      tempId: generateUuid(),
                      role: 'witness',
                      roleLabel: '',
                      fullName: '',
                      phone: '',
                      email: '',
                      notes: '',
                    },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-sky-800 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                მონაწილის დამატება
              </button>
            </div>

            {participants.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">
                დამატებითი მონაწილეები (მომჩივნის წარმომადგენელი, მოწმე, დაზარალებული და სხვ.) არ არის დამატებული.
              </p>
            ) : (
              participants.map((pt) => (
                <div key={pt.tempId} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select
                      value={pt.role}
                      onChange={(e) =>
                        setParticipants((prev) =>
                          prev.map((x) =>
                            x.tempId === pt.tempId
                              ? { ...x, role: e.target.value as CaseParticipant['role'] }
                              : x
                          )
                        )
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="complainant_rep">მომჩივნის წარმომადგენელი</option>
                      <option value="witness">მოწმე / საკონტაქტო პირი</option>
                      <option value="victim">დაზარალებული</option>
                      <option value="interested_party">სხვა დაინტერესებული მხარე</option>
                      <option value="other">სხვა</option>
                    </select>
                    <input
                      type="text"
                      placeholder="სახელი და გვარი"
                      value={pt.fullName}
                      onChange={(e) =>
                        setParticipants((prev) =>
                          prev.map((x) => (x.tempId === pt.tempId ? { ...x, fullName: e.target.value } : x))
                        )
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      type="tel"
                      placeholder="ტელეფონი / საკონტაქტო"
                      value={pt.phone}
                      onChange={(e) =>
                        setParticipants((prev) =>
                          prev.map((x) => (x.tempId === pt.tempId ? { ...x, phone: e.target.value } : x))
                        )
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      placeholder="შენიშვნა"
                      value={pt.notes}
                      onChange={(e) =>
                        setParticipants((prev) =>
                          prev.map((x) => (x.tempId === pt.tempId ? { ...x, notes: e.target.value } : x))
                        )
                      }
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setParticipants((prev) => prev.filter((x) => x.tempId !== pt.tempId))}
                      className="text-xs text-rose-700 hover:underline px-2 py-1"
                    >
                      წაშლა
                    </button>
                  </div>
                </div>
              ))
            )}

            <CustomFieldsSection
              targetPage="case_participants"
              definitions={settings.customFields}
              values={customValues}
              onChange={(fid, val) => setCustomValues((p) => ({ ...p, [fid]: val }))}
            />
          </div>
        )}

        {/* Section Navigation Footer */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            disabled={stepIdx === 0}
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            className="min-h-[40px] inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            წინა სექცია
          </button>

          {stepIdx < SECTIONS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStepIdx((i) => Math.min(SECTIONS.length - 1, i + 1))}
              className="min-h-[40px] inline-flex items-center gap-1 px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg hover:bg-sky-900"
            >
              შემდეგი სექცია
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSave(false)}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800"
            >
              <Check className="w-4 h-4" />
              დასრულება და რეგისტრაცია
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
