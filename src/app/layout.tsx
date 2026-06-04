import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EquiForm",
  description:
    "The most advanced AI equine conformation analysis available",
  icons: {
    icon: "/equiform-logo.png",
    apple: "/equiform-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2dd4bf" />
      </head>
      <body className="min-h-full flex flex-col">
        <div className="flex-1">{children}</div>
        <footer>
          <p
            style={{
              fontSize: "11px",
              color: "#6b7280",
              textAlign: "center",
              padding: "8px 16px",
              borderTop: "1px solid #e5e7eb",
              marginTop: "8px",
            }}
          >
            AI-generated analysis is for informational purposes only and does
            not constitute veterinary advice.
            <a
              href="/disclaimer"
              style={{
                color: "#6b7280",
                textDecoration: "underline",
                marginLeft: "4px",
              }}
            >
              Full Disclaimer
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
