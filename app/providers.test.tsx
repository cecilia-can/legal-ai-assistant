import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/", provider: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("next-auth/react", () => ({ SessionProvider: ({ children, ...props }: { children: React.ReactNode }) => {
  mocks.provider(props);
  return <div data-testid="session-provider">{children}</div>;
} }));

import { Providers } from "./providers";

beforeEach(() => { mocks.pathname = "/"; mocks.provider.mockClear(); });

describe("route session provider", () => {
  it("knowledge pages do not mount the session client or request /api/auth/session", () => {
    mocks.pathname = "/knowledge-bases/kb-1/documents/doc-1";
    render(<Providers session={null}><p>文档</p></Providers>);
    expect(screen.getByText("文档")).toBeInTheDocument();
    expect(screen.queryByTestId("session-provider")).not.toBeInTheDocument();
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it("chat retains its session context without focus-triggered refetch", () => {
    render(<Providers session={null}><p>聊天</p></Providers>);
    expect(screen.getByTestId("session-provider")).toBeInTheDocument();
    expect(mocks.provider).toHaveBeenCalledWith(expect.objectContaining({ refetchOnWindowFocus: false }));
  });
});
