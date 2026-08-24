import type { Metadata } from "next";
import Script from "next/script";
import { AuthProvider } from "@/contexts/AuthContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DayDreamer — Your Personal Second Brain",
    template: "%s — DayDreamer",
  },
  description: "Capture your thoughts, track your mood, and build a timeline of your life with AI-powered memory search.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="theme-before-paint" strategy="beforeInteractive">
          {`try {
            var savedTheme = localStorage.getItem("theme");
            var useDarkTheme = savedTheme === "dark" || (savedTheme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
            document.documentElement.classList.toggle("dark", useDarkTheme);
            document.documentElement.style.colorScheme = useDarkTheme ? "dark" : "light";
          } catch (_) {}`}
        </Script>
        <ThemeProvider>
          <AuthProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
