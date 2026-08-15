import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DemoProvider } from './state/DemoContext'
import { Landing } from './pages/Landing'
import { Access } from './pages/onboarding/Access'
import { Audience } from './pages/onboarding/Audience'
import { Catalog } from './pages/onboarding/Catalog'
import { Offer } from './pages/onboarding/Offer'
import { Outreach } from './pages/onboarding/Outreach'
import { AppShell } from './pages/app/AppShell'
import { Buyers } from './pages/app/Buyers'
import { CatalogView } from './pages/app/CatalogView'
import { Contract } from './pages/app/Contract'
import { ContractsList } from './pages/app/ContractsList'
import { Dashboard } from './pages/app/Dashboard'
import { LeadDetail } from './pages/app/LeadDetail'
import { BobbyLab } from './pages/BobbyLab'

export default function App() {
  return (
    <BrowserRouter>
      <DemoProvider>
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
      </DemoProvider>
    </BrowserRouter>
  )
}
