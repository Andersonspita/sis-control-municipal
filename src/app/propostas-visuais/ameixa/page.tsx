import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, ArrowLeft, ChevronDown, CircleAlert, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { atkinson, atkinsonMono } from "../fontes";
import { Barra, Cartao, codigo, MarcaAmeixa, Prioridade, Risco, SeloAmeixa, Situacao, type ChaveSituacao } from "./kit";
import { TelaAutoavaliacao, TelaDemanda, TelaLogin, TelaNorma, TelaPainel, TelaPlano, TelaSatelite } from "./telas";
import { OUTROS_TOKENS_AMEIXA, TOKENS_AMEIXA } from "./tokens";

export const metadata: Metadata = { title: "Proposta 4 · Ameixa e ciano" };

function Secao({ id, titulo, descricao, children }: { id: string; titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{titulo}</h2>
        {descricao && <p className="max-w-3xl text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

const GRUPOS_SITUACAO: { g: string; s: ChaveSituacao[] }[] = [
  { g: "Requisito", s: ["naoAvaliado", "atende", "parcial", "naoAtende", "naoSeAplica"] },
  { g: "Demanda", s: ["enviada", "visualizada", "respondida", "emAnalise", "devolvida", "concluida", "cancelada", "vencida"] },
  { g: "Ação", s: ["naoIniciada", "emAndamento", "concluida", "atrasada", "cancelada"] },
];

function Componentes() {
  return (
    <div className="grid grid-cols-2 gap-5" id="componentes-grade">
      <Cartao className="space-y-4 p-5">
        <h3 className="font-bold">Botões</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="h-10 px-4">Principal</Button>
          <Button variant="secondary" className="h-10 px-4">Secundário</Button>
          <Button variant="outline" className="h-10 px-4">Contorno</Button>
          <Button className="h-10 bg-perigo px-4 text-white hover:bg-perigo/90"><Trash2 aria-hidden="true" /> Perigo</Button>
          <Button variant="ghost" className="h-10 px-4">Discreto</Button>
          <Button className="h-10 px-4 outline-2 outline-offset-2 outline-ring">Com foco</Button>
          <Button disabled className="h-10 px-4">Desabilitado</Button>
        </div>
        <h3 className="pt-2 font-bold">Tipografia</h3>
        <div className="space-y-1">
          <p className="text-2xl font-bold">Título de página · 24/700</p>
          <p className="text-lg font-bold">Título de seção · 18/700</p>
          <p className="text-[0.92rem]">Texto corrido de norma · 15/400, entrelinha 1,65</p>
          <p className="text-sm text-muted-foreground">Texto de apoio · 14/400</p>
          <p className={cn("text-sm", codigo)}>Art. 12, XIII, a · 15/10/2026 · R$ 1.234,56 · 00.000.000/0001-91</p>
        </div>
      </Cartao>

      <Cartao className="space-y-3 p-5">
        <h3 className="font-bold">Campos e seleção</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1"><label className="font-semibold">Campo</label><div className="flex h-10 items-center rounded-(--radius) border border-input bg-card px-3 text-muted-foreground">Digite o assunto</div></div>
          <div className="space-y-1"><label className="font-semibold">Com foco</label><div className="flex h-10 items-center rounded-(--radius) border border-ring bg-card px-3 outline-2 outline-offset-2 outline-ring">Lista de espera</div></div>
          <div className="space-y-1">
            <label className="font-semibold">Com erro</label>
            <div className="flex h-10 items-center rounded-(--radius) border-2 border-perigo bg-card px-3">15/13/2026</div>
            <p className="flex items-center gap-1 text-xs font-semibold text-perigo"><CircleAlert aria-hidden="true" className="size-3.5" /> Informe uma data válida.</p>
          </div>
          <div className="space-y-1"><label className="font-semibold">Seleção</label><div className="flex h-10 items-center justify-between rounded-(--radius) border border-input bg-card px-3">Secretaria de Saúde <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" /></div></div>
        </div>
        <div className="flex flex-wrap gap-4 pt-1 text-sm">
          <span className="flex items-center gap-2"><span className="flex size-[18px] items-center justify-center rounded-[4px] bg-primary text-[11px] font-bold text-white">✓</span> Caixa marcada</span>
          <span className="flex items-center gap-2"><span className="size-[18px] rounded-[4px] border-2 border-input" /> Caixa vazia</span>
          <span className="flex items-center gap-2"><span className="flex size-[18px] items-center justify-center rounded-full border-2 border-primary"><span className="size-2 rounded-full bg-primary" /></span> Opção escolhida</span>
        </div>
        <h3 className="pt-2 font-bold">Prioridade e risco</h3>
        <div className="flex flex-wrap items-center gap-4">
          <Prioridade p="baixa" /><Prioridade p="media" /><Prioridade p="alta" /><Prioridade p="urgente" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Risco nivel="baixo" /><Risco nivel="medio" /><Risco nivel="alto" /><Risco nivel="critico" />
        </div>
      </Cartao>

      <Cartao className="col-span-2 space-y-3 p-5">
        <h3 className="font-bold">Etiquetas de situação <span className="font-normal text-muted-foreground">— sempre com ícone e texto</span></h3>
        {GRUPOS_SITUACAO.map((g) => (
          <div key={g.g} className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-sm font-semibold text-muted-foreground">{g.g}</span>
            {g.s.map((s) => <Situacao key={s} s={s} />)}
          </div>
        ))}
      </Cartao>

      <Cartao className="space-y-3 p-5">
        <h3 className="font-bold">Cartão de indicador e tabela</h3>
        <div className="grid grid-cols-2 gap-3">
          <Cartao className="p-4">
            <div className="flex justify-between"><p className="text-sm font-semibold text-muted-foreground">Vencidas</p><span className="flex size-8 items-center justify-center rounded-md bg-perigo/10 text-perigo"><AlarmClock aria-hidden="true" className="size-4" /></span></div>
            <p className={cn("text-3xl font-bold", codigo)}>3</p>
            <p className="text-xs text-muted-foreground">SESAU 2 · SEDUC 1</p>
          </Cartao>
          <Cartao className="p-4">
            <p className="text-sm font-semibold text-muted-foreground">Aderência OT 05</p>
            <p className={cn("text-3xl font-bold text-primary", codigo)}>62%</p>
            <Barra valor={62} className="mt-2" />
          </Cartao>
        </div>
        <table className="w-full overflow-hidden rounded-(--radius) border text-sm">
          <thead className="bg-muted text-left text-xs font-bold text-muted-foreground uppercase"><tr><th className="px-3 py-2">Demanda</th><th className="px-3 py-2">Prazo</th><th className="px-3 py-2">Situação</th></tr></thead>
          <tbody className="divide-y">
            <tr><td className="px-3 py-2"><b className={codigo}>001/2026</b> Lista de espera</td><td className={cn("px-3 py-2", codigo)}>15/10/2026</td><td className="px-3 py-2"><Situacao s="emAnalise" /></td></tr>
            <tr className="bg-accent/60"><td className="px-3 py-2"><b className={codigo}>097/2025</b> Contratos</td><td className={cn("px-3 py-2 font-bold text-perigo", codigo)}>30/09/2026</td><td className="px-3 py-2"><Situacao s="vencida" /></td></tr>
          </tbody>
        </table>
      </Cartao>

      <Cartao className="space-y-3 p-5">
        <h3 className="font-bold">Linha do tempo e marca</h3>
        <ol className="space-y-3">
          {(["enviada", "respondida", "emAnalise"] as const).map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              <span className={cn("flex size-8 items-center justify-center rounded-full border-2 bg-card", i === 2 ? "border-alerta text-alerta" : "border-primary text-primary")}><Send aria-hidden="true" className="size-3.5" /></span>
              <Situacao s={s} />
              <span className={cn("ml-auto text-xs text-muted-foreground", codigo)}>0{i + 1}/10/2026 10:0{i}</span>
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-6 rounded-(--radius) bg-sidebar p-4">
          <MarcaAmeixa />
          <SeloAmeixa className="size-10 text-destaque" />
        </div>
        <div className="flex items-center gap-6 rounded-(--radius) border p-4">
          <MarcaAmeixa clara={false} />
          <span className="text-xs text-muted-foreground">Selo de conformidade: documento com marca de verificação. Convive com o brasão da entidade nos relatórios.</span>
        </div>
      </Cartao>
    </div>
  );
}

export default function PropostaAmeixa() {
  return (
    <main id="conteudo" data-tema="ameixa" className={cn(atkinson.variable, atkinsonMono.variable, "min-h-screen bg-background font-sans text-foreground")}>
      <div className="mx-auto w-[1360px] space-y-12 px-10 py-10">
        <header className="space-y-3">
          <Link href="/propostas-visuais" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-2">
            <ArrowLeft aria-hidden="true" className="size-4" /> Todas as propostas
          </Link>
          <h1 className="text-3xl font-bold">Proposta 4 · Ameixa e ciano</h1>
          <p className="max-w-3xl leading-relaxed text-muted-foreground">
            Ameixa profundo com detalhes em ciano e tipografia Atkinson Hyperlegible, criada pelo Braille Institute para máxima
            legibilidade. A navegação fica no topo, em dois níveis (grupo e item), e libera toda a largura da tela para tabelas e
            textos normativos. Datas, números e códigos de requisitos usam a versão monoespaçada, que alinha colunas e evita
            confundir 0/O e 1/l.
          </p>
          <p className="text-sm text-muted-foreground">Opção de escolha — ainda não aplicada ao sistema.</p>
        </header>

        <Secao id="tela-login" titulo="1 · Login"><TelaLogin /></Secao>
        <Secao id="tela-painel" titulo="2 · Painel do controlador" descricao="Cinco indicadores numa linha, aderência com o detalhamento por situação e prazos dos próximos 7 dias. Filtro por unidade no topo."><TelaPainel /></Secao>
        <Secao id="tela-norma" titulo="3 · Norma e árvore de requisitos" descricao="Sumário fixo à esquerda e área de leitura com linha de 68 caracteres, confortável para texto jurídico. Itens que não se aplicam ficam esmaecidos e com etiqueta tracejada."><TelaNorma /></Secao>
        <Secao id="tela-autoavaliacao" titulo="4 · Autoavaliação de um requisito" descricao="A situação é escolhida em quatro cartões grandes, com ícone, texto e descrição. A sugestão da IA fica separada, em ciano, sempre como pendente de revisão."><TelaAutoavaliacao /></Secao>
        <Secao id="tela-plano" titulo="5 · Plano de ação (5W2H)" descricao="Tabela densa com prioridade em barras (forma + texto) e painel lateral com os sete campos do 5W2H e os marcos de execução."><TelaPlano /></Secao>
        <Secao id="tela-demanda" titulo="6 · Demanda e tramitação" descricao="Linha do tempo imutável com autor, data e anexos de cada evento. As decisões do controlador ficam à direita."><TelaDemanda /></Secao>
        <Secao id="tela-satelite" titulo="7 · Área do satélite" descricao="Sem menus: só os pedidos, o prazo em linguagem simples e o botão de responder. Botões de 48 px no celular."><TelaSatelite /></Secao>

        <Secao id="componentes" titulo="Componentes base"><Componentes /></Secao>

        <Secao id="tokens" titulo="Tabela de tokens" descricao="Valores para aplicar no sistema (Tailwind CSS v4 + shadcn/ui). Todos os pares de texto atendem ao contraste mínimo de 4,5:1 (WCAG 2.1 AA).">
          <div className="grid grid-cols-[1.6fr_1fr] gap-5">
            <Cartao className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs font-bold text-muted-foreground uppercase"><tr><th className="px-3 py-2">Token</th><th className="px-3 py-2">Cor</th><th className="px-3 py-2">Uso</th></tr></thead>
                <tbody className="divide-y">
                  {TOKENS_AMEIXA.map((t) => (
                    <tr key={t.token}>
                      <td className={cn("px-3 py-1.5", codigo)}>{t.token}</td>
                      <td className="px-3 py-1.5"><span className="flex items-center gap-2"><span className="size-5 rounded-sm border" style={{ background: t.hex }} /><span className={codigo}>{t.hex}</span></span></td>
                      <td className="px-3 py-1.5 text-muted-foreground">{t.uso}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Cartao>
            <div className="space-y-5">
              <Cartao className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs font-bold text-muted-foreground uppercase"><tr><th className="px-3 py-2">Token</th><th className="px-3 py-2">Valor</th></tr></thead>
                  <tbody className="divide-y">
                    {OUTROS_TOKENS_AMEIXA.map((t) => (
                      <tr key={t.token}><td className="px-3 py-2 font-semibold">{t.token}<span className="block text-xs font-normal text-muted-foreground">{t.uso}</span></td><td className={cn("px-3 py-2", codigo)}>{t.valor}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Cartao>
              <Cartao className="space-y-2 p-4 text-sm">
                <p className="font-bold">Navegação</p>
                <p className="text-muted-foreground">Barra superior escura com os grupos (Painel, Conformidade, Atuação, Gestão) e uma segunda barra clara com os itens do grupo ativo. Em tablet, os grupos viram menu; no celular, menu lateral deslizante.</p>
              </Cartao>
            </div>
          </div>
        </Secao>
      </div>
    </main>
  );
}
