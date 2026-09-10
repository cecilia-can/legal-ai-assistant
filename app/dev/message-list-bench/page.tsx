import { notFound } from "next/navigation";

import { MessageListBenchClient } from "./MessageListBenchClient";

export default function MessageListBenchPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <MessageListBenchClient />;
}
