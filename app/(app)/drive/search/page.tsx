import { DriveView } from "@/lib/drive-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  return (
    <DriveView
      view="search"
      path="/drive/search"
      title={query ? `Results for “${query}”` : "Search"}
      subtitle={query ? "Files and folders whose names match your search." : "Search by file or folder name."}
      params={params}
    />
  );
}
