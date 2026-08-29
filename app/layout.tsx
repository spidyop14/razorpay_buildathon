import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "../components/app-providers";

export const metadata: Metadata = { title: "Agentic Commerce", description: "Commerce control center" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppProviders>{children}</AppProviders></body></html>;
}
