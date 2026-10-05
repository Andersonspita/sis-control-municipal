import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Filter, Lock } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente, db } from "@/lib/db";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconeArquivo } from "@/components/anexos/icone-arquivo";
import { categoriaPorMime, formatarTamanho } from "@/lib/arquivos";
import { formatarDataHora } from "@/lib/datas";
import { numeroDemanda } from "@/lib/demandas";
import { CLASSE_SELECT } from "../demandas/filtros";
import { filtrosDocumentos, ORIGENS, POR_PAGINA, whereDocumentos } from "./filtros";
import { FormUpload } from "./form-upload";

export const metadata: Metadata = { title: "Documentos" };

export default async function Documentos(props: PageProps<"/documentos">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const filtros = filtrosDocumentos(await props.searchParams);
  const where = whereDocumentos(filtros);

  const [unidades, total, documentos] = await comCliente(ctx, (tx) =>
    Promise.all([
      tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, sigla: true } }),
      tx.documento.count({ where }),
      tx.documento.findMany({
        where,
        orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
        skip: (filtros.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          nome: true,
          mimeType: true,
          tamanho: true,
          sha256: true,
          enviadoPorId: true,
          criadoEm: true,
          demanda: { select: { id: true, numero: true, ano: true, assunto: true, unidadeDestino: { select: { nome: true, sigla: true } } } },
          tramite: { select: { interno: true } },
          respostaRequisito: { select: { requisito: { select: { codigo: true, titulo: true } } } },
          acao: { select: { oQue: true, unidadeResponsavel: { select: { nome: true, sigla: true } } } },
          situacao: { select: { id: true, numero: true, ano: true, titulo: true } },
        },
      }),
    ]),
  );
  const ids = [...new Set(documentos.map((d) => d.enviadoPorId))];
  const usuarios = new Map(
    (await db.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]),
  );
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const temFiltro = filtros.origem || filtros.unidade || filtros.busca;

  const urlPagina = (p: number) => {
    const q = new URLSearchParams();
    if (filtros.origem) q.set("origem", filtros.origem);
    if (filtros.unidade) q.set("unidade", filtros.unidade);
    if (filtros.busca) q.set("busca", filtros.busca);
    if (p > 1) q.set("pagina", String(p));
    const s = q.toString();
    return s ? `/documentos?${s}` : "/documentos";
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Documentos"
        descricao="Repositório de arquivos da entidade: anexos de demandas, evidências de requisitos e de ações, e envios avulsos. Cada download fica registrado na trilha de auditoria."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent>
              <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="busca">Nome do arquivo</Label>
                  <Input id="busca" name="busca" defaultValue={filtros.busca} className="h-9" placeholder="Buscar por nome" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="origem">Origem</Label>
                  <select id="origem" name="origem" defaultValue={filtros.origem} className={CLASSE_SELECT}>
                    <option value="">Todas</option>
                    {Object.entries(ORIGENS).map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unidade">Unidade</Label>
                  <select id="unidade" name="unidade" defaultValue={filtros.unidade} className={CLASSE_SELECT}>
                    <option value="">Todas</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.sigla ? `${u.sigla} — ${u.nome}` : u.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                    <Filter aria-hidden="true" />
                    Filtrar
                  </button>
                  {temFiltro && (
                    <Link href="/documentos" className={buttonVariants({ variant: "ghost", size: "lg" })}>
                      Limpar
                    </Link>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Documentos{temFiltro ? " filtrados" : ""}: {total} encontrado(s), página {filtros.pagina} de {paginas}
                  </caption>
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th scope="col" className="px-5 py-3 font-medium">Documento</th>
                      <th scope="col" className="px-3 py-3 font-medium">Origem</th>
                      <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Enviado por</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Tamanho</th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        <span className="sr-only">Baixar</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentos.map((d) => {
                      const unidade = d.demanda?.unidadeDestino ?? d.acao?.unidadeResponsavel;
                      return (
                        <tr key={d.id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="max-w-xs px-5 py-3">
                            <span className="flex items-center gap-2">
                              <IconeArquivo categoria={categoriaPorMime(d.mimeType)} />
                              <a href={`/arquivos/${d.id}`} download={d.nome} className="truncate font-medium underline-offset-4 hover:underline">
                                {d.nome}
                              </a>
                            </span>
                            <span className="mt-0.5 block font-mono text-[0.68rem] text-muted-foreground" title={`SHA-256: ${d.sha256}`}>
                              SHA-256 {d.sha256.slice(0, 12)}…
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {d.demanda ? (
                              <>
                                <Link href={`/demandas/${d.demanda.id}`} className="underline-offset-4 hover:underline">
                                  Demanda <span className="font-mono text-xs font-semibold">{numeroDemanda(d.demanda.numero, d.demanda.ano)}</span>
                                </Link>
                                {d.tramite?.interno && (
                                  <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                                    <Lock aria-hidden="true" className="size-3" /> interno
                                  </span>
                                )}
                              </>
                            ) : d.respostaRequisito ? (
                              <span title={d.respostaRequisito.requisito.titulo}>
                                Requisito <span className="font-mono text-xs font-semibold">{d.respostaRequisito.requisito.codigo}</span>
                              </span>
                            ) : d.acao ? (
                              <span className="line-clamp-1" title={d.acao.oQue}>
                                Ação: {d.acao.oQue}
                              </span>
                            ) : d.situacao ? (
                              <Link href={`/medidas/${d.situacao.id}`} className="underline-offset-4 hover:underline" title={d.situacao.titulo}>
                                Medida <span className="font-mono text-xs font-semibold">{numeroDemanda(d.situacao.numero, d.situacao.ano)}</span>
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">Avulso</span>
                            )}
                            {unidade && <span className="block text-xs text-muted-foreground">{unidade.sigla ?? unidade.nome}</span>}
                          </td>
                          <td className="hidden px-3 py-3 lg:table-cell">
                            {usuarios.get(d.enviadoPorId) ?? "—"}
                            <span className="block text-xs text-muted-foreground">{formatarDataHora(d.criadoEm)}</span>
                          </td>
                          <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums text-muted-foreground">{formatarTamanho(d.tamanho)}</td>
                          <td className="px-5 py-3 text-right">
                            <a
                              href={`/arquivos/${d.id}`}
                              download={d.nome}
                              aria-label={`Baixar ${d.nome}`}
                              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                            >
                              <Download aria-hidden="true" />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                    {documentos.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                          {temFiltro ? "Nenhum documento encontrado com esses filtros." : "Nenhum documento enviado ainda."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {paginas > 1 && (
            <nav aria-label="Paginação" className="flex items-center justify-between gap-4 text-sm">
              <p className="text-muted-foreground">
                {total} documentos · página {filtros.pagina} de {paginas}
              </p>
              <div className="flex gap-2">
                {filtros.pagina > 1 && (
                  <Link href={urlPagina(filtros.pagina - 1)} className={buttonVariants({ variant: "outline" })}>
                    <ChevronLeft aria-hidden="true" /> Anterior
                  </Link>
                )}
                {filtros.pagina < paginas && (
                  <Link href={urlPagina(filtros.pagina + 1)} className={buttonVariants({ variant: "outline" })}>
                    Próxima <ChevronRight aria-hidden="true" />
                  </Link>
                )}
              </div>
            </nav>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Envio avulso</CardTitle>
            <CardDescription>Arquivos sem vínculo com demanda, requisito ou ação (normas internas, atos de nomeação etc.).</CardDescription>
          </CardHeader>
          <CardContent>
            <FormUpload />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
