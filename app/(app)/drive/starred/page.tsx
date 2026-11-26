import { DriveView } from "@/lib/drive-page";

export const metadata = { title: "Starred · Vault" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <DriveView
      view="starred"
      path="/drive/starred"
      title="Starred"
      subtitle="The files you want close at hand."
      params={await searchParams}
    />
  );
}
