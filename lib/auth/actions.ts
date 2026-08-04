"use server";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

const RegisterSchema = z.object({
  name: z.string().trim().min(1, "姓名不能为空。").max(64),
  email: z.string().trim().email("请输入有效邮箱。"),
  password: z
    .string()
    .min(8, "密码至少 8 位。")
    .regex(/[a-zA-Z]/, "密码需包含字母。")
    .regex(/[0-9]/, "密码需包含数字。"),
});

export type AuthFormState = {
  errors?: {
    name?: string[];
    email?: string[];
    password?: string[];
  };
  message?: string;
};

export async function registerAction(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const validated = RegisterSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const email = validated.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { message: "该邮箱已注册，请直接登录。" };
  }

  try {
    await prisma.user.create({
      data: {
        name: validated.data.name,
        email,
        password: await hashPassword(validated.data.password),
      },
    });
  } catch (error) {
    console.error("registerAction failed:", error);
    return { message: "注册失败，请稍后重试。" };
  }

  try {
    await signIn("credentials", {
      email,
      password: validated.data.password,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "账号已创建，但自动登录失败，请手动登录。" };
    }

    throw error;
  }

  redirect("/");
}

const LoginSchema = z.object({
  email: z.string().trim().email("请输入有效邮箱。"),
  password: z.string().min(1, "请输入密码。"),
});

export async function loginAction(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const validated = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const rawCallback = formData.get("callbackUrl");
  const callbackUrl =
    typeof rawCallback === "string" && rawCallback.trim()
      ? rawCallback.trim()
      : "/";

  try {
    await signIn("credentials", {
      email: validated.data.email.toLowerCase(),
      password: validated.data.password,
      redirectTo: callbackUrl || "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "邮箱或密码错误。" };
    }

    throw error;
  }

  redirect(callbackUrl || "/");
}

export async function logoutAction() {
  const { signOut } = await import("@/auth");
  await signOut({ redirectTo: "/login" });
}
