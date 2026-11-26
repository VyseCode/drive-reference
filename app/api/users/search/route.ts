import { getSession } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("You must be signed in", 401);
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (!q) return ok({ users: [] });
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    await connectDB();
    const users = await User.find({
      _id: { $ne: session.userId },
      $or: [{ name: regex }, { email: regex }],
    })
      .select("name email")
      .limit(10)
      .lean();
    return ok({
      users: users.map((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
