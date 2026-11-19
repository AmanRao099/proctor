import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  redirect(!user ? "/login" : user.role === "admin" ? "/admin" : "/dashboard");
}
