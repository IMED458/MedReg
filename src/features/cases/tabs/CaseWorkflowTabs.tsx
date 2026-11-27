import React, { useState } from 'react';
import { AlertTriangle, Check, Plus, RefreshCw } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { dataRepo } from '../../../repositories/DataRepository';
import {
  Correspondence,
  CorrespondenceDirection,
  CorrespondenceStatus,
  DocumentRequest,
  DocumentRequestStatus,
  MedicalCase,
  PriorityLevel,
  ReviewAssignment,
  ReviewAssignmentStatus,
  Task,
} from '../../../models/types';
import {
  formatGeorgianDate,
  generateUuid,
  getDeadlineUrgency,
  getTbilisiDateISO,
} from '../../../utils/caseLogic';
import {
  AttachmentList,
  FieldCommentButton,
  FileUploader,
  StatusLabel,
  UrgencyChip,
} from '../../../components/ui/CommonUI';

const DOC_STATUS_LABELS: Record<DocumentRequestStatus, { label: string; tone: 'slate' | 'sky' | 'amber' | 'emerald' | 'rose' }> = {
  planned: { label: 'დაგეგმილია', tone: 'slate' },
  requested: { label: 'მოთხოვნილია', tone: 'sky' },
  partially_received: { label: 'ნაწილობრივ მიღებულია', tone: 'amber' },
  fully_received: { label: 'სრულად მიღებულია', tone: 'emerald' },
  defective: { label: 'ხარვეზიანია', tone: 'rose' },
  overdue: { label: 'ვადა გასულია', tone: 'rose' },
  no_longer_needed: { label: 'აღარ არის საჭირო', tone: 'slate' },
};

const CORR_STATUS_LABELS: Record<CorrespondenceStatus, string> = {
  to_prepare: 'მოსამზადებელია',
  draft: 'პროექტია',
  to_sign: 'ხელმოსაწერია',
  sent: 'გაგზავნილია',
  received: 'მიღებულია',
  awaiting_reply: 'პასუხის მოლოდინში',
  completed: 'დასრულებულია',
};

const REVIEW_STATUS_LABELS: Record<ReviewAssignmentStatus, { label: string; tone: 'slate' | 'sky' | 'amber' | 'emerald' | 'rose' }> = {
  to_prepare: { label: 'მოსამზადებელია', tone: 'slate' },
  sent: { label: 'გაიგზავნა', tone: 'sky' },
  receipt_confirmed: { label: 'მიღება დადასტურებულია', tone: 'sky' },
  awaiting_response: { label: 'პასუხის მოლოდინში', tone: 'amber' },
  additional_materials_requested: { label: 'დამატებითი მასალაა მოთხოვნილი', tone: 'amber' },
  response_received: { label: 'პასუხი მიღებულია', tone: 'emerald' },
  defective: { label: 'ხარვეზიანია', tone: 'rose' },
  completed: { label: 'დასრულებულია', tone: 'emerald' },
};

