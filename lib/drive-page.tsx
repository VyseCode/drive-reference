import { notFound } from "next/navigation";
import { FileManager } from "@/components/FileManager";
import { requirePageSession } from "@/lib/guards";
import { connectDB } from "@/lib/db";
import { getBreadcrumbs, getNode, listFiles } from "@/lib/queries";
import { parseListParams } from "@/lib/route-utils";
import type { BreadcrumbDTO } from "@/lib/types";

type View = "all" | "recent" | "starred" | "trash" | "search";

export async function DriveView({
  view,
  path,
  title,
  subtitle,
  params,
}: {
  view: View;
  path: string;
  title: string;
  subtitle: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const session = await requirePageSession();
  await connectDB();

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") search.set(key, value);
    else if (Array.isArray(value) && typeof value[0] === "string") search.set(key, value[0]);
  }

  const options = parseListParams(search, session.userId);
  options.view = view;
  const data = await listFiles(options);

  let breadcrumbs: BreadcrumbDTO[] = [];
  if (view === "all" && options.folderId) {
    const node = await getNode(options.folderId.toString());
    if (!node || node.kind !== "folder" || node.trashed) notFound();
    breadcrumbs = await getBreadcrumbs(node, session.userId);
  }

  return (
    <FileManager
      view={view}
      path={path}
      title={title}
      subtitle={subtitle}
      initial={data}
      breadcrumbs={breadcrumbs}
      folderId={view === "all" ? (options.folderId?.toString() ?? null) : null}
      query={view === "search" ? options.query : ""}
      sort={options.sort}
      dir={options.dir}
      page={options.page}
    />
  );
}
