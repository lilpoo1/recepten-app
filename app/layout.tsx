import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recepten & Planning",
  description: "Beheer recepten en plan maaltijden",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import BottomNav from "@/components/BottomNav";
import { StoreProvider } from "@/context/StoreContext";
import HouseholdGate from "@/components/HouseholdGate";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body className="bg-gray-50 min-h-screen overflow-x-hidden pb-20">
        <StoreProvider>
          <main className="max-w-md mx-auto min-h-screen bg-white shadow-sm sm:my-4 sm:rounded-xl overflow-hidden">
            <HouseholdGate>{children}</HouseholdGate>
          </main>
          <BottomNav />
        </StoreProvider>
      </body>
    </html>
  );
}
