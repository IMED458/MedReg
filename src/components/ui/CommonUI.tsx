import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Info,
  MessageSquarePlus,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  Attachment,
  CaseComment,
  CustomFieldDefinition,
  CustomFieldTargetPage,
  SafeUser,
} from '../../models/types';
import { useApp } from '../../context/AppContext';
import { storageProvider } from '../../storage/StorageProvider';
import { dataRepo } from '../../repositories/DataRepository';
import { formatGeorgianDate, formatGeorgianDateTime, generateUuid, validateUploadFile } from '../../utils/caseLogic';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;
  const visible = toasts.slice(-2);
  return (
    <div
      className="fixed top-16 md:top-auto md:bottom-5 right-3 md:right-4 z-50 flex flex-col gap-2 max-w-[320px] sm:max-w-sm w-full pointer-events-none"
      aria-live="polite"
    >
      {visible.map((t) => {
        const tone =
          t.type === 'success'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
            : t.type === 'error'
              ? 'border-rose-300 bg-rose-50 text-rose-950'
              : t.type === 'warning'
                ? 'border-amber-300 bg-amber-50 text-amber-950'
                : 'border-sky-300 bg-sky-50 text-sky-950';
        const Icon =
          t.type === 'success'
            ? CheckCircle2
            : t.type === 'error'
              ? XCircle
              : t.type === 'warning'
                ? AlertTriangle
                : Info;
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-sm text-sm ${tone}`}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1 leading-snug">{t.text}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="შეტყობინების დახურვა"
              className="p-0.5 rounded hover:bg-black/5 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const ConfirmDialog: React.FC = () => {
  const { pendingConfirm, resolveConfirm } = useApp();
  if (!pendingConfirm) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 shadow-lg">
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-lg shrink-0 ${
              pendingConfirm.danger ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
              {pendingConfirm.title}
            </h3>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{pendingConfirm.message}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => resolveConfirm(false)}
            className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            {pendingConfirm.cancelLabel || 'გაუქმება'}
          </button>
          <button
            type="button"
            onClick={() => resolveConfirm(true)}
            className={`min-h-[40px] px-4 py-2 text-sm font-medium text-white rounded-lg whitespace-nowrap ${
              pendingConfirm.danger
                ? 'bg-rose-700 hover:bg-rose-800'
                : 'bg-sky-800 hover:bg-sky-900'
            }`}
          >
            {pendingConfirm.confirmLabel || 'დადასტურება'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const StatusLabel: React.FC<{
  label: string;
  tone?: 'slate' | 'sky' | 'teal' | 'amber' | 'rose' | 'emerald' | 'indigo';
  compact?: boolean;
}> = ({ label, tone = 'slate', compact }) => {
  const map: Record<string, string> = {
    slate: 'text-slate-700 border-slate-200 bg-slate-50',
    sky: 'text-sky-800 border-sky-200 bg-sky-50',
    teal: 'text-teal-800 border-teal-200 bg-teal-50',
    amber: 'text-amber-800 border-amber-200 bg-amber-50',
    rose: 'text-rose-800 border-rose-200 bg-rose-50',
    emerald: 'text-emerald-800 border-emerald-200 bg-emerald-50',
    indigo: 'text-indigo-800 border-indigo-200 bg-indigo-50',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium whitespace-nowrap ${
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      } ${map[tone] || map.slate}`}
    >
      {label}
    </span>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}> = ({ title, description, actionLabel, onAction, secondaryLabel, onSecondary }) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
    <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2.5" />
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">{description}</p>
    {(actionLabel || secondaryLabel) && (
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-sky-800 rounded-lg hover:bg-sky-900 whitespace-nowrap"
          >
            {actionLabel}
          </button>
        )}
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    )}
  </div>
);

export interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
}

