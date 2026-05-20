import type { Metadata } from "next";
import { Roboto, Nunito, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/dashboard/theme-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { Providers } from "@/components/providers";

const roboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-roboto",
});

const nunito = Nunito({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-nunito",
});

const robotoMono = Roboto_Mono({
  weight: ["400", "500"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-roboto-mono",
});

export const metadata: Metadata = {
  title: "Корпоративный BI-терминал RusSilica | CRM-аналитика в реальном времени",
  description:
    "BI-терминал RusSilica — аналитика продаж Bitrix24 в реальном времени: сделки, фильтры, воронки, ответственные, KPI-карточки и экспорт таблиц.",
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
        className={`${roboto.variable} ${nunito.variable} ${robotoMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers>
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
        </Providers>
      </body>
    </html>
  );
}
