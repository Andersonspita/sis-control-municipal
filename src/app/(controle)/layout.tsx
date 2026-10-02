import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { AppShell } from "@/components/shell/app-shell";

export default async function LayoutControle({ children }: { children: React.ReactNode }) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  return (
    <AppShell ctx={ctx} variante="controle">
      {children}
    </AppShell>
  );
}
