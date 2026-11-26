import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vault — your files, in order",
  description:
    "A calm, private workspace for documents, folders and shared links.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-full bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