export const SearchableSelect: React.FC<{
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
}> = ({ id, label, value, onChange, options, placeholder = 'აირჩიეთ...', disabled }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q))
    );
  }, [options, query]);

  return (
    <div className="relative">
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-slate-700 mb-1">
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className="w-full min-h-[40px] flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 hover:border-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ძებნა..."
              aria-label="ჩამონათვალში ძებნა"
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:border-sky-600"
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
                setQuery('');
              }}
              className="w-full px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
            >
              — არცერთი / გასუფთავება —
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500">შედეგი ვერ მოიძებნა</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-sky-50 flex flex-col ${
                    opt.value === value ? 'bg-sky-50 text-sky-900 font-medium' : 'text-slate-800'
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.sublabel && <span className="text-xs text-slate-500">{opt.sublabel}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const FieldCommentButton: React.FC<{
  caseId: string;
  targetType?: CaseComment['targetType'];
  targetId?: string;
  fieldKey: string;
  fieldLabel: string;
}> = ({ caseId, targetType = 'field', targetId, fieldKey, fieldLabel }) => {
  const { snapshot, currentUser, refreshData, notify, can } = useApp();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const comments = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.comments
      .filter(
        (c) =>
          c.caseId === caseId &&
          !c.deletedAt &&
          (c.fieldKey === fieldKey || (targetId && c.targetId === targetId && c.fieldKey === fieldKey))
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [snapshot, caseId, fieldKey, targetId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !currentUser) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await dataRepo.saveComment(
        {
          id: generateUuid(),
          caseId,
          targetType,
          targetId,
          fieldKey,
          fieldLabel,
          authorId: currentUser.id,
          authorName: currentUser.fullName,
          text: text.trim(),
          replies: [],
          createdAt: now,
          updatedAt: now,
          createdBy: currentUser.id,
          updatedBy: currentUser.id,
        },
        currentUser
      );
      setText('');
      await refreshData();
      notify('შენიშვნა დაემატა.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'შეცდომა', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="inline-block relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-label={`კომენტარი ველზე: ${fieldLabel}`}
        title={`კომენტარი / შენიშვნა: ${fieldLabel}`}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors ${
          comments.length > 0
            ? 'text-sky-800 bg-sky-50 border border-sky-200'
            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
        }`}
      >
        <MessageSquarePlus className="w-3.5 h-3.5" />
        {comments.length > 0 && <span className="tabular-nums font-medium">{comments.length}</span>}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">შენიშვნები ველზე</h4>
                  <p className="text-xs text-slate-500">{fieldLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="დახურვა"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 max-h-60 overflow-y-auto space-y-2.5">
                {comments.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">ამ ველზე კომენტარები ჯერ არ არის.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-xs">
                      <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="font-medium text-slate-800">{c.authorName}</span>
                        <span className="tabular-nums">{formatGeorgianDateTime(c.createdAt)}</span>
                      </div>
                      <p className="text-slate-700 whitespace-pre-wrap">{c.text}</p>
                    </div>
                  ))
                )}
              </div>

              {can('edit') && (
                <form onSubmit={handleAdd} className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                  <textarea
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="დაამატეთ შენიშვნა (ძირითად მონაცემს არ ცვლის)..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-sky-600"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      დახურვა
                    </button>
                    <button
                      type="submit"
                      disabled={saving || !text.trim()}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-sky-800 hover:bg-sky-900 rounded-lg disabled:opacity-50"
                    >
                      {saving ? 'ინახება...' : 'შენიშვნის შენახვა'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export interface PendingUploadItem {
  tempId: string;
  file: File;
  title: string;
  category: string;
}

export async function uploadAttachmentBatch(params: {
  items: PendingUploadItem[];
  caseId?: string;
  linkedEntityType: Attachment['linkedEntityType'];
  linkedEntityId?: string;
  user: SafeUser;
}): Promise<Attachment[]> {
  const { items, caseId, linkedEntityType, linkedEntityId, user } = params;
  const uploaded: Attachment[] = [];
  for (const item of items) {
    const stored = await storageProvider.saveFile(item.file);
    const now = new Date().toISOString();
    const att: Attachment = {
      id: generateUuid(),
      caseId,
      linkedEntityType,
      linkedEntityId,
      title: item.title.trim() || item.file.name,
      fileName: stored.fileName,
      category: item.category.trim() || 'ზოგადი',
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      blobKey: stored.blobKey,
      currentVersion: 1,
      versions: [
        {
          version: 1,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          uploadedAt: now,
          uploadedBy: user.id,
          blobKey: stored.blobKey,
        },
      ],
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    };
    await dataRepo.saveAttachment(att, user);
    uploaded.push(att);
  }
  return uploaded;
}

export const PendingFilePicker: React.FC<{
  items: PendingUploadItem[];
  onChange: (items: PendingUploadItem[]) => void;
  defaultCategory?: string;
  label?: string;
  compact?: boolean;
}> = ({
  items,
  onChange,
  defaultCategory = 'ზოგადი დოკუმენტი',
  label = 'ფაილების / დოკუმენტების მიმაგრება',
  compact = false,
}) => {
  const { notify } = useApp();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [category, setCategory] = useState(defaultCategory);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const next: PendingUploadItem[] = [];
    for (const f of Array.from(fileList)) {
      const check = validateUploadFile({ name: f.name, size: f.size, type: f.type });
      if (!check.valid) {
        notify(check.error || `ფაილი „${f.name}“ ვერ დაემატა.`, 'error');
        continue;
      }
      next.push({
        tempId: generateUuid(),
        file: f,
        title: f.name,
        category: category.trim() || defaultCategory,
      });
    }
    if (next.length > 0) {
      onChange([...items, ...next]);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/70 ${compact ? 'p-3 space-y-2' : 'p-4 space-y-2.5'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-800">{label}</span>
        {!compact && (
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="ფაილის კატეგორია"
            aria-label="ფაილის კატეგორია"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs w-48"
          />
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col sm:flex-row items-center justify-between gap-2.5 rounded-lg border border-dashed ${
          compact ? 'p-2.5' : 'p-3.5'
        } transition-colors ${dragging ? 'border-sky-600 bg-sky-50' : 'border-slate-300 bg-white'}`}
      >
        <p className="text-xs text-slate-600">
          აირჩიეთ ან ჩააგდეთ ფაილი (PDF, DOCX, XLSX, JPG, PNG, TXT, CSV — მაქს. 15 MB)
        </p>
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-sky-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-900 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            ფაილის არჩევა
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.tempId}
              className="flex items-center justify-between gap-2 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-3.5 h-3.5 text-sky-800 shrink-0" />
                <span className="font-medium text-slate-800 truncate">{item.file.name}</span>
                <span className="text-slate-500 shrink-0 tabular-nums">
                  {(item.file.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <button
                type="button"
                aria-label={`მიმაგრებული ფაილის მოხსნა: ${item.file.name}`}
                onClick={() => onChange(items.filter((x) => x.tempId !== item.tempId))}
                className="p-1 text-rose-700 hover:bg-rose-50 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const FileUploader: React.FC<{
  caseId?: string;
  linkedEntityType: Attachment['linkedEntityType'];
  linkedEntityId?: string;
  defaultCategory?: string;
  compact?: boolean;
  onUploaded?: (attachment: Attachment) => void;
}> = ({
  caseId,
  linkedEntityType,
  linkedEntityId,
  defaultCategory = 'ზოგადი დოკუმენტი',
  compact = false,
  onUploaded,
}) => {
  const { currentUser, refreshData, notify, can } = useApp();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [receivedFrom, setReceivedFrom] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  if (!can('create') && !can('edit')) return null;

  const processFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!currentUser || files.length === 0) return;
    setUploading(true);
    try {
      let lastAtt: Attachment | undefined;
      for (const file of files) {
        const stored = await storageProvider.saveFile(file);
        const now = new Date().toISOString();
        const att: Attachment = {
          id: generateUuid(),
          caseId,
          linkedEntityType,
          linkedEntityId,
          title: files.length === 1 && title.trim() ? title.trim() : file.name,
          fileName: stored.fileName,
          category: category.trim() || 'ზოგადი',
          description: description.trim() || undefined,
          documentDate: documentDate || undefined,
          receivedFrom: receivedFrom.trim() || undefined,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          blobKey: stored.blobKey,
          currentVersion: 1,
          versions: [
            {
              version: 1,
              fileName: stored.fileName,
              mimeType: stored.mimeType,
              sizeBytes: stored.sizeBytes,
              uploadedAt: now,
              uploadedBy: currentUser.id,
              blobKey: stored.blobKey,
            },
          ],
          createdAt: now,
          updatedAt: now,
          createdBy: currentUser.id,
          updatedBy: currentUser.id,
        };
        await dataRepo.saveAttachment(att, currentUser);
        lastAtt = att;
      }
      setTitle('');
      setDescription('');
      setReceivedFrom('');
      setDocumentDate('');
      await refreshData();
      notify(
        files.length > 1
          ? `${files.length} ფაილი წარმატებით შეინახა მონაცემთა ბაზაში.`
          : `ფაილი „${lastAtt?.fileName}“ წარმატებით შეინახა მონაცემთა ბაზაში.`,
        'success'
      );
      if (onUploaded && lastAtt) onUploaded(lastAtt);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ფაილის ატვირთვა ვერ მოხერხდა.', 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (compact) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void processFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 transition-colors ${
          dragging ? 'border-sky-600 bg-sky-50' : 'border-slate-300 bg-slate-50/70'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="დოკუმენტის დასახელება (არასავალდებულო)"
            className="flex-1 min-w-[160px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
          />
          <span className="text-[11px] text-slate-500 hidden md:inline">{defaultCategory}</span>
        </div>
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void processFiles(e.target.files);
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="min-h-[34px] inline-flex items-center gap-1.5 rounded-md bg-sky-800 px-3 py-1 text-xs font-medium text-white hover:bg-sky-900 disabled:opacity-50 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'იტვირთება...' : 'ფაილის ატვირთვა'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="დოკუმენტის დასახელება (არასავალდებულო)"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="ტიპი / კატეგორია"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={receivedFrom}
          onChange={(e) => setReceivedFrom(e.target.value)}
          placeholder="ვისგან არის მიღებული"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={documentDate}
          onChange={(e) => setDocumentDate(e.target.value)}
          aria-label="დოკუმენტის თარიღი"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="მოკლე აღწერა / შენიშვნა ფაილზე"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void processFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col sm:flex-row items-center justify-between gap-3 rounded-lg border-2 border-dashed p-4 transition-colors ${
          dragging ? 'border-sky-600 bg-sky-50' : 'border-slate-300 bg-white'
        }`}
      >
        <div className="text-xs text-slate-600">
          <p className="font-medium text-slate-800">
            ჩააგდეთ ფაილი აქ ან აირჩიეთ მოწყობილობიდან (PDF, DOCX, XLSX, JPG, PNG, TXT, CSV — მაქს. 15 MB)
          </p>
          <p className="mt-0.5 text-slate-500">
            ფაილი ნაწილებად ინახება Firestore-ის მონაცემთა ბაზაში და cache-დება ამ მოწყობილობაზე.
          </p>
        </div>
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void processFiles(e.target.files);
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="min-h-[40px] inline-flex items-center gap-2 rounded-lg bg-sky-800 px-4 py-2 text-sm font-medium text-white hover:bg-sky-900 disabled:opacity-50 whitespace-nowrap"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'იტვირთება...' : 'ატვირთვა'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ENTITY_ORIGIN_LABELS: Record<Attachment['linkedEntityType'], string> = {
  case: 'ქეისის ფაილი',
  visit: 'ვიზიტი / აქტი',
  act: 'შემოწმების აქტი',
  order: 'ბრძანება',
  document_request: 'მოთხოვნილი დოკუმენტი',
  document_delivery: 'მოწოდებული დოკუმენტი',
  correspondence: 'წერილი',
  review_assignment: 'რეცენზია (გაგზავნა)',
  review_response: 'რეცენზიის პასუხი',
  general: 'საერთო საცავი',
};

export const AttachmentList: React.FC<{
  attachments: Attachment[];
  emptyText?: string;
  showEntityOrigin?: boolean;
}> = ({ attachments, emptyText = 'მიმაგრებული ფაილები არ არის.', showEntityOrigin = false }) => {
  const { can, currentUser, refreshData, notify, confirmAction, snapshot } = useApp();
  const [previewItem, setPreviewItem] = useState<{ att: Attachment; url: string; text?: string } | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  const handleDownload = async (att: Attachment) => {
    if (!can('download_file')) {
      notify('თქვენს როლს არ აქვს ფაილის ჩამოტვირთვის უფლება.', 'error');
      return;
    }
    const url = await storageProvider.getFileDownloadUrl(att.blobKey);
    if (!url) {
      notify('ფაილი მონაცემთა ბაზაში ვერ მოიძებნა.', 'error');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = att.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handlePreview = async (att: Attachment) => {
    if (!can('download_file')) {
      notify('თქვენს როლს არ აქვს ფაილის ნახვის უფლება.', 'error');
      return;
    }
    const blob = await storageProvider.getFileBlob(att.blobKey);
    if (!blob) {
      notify('ფაილი ვერ მოიძებნა.', 'error');
      return;
    }
    const url = URL.createObjectURL(blob);
    let textContent: string | undefined;
    if (att.mimeType.startsWith('text/') || att.fileName.endsWith('.csv') || att.fileName.endsWith('.txt')) {
      textContent = await blob.text();
    }
    setPreviewItem({ att, url, text: textContent });
  };

  const handleDelete = async (att: Attachment) => {
    if (!currentUser) return;
    const ok = await confirmAction({
      title: 'ფაილის წაშლა',
      message: `დარწმუნებული ხართ, რომ გსურთ ფაილის „${att.fileName}“ წაშლა/არქივირება?`,
      confirmLabel: 'წაშლა',
      danger: true,
    });
    if (!ok) return;
    await dataRepo.softDeleteAttachment(att.id, currentUser);
    await refreshData();
    notify('ფაილი წაიშალა.', 'success');
  };

  const handleReplaceVersion = async (att: Attachment, file: File) => {
    if (!currentUser) return;
    try {
      const stored = await storageProvider.saveFile(file);
      const now = new Date().toISOString();
      const nextVer = (att.currentVersion || 1) + 1;
      await dataRepo.saveAttachment(
        {
          ...att,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          blobKey: stored.blobKey,
          currentVersion: nextVer,
          versions: [
            ...att.versions,
            {
              version: nextVer,
              fileName: stored.fileName,
              mimeType: stored.mimeType,
              sizeBytes: stored.sizeBytes,
              uploadedAt: now,
              uploadedBy: currentUser.id,
              blobKey: stored.blobKey,
              note: 'ჩანაცვლებული ვერსია',
            },
          ],
        },
        currentUser
      );
      await refreshData();
      notify(`ფაილის ახალი ვერსია (v${nextVer}) შენახულია.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ვერსიის ჩანაცვლება ვერ მოხერხდა.', 'error');
    } finally {
      setReplacingId(null);
    }
  };

  if (attachments.length === 0) {
    return <p className="text-sm text-slate-500 py-3">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      <input
        ref={replaceRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const target = attachments.find((a) => a.id === replacingId);
          if (f && target) void handleReplaceVersion(target, f);
          if (replaceRef.current) replaceRef.current.value = '';
        }}
      />
      {attachments.map((att) => (
        <div
          key={att.id}
          className="flex flex-wrap items-start justify-between gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5"
        >
          <div className="min-w-[200px] flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="w-4 h-4 text-sky-800 shrink-0" />
              <span className="text-sm font-medium text-slate-900 break-all">{att.title || att.fileName}</span>
              <span className="text-xs text-slate-500 font-mono tabular-nums">v{att.currentVersion || 1}</span>
              {showEntityOrigin && (
                <span className="text-[11px] font-medium text-sky-900 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5">
                  {ENTITY_ORIGIN_LABELS[att.linkedEntityType] || att.linkedEntityType}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="break-all">{att.fileName}</span>
              <span aria-hidden="true">·</span>
              <span>{att.category}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{(att.sizeBytes / 1024).toFixed(1)} KB</span>
              {att.receivedFrom && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>წყარო: {att.receivedFrom}</span>
                </>
              )}
              {att.documentDate && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {formatGeorgianDate(att.documentDate, snapshot?.settings.dateFormat)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {can('download_file') && (
              <>
                <button
                  type="button"
                  onClick={() => void handlePreview(att)}
                  className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
                >
                  <Eye className="w-3.5 h-3.5" />
                  გადახედვა
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload(att)}
                  className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-800 border border-sky-200 bg-sky-50/50 rounded-md hover:bg-sky-50 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  ჩამოტვირთვა
                </button>
              </>
            )}
            {can('edit') && (
              <button
                type="button"
                onClick={() => {
                  setReplacingId(att.id);
                  replaceRef.current?.click();
                }}
                className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
              >
                ახალი ვერსია
              </button>
            )}
            {can('delete') && (
              <button
                type="button"
                onClick={() => void handleDelete(att)}
                aria-label={`ფაილის წაშლა: ${att.fileName}`}
                className="min-h-[36px] p-1.5 text-rose-700 hover:bg-rose-50 rounded-md"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}

      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl border border-slate-200 max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h4 className="text-sm font-semibold text-slate-900 truncate">{previewItem.att.fileName}</h4>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(previewItem.url);
                  setPreviewItem(null);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-50 flex items-center justify-center">
              {previewItem.att.mimeType.startsWith('image/') ? (
                <img
                  src={previewItem.url}
                  alt={previewItem.att.fileName}
                  className="max-w-full max-h-[65vh] object-contain rounded"
                />
              ) : previewItem.att.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewItem.url}
                  title={previewItem.att.fileName}
                  className="w-full h-[65vh] rounded border border-slate-200 bg-white"
                />
              ) : previewItem.text !== undefined ? (
                <pre className="w-full bg-white p-4 rounded border border-slate-200 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[65vh]">
                  {previewItem.text}
                </pre>
              ) : (
                <div className="text-center py-8 space-y-3">
                  <FileText className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className="text-sm text-slate-700">
                    ამ ფორმატის ({previewItem.att.mimeType}) პირდაპირი გადახედვა ბრაუზერში მიუწვდომელია.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleDownload(previewItem.att)}
                    className="px-4 py-2 text-sm font-medium text-white bg-sky-800 rounded-lg hover:bg-sky-900"
                  >
                    ჩამოტვირთვა
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const CustomFieldsSection: React.FC<{
  targetPage: CustomFieldTargetPage;
  definitions: CustomFieldDefinition[];
  values: Record<string, string | number | boolean | string[] | null>;
  onChange: (fieldId: string, value: string | number | boolean | string[] | null) => void;
  disabled?: boolean;
}> = ({ targetPage, definitions, values, onChange, disabled }) => {
  const fields = definitions.filter((f) => f.active && f.targetPage === targetPage);
  if (fields.length === 0) return null;

  return (
    <div className="pt-4 border-t border-slate-200 space-y-3">
      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">დამატებითი მორგებული ველები</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {fields.map((field) => {
          const val = values[field.id] ?? field.defaultValue ?? '';
          return (
            <div key={field.id} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {field.label} {field.required && <span className="text-rose-600">*</span>}
              </label>
              {field.type === 'text' && (
                <input
                  type="text"
                  disabled={disabled}
                  required={field.required}
                  value={String(val)}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                />
              )}
              {field.type === 'textarea' && (
                <textarea
                  rows={2}
                  disabled={disabled}
                  required={field.required}
                  value={String(val)}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                />
              )}
              {field.type === 'date' && (
                <input
                  type="date"
                  disabled={disabled}
                  required={field.required}
                  value={String(val)}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                />
              )}
              {field.type === 'number' && (
                <input
                  type="number"
                  disabled={disabled}
                  required={field.required}
                  value={String(val)}
                  onChange={(e) => onChange(field.id, e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                />
              )}
              {field.type === 'checkbox' && (
                <label className="inline-flex items-center gap-2 text-sm text-slate-800 pt-1">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={Boolean(val)}
                    onChange={(e) => onChange(field.id, e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-sky-800"
                  />
                  <span>დიახ</span>
                </label>
              )}
              {field.type === 'select' && (
                <select
                  disabled={disabled}
                  required={field.required}
                  value={String(val)}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                >
                  <option value="">აირჩიეთ...</option>
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
              {field.type === 'multiselect' && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {(field.options || []).map((opt) => {
                    const arr = Array.isArray(val) ? val : [];
                    const checked = arr.includes(opt);
                    return (
                      <label
                        key={opt}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs"
                      >
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...arr, opt]
                              : arr.filter((x) => x !== opt);
                            onChange(field.id, next);
                          }}
                        />
                        <span>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {field.type === 'file' && (
                <input
                  type="text"
                  disabled={disabled}
                  placeholder="ფაილის მითითება / სათაური"
                  value={String(val)}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const UrgencyChip: React.FC<{ urgency: 'overdue' | 'today' | 'soon_1_3' | 'later' | 'none'; date?: string }> = ({
  urgency,
  date,
}) => {
  const { snapshot } = useApp();
  if (!date && urgency === 'none') return <span className="text-xs text-slate-400">—</span>;
  const formatted = date ? formatGeorgianDate(date, snapshot?.settings.dateFormat) : '';
  const styles: Record<string, string> = {
    overdue: 'text-rose-800 bg-rose-50 border-rose-200',
    today: 'text-amber-800 bg-amber-50 border-amber-200',
    soon_1_3: 'text-sky-800 bg-sky-50 border-sky-200',
    later: 'text-slate-700 bg-slate-50 border-slate-200',
    none: 'text-slate-600 bg-slate-50 border-slate-200',
  };
  const labels: Record<string, string> = {
    overdue: 'ვადაგადაცილებული',
    today: 'დღეს',
    soon_1_3: '1-3 დღეში',
    later: 'დაგეგმილი',
    none: '',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs tabular-nums whitespace-nowrap ${styles[urgency]}`}
    >
      <Clock className="w-3 h-3 shrink-0" />
      <span>{formatted}</span>
      {labels[urgency] && <span className="font-medium">({labels[urgency]})</span>}
    </span>
  );
};
