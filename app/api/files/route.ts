import { getSession } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { listFiles } from "@/lib/queries";
import { parseListParams } from "@/lib/route-utils";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return fail("You must be signed in", 401);
    await connectDB();
    const { searchParams } = new URL(request.url);
    return ok(await listFiles(parseListParams(searchParams, session.userId)));
  } catch (error) {
    return handleError(error);
  }
}
