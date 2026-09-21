import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";
import { ChatIcon, ListIcon, LogOutIcon, SparklesIcon, StarIcon } from "../icons";
import { Clock } from "./Clock";

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  const linkClass = (path: string) =>
    `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
      location.pathname === path
        ? "bg-slate-800 text-white"
        : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
    }`;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initial = user.email.charAt(0).toUpperCase();

  return (
    <nav className="sticky top-0 z-10 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/40 bg-indigo-500/10">
              <StarIcon className="h-4 w-4 text-indigo-400" />
            </span>
            <span className="font-bold tracking-tight text-white">AI Todo</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
            <Link to="/tasks" className={linkClass("/tasks")}>
              <ListIcon className="h-4 w-4" />
              Tasks
            </Link>
            <Link to="/ai-add" className={linkClass("/ai-add")}>
              <SparklesIcon className="h-4 w-4" />
              AI Task
            </Link>
            <Link to="/chat" className={linkClass("/chat")}>
              <ChatIcon className="h-4 w-4" />
              Chat
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Clock />
          <span className="hidden h-5 w-px bg-slate-800 sm:block" />
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-xs font-semibold text-white">
            {initial}
          </span>
          <span className="hidden text-sm text-slate-400 sm:inline">{user.email}</span>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white"
          >
            Logout
            <LogOutIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}
