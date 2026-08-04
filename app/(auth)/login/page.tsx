"use client";

import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-muted">加载中…</p>}>
      <LoginForm />
    </Suspense>
  );
}
