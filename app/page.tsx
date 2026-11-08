import Dashboard from "./ui/Dashboard";
import { getChatGPTUser } from "./chatgpt-auth";
import { readState } from "../lib/gestao/storage";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getChatGPTUser();
  const owner =
    user?.userId ??
    (process.env.NODE_ENV === "development" ? "local-preview" : null);
  let initial = null;
  if (owner) {
    try {
      initial = await readState(owner);
    } catch {}
  }
  return <Dashboard initial={initial} />;
}
