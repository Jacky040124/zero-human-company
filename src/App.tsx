import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DemoProvider } from './state/DemoContext'

const Landing = lazy(() => import('./pages/Landing').then(({ Landing }) => ({ default: Landing })))
const Access = lazy(() => import('./pages/onboarding/Access').then(({ Access }) => ({ default: Access })))
const Audience = lazy(() => import('./pages/onboarding/Audience').then(({ Audience }) => ({ default: Audience })))
const Catalog = lazy(() => import('./pages/onboarding/Catalog').then(({ Catalog }) => ({ default: Catalog })))
const Offer = lazy(() => import('./pages/onboarding/Offer').then(({ Offer }) => ({ default: Offer })))
const Outreach = lazy(() => import('./pages/onboarding/Outreach').then(({ Outreach }) => ({ default: Outreach })))
const AppShell = lazy(() => import('./pages/app/AppShell').then(({ AppShell }) => ({ default: AppShell })))
const Buyers = lazy(() => import('./pages/app/Buyers').then(({ Buyers }) => ({ default: Buyers })))
const CatalogView = lazy(() => import('./pages/app/CatalogView').then(({ CatalogView }) => ({ default: CatalogView })))
const Contract = lazy(() => import('./pages/app/Contract').then(({ Contract }) => ({ default: Contract })))
const ContractsList = lazy(() => import('./pages/app/ContractsList').then(({ ContractsList }) => ({ default: ContractsList })))
const Dashboard = lazy(() => import('./pages/app/Dashboard').then(({ Dashboard }) => ({ default: Dashboard })))
const LeadDetail = lazy(() => import('./pages/app/LeadDetail').then(({ LeadDetail }) => ({ default: LeadDetail })))
const BobbyLab = lazy(() => import('./pages/BobbyLab').then(({ BobbyLab }) => ({ default: BobbyLab })))

export default function App() {
  return (
    <BrowserRouter>
      <DemoProvider>
        <Suspense fallback={<div className="grid min-h-screen place-items-center bg-canvas text-sm text-muted">Opening the company…</div>}>
        <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/bobby-lab" element={<BobbyLab />} />
        <Route path="/onboarding/catalog" element={<Catalog />} />
        <Route path="/onboarding/offer" element={<Offer />} />
        <Route path="/onboarding/outreach" element={<Outreach />} />
        <Route path="/onboarding/audience" element={<Audience />} />
        <Route path="/onboarding/access" element={<Access />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="buyers" element={<Buyers />} />
          <Route path="catalog" element={<CatalogView />} />
          <Route path="contracts" element={<ContractsList />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          <Route path="leads/:id/contract" element={<Contract />} />
        </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </DemoProvider>
    </BrowserRouter>
  )
}
