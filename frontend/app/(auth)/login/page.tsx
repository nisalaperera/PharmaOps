"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";
import Image from "next/image";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";
import APP_CONFIG from "@/lib/config";

const loginSchema = z.object({
  email:    z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [authError,    setAuthError]    = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(values: LoginFormValues) {
    setAuthError(null);

    const result = await signIn("credentials", {
      email:    values.email.toLowerCase().trim(),
      password: values.password,
      redirect: false,
    });

    if (result?.error) {
      setAuthError("Invalid email or password. Please try again.");
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4 relative overflow-hidden">

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10"
             style={{ background: "radial-gradient(circle, #008080, transparent)" }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-10"
             style={{ background: "radial-gradient(circle, #004B79, transparent)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-5"
             style={{ background: "radial-gradient(circle, #008080, transparent)" }} />
      </div>

      {/* Theme toggle — top right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      {/* Login card */}
      <div className="w-full max-w-md relative z-10 animate-slide-up">
        <div className="surface shadow-card-lg rounded-2xl p-8">

          {/* Header — org logo + org name */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <Image
              src={APP_CONFIG.orgLogo}
              alt={APP_CONFIG.orgName}
              width={48}
              height={48}
              className="rounded-xl object-contain"
            />
            <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>
              {APP_CONFIG.orgName}
            </h1>
          </div>

          {/* Auth error banner */}
          {authError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg mb-6 bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-400 text-sm animate-fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {/* Email */}
            <div>
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={`you@${APP_CONFIG.orgName.toLowerCase().replace(/\s+/g, "")}.lk`}
                className={cn("form-input", errors.email && "border-danger-500 focus:ring-danger-500")}
                {...register("email")}
              />
              {errors.email && (
                <p className="form-error">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={cn(
                    "form-input pr-10",
                    errors.password && "border-danger-500 focus:ring-danger-500"
                  )}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "var(--color-text-muted)" }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="form-error">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg",
                "text-sm font-semibold text-white transition-all duration-150",
                "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
              style={{
                background: isSubmitting
                  ? "#008080"
                  : "linear-gradient(135deg, #008080, #004B79)",
                boxShadow: "0 4px 14px rgba(0, 128, 128, 0.35)",
              }}
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Footer — app logo + app name + copyright */}
          <div className="flex flex-col items-center gap-1.5 mt-6">
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              &copy; {new Date().getFullYear()} {APP_CONFIG.appName}. All rights reserved.
            </p>
            <div className="flex items-center gap-2">
              <Image
                src={APP_CONFIG.appLogo}
                alt={APP_CONFIG.appName}
                width={144}
                height={32}
                className="object-contain opacity-60"
              />
              {/* <p className="text-md" style={{ color: "var(--color-text-muted)" }}>
                {APP_CONFIG.appName}
              </p> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
