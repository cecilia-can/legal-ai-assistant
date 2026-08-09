"use server";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { OAuthProviderId } from "@/lib/auth/oauth";
import { verifyAndConsumeOAuthLinkIntent } from "@/lib/auth/oauth-link";

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

export async function oauthSignInAction(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const provider = formData.get("provider");
  if (provider !== "github" && provider !== "google") {
    return { message: "不支持的第三方登录方式。" };
  }

  const callbackUrl = formData.get("callbackUrl");
  const redirectTo =
    typeof callbackUrl === "string" && callbackUrl.trim()
      ? callbackUrl.trim()
      : "/";

  try {
    await signIn(provider as OAuthProviderId, { redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "第三方登录失败，请重试或使用邮箱密码登录。" };
    }
    throw error;
  }

  return {};
}

const LinkOAuthAccountSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(1, "Password is required."),
});

export async function linkOAuthAccountAction(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const validated = LinkOAuthAccountSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const linkedAccount = await verifyAndConsumeOAuthLinkIntent({
    token: validated.data.token,
    password: validated.data.password,
  });

  if (!linkedAccount) {
    return {
      message: "绑定验证失败或链接已过期，请重新使用 GitHub / Google 登录。",
    };
  }

  try {
    await signIn("credentials", {
      email: linkedAccount.email,
      password: validated.data.password,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        message: "账号已绑定，但自动登录失败，请返回登录页使用邮箱密码登录。",
      };
    }

    throw error;
  }

  redirect("/");
}
