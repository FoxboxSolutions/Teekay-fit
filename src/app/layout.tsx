import type { Metadata } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { nonIndexableMeta } from "@/lib/env";
import "./globals.css";

// Barlow Condensed 700 : titres (dont le h1 du hero) — préchargée (critique).
const barlowCondensed700 = Barlow_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: "700",
  display: "swap",
  adjustFontFallback: true,
  preload: true,
  variable: "--font-barlow-condensed",
});

// Barlow Condensed 600 : graisses des composants UI (boutons, badges, onglets…),
// hors chemin critique du hero → chargée à la demande, sans préchargement.
const barlowCondensed600 = Barlow_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: "600",
  display: "swap",
  adjustFontFallback: true,
  preload: false,
  variable: "--font-barlow-condensed-600",
});

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  adjustFontFallback: true,
  variable: "--font-inter",
});

// Police d'accent du hero (titre d'accent uniquement). Pas de preload : le
// monogramme reste l'élément LCP et ne doit pas être concurrencé.
const youthShandey = localFont({
  src: "../../public/fonts/YouthShandey.otf",
  display: "swap",
  variable: "--font-youth-shandey",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "TeekayFit",
    description: "Hybrid Athlete & Performance Coach",
    // Défaut sûr : <meta name="robots" content="noindex, nofollow"> hors
    // production explicite ; hérité par toutes les pages enfants (audit M4).
    ...nonIndexableMeta(),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
      <html
        lang={locale}
        dir={locale === "ar" ? "rtl" : "ltr"}
        className={`${barlowCondensed700.variable} ${barlowCondensed600.variable} ${inter.variable} ${youthShandey.variable}`}
      >
      <body className="antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
