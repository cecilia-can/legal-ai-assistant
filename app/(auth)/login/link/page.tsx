import { LinkOAuthForm } from "@/components/auth/LinkOAuthForm";

type LinkPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function LinkPage({ searchParams }: LinkPageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return <LinkOAuthForm token={token} />;
}
