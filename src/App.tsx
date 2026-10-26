import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { MerchantProvider } from './context/MerchantContext';
import { ToastProvider } from './context/ToastContext';
import { isConfigured } from './lib/supabase';
import { Alert, Empty } from './components/ui';
import { PublicLayout } from './layouts/PublicLayout';
import { PanelLayout } from './layouts/PanelLayout';
import { LandingPage } from './pages/public/Landing';
import { PrivacyPage, TermsPage } from './pages/public/Legal';
import { JoinPage } from './pages/public/JoinPage';
import { AcceptInvitationPage, AuthCallbackPage, CreateMerchantPage, ForgotPasswordPage, HomeRedirect, LoginPage, RegisterPage, ResetPasswordPage } from './pages/auth/AuthPages';
import { AccountPage, WalletCardPage, WalletPage } from './pages/wallet/WalletPages';
import { OperatePage } from './pages/operate/OperatePage';
import { PanelHome } from './pages/panel/Home';
import { OnboardingPage } from './pages/panel/Onboarding';
import { ProgramEditorPage, ProgramsPage } from './pages/panel/Programs';
import { CustomerDetailPage, CustomersPage, TransactionsPage } from './pages/panel/Customers';
import { AuditPage, BillingPage, BranchesPage, PromotionsPage, SettingsPage, SupportPage, TeamPage } from './pages/panel/Management';
import { SharePage } from './pages/panel/Share';
import { AdminAudit, AdminHome, AdminLayout, AdminMerchants, AdminPlans, AdminSettings, AdminSupport } from './pages/admin/AdminPages';

function NotConfigured() {
  return (
    <div className="container section narrow">
      <Alert kind="warn">
        Falta configurar Supabase. Copiá <code>.env.example</code> como <code>.env.local</code> y completá <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Ver README.
      </Alert>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ToastProvider>
        <AuthProvider>
          <MerchantProvider>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route index element={<LandingPage />} />
                <Route path="terminos" element={<TermsPage />} />
                <Route path="privacidad" element={<PrivacyPage />} />
                {isConfigured ? <>
                  <Route path="ingresar" element={<LoginPage />} />
                  <Route path="registro" element={<RegisterPage />} />
                  <Route path="recuperar" element={<ForgotPasswordPage />} />
                  <Route path="restablecer" element={<ResetPasswordPage />} />
                  <Route path="auth/callback" element={<AuthCallbackPage />} />
                  <Route path="crear-comercio" element={<CreateMerchantPage />} />
                  <Route path="invitacion/:token" element={<AcceptInvitationPage />} />
                  <Route path="unirse/:code" element={<JoinPage />} />
                  <Route path="inicio" element={<HomeRedirect />} />
                </> : <Route path="*" element={<NotConfigured />} />}
              </Route>
              {isConfigured && <>
                <Route path="mis-tarjetas" element={<WalletPage />} />
                <Route path="mis-tarjetas/:cardId" element={<WalletCardPage />} />
                <Route path="mi-cuenta" element={<AccountPage />} />
                <Route element={<PanelLayout />}>
                  <Route path="operar" element={<OperatePage />} />
                  <Route path="panel" element={<PanelHome />} />
                  <Route path="panel/onboarding" element={<OnboardingPage />} />
                  <Route path="panel/tarjetas" element={<ProgramsPage />} />
                  <Route path="panel/tarjetas/:id" element={<ProgramEditorPage />} />
                  <Route path="panel/clientes" element={<CustomersPage />} />
                  <Route path="panel/clientes/:cardId" element={<CustomerDetailPage />} />
                  <Route path="panel/movimientos" element={<TransactionsPage />} />
                  <Route path="panel/promociones" element={<PromotionsPage />} />
                  <Route path="panel/compartir" element={<SharePage />} />
                  <Route path="panel/equipo" element={<TeamPage />} />
                  <Route path="panel/sucursales" element={<BranchesPage />} />
                  <Route path="panel/configuracion" element={<SettingsPage />} />
                  <Route path="panel/suscripcion" element={<BillingPage />} />
                  <Route path="panel/auditoria" element={<AuditPage />} />
                  <Route path="panel/soporte" element={<SupportPage />} />
                </Route>
                <Route path="admin" element={<AdminLayout />}>
                  <Route index element={<AdminHome />} />
                  <Route path="comercios" element={<AdminMerchants />} />
                  <Route path="planes" element={<AdminPlans />} />
                  <Route path="soporte" element={<AdminSupport />} />
                  <Route path="auditoria" element={<AdminAudit />} />
                  <Route path="ajustes" element={<AdminSettings />} />
                </Route>
              </>}
              <Route path="*" element={<PublicLayout />}>
                <Route path="*" element={<div className="container section"><Empty title="Página no encontrada">El enlace no existe o fue movido.</Empty></div>} />
              </Route>
            </Routes>
          </MerchantProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
