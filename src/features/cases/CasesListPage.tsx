import React from 'react';
import { FilePlus2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CaseTableWidget } from './CaseTableWidget';

export const CasesListPage: React.FC = () => {
  const { casePresetFilter, setCasePresetFilter, navigate, can } = useApp();

  const presetLabels: Record<string, string> = {
    all: 'ყველა ქეისი',
    my_active: 'ჩემი აქტიური ქეისები',
    new: 'ახალი ქეისები',
    in_progress: 'პროცესში მყოფი ქეისები',
    overdue: 'ვადაგადაცილებული ქეისები',
    next_7_days: 'მომდევნო 7 დღეში შესასრულებელი',
    waiting_docs: 'დოკუმენტების მოლოდინში',
    waiting_reviews: 'რეცენზიის მოლოდინში',
    completed_month: 'მიმდინარე თვეში დასრულებული',
  };

  const activePresetTitle = casePresetFilter?.kpiPreset
    ? presetLabels[casePresetFilter.kpiPreset] || 'ყველა ქეისი'
    : 'ყველა ქეისი';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{activePresetTitle}</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            სრული ძებნა, მრავალკრიტერიუმიანი ფილტრაცია, სვეტების მორგება და CSV ექსპორტი
          </p>
        </div>
        <div className="flex items-center gap-2">
          {casePresetFilter?.kpiPreset && (
            <button
              type="button"
              onClick={() => setCasePresetFilter(null)}
              className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              ყველა ქეისის ჩვენება
            </button>
          )}
          {can('create') && (
            <button
              type="button"
              onClick={() => navigate('case_new')}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-sky-900 px-3.5 py-2 text-xs sm:text-sm font-medium text-white hover:bg-sky-950"
            >
              <FilePlus2 className="w-4 h-4" />
              ახალი ქეისი
            </button>
          )}
        </div>
      </div>

      <CaseTableWidget initialCriteria={casePresetFilter} />
    </div>
  );
};
