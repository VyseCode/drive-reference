import { connectDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { User } from "@/models/User";
import type { UsageDTO } from "@/lib/types";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return fail("You must be signed in", 401);

    await connectDB();
    const user = await User.findById(session.userId).select("name email quotaBytes usedBytes").lean();
    if (!user) return fail("Your account no longer exists", 401);

    const usage: UsageDTO = {
      quotaBytes: user.quotaBytes,
      usedBytes: user.usedBytes,
      freeBytes: Math.max(0, user.quotaBytes - user.usedBytes),
      percent: user.quotaBytes > 0 ? Math.min(100, Math.round((user.usedBytes / user.quotaBytes) * 100)) : 0,
    };

    return ok({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        usage,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