export const CaseDocumentsTab: React.FC<{ medicalCase: MedicalCase }> = ({ medicalCase }) => {
  const { snapshot, currentUser, refreshData, notify, can } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [docTypeId, setDocTypeId] = useState('doc_history');
  const [docTitle, setDocTitle] = useState('');
  const [fromType, setFromType] = useState<'clinic' | 'doctor' | 'other'>('clinic');
  const [fromName, setFromName] = useState('');
  const [basis, setBasis] = useState('');
  const [letterNum, setLetterNum] = useState('');
  const [letterDate, setLetterDate] = useState(getTbilisiDateISO());
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<DocumentRequestStatus>('requested');

  const [deliveryReqId, setDeliveryReqId] = useState<string | null>(null);
  const [delivDate, setDelivDate] = useState(getTbilisiDateISO());
  const [delivLetterNum, setDelivLetterNum] = useState('');
  const [delivForm, setDelivForm] = useState<'copy' | 'original' | 'electronic'>('copy');
  const [delivPages, setDelivPages] = useState('');
  const [delivMissing, setDelivMissing] = useState('');
  const [delivNextStatus, setDelivNextStatus] = useState<DocumentRequestStatus>('fully_received');

  if (!snapshot || !currentUser) return null;
  const editable = can('edit');
  const reqs = snapshot.documentRequests.filter((r) => r.caseId === medicalCase.id && !r.deletedAt);
  const todayISO = getTbilisiDateISO();

  const handleAddRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim()) return;
    const now = new Date().toISOString();
    const req: DocumentRequest = {
      id: generateUuid(),
      caseId: medicalCase.id,
      documentTypeId: docTypeId,
      documentTitle: docTitle.trim(),
      requestedFromType: fromType,
      requestedFromName: fromName.trim() || 'კლინიკა',
      basis: basis.trim(),
      outgoingLetterNumber: letterNum.trim() || undefined,
      outgoingLetterDate: letterDate || undefined,
      sentDate: letterDate || undefined,
      dueDate: dueDate || undefined,
      status,
      responsibleUserId: currentUser.id,
      deliveries: [],
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };
    await dataRepo.saveDocumentRequest(req, currentUser);
    setDocTitle('');
    setLetterNum('');
    setShowAdd(false);
    await refreshData();
    notify('დოკუმენტის მოთხოვნა დაემატა.', 'success');
  };

  const handleAddDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryReqId) return;
    const now = new Date().toISOString();
    await dataRepo.addDocumentDelivery(
      deliveryReqId,
      {
        id: generateUuid(),
        requestId: deliveryReqId,
        caseId: medicalCase.id,
        deliveryDate: delivDate,
        incomingLetterNumber: delivLetterNum.trim() || undefined,
        receivedByUserId: currentUser.id,
        copyOrOriginal: delivForm,
        pageCount: delivPages ? Number(delivPages) : undefined,
        stillMissing: delivMissing.trim() || undefined,
        attachmentIds: [],
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
      },
      delivNextStatus,
      currentUser
    );
    setDeliveryReqId(null);
    setDelivMissing('');
    setDelivLetterNum('');
    await refreshData();
    notify('მიწოდება დაფიქსირდა.', 'success');
  };

  const updateStatusQuick = async (req: DocumentRequest, nextStatus: DocumentRequestStatus) => {
    await dataRepo.saveDocumentRequest({ ...req, status: nextStatus }, currentUser);
    await refreshData();
    notify('მოთხოვნის სტატუსი განახლდა.', 'success');
  };

  // Checklist summary
  const countRequested = reqs.length;
  const countDelivered = reqs.filter((r) => r.status === 'fully_received').length;
  const countPartial = reqs.filter((r) => r.status === 'partially_received').length;
  const countPending = reqs.filter((r) =>
    ['planned', 'requested', 'overdue', 'defective'].includes(r.status)
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
          <span>მოთხოვნილი: <strong>{countRequested}</strong></span>
          <span className="text-emerald-800">მოტანილი: <strong>{countDelivered}</strong></span>
          <span className="text-amber-800">ნაწილობრივ: <strong>{countPartial}</strong></span>
          <span className="text-rose-800">ჯერ არ მოუტანიათ: <strong>{countPending}</strong></span>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => setShowAdd((p) => !p)}
            className="min-h-[36px] inline-flex items-center gap-1 rounded-lg bg-sky-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-950"
          >
            <Plus className="w-3.5 h-3.5" />
            დოკუმენტის მოთხოვნა
          </button>
        )}
      </div>

      {showAdd && (
        <form onSubmit={handleAddRequest} className="rounded-xl border border-sky-200 bg-white p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <select
            value={docTypeId}
            onChange={(e) => setDocTypeId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
          >
            {snapshot.settings.documentTypes.map((dt) => (
              <option key={dt.id} value={dt.id}>
                {dt.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            required
            placeholder="რა დოკუმენტია საჭირო *"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={fromType}
            onChange={(e) => setFromType(e.target.value as typeof fromType)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
          >
            <option value="clinic">კლინიკისგან</option>
            <option value="doctor">ექიმისგან</option>
            <option value="other">სხვა პირისგან</option>
          </select>
          <input
            type="text"
            placeholder="ვისგან ვითხოვ (დასახელება)"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="გამოთხოვის წერილის №"
            value={letterNum}
            onChange={(e) => setLetterNum(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            aria-label="მოსაწოდებელი ვადა"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="საფუძველი"
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as DocumentRequestStatus)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
          >
            {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-2 text-xs text-slate-600">
              გაუქმება
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
              შენახვა
            </button>
          </div>
        </form>
      )}

      {reqs.length === 0 ? (
        <p className="text-xs text-slate-500">მოთხოვნილი დოკუმენტები ჯერ არ არის დამატებული.</p>
      ) : (
        <div className="space-y-3">
          {reqs.map((r) => {
            const st = DOC_STATUS_LABELS[r.status] || { label: r.status, tone: 'slate' as const };
            const isOverdue =
              r.status === 'overdue' ||
              (['planned', 'requested', 'partially_received', 'defective'].includes(r.status) &&
                Boolean(r.dueDate && r.dueDate < todayISO));
            const reqAttachments = snapshot.attachments.filter(
              (a) => !a.deletedAt && a.linkedEntityType === 'document_request' && a.linkedEntityId === r.id
            );

            return (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="text-sm text-slate-900">{r.documentTitle}</strong>
                    <span className="ml-2 text-slate-500">({r.requestedFromName})</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {isOverdue && <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />}
                    <StatusLabel label={st.label} tone={st.tone} compact />
                    <FieldCommentButton
                      caseId={medicalCase.id}
                      targetType="document_request"
                      targetId={r.id}
                      fieldKey={`docreq_${r.id}`}
                      fieldLabel={`დოკ. მოთხოვნა: ${r.documentTitle}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-slate-600">
                  <p>წერილი: {r.outgoingLetterNumber || '—'} {r.outgoingLetterDate && `(${formatGeorgianDate(r.outgoingLetterDate)})`}</p>
                  <p>ვადა: <UrgencyChip urgency={getDeadlineUrgency(r.dueDate, r.status === 'fully_received', todayISO)} date={r.dueDate} /></p>
                  <p>ეტაპობრივი მიწოდებები: <strong>{r.deliveries.length}</strong></p>
                </div>

                {r.missingItemsNote && (
                  <p className="text-amber-900 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                    ჯერ კიდევ აკლია: {r.missingItemsNote}
                  </p>
                )}

                {r.deliveries.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {r.deliveries.map((d, idx) => (
                      <div key={d.id} className="rounded bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-[11px] text-slate-700 flex flex-wrap justify-between gap-2">
                        <span>
                          ეტაპი {idx + 1}: {formatGeorgianDate(d.deliveryDate)} · {d.copyOrOriginal === 'original' ? 'ორიგინალი' : d.copyOrOriginal === 'electronic' ? 'ელექტრონული' : 'ასლი'}
                          {d.pageCount ? ` (${d.pageCount} გვ.)` : ''}
                          {d.incomingLetterNumber ? ` · შემ. №${d.incomingLetterNumber}` : ''}
                        </span>
                        {d.stillMissing && <span className="text-amber-800">დარჩა: {d.stillMissing}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {editable && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <select
                      value={r.status}
                      aria-label={`სტატუსი: ${r.documentTitle}`}
                      onChange={(e) => void updateStatusQuick(r, e.target.value as DocumentRequestStatus)}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setDeliveryReqId(deliveryReqId === r.id ? null : r.id)}
                      className="px-2.5 py-1 rounded border border-sky-200 bg-sky-50 text-sky-900 font-medium hover:bg-sky-100"
                    >
                      + მიწოდების დაფიქსირება
                    </button>
                  </div>
                )}

                {deliveryReqId === r.id && (
                  <form onSubmit={handleAddDelivery} className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="date"
                      value={delivDate}
                      onChange={(e) => setDelivDate(e.target.value)}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="შემოსული წერილის №"
                      value={delivLetterNum}
                      onChange={(e) => setDelivLetterNum(e.target.value)}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <select
                      value={delivForm}
                      onChange={(e) => setDelivForm(e.target.value as typeof delivForm)}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="copy">ასლი</option>
                      <option value="original">ორიგინალი</option>
                      <option value="electronic">ელექტრონული</option>
                    </select>
                    <input
                      type="number"
                      placeholder="გვერდების რაოდენობა"
                      value={delivPages}
                      onChange={(e) => setDelivPages(e.target.value)}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="ჯერ კიდევ რა აკლია (არსებობისას)"
                      value={delivMissing}
                      onChange={(e) => setDelivMissing(e.target.value)}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <select
                      value={delivNextStatus}
                      onChange={(e) => setDelivNextStatus(e.target.value as DocumentRequestStatus)}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="fully_received">სრულად მიღებულია</option>
                      <option value="partially_received">ნაწილობრივ მიღებულია</option>
                      <option value="defective">ხარვეზიანია</option>
                    </select>
                    <div className="sm:col-span-3 flex justify-end gap-2">
                      <button type="button" onClick={() => setDeliveryReqId(null)} className="px-2.5 py-1 text-slate-600">
                        გაუქმება
                      </button>
                      <button type="submit" className="px-3 py-1 bg-sky-800 text-white rounded font-medium">
                        მიწოდების შენახვა
                      </button>
                    </div>
                  </form>
                )}

                {editable && (
                  <details>
                    <summary className="cursor-pointer text-sky-800 font-medium">მიღებული ფაილები ({reqAttachments.length})</summary>
                    <div className="mt-2 space-y-2">
                      <FileUploader caseId={medicalCase.id} linkedEntityType="document_request" linkedEntityId={r.id} defaultCategory="გამოთხოვილი დოკუმენტი" />
                      <AttachmentList attachments={reqAttachments} />
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

export const CaseCorrespondenceTab: React.FC<{ medicalCase: MedicalCase }> = ({ medicalCase }) => {
  const { snapshot, currentUser, refreshData, notify, can } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [direction, setDirection] = useState<CorrespondenceDirection>('outgoing');
  const [categoryId, setCategoryId] = useState('corr_interim');
  const [officialNumber, setOfficialNumber] = useState('');
  const [officialDate, setOfficialDate] = useState(getTbilisiDateISO());
  const [sender, setSender] = useState('');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [shortContent, setShortContent] = useState('');
  const [status, setStatus] = useState<CorrespondenceStatus>('to_prepare');
  const [isInterim, setIsInterim] = useState(true);
  const [interimPrepared, setInterimPrepared] = useState(false);
  const [interimSigned, setInterimSigned] = useState(false);
  const [interimSent, setInterimSent] = useState(false);
  const [expectedReplyDate, setExpectedReplyDate] = useState('');
  const [editingLetterId, setEditingLetterId] = useState<string | null>(null);
  const [editNum, setEditNum] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStatus, setEditStatus] = useState<CorrespondenceStatus>('to_prepare');

  if (!snapshot || !currentUser) return null;
  const editable = can('edit');
  const letters = snapshot.correspondence.filter((l) => l.caseIds.includes(medicalCase.id) && !l.deletedAt);

  const handleAddLetter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    const now = new Date().toISOString();
    const letter: Correspondence = {
      id: generateUuid(),
      caseIds: [medicalCase.id],
      direction,
      categoryId,
      officialNumber: officialNumber.trim() || undefined,
      officialDate: officialDate || undefined,
      sender: sender.trim() || currentUser.fullName,
      recipient: recipient.trim() || 'ადრესატი',
      subject: subject.trim(),
      shortContent: shortContent.trim(),
      status: interimSent ? 'sent' : status,
      isInterimLetter: isInterim || categoryId === 'corr_interim',
      interimPrepared,
      interimSigned,
      interimSent,
      sentDate: interimSent ? officialDate || getTbilisiDateISO() : undefined,
      expectedReplyDate: expectedReplyDate || undefined,
      responsibleUserId: currentUser.id,
      attachmentIds: [],
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };
    await dataRepo.saveCorrespondence(letter, currentUser);
    setSubject('');
    setOfficialNumber('');
    setShortContent('');
    setShowAdd(false);
    await refreshData();
    notify('წერილი დარეგისტრირდა.', 'success');
  };

  const toggleInterimStep = async (
    letter: Correspondence,
    field: 'interimPrepared' | 'interimSigned' | 'interimSent',
    val: boolean
  ) => {
    const updated: Correspondence = {
      ...letter,
      [field]: val,
      status: field === 'interimSent' && val ? 'sent' : letter.status,
      sentDate: field === 'interimSent' && val ? letter.sentDate || getTbilisiDateISO() : letter.sentDate,
    };
    await dataRepo.saveCorrespondence(updated, currentUser);
    await refreshData();
    notify('წერილის სტატუსი განახლდა.', 'success');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">წერილები და კორესპონდენცია</h3>
        {editable && (
          <button
            type="button"
            onClick={() => setShowAdd((p) => !p)}
            className="min-h-[36px] inline-flex items-center gap-1 rounded-lg bg-sky-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-950"
          >
            <Plus className="w-3.5 h-3.5" />
            ახალი წერილი
          </button>
        )}
      </div>

      {showAdd && (
        <form onSubmit={handleAddLetter} className="rounded-xl border border-sky-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as CorrespondenceDirection)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
            >
              <option value="outgoing">გასული</option>
              <option value="incoming">შემოსული</option>
              <option value="internal">შიდა</option>
            </select>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                if (e.target.value === 'corr_interim') setIsInterim(true);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
            >
              {snapshot.settings.correspondenceCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CorrespondenceStatus)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
            >
              {Object.entries(CORR_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="ოფიციალური ნომერი"
              value={officialNumber}
              onChange={(e) => setOfficialNumber(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={officialDate}
              onChange={(e) => setOfficialDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              aria-label="პასუხის მოსალოდნელი თარიღი"
              value={expectedReplyDate}
              onChange={(e) => setExpectedReplyDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="გამგზავნი"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="ადრესატი"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              required
              placeholder="თემა *"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <textarea
            rows={2}
            placeholder="მოკლე შინაარსი"
            value={shortContent}
            onChange={(e) => setShortContent(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="inline-flex items-center gap-1.5 font-medium">
              <input type="checkbox" checked={isInterim} onChange={(e) => setIsInterim(e.target.checked)} />
              შუალედური წერილია
            </label>
            {isInterim && (
              <>
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={interimPrepared} onChange={(e) => setInterimPrepared(e.target.checked)} />
                  მომზადებულია
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={interimSigned} onChange={(e) => setInterimSigned(e.target.checked)} />
                  ხელმოწერილია
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={interimSent} onChange={(e) => setInterimSent(e.target.checked)} />
                  გაგზავნილია
                </label>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-slate-600">
              გაუქმება
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
              წერილის შენახვა
            </button>
          </div>
        </form>
      )}

      {letters.length === 0 ? (
        <p className="text-xs text-slate-500">კორესპონდენცია ჯერ არ არის დამატებული.</p>
      ) : (
        <div className="space-y-2.5">
          {letters.map((l) => {
            const catLabel = snapshot.settings.correspondenceCategories.find((c) => c.id === l.categoryId)?.label || l.categoryId;
            return (
              <div key={l.id} className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="text-sm text-slate-900">{l.subject}</strong>
                    <span className="ml-2 text-slate-500">({catLabel} · {l.direction === 'incoming' ? 'შემოსული' : l.direction === 'outgoing' ? 'გასული' : 'შიდა'})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusLabel label={CORR_STATUS_LABELS[l.status]} tone={l.status === 'sent' || l.status === 'completed' ? 'emerald' : 'amber'} compact />
                    <FieldCommentButton
                      caseId={medicalCase.id}
                      targetType="correspondence"
                      targetId={l.id}
                      fieldKey={`corr_${l.id}`}
                      fieldLabel={`წერილი: ${l.subject}`}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-slate-600">
                    № {l.officialNumber || '—'} · თარიღი: {formatGeorgianDate(l.officialDate)} · გამგზავნი: {l.sender} → ადრესატი: {l.recipient}
                  </p>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => {
                        if (editingLetterId === l.id) {
                          setEditingLetterId(null);
                        } else {
                          setEditingLetterId(l.id);
                          setEditNum(l.officialNumber || '');
                          setEditDate(l.officialDate || getTbilisiDateISO());
                          setEditStatus(l.status);
                        }
                      }}
                      className="text-xs font-medium text-sky-800 hover:underline"
                    >
                      {editingLetterId === l.id ? 'დახურვა' : 'ნომრის / სტატუსის შეცვლა'}
                    </button>
                  )}
                </div>
                {editingLetterId === l.id && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await dataRepo.saveCorrespondence(
                        {
                          ...l,
                          officialNumber: editNum.trim() || undefined,
                          officialDate: editDate || undefined,
                          status: editStatus,
                          interimSent: editStatus === 'sent' ? true : l.interimSent,
                          sentDate: editStatus === 'sent' ? editDate || getTbilisiDateISO() : l.sentDate,
                        },
                        currentUser
                      );
                      setEditingLetterId(null);
                      await refreshData();
                      notify('წერილის რეკვიზიტები განახლდა.', 'success');
                    }}
                    className="rounded-lg border border-sky-200 bg-sky-50/40 p-2.5 grid grid-cols-1 sm:grid-cols-4 gap-2"
                  >
                    <input
                      type="text"
                      placeholder="ოფიციალური ნომერი"
                      value={editNum}
                      onChange={(e) => setEditNum(e.target.value)}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as CorrespondenceStatus)}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    >
                      {Object.entries(CORR_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="px-3 py-1.5 bg-sky-800 text-white rounded font-medium text-xs">
                      შენახვა
                    </button>
                  </form>
                )}
                {l.isInterimLetter && editable && (
                  <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-slate-100">
                    <span className="font-medium text-slate-700">შუალედური წერილის სტატუსი:</span>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(l.interimPrepared)}
                        onChange={(e) => void toggleInterimStep(l, 'interimPrepared', e.target.checked)}
                      />
                      მომზადებულია
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(l.interimSigned)}
                        onChange={(e) => void toggleInterimStep(l, 'interimSigned', e.target.checked)}
                      />
                      ხელმოწერილია
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(l.interimSent)}
                        onChange={(e) => void toggleInterimStep(l, 'interimSent', e.target.checked)}
                      />
                      გაგზავნილია
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const CaseReviewsTab: React.FC<{ medicalCase: MedicalCase }> = ({ medicalCase }) => {
  const { snapshot, currentUser, refreshData, notify, can } = useApp();
  const [showSend, setShowSend] = useState(false);
  const [reviewerId, setReviewerId] = useState('');
  const [basis, setBasis] = useState('');
  const [questions, setQuestions] = useState('');
  const [materials, setMaterials] = useState('');
  const [outLetterNum, setOutLetterNum] = useState('');
  const [outLetterDate, setOutLetterDate] = useState(getTbilisiDateISO());
  const [dueDate, setDueDate] = useState('');

  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respDate, setRespDate] = useState(getTbilisiDateISO());
  const [respLetterNum, setRespLetterNum] = useState('');
  const [respAuthor, setRespAuthor] = useState('');
  const [respSummary, setRespSummary] = useState('');
  const [respNextStatus, setRespNextStatus] = useState<ReviewAssignmentStatus>('response_received');

  if (!snapshot || !currentUser) return null;
  const editable = can('edit');
  const assignments = snapshot.reviewAssignments.filter((r) => r.caseId === medicalCase.id && !r.deletedAt);

  const handleNeedsReviewChange = async (val: 'yes' | 'no' | 'undecided') => {
    await dataRepo.updateCaseFields(medicalCase.id, { needsReview: val }, currentUser, 'საჭიროა რეცენზია?');
    await refreshData();
  };

  const handleSendReview = async (e: React.FormEvent) => {
    e.preventDefault();
    const rev = snapshot.reviewers.find((r) => r.id === reviewerId);
    if (!rev) return;
    const now = new Date().toISOString();
    const assign: ReviewAssignment = {
      id: generateUuid(),
      caseId: medicalCase.id,
      reviewerId: rev.id,
      reviewerNameSnapshot: rev.fullName,
      basis: basis.trim(),
      questionsToAnswer: questions.trim(),
      materialsList: materials.trim(),
      attachedDocumentIds: [],
      outgoingLetterNumber: outLetterNum.trim() || undefined,
      outgoingLetterDate: outLetterDate || undefined,
      sentDate: outLetterDate || undefined,
      dueDate: dueDate || undefined,
      status: 'sent',
      responses: [],
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };
    await dataRepo.saveReviewAssignment(assign, currentUser);
    if (medicalCase.needsReview !== 'yes') {
      await dataRepo.updateCaseFields(medicalCase.id, { needsReview: 'yes' }, currentUser, 'საჭიროა რეცენზია?');
    }
    setReviewerId('');
    setOutLetterNum('');
    setQuestions('');
    setShowSend(false);
    await refreshData();
    notify('რეცენზიაზე გაგზავნა დაფიქსირდა.', 'success');
  };

  const handleAddResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    const assign = assignments.find((a) => a.id === respondingId);
    if (!assign || !respSummary.trim()) return;
    const now = new Date().toISOString();
    await dataRepo.addReviewResponse(
      assign.id,
      {
        id: generateUuid(),
        assignmentId: assign.id,
        caseId: medicalCase.id,
        version: assign.responses.length + 1,
        receivedDate: respDate,
        incomingLetterNumber: respLetterNum.trim() || undefined,
        incomingLetterDate: respDate,
        authorName: respAuthor.trim() || assign.reviewerNameSnapshot,
        shortSummary: respSummary.trim(),
        attachmentIds: [],
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
      },
      respNextStatus,
      currentUser
    );
    setRespondingId(null);
    setRespLetterNum('');
    setRespSummary('');
    await refreshData();
    notify('რეცენზიის პასუხი შენახულია.', 'success');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-semibold text-slate-900">საჭიროა რეცენზია?</span>
          <select
            disabled={!editable}
            value={medicalCase.needsReview}
            onChange={(e) => void handleNeedsReviewChange(e.target.value as 'yes' | 'no' | 'undecided')}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="undecided">გადასაწყვეტია</option>
            <option value="yes">დიახ</option>
            <option value="no">არა</option>
          </select>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => setShowSend((p) => !p)}
            className="min-h-[36px] inline-flex items-center gap-1 rounded-lg bg-sky-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-950"
          >
            <Plus className="w-3.5 h-3.5" />
            რეცენზენტთან გაგზავნა
          </button>
        )}
      </div>

      {showSend && (
        <form onSubmit={handleSendReview} className="rounded-xl border border-sky-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">რეცენზენტი *</label>
              <select
                required
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
              >
                <option value="">აირჩიეთ რეცენზენტი...</option>
                {snapshot.reviewers
                  .filter((r) => !r.deletedAt)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fullName} ({r.specialty})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">გასული წერილის №</label>
              <input
                type="text"
                value={outLetterNum}
                onChange={(e) => setOutLetterNum(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">გაგზავნის თარიღი</label>
              <input
                type="date"
                value={outLetterDate}
                onChange={(e) => setOutLetterDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">შეთანხმებული სამუშაო ვადა</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <input
              type="text"
              placeholder="გაგზავნის საფუძველი"
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="გასაგზავნი მასალების ჩამონათვალი"
              value={materials}
              onChange={(e) => setMaterials(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <textarea
            rows={2}
            placeholder="რეცენზენტისთვის გასაცემი კითხვები"
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowSend(false)} className="px-3 py-1.5 text-xs text-slate-600">
              გაუქმება
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
              გაგზავნის რეგისტრაცია
            </button>
          </div>
        </form>
      )}

      {assignments.length === 0 ? (
        <p className="text-xs text-slate-500">ამ ქეისზე რეცენზია ჯერ არ არის გაგზავნილი.</p>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const st = REVIEW_STATUS_LABELS[a.status];
            const revFiles = snapshot.attachments.filter(
              (att) => !att.deletedAt && att.linkedEntityType === 'review_assignment' && att.linkedEntityId === a.id
            );
            return (
              <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="text-sm text-slate-900">{a.reviewerNameSnapshot}</strong>
                    <span className="ml-2 text-slate-500">
                      წერილი №{a.outgoingLetterNumber || '—'} ({formatGeorgianDate(a.outgoingLetterDate)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusLabel label={st.label} tone={st.tone} compact />
                    <FieldCommentButton
                      caseId={medicalCase.id}
                      targetType="review"
                      targetId={a.id}
                      fieldKey={`review_${a.id}`}
                      fieldLabel={`რეცენზია: ${a.reviewerNameSnapshot}`}
                    />
                  </div>
                </div>
                <p className="text-slate-600">
                  სამუშაო ვადა: {formatGeorgianDate(a.dueDate)} · კითხვები: {a.questionsToAnswer || '—'}
                </p>

                {a.responses.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {a.responses.map((resp) => (
                      <div key={resp.id} className="rounded-lg bg-emerald-50/50 border border-emerald-200 p-2.5">
                        <div className="flex justify-between font-medium text-emerald-950">
                          <span>პასუხი v{resp.version} · ავტორი: {resp.authorName}</span>
                          <span>შემ. წერილი №{resp.incomingLetterNumber || '—'} ({formatGeorgianDate(resp.receivedDate)})</span>
                        </div>
                        <p className="mt-1 text-slate-800">{resp.shortSummary}</p>
                      </div>
                    ))}
                  </div>
                )}

                {editable && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setRespondingId(respondingId === a.id ? null : a.id);
                        setRespAuthor(a.reviewerNameSnapshot);
                      }}
                      className="px-2.5 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 font-medium hover:bg-emerald-100"
                    >
                      + პასუხის / დაზუსტების დაფიქსირება
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await dataRepo.saveReviewAssignment({ ...a, status: 'sent', sentDate: getTbilisiDateISO() }, currentUser);
                        await refreshData();
                        notify('ხელახალი გაგზავნა დაფიქსირდა.', 'info');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      <RefreshCw className="w-3 h-3" />
                      ხელახლა გაგზავნა
                    </button>
                  </div>
                )}

                {respondingId === a.id && (
                  <form onSubmit={handleAddResponse} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        required
                        placeholder="ავტორი *"
                        value={respAuthor}
                        onChange={(e) => setRespAuthor(e.target.value)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="შემოსული წერილის №"
                        value={respLetterNum}
                        onChange={(e) => setRespLetterNum(e.target.value)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                      <input
                        type="date"
                        value={respDate}
                        onChange={(e) => setRespDate(e.target.value)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <textarea
                      rows={2}
                      required
                      placeholder="რეცენზიის მოკლე შეჯამება / დასკვნა *"
                      value={respSummary}
                      onChange={(e) => setRespSummary(e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <select
                        value={respNextStatus}
                        onChange={(e) => setRespNextStatus(e.target.value as ReviewAssignmentStatus)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs"
                      >
                        <option value="response_received">პასუხი მიღებულია</option>
                        <option value="completed">დასრულებულია</option>
                        <option value="additional_materials_requested">დამატებითი მასალაა მოთხოვნილი</option>
                        <option value="defective">ხარვეზიანია</option>
                      </select>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setRespondingId(null)} className="px-2.5 py-1 text-slate-600">
                          გაუქმება
                        </button>
                        <button type="submit" className="px-3 py-1 bg-emerald-700 text-white rounded font-medium">
                          პასუხის შენახვა
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {editable && (
                  <details>
                    <summary className="cursor-pointer text-sky-800 font-medium">რეცენზიის ფაილები ({revFiles.length})</summary>
                    <div className="mt-2 space-y-2">
                      <FileUploader caseId={medicalCase.id} linkedEntityType="review_assignment" linkedEntityId={a.id} defaultCategory="რეცენზია" />
                      <AttachmentList attachments={revFiles} />
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

export const CaseTasksTab: React.FC<{ medicalCase: MedicalCase }> = ({ medicalCase }) => {
  const { snapshot, currentUser, refreshData, notify, can } = useApp();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(getTbilisiDateISO());
  const [priority, setPriority] = useState<PriorityLevel>('normal');
  const [assignedTo, setAssignedTo] = useState(medicalCase.assignedTo);

  if (!snapshot || !currentUser) return null;
  const editable = can('edit');
  const caseTasks = snapshot.tasks.filter((t) => t.caseId === medicalCase.id && !t.deletedAt);
  const todayISO = getTbilisiDateISO();

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const now = new Date().toISOString();
    const task: Task = {
      id: generateUuid(),
      caseId: medicalCase.id,
      title: title.trim(),
      assignedTo: assignedTo || currentUser.id,
      observerIds: [],
      dueDate: dueDate || undefined,
      priority,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };
    await dataRepo.saveTask(task, currentUser);
    setTitle('');
    await refreshData();
    notify('დავალება დაემატა.', 'success');
  };

  const toggleDone = async (task: Task) => {
    const nextStatus = task.status === 'completed' ? 'open' : 'completed';
    await dataRepo.saveTask(
      {
        ...task,
        status: nextStatus,
        completedAt: nextStatus === 'completed' ? new Date().toISOString() : undefined,
      },
      currentUser
    );
    await refreshData();
    notify(nextStatus === 'completed' ? 'დავალება შესრულებულად მოინიშნა.' : 'დავალება ხელახლა გაიხსნა.', 'success');
  };

  return (
    <div className="space-y-4">
      {editable && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-600 mr-1">სწრაფი შაბლონები:</span>
            {snapshot.settings.taskTemplates.slice(0, 6).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  setTitle(tpl.title);
                  setPriority(tpl.defaultPriority);
                }}
                className="rounded border border-slate-200 bg-slate-50 hover:bg-sky-50 px-2 py-1 text-[11px] text-slate-700"
              >
                + {tpl.title}
              </button>
            ))}
          </div>

          <form onSubmit={handleAddTask} className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
            <input
              type="text"
              required
              placeholder="დავალების სათაური *"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="md:col-span-5 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="md:col-span-3 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="md:col-span-4 min-w-0 flex gap-2">
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs truncate"
              >
                {snapshot.users.filter((u) => u.isActive).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
              <button type="submit" className="shrink-0 px-3.5 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg whitespace-nowrap">
                დამატება
              </button>
            </div>
          </form>
        </div>
      )}

      {caseTasks.length === 0 ? (
        <p className="text-xs text-slate-500">ამ ქეისზე დავალებები ჯერ არ არის.</p>
      ) : (
        <div className="space-y-2">
          {caseTasks.map((t) => {
            const assignee = snapshot.users.find((u) => u.id === t.assignedTo);
            const done = t.status === 'completed';
            return (
              <div
                key={t.id}
                className={`rounded-xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs ${
                  done ? 'border-slate-200 bg-slate-50/70 text-slate-500' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {editable && (
                    <button
                      type="button"
                      onClick={() => void toggleDone(t)}
                      aria-label={`დავალების შესრულება: ${t.title}`}
                      className={`w-5 h-5 rounded border flex items-center justify-center ${
                        done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-400 bg-white'
                      }`}
                    >
                      {done && <Check className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <div>
                    <span className={`text-sm font-medium ${done ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                      {t.title}
                    </span>
                    <span className="ml-2 text-slate-500">· {assignee?.fullName || '—'}</span>
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
