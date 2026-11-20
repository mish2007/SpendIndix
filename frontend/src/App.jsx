import Dashboard from "./pages/Dashboard";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Register from "./pages/Register";
import Terms from "./pages/Terms";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import EmailConfirmationCallback from "./pages/EmailConfirmationCallback";
import TransactionsPage from "./pages/Transactions";
import BudgetsPage from "./pages/Budgets";
import SavingsGoalsPage from "./pages/SavingsGoals";
import AnalyticsPage from "./pages/Analytics";
import ProfilePage from "./pages/Profile";
import ReportsPage from "./pages/Reports";
import SettingsPage from "./pages/Settings";
import AdvisorPage from "./pages/Advisor";
import AppShell from "./components/AppShell";
import { AuthProvider } from "./context/AuthProvider";
import ProtectedRoute from "./components/ProtectedRoute";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/register" element={<Register />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/forgot-password"
            element={<ForgotPassword />}
          />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/auth/callback"
            element={<EmailConfirmationCallback />}
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppShell pageTitle="Dashboard">
                  <Dashboard />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions"
            element={
              <ProtectedRoute>
                <TransactionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/budgets"
            element={
              <ProtectedRoute>
                <AppShell pageTitle="Budgets">
                  <BudgetsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/savings-goals"
            element={
              <ProtectedRoute>
                <AppShell pageTitle="Savings Goals">
                  <SavingsGoalsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
                    <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AppShell pageTitle="Profile">
                  <ProfilePage />
                </AppShell>
              </ProtectedRoute>
            }
          /><Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <AppShell pageTitle="Analytics">
                  <AnalyticsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <AppShell pageTitle="Reports">
                  <ReportsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <AppShell pageTitle="Settings">
                  <SettingsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/advisor"
            element={
              <ProtectedRoute>
                <AppShell pageTitle="AI Financial Advisor">
                  <AdvisorPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;


