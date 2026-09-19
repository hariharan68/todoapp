import { AuthSplitLayout } from "../components/layout/AuthSplitLayout";
import { SignupForm } from "../components/auth/SignupForm";

export function Signup() {
  return (
    <AuthSplitLayout
      title="Create your account"
      subtitle="Start organizing your tasks with AI"
    >
      <SignupForm />
    </AuthSplitLayout>
  );
}
