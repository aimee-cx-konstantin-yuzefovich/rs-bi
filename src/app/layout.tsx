import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/dashboard/theme-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ErrorBoundary } from "@/components/error-boundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Корпоративный BI-терминал RusSilica | CRM-аналитика в реальном времени",
  description:
    "BI-терминал RusSilica — аналитика продаж Bitrix24 в реальном времени: сделки, фильтры, воронки, ответственные, KPI-карточки и экспорт таблиц.",
  icons: {
    icon: "/russilica-logo.png",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-video-preview": -1,
      "max-image-preview": "none",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AuthProvider>
          <ErrorBoundary>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem={false}
              storageKey="bitrix-bi-theme"
            >
              {children}
              <Toaster />
            </ThemeProvider>
          </ErrorBoundary>
        </AuthProvider>
      </body>
    </html>
  );
}
