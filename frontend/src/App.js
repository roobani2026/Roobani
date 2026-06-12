import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import MaintenanceBanner from "./components/MaintenanceBanner";
import Home from "./pages/Home";
import Plans from "./pages/Plans";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Contact from "./pages/Contact";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Cookies from "./pages/Cookies";
import Dashboard from "./pages/Dashboard";
import DashboardLayout from "./pages/DashboardLayout";
import DashTransactions from "./pages/DashTransactions";
import DashWithdraw from "./pages/DashWithdraw";
import DashUpgrade from "./pages/DashUpgrade";
import DashKyc from "./pages/DashKyc";
import DashNotifications from "./pages/DashNotifications";
import DashProfile from "./pages/DashProfile";
import AuthCallback from "./pages/AuthCallback";
import PasswordReset from "./pages/PasswordReset";
import PasswordResetConfirm from "./pages/PasswordResetConfirm";
import EmailVerify from "./pages/EmailVerify";
import Fund from "./pages/Fund";
// Admin tree is code-split: it's only loaded when an admin actually navigates
// to /admin/*, keeping the customer-facing bundle smaller.
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers"));
const AdminCustomerDetail = lazy(() => import("./pages/admin/AdminCustomerDetail"));
const AdminManagers = lazy(() => import("./pages/admin/AdminManagers"));
const AdminAudit = lazy(() => import("./pages/admin/AdminAudit"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminWithdrawals = lazy(() => import("./pages/admin/AdminWithdrawals"));
import ErrorBoundary from "./components/ErrorBoundary";
import PageTransition from "./components/PageTransition";
import CookieConsent from "./components/CookieConsent";
import { AuthProvider } from "./lib/auth";
import { AdminAuthProvider } from "./lib/adminAuth";
import { ThemeProvider } from "./lib/theme";
import { CurrencyProvider } from "./lib/currency";
import { Toaster } from "sonner";

function AdminLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAFAF8" }}>
      <div className="font-mono text-xs tracking-[0.2em] uppercase text-[#6B6B6B]">Loading admin console…</div>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

function AppRouter() {
  const location = useLocation();
  // OAuth callback (customer side) early-exit
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  const isAdminRoute = location.pathname.startsWith("/admin");
  const isAuthRoute = ["/login", "/signup", "/auth/forgot", "/auth/reset", "/auth/verify"].includes(location.pathname);
  if (isAdminRoute) {
    return (
      <AdminAuthProvider>
        <ScrollToTop />
        <ErrorBoundary scope="admin">
          <Suspense fallback={<AdminLoading />}>
            <Routes>
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="customers/:id" element={<AdminCustomerDetail />} />
                <Route path="withdrawals" element={<AdminWithdrawals />} />
                <Route path="managers" element={<AdminManagers />} />
                <Route path="audit" element={<AdminAudit />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </AdminAuthProvider>
    );
  }
  return (
    <>
      <ScrollToTop />
      <MaintenanceBanner />
      {!isAuthRoute && <Navbar />}
      <main className="min-h-screen">
        <PageTransition>
          <ErrorBoundary scope="site">
            <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/about" element={<Contact />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/cookies" element={<Cookies />} />
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="transactions" element={<DashTransactions />} />
              <Route path="withdraw" element={<DashWithdraw />} />
              <Route path="upgrade" element={<DashUpgrade />} />
              <Route path="kyc" element={<DashKyc />} />
              <Route path="notifications" element={<DashNotifications />} />
              <Route path="profile" element={<DashProfile />} />
            </Route>
            <Route path="/fund/:slug" element={<Fund />} />
            <Route path="/auth/forgot" element={<PasswordReset />} />
            <Route path="/auth/reset" element={<PasswordResetConfirm />} />
            <Route path="/auth/verify" element={<EmailVerify />} />
            <Route path="*" element={<Home />} />
            </Routes>
          </ErrorBoundary>
        </PageTransition>
      </main>
      {!isAuthRoute && <Footer />}
      <CookieConsent />
    </>
  );
}

export default function App() {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <CurrencyProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppRouter />
              <Toaster position="top-right" richColors closeButton />
            </BrowserRouter>
          </AuthProvider>
        </CurrencyProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}
