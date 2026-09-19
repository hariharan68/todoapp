import { Navigate, Route, Routes } from "react-router-dom";
import { Navbar } from "./components/layout/Navbar";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { Chat } from "./pages/Chat";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Tasks } from "./pages/Tasks";
import { AiAdd } from "./pages/AiAdd";

export default function App() {
  return (
    <div className="min-h-full flex flex-col bg-[radial-gradient(ellipse_120%_60%_at_50%_-10%,theme(colors.slate.900),theme(colors.slate.950))]">
      <Navbar />
      <div className="flex-1">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <Tasks />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-add"
            element={
              <ProtectedRoute>
                <AiAdd />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Routes>
      </div>
    </div>
  );
}
