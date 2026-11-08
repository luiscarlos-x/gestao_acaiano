import Dashboard from "./ui/Dashboard";
import { createClient } from "../lib/supabase/server";
import { redirect } from "next/navigation";
import { readState } from "../lib/gestao/storage";
export const dynamic = "force-dynamic";
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const owner = user.id;
  let initial = null;
  try {
    initial = await readState(owner);
  } catch {}
  return <Dashboard initial={initial} userEmail={user.email ?? ""} />;
}
