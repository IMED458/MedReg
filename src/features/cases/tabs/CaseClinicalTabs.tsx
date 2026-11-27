import React, { useState } from 'react';
import { Building2, CheckSquare, Plus, Stethoscope, Users } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { dataRepo } from '../../../repositories/DataRepository';
import {
  ActPrepStatus,
  CaseDoctorRole,
  DoctorExplanationRecord,
  MedicalCase,
  Order,
  Patient,
  SeizureStatus,
  Visit,
  VisitStatus,
} from '../../../models/types';
import { formatGeorgianDate, generateUuid, getTbilisiDateISO, maskPersonalId } from '../../../utils/caseLogic';
import {
  AttachmentList,
  FieldCommentButton,
  FileUploader,
  SearchableSelect,
  StatusLabel,
} from '../../../components/ui/CommonUI';

const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  planned: 'დაგეგმილი',
  postponed: 'გადადებული',
  in_progress: 'მიმდინარეობს',
  completed: 'შედგა',
  cancelled: 'გაუქმდა',
};

const SEIZURE_LABELS: Record<SeizureStatus, string> = {
  yes: 'დიახ (სრულად)',
  no: 'არა',
  partial: 'ნაწილობრივ',
  unknown: 'ჯერ უცნობია',
};

export const CaseParticipantsTab: React.FC<{ medicalCase: MedicalCase }> = ({ medicalCase }) => {
  const { snapshot, currentUser, refreshData, notify, can, revealSensitive, setRevealSensitive } = useApp();
  const [editingApp, setEditingApp] = useState(false);
  const [addingPat, setAddingPat] = useState(false);
  const [editingPatId, setEditingPatId] = useState<string | null>(null);

  const applicant = snapshot?.applicants.find((a) => a.caseId === medicalCase.id && !a.deletedAt);
  const patients = snapshot?.patients.filter((p) => p.caseId === medicalCase.id && !p.deletedAt) || [];
  const participants = snapshot?.caseParticipants.filter((p) => p.caseId === medicalCase.id && !p.deletedAt) || [];

  const [appName, setAppName] = useState(applicant?.name || '');
  const [appPhone, setAppPhone] = useState(applicant?.phone || '');
  const [appEmail, setAppEmail] = useState(applicant?.email || '');
  const [appAddress, setAppAddress] = useState(applicant?.address || '');
  const [appPersonalId, setAppPersonalId] = useState(applicant?.personalId || '');

  const [patForm, setPatForm] = useState({
    fullName: '',
    birthDate: '',
    phone: '',
    address: '',
    personalId: '',
    representative: '',
    isSameAsApplicant: false,
    notes: '',
  });

  const [partForm, setPartForm] = useState({
    role: 'witness' as 'complainant_rep' | 'witness' | 'victim' | 'interested_party' | 'other',
    fullName: '',
    phone: '',
    notes: '',
  });

  if (!snapshot || !currentUser) return null;
  const editable = can('edit');
  const canViewSensitive = can('view_sensitive');

  const saveApplicant = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    await dataRepo.addApplicantOrUpdate(
      {
        id: applicant?.id || generateUuid(),
        caseId: medicalCase.id,
        type: applicant?.type || 'individual',
        name: appName.trim(),
        phone: appPhone.trim(),
        email: appEmail.trim(),
        address: appAddress.trim(),
        personalId: appPersonalId.trim(),
        createdAt: applicant?.createdAt || now,
        updatedAt: now,
        createdBy: applicant?.createdBy || currentUser.id,
        updatedBy: currentUser.id,
      },
      currentUser
    );
    setEditingApp(false);
    await refreshData();
    notify('განმცხადებლის მონაცემები შენახულია.', 'success');
  };

  const startEditPatient = (p: Patient) => {
    setEditingPatId(p.id);
    setPatForm({
      fullName: p.fullName,
      birthDate: p.birthDate || '',
      phone: p.phone || '',
      address: p.address || '',
      personalId: p.personalId || '',
      representative: p.representative || '',
      isSameAsApplicant: p.isSameAsApplicant,
      notes: p.notes || '',
    });
    setAddingPat(true);
  };

  const handleTogglePatSame = (checked: boolean) => {
    if (checked && applicant) {
      setPatForm((prev) => ({
        ...prev,
        isSameAsApplicant: true,
        fullName: applicant.name,
        phone: applicant.phone || '',
        address: applicant.address || '',
        personalId: applicant.personalId || '',
      }));
    } else {
      setPatForm((prev) => ({ ...prev, isSameAsApplicant: false }));
    }
  };

  const savePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patForm.fullName.trim()) return;
    const now = new Date().toISOString();
    const existing = patients.find((p) => p.id === editingPatId);
    await dataRepo.savePatient(
      {
        id: existing?.id || generateUuid(),
        caseId: medicalCase.id,
        fullName: patForm.fullName.trim(),
        birthDate: patForm.birthDate || undefined,
        phone: patForm.phone.trim() || undefined,
        address: patForm.address.trim() || undefined,
        personalId: patForm.personalId.trim() || undefined,
        representative: patForm.representative.trim() || undefined,
        isSameAsApplicant: patForm.isSameAsApplicant,
        applicantId: patForm.isSameAsApplicant ? applicant?.id : undefined,
        notes: patForm.notes.trim() || undefined,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        createdBy: existing?.createdBy || currentUser.id,
        updatedBy: currentUser.id,
      },
      currentUser
    );
    setAddingPat(false);
    setEditingPatId(null);
    await refreshData();
    notify('პაციენტის ჩანაწერი შენახულია.', 'success');
  };

  const addParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partForm.fullName.trim()) return;
    const now = new Date().toISOString();
    await dataRepo.saveParticipant(
      {
        id: generateUuid(),
        caseId: medicalCase.id,
        role: partForm.role,
        fullName: partForm.fullName.trim(),
        phone: partForm.phone.trim() || undefined,
        notes: partForm.notes.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
      },
      currentUser
    );
    setPartForm({ role: 'witness', fullName: '', phone: '', notes: '' });
    await refreshData();
    notify('მონაწილე დაემატა.', 'success');
  };

  return (
    <div className="space-y-5">
      {canViewSensitive && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setRevealSensitive(!revealSensitive)}
            className="text-xs font-medium text-sky-800 hover:underline"
          >
            {revealSensitive ? 'პირადი ნომრების დაფარვა' : 'პირადი ნომრების ჩვენება'}
          </button>
        </div>
      )}

      {/* Applicant */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">განმცხადებელი</h3>
            <FieldCommentButton caseId={medicalCase.id} fieldKey="applicant" fieldLabel="განმცხადებელი" />
          </div>
          {editable && (
            <button
              type="button"
              onClick={() => {
                setAppName(applicant?.name || '');
                setAppPhone(applicant?.phone || '');
                setAppEmail(applicant?.email || '');
                setAppAddress(applicant?.address || '');
                setAppPersonalId(applicant?.personalId || '');
                setEditingApp((p) => !p);
              }}
              className="text-xs font-medium text-sky-800 hover:underline"
            >
              {editingApp ? 'გაუქმება' : applicant ? 'რედაქტირება' : 'დამატება'}
            </button>
          )}
        </div>

        {editingApp ? (
          <form onSubmit={saveApplicant} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <input
              type="text"
              required
              placeholder="სახელი და გვარი / ორგანიზაცია"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="tel"
              placeholder="ტელეფონი"
              value={appPhone}
              onChange={(e) => setAppPhone(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="email"
              placeholder="ელფოსტა"
              value={appEmail}
              onChange={(e) => setAppEmail(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="მისამართი"
              value={appAddress}
              onChange={(e) => setAppAddress(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            {canViewSensitive && (
              <input
                type="text"
                placeholder="პირადი ნომერი (არასავალდებულო)"
                value={appPersonalId}
                onChange={(e) => setAppPersonalId(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            )}
            <div className="sm:col-span-2 flex justify-end">
              <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
                შენახვა
              </button>
            </div>
          </form>
        ) : applicant ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
            <p><span className="text-slate-500">სახელი:</span> <strong>{applicant.name}</strong></p>
            <p><span className="text-slate-500">ტელეფონი:</span> {applicant.phone || '—'}</p>
            <p><span className="text-slate-500">ელფოსტა:</span> {applicant.email || '—'}</p>
            <p><span className="text-slate-500">მისამართი:</span> {applicant.address || '—'}</p>
            <p>
              <span className="text-slate-500">პირადი №:</span>{' '}
              <span className="font-mono">
                {maskPersonalId(applicant.personalId, canViewSensitive, !revealSensitive)}
              </span>
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">განმცხადებელი არ არის მითითებული.</p>
        )}
      </div>

      {/* Patients */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">პაციენტ(ებ)ი</h3>
            <FieldCommentButton caseId={medicalCase.id} fieldKey="patient" fieldLabel="პაციენტი" />
          </div>
          {editable && (
            <button
              type="button"
              onClick={() => {
                setEditingPatId(null);
                setPatForm({
                  fullName: '',
                  birthDate: '',
                  phone: '',
                  address: '',
                  personalId: '',
                  representative: '',
                  isSameAsApplicant: false,
                  notes: '',
                });
                setAddingPat((p) => !p);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-800 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              პაციენტის დამატება
            </button>
          )}
        </div>

        {!canViewSensitive ? (
          <p className="text-xs text-slate-500">პაციენტის მონაცემები დაფარულია თქვენი როლისთვის.</p>
        ) : (
          <>
            {addingPat && (
              <form onSubmit={savePatient} className="rounded-lg border border-sky-200 bg-sky-50/40 p-3.5 space-y-3">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-sky-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={patForm.isSameAsApplicant}
                    onChange={(e) => handleTogglePatSame(e.target.checked)}
                  />
                  <span>განმცხადებელი იგივე პირია</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    placeholder="პაციენტის სახელი და გვარი"
                    value={patForm.fullName}
                    onChange={(e) => setPatForm((p) => ({ ...p, fullName: e.target.value }))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    aria-label="დაბადების თარიღი"
                    value={patForm.birthDate}
                    onChange={(e) => setPatForm((p) => ({ ...p, birthDate: e.target.value }))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="tel"
                    placeholder="ტელეფონი"
                    value={patForm.phone}
                    onChange={(e) => setPatForm((p) => ({ ...p, phone: e.target.value }))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="წარმომადგენელი"
                    value={patForm.representative}
                    onChange={(e) => setPatForm((p) => ({ ...p, representative: e.target.value }))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="მისამართი"
                    value={patForm.address}
                    onChange={(e) => setPatForm((p) => ({ ...p, address: e.target.value }))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="პირადი ნომერი"
                    value={patForm.personalId}
                    onChange={(e) => setPatForm((p) => ({ ...p, personalId: e.target.value }))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAddingPat(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    გაუქმება
                  </button>
                  <button type="submit" className="px-4 py-1.5 text-xs font-medium text-white bg-sky-800 rounded-lg">
                    შენახვა
                  </button>
                </div>
              </form>
            )}

            {patients.length === 0 ? (
              <p className="text-xs text-slate-500">პაციენტი არ არის მითითებული.</p>
            ) : (
              <div className="space-y-2">
                {patients.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-slate-200 p-3 text-xs flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-slate-900">{p.fullName}</strong>
                        {p.isSameAsApplicant && <StatusLabel label="იგივე პირი" tone="sky" compact />}
                      </div>
                      <p className="text-slate-600 mt-0.5">
                        ტელ: {p.phone || '—'} · მისამართი: {p.address || '—'} · პირადი №:{' '}
                        <span className="font-mono">
                          {maskPersonalId(p.personalId, canViewSensitive, !revealSensitive)}
                        </span>
                      </p>
                    </div>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => startEditPatient(p)}
                        className="text-xs font-medium text-sky-800 hover:underline"
                      >
                        რედაქტირება / განცალკევება
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Other Participants */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">სხვა მონაწილეები</h3>
        {participants.length > 0 && (
          <div className="space-y-1.5">
            {participants.map((pt) => (
              <div key={pt.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs flex justify-between">
                <div>
                  <strong>{pt.fullName}</strong> ({pt.role}) · {pt.phone || '—'}
                </div>
                <span className="text-slate-500">{pt.notes}</span>
              </div>
            ))}
          </div>
        )}
        {editable && (
          <form onSubmit={addParticipant} className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2">
            <select
              value={partForm.role}
              onChange={(e) => setPartForm((p) => ({ ...p, role: e.target.value as typeof p.role }))}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
            >
              <option value="complainant_rep">მომჩივნის წარმომადგენელი</option>
              <option value="witness">მოწმე</option>
              <option value="victim">დაზარალებული</option>
              <option value="interested_party">დაინტერესებული მხარე</option>
              <option value="other">სხვა</option>
            </select>
            <input
              type="text"
              placeholder="სახელი და გვარი"
              value={partForm.fullName}
              onChange={(e) => setPartForm((p) => ({ ...p, fullName: e.target.value }))}
              className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
            />
            <input
              type="text"
              placeholder="ტელეფონი / შენიშვნა"
              value={partForm.phone}
              onChange={(e) => setPartForm((p) => ({ ...p, phone: e.target.value }))}
              className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
            />
            <button type="submit" className="px-3 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
              + მონაწილის დამატება
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export const CaseClinicsDoctorsTab: React.FC<{ medicalCase: MedicalCase }> = ({ medicalCase }) => {
  const { snapshot, currentUser, refreshData, notify, can } = useApp();
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [branchName, setBranchName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPos, setContactPos] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [orgNextAction, setOrgNextAction] = useState('');

  const [selectedDocId, setSelectedDocId] = useState('');
  const [docRole, setDocRole] = useState<CaseDoctorRole>('attending_physician');
  const [docNextAction, setDocNextAction] = useState('');

  if (!snapshot || !currentUser) return null;
  const editable = can('edit');

  const linkedOrgs = snapshot.caseOrganizations.filter((l) => l.caseId === medicalCase.id && !l.deletedAt);
  const linkedDocs = snapshot.caseDoctors.filter((l) => l.caseId === medicalCase.id && !l.deletedAt);

  const handleSelectOrg = (orgId: string) => {
    setSelectedOrgId(orgId);
    const org = snapshot.organizations.find((o) => o.id === orgId);
    if (org) {
      setBranchName(org.branches[0]?.name || '');
      setContactName(org.adminResponsible || org.directorName || '');
      setContactPos('ადმინისტრაციული პასუხისმგებელი');
      setContactPhone(org.phone || '');
    }
  };

  const handleLinkOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    const org = snapshot.organizations.find((o) => o.id === selectedOrgId);
    const now = new Date().toISOString();
    await dataRepo.linkOrganizationToCase(
      {
        id: generateUuid(),
        caseId: medicalCase.id,
        organizationId: selectedOrgId,
        branchName: branchName || undefined,
        snapshotAddress: org?.address,
        responsibleContactName: contactName.trim() || undefined,
        responsibleContactPosition: contactPos.trim() || undefined,
        responsibleContactPhone: contactPhone.trim() || undefined,
        nextAction: orgNextAction.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
      },
      currentUser
    );
    setSelectedOrgId('');
    setOrgNextAction('');
    await refreshData();
    notify('კლინიკა დაუკავშირდა ქეისს.', 'success');
  };

  const handleLinkDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId) return;
    const doc = snapshot.doctors.find((d) => d.id === selectedDocId);
    const now = new Date().toISOString();
    await dataRepo.linkDoctorToCase(
      {
        id: generateUuid(),
        caseId: medicalCase.id,
        doctorId: selectedDocId,
        organizationId: doc?.organizationIds[0],
        roleInCase: docRole,
        snapshotPhone: doc?.phone,
        snapshotEmail: doc?.email,
        nextAction: docNextAction.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
      },
      currentUser
    );
    setSelectedDocId('');
    setDocNextAction('');
    await refreshData();
    notify('ექიმი დაუკავშირდა ქეისს.', 'success');
  };

  const DOC_ROLE_LABELS: Record<CaseDoctorRole, string> = {
    attending_physician: 'მკურნალი ექიმი',
    department_head: 'განყოფილების ხელმძღვანელი',
    explanation_author: 'ახსნა-განმარტების ავტორი',
    responsible_person: 'პასუხისმგებელი პირი',
    other: 'სხვა',
  };

  return (
    <div className="space-y-5">
      {/* Clinics */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-sky-800" />
          <h3 className="text-sm font-semibold text-slate-900">დაკავშირებული კლინიკები და პასუხისმგებელი პირები</h3>
        </div>

        {linkedOrgs.length === 0 ? (
          <p className="text-xs text-slate-500">კლინიკა ჯერ არ არის მიბმული.</p>
        ) : (
          <div className="space-y-2">
            {linkedOrgs.map((link) => {
              const org = snapshot.organizations.find((o) => o.id === link.organizationId);
              return (
                <div key={link.id} className="rounded-lg border border-slate-200 p-3 text-xs space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm text-slate-900">{org?.legalName || 'კლინიკა'}</strong>
                    <span className="text-slate-500">ს/კ {org?.taxId || '—'} · ფილიალი: {link.branchName || 'ძირითადი'}</span>
                  </div>
                  <p className="text-slate-600">
                    დირექტორი: {org?.directorName || '—'} | ქეისზე პასუხისმგებელი: <strong>{link.responsibleContactName || '—'}</strong> ({link.responsibleContactPhone || '—'})
                  </p>
                  {link.nextAction && <p className="text-sky-900">შემდეგი მოქმედება: {link.nextAction}</p>}
                </div>
              );
            })}
          </div>
        )}

        {editable && (
          <form onSubmit={handleLinkOrg} className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SearchableSelect
              label="აირჩიეთ კლინიკა ცნობარიდან"
              value={selectedOrgId}
              onChange={handleSelectOrg}
              options={snapshot.organizations
                .filter((o) => !o.deletedAt)
                .map((o) => ({ value: o.id, label: o.legalName, sublabel: o.municipality }))}
            />
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ფილიალი</label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="ფილიალის დასახელება"
                className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <input
              type="text"
              placeholder="კლინიკის პასუხისმგებელი პირი ამ ქეისზე"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="საკონტაქტო ტელეფონი"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="შემდეგი მოქმედება კლინიკასთან"
              value={orgNextAction}
              onChange={(e) => setOrgNextAction(e.target.value)}
              className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="sm:col-span-2 flex justify-end">
              <button type="submit" disabled={!selectedOrgId} className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg disabled:opacity-40">
                + კლინიკის დაკავშირება
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Doctors */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-teal-700" />
          <h3 className="text-sm font-semibold text-slate-900">საქმეში მონაწილე ექიმები / პერსონალი</h3>
        </div>

        {linkedDocs.length === 0 ? (
          <p className="text-xs text-slate-500">ექიმი ჯერ არ არის მიბმული.</p>
        ) : (
          <div className="space-y-2">
            {linkedDocs.map((link) => {
              const doc = snapshot.doctors.find((d) => d.id === link.doctorId);
              return (
                <div key={link.id} className="rounded-lg border border-slate-200 p-3 text-xs flex flex-wrap justify-between gap-2">
                  <div>
                    <strong className="text-sm text-slate-900">{doc?.fullName || 'ექიმი'}</strong>
                    <span className="ml-2 text-slate-500">({doc?.specialty})</span>
                    <p className="text-slate-600 mt-0.5">
                      როლი ქეისში: <strong>{DOC_ROLE_LABELS[link.roleInCase]}</strong> · ტელ: {link.snapshotPhone || doc?.phone || '—'}
                    </p>
                  </div>
                  {link.nextAction && <span className="text-sky-900">შემდეგი: {link.nextAction}</span>}
                </div>
              );
            })}
          </div>
        )}

        {editable && (
          <form onSubmit={handleLinkDoc} className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SearchableSelect
              label="ექიმი ცნობარიდან"
              value={selectedDocId}
              onChange={setSelectedDocId}
              options={snapshot.doctors
                .filter((d) => !d.deletedAt)
                .map((d) => ({ value: d.id, label: d.fullName, sublabel: d.specialty }))}
            />
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">როლი საქმეში</label>
              <select
                value={docRole}
                onChange={(e) => setDocRole(e.target.value as CaseDoctorRole)}
                className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {Object.entries(DOC_ROLE_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">შემდეგი მოქმედება</label>
              <input
                type="text"
                value={docNextAction}
                onChange={(e) => setDocNextAction(e.target.value)}
                placeholder="მაგ: ახსნა-განმარტების მიღება"
                className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button type="submit" disabled={!selectedDocId} className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg disabled:opacity-40">
                + ექიმის დაკავშირება
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export const CaseVisitsTab: React.FC<{ medicalCase: MedicalCase }> = ({ medicalCase }) => {
  const { snapshot, currentUser, refreshData, notify, can } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);

  const [orgId, setOrgId] = useState(medicalCase.primaryOrganizationId || '');
  const [address, setAddress] = useState('');
  const [plannedDateTime, setPlannedDateTime] = useState(`${getTbilisiDateISO()}T11:00`);
  const [purpose, setPurpose] = useState('');
  const [visitTypeId, setVisitTypeId] = useState('vis_onsite');
  const [basis, setBasis] = useState('');
  const [orderId, setOrderId] = useState('');
  const [commissionId, setCommissionId] = useState('');
  const [clinicReps, setClinicReps] = useState('');
  const [status, setStatus] = useState<VisitStatus>('planned');
  const [actPrepStatus, setActPrepStatus] = useState<ActPrepStatus>('not_started');
  const [actNumber, setActNumber] = useState('');
  const [actDate, setActDate] = useState('');
  const [actSignatories, setActSignatories] = useState('');
  const [docSeizureStatus, setDocSeizureStatus] = useState<SeizureStatus>('unknown');
  const [docSeizureDesc, setDocSeizureDesc] = useState('');
  const [docSeizureForm, setDocSeizureForm] = useState<'copy' | 'original' | 'mixed'>('copy');
  const [docReturnDate, setDocReturnDate] = useState('');
  const [explDoctorName, setExplDoctorName] = useState('');
  const [explRequested, setExplRequested] = useState(false);
  const [explReceived, setExplReceived] = useState(false);
  const [explDate, setExplDate] = useState('');

  if (!snapshot || !currentUser) return null;
  const editable = can('edit');
  const visits = snapshot.visits.filter((v) => v.caseId === medicalCase.id && !v.deletedAt);
  const acts = snapshot.inspectionActs.filter((a) => a.caseId === medicalCase.id && !a.deletedAt);
  const caseOrders = snapshot.orders.filter((o) => o.caseId === medicalCase.id && !o.deletedAt);

  const openVisitForm = (v?: Visit) => {
    if (v) {
      setEditingVisit(v);
      setOrgId(v.organizationId || '');
      setAddress(v.address || '');
      setPlannedDateTime(v.plannedDateTime);
      setPurpose(v.purpose);
      setVisitTypeId(v.visitTypeId);
      setBasis(v.basis || '');
      setOrderId(v.orderId || '');
      setCommissionId(v.commissionId || '');
      setClinicReps(v.clinicRepresentatives || '');
      setStatus(v.status);
      setActPrepStatus(v.actPrepStatus);
      setActNumber(v.actNumber || '');
      setActDate(v.actDate || '');
      setActSignatories(v.actSignatories || '');
      setDocSeizureStatus(v.docSeizureStatus);
      setDocSeizureDesc(v.docSeizureDescription || '');
      setDocSeizureForm(v.docSeizureForm || 'copy');
      setDocReturnDate(v.docReturnDate || '');
      const firstExpl = v.doctorExplanations[0];
      setExplDoctorName(firstExpl?.doctorName || '');
      setExplRequested(Boolean(firstExpl?.requested));
      setExplReceived(Boolean(firstExpl?.received));
      setExplDate(firstExpl?.receivedDate || '');
      setShowAdd(true);
    } else {
      setEditingVisit(null);
      setOrgId(medicalCase.primaryOrganizationId || '');
      setAddress('');
      setPlannedDateTime(`${getTbilisiDateISO()}T11:00`);
      setPurpose('');
      setVisitTypeId('vis_onsite');
      setBasis('');
      setOrderId('');
      setCommissionId('');
      setClinicReps('');
      setStatus('planned');
      setActPrepStatus('not_started');
      setActNumber('');
      setActDate('');
      setActSignatories('');
      setDocSeizureStatus('unknown');
      setDocSeizureDesc('');
      setDocSeizureForm('copy');
      setDocReturnDate('');
      setExplDoctorName('');
      setExplRequested(false);
      setExplReceived(false);
      setExplDate('');
      setShowAdd((p) => !p);
    }
  };

  const handleSaveVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purpose.trim()) return;
    const now = new Date().toISOString();
    const explanations: DoctorExplanationRecord[] = explDoctorName.trim()
      ? [
          {
            id: editingVisit?.doctorExplanations[0]?.id || generateUuid(),
            doctorName: explDoctorName.trim(),
            requested: explRequested,
            received: explReceived,
            receivedDate: explDate || undefined,
            signed: explReceived,
            attachmentIds: editingVisit?.doctorExplanations[0]?.attachmentIds || [],
          },
        ]
      : [];

    const visit: Visit = {
      id: editingVisit?.id || generateUuid(),
      caseId: medicalCase.id,
      organizationId: orgId || medicalCase.primaryOrganizationId || '',
      address: address.trim(),
      plannedDateTime,
      purpose: purpose.trim(),
      visitTypeId,
      basis: basis.trim(),
      orderId: orderId || undefined,
      responsibleUserId: editingVisit?.responsibleUserId || currentUser.id,
      commissionId: commissionId || undefined,
      clinicRepresentatives: clinicReps.trim(),
      status,
      checklist: editingVisit?.checklist || [
        { id: 'vc1', label: 'უფლებამოსილების დოკუმენტის გაცნობა', done: status === 'completed' },
        { id: 'vc2', label: 'სამედიცინო დოკუმენტაციის დათვალიერება', done: docSeizureStatus === 'yes' },
      ],
      actPrepStatus,
      actNumber: actNumber.trim() || undefined,
      actDate: actDate || undefined,
      actSignatories: actSignatories.trim() || undefined,
      actAttachmentIds: editingVisit?.actAttachmentIds || [],
      docSeizureStatus,
      docSeizureDescription: docSeizureDesc.trim() || undefined,
      docSeizureForm,
      docReturnDate: docReturnDate || undefined,
      doctorExplanations: explanations,
      evidenceAttachmentIds: editingVisit?.evidenceAttachmentIds || [],
      createdAt: editingVisit?.createdAt || now,
      updatedAt: now,
      createdBy: editingVisit?.createdBy || currentUser.id,
      updatedBy: currentUser.id,
    };

    await dataRepo.saveVisit(visit, currentUser);
    setEditingVisit(null);
    setPurpose('');
    setActNumber('');
    setExplDoctorName('');
    setShowAdd(false);
    await refreshData();
    notify('ვიზიტი და აქტის სტატუსი შენახულია.', 'success');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">კლინიკაში ვიზიტები და შემოწმების აქტები</h3>
        {editable && (
          <button
            type="button"
            onClick={() => openVisitForm()}
            className="min-h-[36px] inline-flex items-center gap-1 rounded-lg bg-sky-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-950"
          >
            <Plus className="w-3.5 h-3.5" />
            ახალი ვიზიტი
          </button>
        )}
      </div>

      {showAdd && (
        <form onSubmit={handleSaveVisit} className="rounded-xl border border-sky-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">კლინიკა</label>
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              >
                <option value="">აირჩიეთ კლინიკა</option>
                {snapshot.organizations
                  .filter((o) => !o.deletedAt)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.legalName}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">დაგეგმილი თარიღი/დრო</label>
              <input
                type="datetime-local"
                value={plannedDateTime}
                onChange={(e) => setPlannedDateTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ვიზიტის სტატუსი</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as VisitStatus)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              >
                {Object.entries(VISIT_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">მიზანი *</label>
              <input
                type="text"
                required
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="მაგ: ადგილზე ფაქტობრივი გარემოებების დათვალიერება"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">შესაბამისი ბრძანება</label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              >
                <option value="">არ არის არჩეული</option>
                {caseOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    №{o.orderNumber} ({o.issuedDate})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">შემოწმების ტიპი</label>
              <select
                value={visitTypeId}
                onChange={(e) => setVisitTypeId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              >
                {snapshot.settings.visitTypes.map((vt) => (
                  <option key={vt.id} value={vt.id}>
                    {vt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">კომისია / ჯგუფი</label>
              <select
                value={commissionId}
                onChange={(e) => setCommissionId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              >
                <option value="">ინდივიდუალური</option>
                {snapshot.commissions
                  .filter((c) => !c.deletedAt)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">კლინიკის წარმომადგენლები</label>
              <input
                type="text"
                value={clinicReps}
                onChange={(e) => setClinicReps(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">აქტის მომზადება</label>
              <select
                value={actPrepStatus}
                onChange={(e) => setActPrepStatus(e.target.value as ActPrepStatus)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              >
                {snapshot.settings.actStatuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">აქტის ნომერი (ხელით)</label>
              <input
                type="text"
                value={actNumber}
                onChange={(e) => setActNumber(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">აქტის თარიღი</label>
              <input
                type="date"
                value={actDate}
                onChange={(e) => setActDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ხელმომწერები</label>
              <input
                type="text"
                value={actSignatories}
                onChange={(e) => setActSignatories(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">დოკუმენტაციის ამოღება/გაცნობა</label>
              <select
                value={docSeizureStatus}
                onChange={(e) => setDocSeizureStatus(e.target.value as SeizureStatus)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              >
                {Object.entries(SEIZURE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ფორმა</label>
              <select
                value={docSeizureForm}
                onChange={(e) => setDocSeizureForm(e.target.value as typeof docSeizureForm)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              >
                <option value="copy">ასლი</option>
                <option value="original">ორიგინალი</option>
                <option value="mixed">ასლი + ორიგინალი</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ამოღებული მასალების აღწერა</label>
              <input
                type="text"
                value={docSeizureDesc}
                onChange={(e) => setDocSeizureDesc(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <input
              type="text"
              placeholder="ექიმი (ახსნა-განმარტების ავტორი)"
              value={explDoctorName}
              onChange={(e) => setExplDoctorName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" checked={explRequested} onChange={(e) => setExplRequested(e.target.checked)} />
              მოთხოვნილია
            </label>
            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" checked={explReceived} onChange={(e) => setExplReceived(e.target.checked)} />
              მიღებულია
            </label>
            <input
              type="date"
              aria-label="ახსნა-განმარტების თარიღი"
              value={explDate}
              onChange={(e) => setExplDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-slate-600">
              გაუქმება
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
              ვიზიტის შენახვა
            </button>
          </div>
        </form>
      )}

      {visits.length === 0 && acts.length === 0 ? (
        <p className="text-xs text-slate-500">ამ ქეისზე ვიზიტები და აქტები ჯერ არ არის დამატებული.</p>
      ) : (
        <div className="space-y-3">
          {visits.map((v) => {
            const org = snapshot.organizations.find((o) => o.id === v.organizationId);
            const actStatusLabel = snapshot.settings.actStatuses.find((s) => s.id === v.actPrepStatus)?.label || v.actPrepStatus;
            const visitAttachments = snapshot.attachments.filter(
              (a) => !a.deletedAt && a.linkedEntityType === 'visit' && a.linkedEntityId === v.id
            );
            return (
              <div key={v.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="text-sm text-slate-900">{v.purpose}</strong>
                    <span className="ml-2 text-slate-500">({org?.legalName || 'კლინიკა'})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusLabel label={VISIT_STATUS_LABELS[v.status]} tone={v.status === 'completed' ? 'emerald' : 'sky'} compact />
                    {editable && (
                      <button
                        type="button"
                        onClick={() => openVisitForm(v)}
                        className="text-xs font-medium text-sky-800 hover:underline"
                      >
                        რედაქტირება
                      </button>
                    )}
                    <FieldCommentButton
                      caseId={medicalCase.id}
                      targetType="visit"
                      targetId={v.id}
                      fieldKey={`visit_${v.id}`}
                      fieldLabel={`ვიზიტი: ${v.purpose}`}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-slate-600">
                  <p>დაგეგმილი: <span className="tabular-nums">{v.plannedDateTime.replace('T', ' ')}</span></p>
                  <p>აქტი: <strong>{v.actNumber ? `№${v.actNumber}` : 'ნომრის გარეშე'}</strong> ({actStatusLabel}) {v.actDate && `· ${formatGeorgianDate(v.actDate)}`}</p>
                  <p>დოკუმენტაციის ამოღება: <strong>{SEIZURE_LABELS[v.docSeizureStatus]}</strong> {v.docSeizureDescription && `· ${v.docSeizureDescription}`}</p>
                </div>
                {v.doctorExplanations.length > 0 && (
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <span className="font-semibold text-slate-700">ექიმის ახსნა-განმარტება: </span>
                    {v.doctorExplanations.map((ex) => (
                      <span key={ex.id}>
                        {ex.doctorName} — {ex.received ? 'მიღებულია' : ex.requested ? 'მოთხოვნილია' : 'დაგეგმილი'}{' '}
                        {ex.receivedDate ? `(${formatGeorgianDate(ex.receivedDate)})` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {editable && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-sky-800 font-medium">ვიზიტის / აქტის ფაილების მიმაგრება ({visitAttachments.length})</summary>
                    <div className="mt-2 space-y-2">
                      <FileUploader caseId={medicalCase.id} linkedEntityType="visit" linkedEntityId={v.id} defaultCategory="შემოწმების აქტი / მტკიცებულება" />
                      <AttachmentList attachments={visitAttachments} />
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const CaseOrdersCommissionsTab: React.FC<{ medicalCase: MedicalCase }> = ({ medicalCase }) => {
  const { snapshot, currentUser, refreshData, notify, can } = useApp();
  const [orderTypeId, setOrderTypeId] = useState('ord_inspection');
  const [orderNumber, setOrderNumber] = useState('');
  const [issuer, setIssuer] = useState('');
  const [issuedDate, setIssuedDate] = useState(getTbilisiDateISO());
  const [basis, setBasis] = useState('');
  const [selectedCommissionId, setSelectedCommissionId] = useState('');
  const [stageNote, setStageNote] = useState('');

  if (!snapshot || !currentUser) return null;
  const editable = can('edit');
  const orders = snapshot.orders.filter((o) => o.caseId === medicalCase.id && !o.deletedAt);
  const caseComms = snapshot.caseCommissions.filter((cc) => cc.caseId === medicalCase.id && !cc.deletedAt);

  const handleAddOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    const now = new Date().toISOString();
    const order: Order = {
      id: generateUuid(),
      caseId: medicalCase.id,
      orderTypeId,
      orderNumber: orderNumber.trim(),
      issuer: issuer.trim(),
      issuedDate,
      basis: basis.trim(),
      status: 'active',
      attachmentIds: [],
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };
    await dataRepo.saveOrder(order, currentUser);
    setOrderNumber('');
    setBasis('');
    await refreshData();
    notify('ბრძანება/აქტი დაემატა.', 'success');
  };

  const handleLinkCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCommissionId) return;
    const now = new Date().toISOString();
    await dataRepo.linkCommissionToCase(
      {
        id: generateUuid(),
        caseId: medicalCase.id,
        commissionId: selectedCommissionId,
        stageNote: stageNote.trim() || undefined,
        assignedDate: getTbilisiDateISO(),
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
      },
      currentUser
    );
    setSelectedCommissionId('');
    setStageNote('');
    await refreshData();
    notify('კომისია/ჯგუფი მიენიჭა ქეისს.', 'success');
  };

  return (
    <div className="space-y-5">
      {/* Orders */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">ბრძანებები და ადმინისტრაციული აქტები</h3>
        {orders.length === 0 ? (
          <p className="text-xs text-slate-500">ბრძანებები ჯერ არ არის დამატებული.</p>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => {
              const typeLabel = snapshot.settings.orderTypes.find((t) => t.id === o.orderTypeId)?.label || o.orderTypeId;
              return (
                <div key={o.id} className="rounded-lg border border-slate-200 p-3 text-xs flex flex-wrap justify-between gap-2">
                  <div>
                    <strong className="text-slate-900">№{o.orderNumber}</strong> · {typeLabel} · {formatGeorgianDate(o.issuedDate)}
                    <p className="text-slate-600 mt-0.5">გამომცემი: {o.issuer || '—'} · საფუძველი: {o.basis || '—'}</p>
                  </div>
                  <StatusLabel label={o.status === 'active' ? 'მოქმედი' : o.status === 'amended' ? 'შეცვლილი' : 'გაუქმებული'} tone="teal" compact />
                </div>
              );
            })}
          </div>
        )}

        {editable && (
          <form onSubmit={handleAddOrder} className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <select
              value={orderTypeId}
              onChange={(e) => setOrderTypeId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
            >
              {snapshot.settings.orderTypes.map((ot) => (
                <option key={ot.id} value={ot.id}>
                  {ot.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              placeholder="ბრძანების № *"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="text"
              placeholder="გამომცემი"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="date"
              value={issuedDate}
              onChange={(e) => setIssuedDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="text"
              placeholder="საფუძველი / აღწერა"
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              className="sm:col-span-3 rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button type="submit" className="px-3 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
              + ბრძანების დამატება
            </button>
          </form>
        )}
      </div>

      {/* Commissions */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-sky-800" />
          <h3 className="text-sm font-semibold text-slate-900">კომისიები და შემოწმების ჯგუფები</h3>
        </div>
        {caseComms.length === 0 ? (
          <p className="text-xs text-slate-500">კომისია/ჯგუფი ჯერ არ არის მიბმული.</p>
        ) : (
          <div className="space-y-2">
            {caseComms.map((cc) => {
              const comm = snapshot.commissions.find((c) => c.id === cc.commissionId);
              return (
                <div key={cc.id} className="rounded-lg border border-slate-200 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <strong className="text-sm text-slate-900">{comm?.name || 'კომისია'}</strong>
                    <span className="text-slate-500">დანიშვნა: {formatGeorgianDate(cc.assignedDate)}</span>
                  </div>
                  <p className="text-slate-600">
                    თავმჯდომარე: {comm?.chairName || '—'} · წევრები ({comm?.members.length || 0}):{' '}
                    {comm?.members.map((m) => m.fullName).join(', ') || '—'}
                  </p>
                  {cc.stageNote && <p className="text-sky-900">ეტაპი: {cc.stageNote}</p>}
                </div>
              );
            })}
          </div>
        )}

        {editable && (
          <form onSubmit={handleLinkCommission} className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <select
              value={selectedCommissionId}
              onChange={(e) => setSelectedCommissionId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
            >
              <option value="">აირჩიეთ კომისია/ჯგუფი...</option>
              {snapshot.commissions
                .filter((c) => !c.deletedAt)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.members.length} წევრი)
                  </option>
                ))}
            </select>
            <input
              type="text"
              placeholder="ეტაპის შენიშვნა"
              value={stageNote}
              onChange={(e) => setStageNote(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={!selectedCommissionId}
              className="px-3 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg disabled:opacity-40"
            >
              + ჯგუფის მინიჭება
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
