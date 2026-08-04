"use client";

const LOGIN_PATH = "/login";

export function redirectToLogin(): void {
  if (typeof window === "undefined") {
    return;
  }

  const callbackUrl = encodeURIComponent(
    `${window.location.pathname}${window.location.search}`,
  );
  window.location.href = `${LOGIN_PATH}?callbackUrl=${callbackUrl}`;
}

export function isUnauthorizedResponse(response: Response): boolean {
  return response.status === 401;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
  });

  if (isUnauthorizedResponse(response)) {
    redirectToLogin();
    throw new Error("UNAUTHORIZED");
  }

  return response;
}
