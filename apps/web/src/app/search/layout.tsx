import type { Metadata } from "next";

export const metadata: Metadata = { title: "Memory Search" };

export default function SearchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
