import { exigirContexto } from "@/lib/auth/dal";
import { AppShell } from "@/components/shell/app-shell";

export default async function LayoutSatelite({ children }: { children: React.ReactNode }) {
  const ctx = await exigirContexto(["SATELITE"]);
  return (
    <AppShell ctx={ctx} variante="satelite">
      {children}
    </AppShell>
  );
}
