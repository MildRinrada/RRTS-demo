import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { QueryState } from './components/ui';
import { StatusPage } from './screens/customer/StatusPage';
import { MyRepairs } from './screens/customer/MyRepairs';
import { DemoBar } from './screens/demo/DemoBar';
import { DemoHome } from './screens/demo/DemoHome';

// The shop's screens load on demand, so a customer opening the QR on a phone downloads only their page.
const shop = <T extends string>(name: T, load: () => Promise<Record<T, React.ComponentType>>) => lazy(() => load().then((m) => ({ default: m[name] })));
const LoginPage = shop('LoginPage', () => import('./screens/shop/LoginPage'));
const ShopLayout = shop('ShopLayout', () => import('./screens/shop/ShopLayout'));
const Board = shop('Board', () => import('./screens/shop/Board'));
const Intake = shop('Intake', () => import('./screens/shop/Intake'));
const JobPage = shop('JobPage', () => import('./screens/shop/JobPage'));
const Handover = shop('Handover', () => import('./screens/shop/Handover'));
const ScanPage = shop('ScanPage', () => import('./screens/shop/ScanPage'));
const StickerOpen = shop('StickerOpen', () => import('./screens/shop/ScanPage'));
const Customers = shop('Customers', () => import('./screens/shop/Customers'));
const CustomerPage = shop('CustomerPage', () => import('./screens/shop/Customers'));
const Reports = shop('Reports', () => import('./screens/shop/Reports'));
const Settings = shop('Settings', () => import('./screens/shop/Settings'));
const AuditPage = shop('AuditPage', () => import('./screens/shop/AuditPage'));
const AccountPage = shop('AccountPage', () => import('./screens/shop/AccountPage'));
const PrintPage = shop('PrintPage', () => import('./screens/demo/PrintPage'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <ScrollTop />
        <Routes>
          <Route path="/print/*" element={null} />
          <Route path="*" element={<DemoBar />} />
        </Routes>
        <Suspense
          fallback={
            <QueryState loading error={null}>
              {null}
            </QueryState>
          }
        >
          <Routes>
            <Route path="/" element={<DemoHome />} />
            <Route path="/print/:doc/:id" element={<PrintPage />} />
            <Route path="/j/:token" element={<StatusPage />} />
            <Route path="/me" element={<MyRepairs />} />

            <Route path="/login" element={<LoginPage />} />
            <Route path="/s/:token" element={<StickerOpen />} />
            <Route path="/shop" element={<ShopLayout />}>
              <Route index element={<Board />} />
              <Route path="intake" element={<Intake />} />
              <Route path="scan" element={<ScanPage />} />
              <Route path="jobs/:id" element={<JobPage />} />
              <Route path="jobs/:id/handover" element={<Handover />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id" element={<CustomerPage />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings/*" element={<Settings />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="account" element={<AccountPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </HashRouter>
  );
}
