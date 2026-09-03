import { Landing } from "@/components/marketing/landing";
import { publicConfig } from "@/config/public";
import { getSupabaseServerClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  let signedIn = false;
  if (publicConfig.supabase.url && publicConfig.supabase.anonKey) {
    try {
      const supabase = await getSupabaseServerClient();
      const { data } = await supabase.auth.getUser();
      signedIn = Boolean(data.user);
    } catch {
      signedIn = false;
    }
  }
  return <Landing signedIn={signedIn} />;
}
