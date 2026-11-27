import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ConfirmDialog, ToastContainer } from './components/ui/CommonUI';
import { LoginPage } from './features/auth/LoginPage';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { CasesListPage } from './features/cases/CasesListPage';
import { CaseCreatePage } from './features/cases/CaseCreatePage';
import { CaseDetailPage } from './features/cases/CaseDetailPage';
import {
  ClinicsDirectoryPage,
  CommissionsDirectoryPage,
  DoctorsDirectoryPage,
} from './features/directories/DirectoriesPages';
import {
  CalendarVisitsPage,
  CorrespondenceRegistryPage,
  DocumentRequestsRegistryPage,
  DocumentVaultPage,
  ReviewsRegistryPage,
  TasksDeadlinesPage,
  VisitsRegistryPage,
} from './features/operations/OperationsPages';
import { ReportsPage, SettingsPage, UsersManagementPage } from './features/admin/AdminPages';

const MainRouter: React.FC = () => {
  const { currentUser, authLoading, activePage } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        სამუშაო სივრცე იტვირთება...
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <AppShell>
      {activePage === 'dashboard' && <DashboardPage />}
      {activePage === 'cases' && <CasesListPage />}
      {activePage === 'case_new' && <CaseCreatePage />}
      {activePage === 'case_detail' && <CaseDetailPage />}
      {activePage === 'tasks' && <TasksDeadlinesPage />}
      {activePage === 'calendar' && <CalendarVisitsPage />}
      {activePage === 'clinics' && <ClinicsDirectoryPage />}
      {activePage === 'doctors' && <DoctorsDirectoryPage />}
      {activePage === 'visits' && <VisitsRegistryPage />}
      {activePage === 'correspondence' && <CorrespondenceRegistryPage />}
      {activePage === 'documents_req' && <DocumentRequestsRegistryPage />}
      {activePage === 'reviews' && <ReviewsRegistryPage />}
      {activePage === 'commissions' && <CommissionsDirectoryPage />}
      {activePage === 'vault' && <DocumentVaultPage />}
      {activePage === 'reports' && <ReportsPage />}
      {activePage === 'users' && <UsersManagementPage />}
      {activePage === 'settings' && <SettingsPage />}
    </AppShell>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainRouter />
      <ToastContainer />
      <ConfirmDialog />
    </AppProvider>
  );
}
