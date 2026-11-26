import { DriveView } from "@/lib/drive-page";

export const metadata = { title: "My files · Vault" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <DriveView
      view="all"
      path="/drive"
      title="My files"
      subtitle="Folders and files you own, all in one place."
      params={await searchParams}
    />
  );
}
