import React, { useState } from 'react';
import { Building2, Edit3, Plus, Stethoscope, Trash2, UsersRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { dataRepo } from '../../repositories/DataRepository';
import { Branch, Commission, CommissionMember, Doctor, Organization } from '../../models/types';
import { formatGeorgianDate, generateUuid, getTbilisiDateISO } from '../../utils/caseLogic';
import { EmptyState, StatusLabel } from '../../components/ui/CommonUI';

export const ClinicsDirectoryPage: React.FC = () => {
  const { snapshot, currentUser, refreshData, notify, can, navigate } = useApp();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);

  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [directorName, setDirectorName] = useState('');
  const [adminResponsible, setAdminResponsible] = useState('');
  const [legalRep, setLegalRep] = useState('');
  const [qualityRep, setQualityRep] = useState('');
  const [notes, setNotes] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [contacts, setContacts] = useState<{ id: string; fullName: string; position: string; phone: string; email: string }[]>([]);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPos, setNewContactPos] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  if (!snapshot || !currentUser) return null;
  const editable = can('edit') || can('create');

  const openEdit = (org?: Organization) => {
    if (org) {
      setEditing(org);
      setLegalName(org.legalName);
      setTradeName(org.tradeName || '');
      setTaxId(org.taxId);
      setAddress(org.address);
      setMunicipality(org.municipality);
      setPhone(org.phone || '');
      setEmail(org.email || '');
      setWebsite(org.website || '');
      setDirectorName(org.directorName || '');
      setAdminResponsible(org.adminResponsible || '');
      setLegalRep(org.legalRepresentative || '');
      setQualityRep(org.qualityRepresentative || '');
      setNotes(org.notes || '');
      setBranches(org.branches || []);
      setContacts(org.contacts.map((c) => ({ id: c.id, fullName: c.fullName, position: c.position, phone: c.phone || '', email: c.email || '' })));
    } else {
      setEditing(null);
      setLegalName('');
      setTradeName('');
      setTaxId('');
      setAddress('');
      setMunicipality('');
      setPhone('');
      setEmail('');
      setWebsite('');
      setDirectorName('');
      setAdminResponsible('');
      setLegalRep('');
      setQualityRep('');
      setNotes('');
      setBranches([]);
      setContacts([]);
    }
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legalName.trim()) return;
    const now = new Date().toISOString();
    const org: Organization = {
      id: editing?.id || generateUuid(),
      legalName: legalName.trim(),
      tradeName: tradeName.trim() || undefined,
      taxId: taxId.trim(),
      address: address.trim(),
      municipality: municipality.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      website: website.trim() || undefined,
      directorName: directorName.trim() || undefined,
      adminResponsible: adminResponsible.trim() || undefined,
      legalRepresentative: legalRep.trim() || undefined,
      qualityRepresentative: qualityRep.trim() || undefined,
      branches,
      contacts: contacts.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        position: c.position,
        roleType: 'case_contact' as const,
        phone: c.phone || undefined,
        email: c.email || undefined,
      })),
      notes: notes.trim() || undefined,
      createdAt: editing?.createdAt || now,
      updatedAt: now,
      createdBy: editing?.createdBy || currentUser.id,
      updatedBy: currentUser.id,
    };
    await dataRepo.saveOrganization(org, currentUser);
    setShowForm(false);
    await refreshData();
    notify('კლინიკის პროფილი შენახულია.', 'success');
  };

  const orgs = snapshot.organizations.filter(
    (o) =>
      !o.deletedAt &&
      (!search.trim() ||
        `${o.legalName} ${o.tradeName || ''} ${o.taxId} ${o.municipality}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">კლინიკები და დაწესებულებები</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            ერთიანი ცნობარი ფილიალებით, დირექტორებით, პასუხისმგებელი პირებითა და ქეისებთან კავშირით
          </p>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => openEdit()}
            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-sky-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-sky-950"
          >
            <Plus className="w-4 h-4" />
            ახალი კლინიკა
          </button>
        )}
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ძებნა დასახელებით, ს/კ კოდით, მუნიციპალიტეტით..."
        className="w-full sm:w-80 h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
      />

      {showForm && (
        <form onSubmit={handleSave} className="rounded-xl border border-sky-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
            {editing ? 'კლინიკის რედაქტირება' : 'ახალი კლინიკის დამატება'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input
              type="text"
              required
              placeholder="სრული იურიდიული დასახელება *"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="სავაჭრო / ცნობილი სახელი"
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="საიდენტიფიკაციო კოდი"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
            <input
              type="text"
              placeholder="მისამართი"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="მუნიციპალიტეტი"
              value={municipality}
              onChange={(e) => setMunicipality(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="tel"
              placeholder="ტელეფონი"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="email"
              placeholder="ელფოსტა"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="ვებგვერდი"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="დირექტორი"
              value={directorName}
              onChange={(e) => setDirectorName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="ადმინისტრაციული პასუხისმგებელი"
              value={adminResponsible}
              onChange={(e) => setAdminResponsible(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="იურიდიული წარმომადგენელი"
              value={legalRep}
              onChange={(e) => setLegalRep(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="ხარისხის სამსახურის წარმომადგენელი"
              value={qualityRep}
              onChange={(e) => setQualityRep(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <span className="text-xs font-semibold text-slate-700">ფილიალები ({branches.length})</span>
            {branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-xs bg-white rounded border border-slate-200 px-2.5 py-1.5">
                <span><strong>{b.name}</strong> — {b.address}</span>
                <button
                  type="button"
                  onClick={() => setBranches((p) => p.filter((x) => x.id !== b.id))}
                  className="text-rose-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="ფილიალის სახელი"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="flex-1 min-w-[160px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                placeholder="ფილიალის მისამართი"
                value={newBranchAddress}
                onChange={(e) => setNewBranchAddress(e.target.value)}
                className="flex-1 min-w-[200px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newBranchName.trim()) return;
                  setBranches((p) => [
                    ...p,
                    {
                      id: generateUuid(),
                      name: newBranchName.trim(),
                      address: newBranchAddress.trim(),
                      municipality: municipality || 'თბილისი',
                    },
                  ]);
                  setNewBranchName('');
                  setNewBranchAddress('');
                }}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-white rounded"
              >
                + ფილიალი
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <span className="text-xs font-semibold text-slate-700">საკონტაქტო პირები ({contacts.length})</span>
            {contacts.map((ct) => (
              <div key={ct.id} className="flex items-center justify-between text-xs bg-white rounded border border-slate-200 px-2.5 py-1.5">
                <span><strong>{ct.fullName}</strong> ({ct.position || 'თანამშრომელი'}) — {ct.phone || '—'}</span>
                <button
                  type="button"
                  onClick={() => setContacts((p) => p.filter((x) => x.id !== ct.id))}
                  className="text-rose-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="სახელი და გვარი"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                className="flex-1 min-w-[150px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                placeholder="პოზიცია"
                value={newContactPos}
                onChange={(e) => setNewContactPos(e.target.value)}
                className="flex-1 min-w-[140px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
              <input
                type="tel"
                placeholder="ტელეფონი"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
                className="w-36 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newContactName.trim()) return;
                  setContacts((p) => [
                    ...p,
                    {
                      id: generateUuid(),
                      fullName: newContactName.trim(),
                      position: newContactPos.trim() || 'საკონტაქტო პირი',
                      phone: newContactPhone.trim(),
                      email: '',
                    },
                  ]);
                  setNewContactName('');
                  setNewContactPos('');
                  setNewContactPhone('');
                }}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-white rounded"
              >
                + კონტაქტი
              </button>
            </div>
          </div>

          <textarea
            rows={2}
            placeholder="დამატებითი შენიშვნები კლინიკაზე"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 text-xs text-slate-600">
              გაუქმება
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
              კლინიკის შენახვა
            </button>
          </div>
        </form>
      )}

      {orgs.length === 0 ? (
        <EmptyState
          title="კლინიკების ცნობარი ცარიელია"
          description="დაამატეთ სამედიცინო დაწესებულება, რომ შემდგომ ნებისმიერ ქეისში სწრაფად აირჩიოთ."
          actionLabel={editable ? '+ ახალი კლინიკა' : undefined}
          onAction={editable ? () => openEdit() : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orgs.map((o) => {
            const linkedCaseIds = new Set(
              snapshot.caseOrganizations
                .filter((l) => l.organizationId === o.id && !l.deletedAt)
                .map((l) => l.caseId)
            );
            snapshot.cases
              .filter((c) => !c.deletedAt && c.primaryOrganizationId === o.id)
              .forEach((c) => linkedCaseIds.add(c.id));

            return (
              <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Building2 className="w-4 h-4 text-sky-800 mt-0.5 shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{o.legalName}</h3>
                      <p className="text-slate-500">
                        ს/კ {o.taxId || '—'} · {o.municipality || '—'} · {o.address || '—'}
                      </p>
                    </div>
                  </div>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => openEdit(o)}
                      className="p-1.5 text-slate-500 hover:text-sky-800 rounded"
                      aria-label={`რედაქტირება: ${o.legalName}`}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="text-slate-600 space-y-0.5">
                  <p>დირექტორი: {o.directorName || '—'} | ადმ. პასუხისმგებელი: {o.adminResponsible || '—'}</p>
                  <p>ტელ: {o.phone || '—'} · ელფოსტა: {o.email || '—'}</p>
                  <p>ფილიალები: {o.branches.length} · დაკავშირებული ქეისები: <strong>{linkedCaseIds.size}</strong></p>
                </div>
                {linkedCaseIds.size > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
                    {Array.from(linkedCaseIds).map((cid) => {
                      const c = snapshot.cases.find((x) => x.id === cid);
                      if (!c) return null;
                      return (
                        <button
                          key={cid}
                          type="button"
                          onClick={() => navigate('case_detail', { caseId: cid })}
                          className="font-mono text-[11px] text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded hover:bg-sky-100"
                        >
                          {c.caseNumber}
                        </button>
                      );
                    })}
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

export const DoctorsDirectoryPage: React.FC = () => {
  const { snapshot, currentUser, refreshData, notify, can, navigate } = useApp();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);

  const [fullName, setFullName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [position, setPosition] = useState('');
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [statusNote, setStatusNote] = useState('');

  if (!snapshot || !currentUser) return null;
  const editable = can('edit') || can('create');

  const openEdit = (doc?: Doctor) => {
    if (doc) {
      setEditing(doc);
      setFullName(doc.fullName);
      setSpecialty(doc.specialty);
      setPosition(doc.position);
      setOrgIds(doc.organizationIds);
      setPhone(doc.phone || '');
      setEmail(doc.email || '');
      setStatusNote(doc.professionalStatusNote || '');
    } else {
      setEditing(null);
      setFullName('');
      setSpecialty('');
      setPosition('');
      setOrgIds([]);
      setPhone('');
      setEmail('');
      setStatusNote('');
    }
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    const now = new Date().toISOString();
    await dataRepo.saveDoctor(
      {
        id: editing?.id || generateUuid(),
        fullName: fullName.trim(),
        specialty: specialty.trim(),
        position: position.trim(),
        organizationIds: orgIds,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        professionalStatusNote: statusNote.trim() || undefined,
        createdAt: editing?.createdAt || now,
        updatedAt: now,
        createdBy: editing?.createdBy || currentUser.id,
        updatedBy: currentUser.id,
      },
      currentUser
    );
    setShowForm(false);
    await refreshData();
    notify('ექიმის პროფილი შენახულია.', 'success');
  };

  const docs = snapshot.doctors.filter(
    (d) =>
      !d.deletedAt &&
      (!search.trim() || `${d.fullName} ${d.specialty}`.toLowerCase().includes(search.trim().toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ექიმები და საკონტაქტო პირები</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            სამედიცინო პერსონალის ერთიანი ცნობარი მრავალ კლინიკასთან და ქეისთან კავშირით
          </p>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => openEdit()}
            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-sky-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-sky-950"
          >
            <Plus className="w-4 h-4" />
            ახალი ექიმი
          </button>
        )}
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ძებნა სახელით ან სპეციალობით..."
        className="w-full sm:w-80 h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
      />

      {showForm && (
        <form onSubmit={handleSave} className="rounded-xl border border-sky-200 bg-white p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              placeholder="სახელი და გვარი *"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="სპეციალობა"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="თანამდებობა"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="tel"
              placeholder="ტელეფონი"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="email"
              placeholder="ელფოსტა"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="პროფესიული სტატუსის შენიშვნა"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {snapshot.organizations.length > 0 && (
            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1">სამუშაო კლინიკები</span>
              <div className="flex flex-wrap gap-2">
                {snapshot.organizations
                  .filter((o) => !o.deletedAt)
                  .map((o) => (
                    <label key={o.id} className="inline-flex items-center gap-1.5 text-xs border border-slate-200 rounded px-2 py-1">
                      <input
                        type="checkbox"
                        checked={orgIds.includes(o.id)}
                        onChange={(e) =>
                          setOrgIds((p) => (e.target.checked ? [...p, o.id] : p.filter((x) => x !== o.id)))
                        }
                      />
                      <span>{o.legalName}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 text-xs text-slate-600">
              გაუქმება
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
              შენახვა
            </button>
          </div>
        </form>
      )}

      {docs.length === 0 ? (
        <EmptyState
          title="ექიმების ცნობარი ცარიელია"
          description="დაამატეთ ექიმი ან სამედიცინო პერსონალი ქეისებთან დასაკავშირებლად."
          actionLabel={editable ? '+ ახალი ექიმი' : undefined}
          onAction={editable ? () => openEdit() : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docs.map((d) => {
            const linkedCases = snapshot.caseDoctors.filter((cd) => cd.doctorId === d.id && !cd.deletedAt);
            const orgNames = snapshot.organizations
              .filter((o) => d.organizationIds.includes(o.id))
              .map((o) => o.legalName)
              .join(', ');
            return (
              <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <Stethoscope className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{d.fullName}</h3>
                      <p className="text-slate-600">{d.specialty} {d.position && `· ${d.position}`}</p>
                    </div>
                  </div>
                  {editable && (
                    <button type="button" onClick={() => openEdit(d)} className="p-1 text-slate-500 hover:text-sky-800">
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-slate-600">კლინიკა: {orgNames || '—'}</p>
                <p className="text-slate-600">ტელ: {d.phone || '—'} · ელფოსტა: {d.email || '—'}</p>
                {linkedCases.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
                    {linkedCases.map((lc) => {
                      const c = snapshot.cases.find((x) => x.id === lc.caseId);
                      if (!c) return null;
                      return (
                        <button
                          key={lc.id}
                          type="button"
                          onClick={() => navigate('case_detail', { caseId: c.id })}
                          className="font-mono text-[11px] text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded"
                        >
                          {c.caseNumber}
                        </button>
                      );
                    })}
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

export const CommissionsDirectoryPage: React.FC = () => {
  const { snapshot, currentUser, refreshData, notify, can } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('შემოწმების ჯგუფი');
  const [basis, setBasis] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderDate, setOrderDate] = useState(getTbilisiDateISO());
  const [chairName, setChairName] = useState('');
  const [members, setMembers] = useState<CommissionMember[]>([]);
  const [memName, setMemName] = useState('');
  const [memPos, setMemPos] = useState('');
  const [memRole, setMemRole] = useState<CommissionMember['roleInGroup']>('member');

  if (!snapshot || !currentUser) return null;
  const editable = can('edit') || can('create');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const now = new Date().toISOString();
    const comm: Commission = {
      id: generateUuid(),
      name: name.trim(),
      type,
      creationBasis: basis.trim(),
      orderNumber: orderNumber.trim() || undefined,
      orderDate: orderDate || undefined,
      chairName: chairName.trim() || currentUser.fullName,
      members,
      startDate: orderDate,
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };
    await dataRepo.saveCommission(comm, currentUser);
    setShowForm(false);
    setName('');
    setMembers([]);
    await refreshData();
    notify('კომისია / ჯგუფი შენახულია.', 'success');
  };

  const comms = snapshot.commissions.filter((c) => !c.deletedAt);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">კომისიები და შემოწმების ჯგუფები</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            ჯგუფის შემადგენლობა, თავმჯდომარეები, ბრძანების რეკვიზიტები და ქეისებზე განაწილება
          </p>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => setShowForm((p) => !p)}
            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-sky-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-sky-950"
          >
            <Plus className="w-4 h-4" />
            ახალი კომისია / ჯგუფი
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="rounded-xl border border-sky-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              placeholder="კომისიის / ჯგუფის სახელწოდება *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="ტიპი"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="თავმჯდომარე / უფროსი"
              value={chairName}
              onChange={(e) => setChairName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="ბრძანების №"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="შექმნის საფუძველი"
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <span className="text-xs font-semibold text-slate-700">წევრები ({members.length})</span>
            {members.map((m) => (
              <div key={m.id} className="text-xs bg-white border border-slate-200 rounded px-2.5 py-1.5 flex justify-between">
                <span><strong>{m.fullName}</strong> ({m.position}) — {m.roleInGroup}</span>
                <button type="button" onClick={() => setMembers((p) => p.filter((x) => x.id !== m.id))} className="text-rose-700">
                  წაშლა
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="წევრის სახელი და გვარი"
                value={memName}
                onChange={(e) => setMemName(e.target.value)}
                className="flex-1 min-w-[160px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                placeholder="თანამდებობა"
                value={memPos}
                onChange={(e) => setMemPos(e.target.value)}
                className="flex-1 min-w-[140px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
              <select
                value={memRole}
                onChange={(e) => setMemRole(e.target.value as CommissionMember['roleInGroup'])}
                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
              >
                <option value="chair">თავმჯდომარე</option>
                <option value="member">წევრი</option>
                <option value="secretary">მდივანი</option>
                <option value="expert">ექსპერტი</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!memName.trim()) return;
                  setMembers((p) => [
                    ...p,
                    { id: generateUuid(), fullName: memName.trim(), position: memPos.trim(), roleInGroup: memRole },
                  ]);
                  setMemName('');
                  setMemPos('');
                }}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-white rounded"
              >
                + წევრი
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 text-xs text-slate-600">
              გაუქმება
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-sky-800 rounded-lg">
              კომისიის შენახვა
            </button>
          </div>
        </form>
      )}

      {comms.length === 0 ? (
        <EmptyState
          title="კომისიები და ჯგუფები არ არის"
          description="შექმენით შემოწმების ჯგუფი და მიამაგრეთ წევრები."
          actionLabel={editable ? '+ ახალი კომისია' : undefined}
          onAction={editable ? () => setShowForm(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {comms.map((cm) => (
            <div key={cm.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <UsersRound className="w-4 h-4 text-sky-800 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{cm.name}</h3>
                  <p className="text-slate-500">{cm.type} · ბრძანება №{cm.orderNumber || '—'} ({formatGeorgianDate(cm.orderDate)})</p>
                </div>
              </div>
              <p className="text-slate-700">თავმჯდომარე: <strong>{cm.chairName}</strong></p>
              <div className="flex flex-wrap gap-1">
                {cm.members.map((m) => (
                  <StatusLabel key={m.id} label={`${m.fullName} (${m.roleInGroup})`} tone="slate" compact />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
