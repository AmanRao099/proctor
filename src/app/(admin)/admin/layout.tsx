import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { currentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login?reason=expired");
  if (user.role !== "admin") redirect("/dashboard");
  return <AdminShell user={user}>{children}</AdminShell>;
}
