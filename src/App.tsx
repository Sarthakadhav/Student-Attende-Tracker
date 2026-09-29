import { useEffect, useState } from "react";
import { api, tokenStore } from "./api";
import Faculty from "./FComponents/Faculty";
import AuthPage from "./pages/AuthPage";
import ChangePassword from "./pages/ChangePassword";
import StudentDashboard from "./pages/StudentDashboard";
import type { AuthResponse, User } from "./types";

// The only App component:
// not logged in → Login / Faculty sign-up
// starting password → Change password
// student → Student portal, faculty → Faculty portal
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(() => Boolean(tokenStore.get()));

  useEffect(() => {
    if (!tokenStore.get()) return;
    api 
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => tokenStore.clear())
      .finally(() => setChecking(false));
  }, []);

  const handleAuthenticated = ({ token, user }: AuthResponse) => {
    tokenStore.set(token);
    setUser(user);
  };

  const handleLogout = () => {
    tokenStore.clear();
    setUser(null);
  };

  if (checking) return <p className="page-loading full-page">Loading…</p>;
  if (!user) return <AuthPage onAuthenticated={handleAuthenticated} />;
  if (user.mustChangePassword) {
    return <ChangePassword user={user} onChanged={setUser} onLogout={handleLogout} />;
  }

  return user.role === "faculty" ? (
    <Faculty user={user} onLogout={handleLogout} />
  ) : (
    <StudentDashboard user={user} onLogout={handleLogout} />
  );
}

export default App;