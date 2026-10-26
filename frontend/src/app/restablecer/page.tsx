import { Suspense } from "react";
import RestablecerForm from "@/modules/auth/components/RestablecerForm";

// HU-F4: restablecimiento con token (/restablecer?token=...)
export default function RestablecerPage() {
  return (
    <Suspense fallback={null}>
      <RestablecerForm />
    </Suspense>
  );
}
