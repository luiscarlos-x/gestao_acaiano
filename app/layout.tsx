import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Açaíano | Gestão da açaíteria",
  description: "Caixa, estoque e compras da Açaíano.",
  icons: { icon: "/brand/fruto.png" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
