import React, { useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { NavItemKey } from './components/layout/Sidebar';
import { OwnerDashboard } from './features/dashboard/OwnerDashboard';
import { PurchaseOrdersView } from './features/inventory/PurchaseOrdersView';
import { GrnView } from './features/inventory/GrnView';
import { TransferView } from './features/inventory/TransferView';
import { SiteConsumptionView } from './features/inventory/SiteConsumptionView';
import { WastageAdjustmentsView } from './features/inventory/WastageAdjustmentsView';
import { ApprovalsInboxView } from './features/approvals/ApprovalsInboxView';
import { ReportsView } from './features/reports/ReportsView';
import { MastersView } from './features/masters/MastersView';
import { ModuleSkeletonView } from './features/skeletons/ModuleSkeletonView';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavItemKey>('dashboard');

  const renderContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return <OwnerDashboard onNavigate={(tab) => setCurrentTab(tab)} />;
      case 'po':
        return <PurchaseOrdersView />;
      case 'grn':
        return <GrnView />;
      case 'transfers':
        return <TransferView />;
      case 'consumption':
        return <SiteConsumptionView />;
      case 'adjustments':
        return <WastageAdjustmentsView />;
      case 'approvals':
        return <ApprovalsInboxView />;
      case 'reports':
        return <ReportsView />;
      case 'masters':
        return <MastersView />;
      case 'fuel':
      case 'vehicles':
      case 'labour':
      case 'expenses':
      case 'plant':
      case 'contract':
      case 'costing':
      case 'alerts':
        return <ModuleSkeletonView moduleKey={currentTab} />;
      default:
        return <OwnerDashboard onNavigate={(tab) => setCurrentTab(tab)} />;
    }
  };

  return (
    <AppLayout currentTab={currentTab} onSelectTab={setCurrentTab}>
      {renderContent()}
    </AppLayout>
  );
};
export default App;
