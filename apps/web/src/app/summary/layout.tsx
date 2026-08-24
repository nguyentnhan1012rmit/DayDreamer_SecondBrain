import type { Metadata } from "next";

export const metadata: Metadata = { title: "Summary" };

export default function SummaryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
