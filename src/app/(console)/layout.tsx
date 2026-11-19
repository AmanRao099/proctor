import { redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { currentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login?reason=expired");
  return (
    <>
      <TopBar user={user} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">{children}</main>
    </>
  );
}
