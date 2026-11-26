import { redirect } from "next/navigation";
import { DriveShell } from "@/components/DriveShell";
import { requirePageSession } from "@/lib/guards";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";

export default async function DriveLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  await connectDB();
  const user = await User.findById(session.userId).select("name email").lean();
  if (!user) redirect("/login");

  return (
    <DriveShell user={{ name: user.name, email: user.email }}>{children}</DriveShell>
  );
}
