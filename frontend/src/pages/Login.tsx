import { AuthSplitLayout } from "../components/layout/AuthSplitLayout";
import { LoginForm } from "../components/auth/LoginForm";

export function Login() {
  return (
    <AuthSplitLayout title="Welcome back" subtitle="Log in to manage your tasks">
      <LoginForm />
    </AuthSplitLayout>
  );
}
