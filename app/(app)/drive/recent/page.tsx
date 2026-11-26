import { DriveView } from "@/lib/drive-page";

export const metadata = { title: "Recent · Vault" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <DriveView
      view="recent"
      path="/drive/recent"
      title="Recent"
      subtitle="Your files and shared items, newest changes first."
      params={await searchParams}
    />
  );
}
