import { Alert } from "@/components/ui/alert";
import type { FormState } from "@/lib/validation";

export function FormAlert({ state }: { state: FormState }) {
  if (state?.error) return <Alert variant="error">{state.error}</Alert>;
  if (state?.success) return <Alert variant="success">{state.success}</Alert>;
  return null;
}
