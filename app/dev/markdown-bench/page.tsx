import { notFound } from "next/navigation";

import { MarkdownBenchClient } from "./MarkdownBenchClient";

export default function MarkdownBenchPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <MarkdownBenchClient />;
}
