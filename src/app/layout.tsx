import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { obterContexto } from "@/lib/auth/dal";
import { classesFontes } from "@/lib/fontes";
import { obterTema } from "@/lib/temas";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sistema de Controladoria Municipal",
    template: "%s · Sistema de Controladoria Municipal",
  },
  description: "Controle interno, autoavaliação normativa, auditorias e planos de ação para a gestão pública municipal.",
  applicationName: "Sistema de Controladoria Municipal",
  authors: [{ name: "HorizonAJ" }],
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // O tema fica no <html> para valer também em diálogos, menus e avisos, que são renderizados fora do layout.
  const ctx = await obterContexto();
  const tema = obterTema(ctx?.cliente.tema);

  return (
    <html lang="pt-BR" data-tema={tema.id} className={`${classesFontes} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
