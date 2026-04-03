import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Image to LaTeX Converter",
  description: "Convert images to LaTeX code using AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
