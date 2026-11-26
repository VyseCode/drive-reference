import { DriveView } from "@/lib/drive-page";

export const metadata = { title: "Trash · Vault" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <DriveView
      view="trash"
      path="/drive/trash"
      title="Trash"
      subtitle="Deleted items stay here until you remove them forever."
      params={await searchParams}
    />
  );
}
