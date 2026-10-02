import type { ReactNode } from "react";
import {
  AlarmClock,
  ArrowRight,
  Building2,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  Filter,
  Hourglass,
  Inbox,
  ListChecks,
  Lock,
  Mail,
  Menu,
  MessageSquareText,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  CircleCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Barra,
  BarraTopo,
  Cartao,
  codigo,
  MarcaAmeixa,
  Moldura,
  Prioridade,
  SeloAmeixa,
  Situacao,
  SITUACOES,
  Trilha,
  type ChaveSituacao,
} from "./kit";

const foco = "outline-2 outline-offset-2 outline-ring";

/* 1 · Login */
export function TelaLogin() {
  return (
    <Moldura titulo="1 · Login" url="controladoria.horizonaj.com.br/login">
      <div className="grid h-[640px] grid-cols-[1.1fr_1fr]">
        <div className="relative flex flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground">
          <MarcaAmeixa />
          <div className="relative z-10 max-w-md space-y-6">
            <h2 className="text-[2rem] leading-tight font-bold text-white">
              Conformidade comprovada, prazos cumpridos e tudo registrado.
            </h2>
            <ul className="space-y-3 text-sm">
              {[
                "Autoavaliação da OT 05/2024 e da Resolução TCM-BA 1.120/2005",
                "Demandas às secretarias com prazo, resposta e anexos",
                "Trilha de auditoria imutável de cada ação",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destaque" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative z-10 text-xs text-sidebar-foreground/75">HorizonAJ · Tecnologia para o controle público</p>
          <svg aria-hidden="true" viewBox="0 0 400 400" className="absolute -right-24 -bottom-24 size-[420px] text-sidebar-accent">
            <rect x="40" y="40" width="320" height="320" rx="72" fill="none" stroke="currentColor" strokeWidth="28" />
            <rect x="120" y="120" width="160" height="160" rx="36" fill="none" stroke="currentColor" strokeWidth="20" />
          </svg>
        </div>
        <div className="flex flex-col justify-center bg-card px-16">
          <div className="mx-auto w-full max-w-sm space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold">Entrar</h2>
              <p className="text-sm text-muted-foreground">Use o e-mail e a senha cadastrados pela sua controladoria.</p>
            </div>
            <div role="alert" className="flex gap-2.5 rounded-(--radius) border border-perigo/30 bg-perigo/8 px-3 py-2.5 text-sm text-perigo">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="font-semibold">E-mail ou senha inválidos.</span>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">E-mail</label>
              <div className={cn("flex h-11 items-center gap-2 rounded-(--radius) border border-ring bg-card px-3", foco)}>
                <Mail aria-hidden="true" className="size-4 text-muted-foreground" />
                <span className="text-sm">maria.silva@exemplo.ba.gov.br</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-sm font-semibold">Senha</label>
                <span className="text-sm font-semibold text-primary underline underline-offset-2">Esqueci minha senha</span>
              </div>
              <div className="flex h-11 items-center gap-2 rounded-(--radius) border border-input bg-card px-3">
                <Lock aria-hidden="true" className="size-4 text-muted-foreground" />
                <span className="text-sm tracking-[0.3em]">••••••••</span>
              </div>
            </div>
            <Button className="h-11 w-full text-[0.95rem] font-semibold">Entrar</Button>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="size-4" /> Acesso restrito a servidores autorizados. Todos os acessos são registrados.
            </p>
          </div>
        </div>
      </div>
    </Moldura>
  );
}

/* 2 · Painel */
const INDICADORES = [
  { r: "Demandas em aberto", v: 12, d: "4 enviadas esta semana", i: Inbox, c: "text-primary bg-secondary" },
  { r: "Vencidas", v: 3, d: "SESAU 2 · SEDUC 1", i: AlarmClock, c: "text-perigo bg-perigo/10" },
  { r: "Aguardando análise", v: 4, d: "Respondidas pelas unidades", i: Hourglass, c: "text-alerta bg-alerta/10" },
  { r: "Ações atrasadas", v: 5, d: "de 31 no plano 2026", i: ListChecks, c: "text-perigo bg-perigo/10" },
  { r: "Unidades", v: 6, d: "Secretarias e fundos", i: Building2, c: "text-info bg-info/10" },
];

export function TelaPainel() {
  return (
    <Moldura titulo="2 · Painel do controlador" url="controladoria.horizonaj.com.br/painel">
      <BarraTopo grupo="Painel" />
      <div className="space-y-5 p-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold">Painel</h2>
            <p className="text-sm text-muted-foreground">Prefeitura Municipal de Exemplo · atualizado às 15:42</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 items-center gap-2 rounded-(--radius) border border-input bg-card px-3 text-sm">
              <Filter aria-hidden="true" className="size-4 text-muted-foreground" /> Unidade: <b>Todas</b>
              <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
            </span>
            <Button className="h-9 px-3.5"><Plus aria-hidden="true" /> Nova demanda</Button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {INDICADORES.map((k) => (
            <Cartao key={k.r} className="p-4">
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold text-muted-foreground">{k.r}</p>
                <span className={cn("flex size-8 items-center justify-center rounded-md", k.c)}>
                  <k.i aria-hidden="true" className="size-4" />
                </span>
              </div>
              <p className={cn("mt-1 text-3xl font-bold", codigo)}>{k.v}</p>
              <p className="mt-1 text-xs text-muted-foreground">{k.d}</p>
            </Cartao>
          ))}
        </div>

        <div className="grid grid-cols-[1.35fr_1fr] gap-4">
          <div className="space-y-4">
            <Cartao className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold">Aderência às normas</h3>
                <span className="text-xs text-muted-foreground">Ciclo Autoavaliação 2026</span>
              </div>
              {[
                { n: "OT 05/2024 — Rede de Controle", p: 62, a: 13, pa: 4, na: 5, t: 24 },
                { n: "Resolução TCM-BA 1.120/2005", p: 41, a: 38, pa: 21, na: 30, t: 118 },
              ].map((x) => (
                <div key={x.n} className="space-y-2 border-t py-3 first-of-type:border-t-0 first-of-type:pt-0">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold">{x.n}</span>
                    <span className={cn("text-lg font-bold text-primary", codigo)}>{x.p}%</span>
                  </div>
                  <Barra valor={x.p} />
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span><b className="text-sucesso">{x.a}</b> atendem</span>
                    <span><b className="text-alerta">{x.pa}</b> parcialmente</span>
                    <span><b className="text-perigo">{x.na}</b> não atendem</span>
                    <span className="ml-auto">{x.t} requisitos</span>
                  </div>
                </div>
              ))}
            </Cartao>
            <Cartao>
              <h3 className="border-b px-5 py-3 font-bold">Tramitações recentes</h3>
              <ul className="divide-y text-sm">
                {[
                  { s: "respondida" as const, t: "Secretaria de Saúde respondeu a demanda", d: "001/2026 — Lista de espera da regulação", q: "há 2 horas" },
                  { s: "enviada" as const, t: "Demanda enviada ao Gabinete", d: "002/2026 — Agenda de audiências públicas", q: "ontem" },
                  { s: "devolvida" as const, t: "Demanda devolvida para complementação", d: "098/2025 — Inventário patrimonial SEAD", q: "29/09/2026" },
                ].map((x) => (
                  <li key={x.d} className="flex items-center gap-3 px-5 py-3">
                    <Situacao s={x.s} className="w-32 justify-center" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{x.t}</span>
                      <span className="block truncate text-muted-foreground">{x.d}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{x.q}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
          </div>
          <Cartao>
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="font-bold">Prazos próximos</h3>
              <span className="text-xs text-muted-foreground">próximos 7 dias</span>
            </div>
            <ul className="divide-y text-sm">
              {[
                { dia: "05", mes: "out", t: "Responder diligência do TCM — Processo 12.345/26", u: "Controladoria", f: "vence em 3 dias", tom: "alerta" },
                { dia: "06", mes: "out", t: "Plano de capacitação da controladoria", u: "Ação · SEAD", f: "vence em 4 dias", tom: "neutro" },
                { dia: "07", mes: "out", t: "Folha de setembro — conferência", u: "Demanda 004/2026 · SEAD", f: "vence em 5 dias", tom: "neutro" },
                { dia: "08", mes: "out", t: "Relatório de frota e combustíveis", u: "Demanda 003/2026 · SEINFRA", f: "vence em 6 dias", tom: "neutro" },
                { dia: "30", mes: "set", t: "Contratos temporários da Educação", u: "Demanda 097/2025 · SEDUC", f: "vencida há 2 dias", tom: "perigo" },
              ].map((x) => (
                <li key={x.t} className="flex gap-3 px-5 py-3">
                  <span className={cn("flex w-11 shrink-0 flex-col items-center rounded-md border py-1 leading-none", x.tom === "perigo" && "border-perigo/40 bg-perigo/8 text-perigo")}>
                    <span className={cn("text-lg font-bold", codigo)}>{x.dia}</span>
                    <span className="text-[0.65rem] font-semibold uppercase">{x.mes}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{x.t}</span>
                    <span className="block text-xs text-muted-foreground">{x.u}</span>
                  </span>
                  <span className={cn("self-center text-xs font-semibold whitespace-nowrap", x.tom === "perigo" ? "text-perigo" : x.tom === "alerta" ? "text-alerta" : "text-muted-foreground")}>
                    {x.tom === "perigo" && <AlarmClock aria-hidden="true" className="mr-1 inline size-3.5" />}
                    {x.f}
                  </span>
                </li>
              ))}
            </ul>
          </Cartao>
        </div>
      </div>
    </Moldura>
  );
}

/* 3 · Norma */
function Etiqueta({ children, tom = "primaria" }: { children: ReactNode; tom?: "primaria" | "neutro" }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-sm px-1.5 text-[0.7rem] font-semibold", tom === "primaria" ? "bg-secondary text-secondary-foreground" : "border border-dashed border-input text-muted-foreground")}>
      {children}
    </span>
  );
}

function ItemNorma({ cod, titulo, texto, avaliavel, naoAplica, nivel = 0 }: { cod: string; titulo: string; texto?: string; avaliavel?: boolean; naoAplica?: boolean; nivel?: number }) {
  return (
    <div className={cn("border-l-2 py-3 pr-2", nivel === 0 ? "border-primary pl-4" : "border-border pl-4", naoAplica && "opacity-60")} style={{ marginLeft: nivel * 24 }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("text-xs font-semibold text-primary", codigo)}>{cod}</span>
        <h4 className={cn("font-bold", nivel === 0 ? "text-[0.95rem]" : "text-sm")}>{titulo}</h4>
        {avaliavel && <Etiqueta>avaliável</Etiqueta>}
        {naoAplica && <Etiqueta tom="neutro">não se aplica a câmara municipal</Etiqueta>}
      </div>
      {texto && <p className="mt-1.5 max-w-[68ch] text-[0.92rem] leading-relaxed text-foreground/85">{texto}</p>}
    </div>
  );
}

export function TelaNorma() {
  return (
    <Moldura titulo="3 · Norma e árvore de requisitos" url="controladoria.horizonaj.com.br/normas/tcmba-res-1120">
      <BarraTopo grupo="Conformidade" item="Normas" />
      <div className="grid grid-cols-[260px_1fr]">
        <aside className="border-r bg-card p-4">
          <p className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">Sumário</p>
          <ul className="space-y-0.5 text-sm">
            {["Arts. 1º a 4º — Disposições gerais", "Arts. 5º a 8º — Órgão Central", "Arts. 9º e 10 — Finalidades", "Art. 11 — Controle de pessoal", "Art. 12 — Atividades de controle", "Arts. 13 a 16 — Apoio ao controle externo", "Art. 17 — Relatório anual", "Arts. 18 a 23 — Disposições finais"].map((s, i) => (
              <li key={s} className={cn("rounded-md px-2.5 py-1.5", i === 4 ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground")}>{s}</li>
            ))}
          </ul>
        </aside>
        <div className="p-6">
          <Trilha partes={["Conformidade", "Normas", "Resolução TCM-BA 1.120/2005"]} />
          <div className="mt-2 flex items-start justify-between gap-6">
            <div>
              <h2 className="text-2xl font-bold">Resolução TCM-BA nº 1.120/2005 — Sistemas de Controle Interno Municipais</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tribunal de Contas dos Municípios do Estado da Bahia · <b className="text-foreground">91 requisitos avaliáveis</b> para câmara municipal
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-2">
              Texto oficial <ExternalLink aria-hidden="true" className="size-4" />
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2 border-b pb-3">
            {["Todos (147)", "Avaliáveis (91)", "Não se aplicam (27)"].map((f, i) => (
              <span key={f} className={cn("rounded-full px-3 py-1 text-sm font-semibold", i === 0 ? "bg-primary text-primary-foreground" : "border bg-card text-muted-foreground")}>{f}</span>
            ))}
            <span className="ml-auto flex h-9 w-72 items-center gap-2 rounded-(--radius) border border-input bg-card px-3 text-sm text-muted-foreground">
              <Search aria-hidden="true" className="size-4" /> Buscar no texto da norma
            </span>
          </div>
          <div className="mt-2">
            <ItemNorma cod="Art. 1º" titulo="Implantação e manutenção integrada do Sistema de Controle Interno" avaliavel texto="Os Poderes Executivo e Legislativo municipais implantarão e manterão, de forma integrada, Sistemas de Controle Interno Municipais, de conformidade com o mandamento contido no art. 74, I a IV, da Constituição da República Federativa do Brasil, e no art. 90, I a IV e respectivo parágrafo único, da Constituição do Estado da Bahia." />
            <ItemNorma cod="Art. 5º" titulo="Órgão Central criado por lei e diretamente subordinado ao chefe do Poder" avaliavel texto="As atividades dos Sistemas de Controle Interno Municipais serão atribuídas a unidades específicas – os Órgãos Centrais do Sistema – que, criadas por lei municipal, possuam estruturas condizentes com o porte e a complexidade do respectivo Poder, ficando diretamente subordinada ao Prefeito ou Presidente de Câmara, conforme o caso…" />
            <ItemNorma nivel={1} cod="Art. 5º, parágrafo único" titulo="Órgãos setoriais do Executivo reportando-se ao Órgão Central" naoAplica />
            <ItemNorma cod="Art. 12" titulo="Atividades de controle" texto="Para o pleno exercício de sua competência, os Sistemas de Controle Interno Municipais deverão desempenhar, dentre outras, as seguintes atividades de controle:" />
            <ItemNorma nivel={1} cod="Art. 12, XII" titulo="Dívida Ativa" naoAplica />
            <ItemNorma nivel={1} cod="Art. 12, XIII" titulo="Despesa Pública" />
            <ItemNorma nivel={2} cod="Art. 12, XIII, a" titulo="Descrições claras em empenhos, notas e cotações" avaliavel texto="verificar a existência de descrições e especificações lançadas, de forma clara e detalhada, nas Notas de Empenho, Notas Fiscais, Recibos, cotações de preços, nos casos de aquisições por dispensa de licitação, e outros documentos similares;" />
          </div>
        </div>
      </div>
    </Moldura>
  );
}

/* 4 · Autoavaliação */
const OPCOES: { s: ChaveSituacao; d: string }[] = [
  { s: "atende", d: "Requisito cumprido e comprovado" },
  { s: "parcial", d: "Cumprido em parte" },
  { s: "naoAtende", d: "Não cumprido" },
  { s: "naoSeAplica", d: "Não aplicável à entidade" },
];

export function TelaAutoavaliacao() {
  return (
    <Moldura titulo="4 · Autoavaliação de um requisito" url="controladoria.horizonaj.com.br/autoavaliacao/2026/ot05-i-1">
      <BarraTopo grupo="Conformidade" item="Autoavaliação" />
      <div className="flex items-center gap-4 border-b bg-card px-6 py-3">
        <span className="text-sm font-bold">Autoavaliação 2026</span>
        <span className="text-sm text-muted-foreground">OT 05/2024</span>
        <span className="flex flex-1 items-center gap-3">
          <Barra valor={75} className="max-w-xs flex-1" />
          <span className="text-sm"><b className={codigo}>18</b> de <b className={codigo}>24</b> respondidos</span>
        </span>
        <Button variant="outline" className="h-9"><ChevronLeft aria-hidden="true" /> Anterior</Button>
        <Button variant="outline" className="h-9">Próximo <ChevronRight aria-hidden="true" /></Button>
      </div>
      <div className="grid grid-cols-[1fr_380px] gap-5 p-6">
        <div className="space-y-5">
          <div>
            <span className={cn("text-sm font-semibold text-primary", codigo)}>OT 05, I.1</span>
            <h2 className="text-xl font-bold">Controladoria criada por lei específica</h2>
            <p className="mt-2 max-w-[75ch] text-[0.92rem] leading-relaxed text-foreground/85">
              As Controladorias Internas Municipais, criadas por lei municipal, devem possuir estruturas adequadas ao porte e à complexidade do respectivo órgão, garantindo autonomia administrativa e financeira.
            </p>
            <p className="mt-2 text-sm text-muted-foreground"><b>Evidência esperada:</b> lei de criação da unidade de controle interno, com número e data de publicação.</p>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Situação do requisito</legend>
            <div className="grid grid-cols-4 gap-2">
              {OPCOES.map(({ s, d }) => {
                const { rotulo, icone: Icone } = SITUACOES[s];
                const marcado = s === "atende";
                return (
                  <span key={s} className={cn("flex flex-col gap-1 rounded-(--radius) border-2 bg-card p-3", marcado ? "border-sucesso bg-sucesso/6" : "border-border")}>
                    <span className="flex items-center gap-2">
                      <span className={cn("flex size-4 items-center justify-center rounded-full border-2", marcado ? "border-sucesso" : "border-input")}>
                        {marcado && <span className="size-2 rounded-full bg-sucesso" />}
                      </span>
                      <Icone aria-hidden="true" className={cn("size-4", marcado ? "text-sucesso" : "text-muted-foreground")} />
                      <span className="text-sm font-bold">{rotulo}</span>
                    </span>
                    <span className="pl-6 text-xs text-muted-foreground">{d}</span>
                  </span>
                );
              })}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <label className="text-sm font-bold">Justificativa</label>
            <div className={cn("min-h-28 rounded-(--radius) border border-ring bg-card p-3 text-[0.92rem] leading-relaxed", foco)}>
              A Controladoria-Geral do Município foi criada pela Lei Municipal nº 1.234, de 12/03/2019, publicada no Diário Oficial do Município em 13/03/2019, que define sua estrutura, atribuições e subordinação direta ao Prefeito.
            </div>
            <p className="text-right text-xs text-muted-foreground">212 / 4.000 caracteres</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Evidências</span>
              <div className="flex gap-2">
                <Button variant="outline" className="h-9"><Send aria-hidden="true" /> Solicitar documento a uma unidade</Button>
                <Button variant="secondary" className="h-9"><Upload aria-hidden="true" /> Anexar arquivo</Button>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-(--radius) border bg-card px-3 py-2.5">
              <FileText aria-hidden="true" className="size-5 text-primary" />
              <span className="flex-1 text-sm"><b>Lei Municipal nº 1.234/2019.pdf</b> <span className="text-muted-foreground">· 2,1 MB · enviado por Maria Controladora em 28/09/2026</span></span>
              <span className="text-sm font-semibold text-primary">Abrir</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="ghost" className="h-10">Descartar</Button>
            <Button variant="secondary" className="h-10">Salvar rascunho</Button>
            <Button className="h-10 px-4">Salvar e ir para o próximo <ArrowRight aria-hidden="true" /></Button>
          </div>
        </div>
        <aside className="space-y-3">
          <Cartao className="overflow-hidden border-destaque">
            <div className="flex items-center gap-2 bg-destaque/15 px-4 py-2.5">
              <Sparkles aria-hidden="true" className="size-4 text-destaque-foreground" />
              <span className="text-sm font-bold text-destaque-foreground">Sugestão da IA</span>
              <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-[0.7rem] font-semibold text-destaque-foreground ring-1 ring-destaque">pendente de revisão</span>
            </div>
            <div className="space-y-3 p-4 text-sm">
              <p className="flex items-center gap-2"><span className="text-muted-foreground">Situação sugerida:</span> <Situacao s="atende" /></p>
              <blockquote className="border-l-4 border-destaque bg-muted px-3 py-2 text-[0.85rem] leading-relaxed italic">
                “Fica criada a Controladoria-Geral do Município, órgão central do Sistema de Controle Interno, diretamente subordinada ao Chefe do Poder Executivo…”
              </blockquote>
              <p className="text-xs text-muted-foreground">Lei Municipal nº 1.234/2019.pdf · <b>página 1, art. 1º</b></p>
              <div className="flex gap-2">
                <Button className="h-8 flex-1">Aceitar</Button>
                <Button variant="outline" className="h-8 flex-1">Editar</Button>
                <Button variant="ghost" className="h-8">Descartar</Button>
              </div>
            </div>
          </Cartao>
          <Cartao className="p-4 text-sm">
            <p className="mb-2 font-bold">Requisitos relacionados</p>
            <p className="text-muted-foreground"><span className={codigo}>Res. 1.120, Art. 5º</span> — a mesma evidência também atende ao Órgão Central criado por lei.</p>
          </Cartao>
        </aside>
      </div>
    </Moldura>
  );
}

/* 5 · Plano de ação */
const ACOES: { t: string; o: string; r: string; u: string; p: string; pr: "baixa" | "media" | "alta" | "urgente"; e: number; s: ChaveSituacao }[] = [
  { t: "Encaminhar à Câmara projeto de lei de reestruturação da controladoria", o: "Requisito OT 05, I", r: "Gabinete do Prefeito", u: "GAB", p: "30/11/2026", pr: "alta", e: 40, s: "emAndamento" },
  { t: "Realizar concurso para auditor de controle interno", o: "Requisito OT 05, II", r: "Secretaria de Administração", u: "SEAD", p: "30/06/2027", pr: "media", e: 10, s: "emAndamento" },
  { t: "Implantar recadastramento anual de inativos", o: "Auditoria 02/2026", r: "Diretoria de Pessoal", u: "SEAD", p: "15/09/2026", pr: "alta", e: 60, s: "atrasada" },
  { t: "Regularizar contratos temporários sem processo seletivo", o: "Determinação TCM", r: "Secretaria de Educação", u: "SEDUC", p: "20/10/2026", pr: "urgente", e: 0, s: "naoIniciada" },
  { t: "Instituir controle de abastecimento por veículo", o: "Medida 05/2026", r: "Secretaria de Infraestrutura", u: "SEINFRA", p: "31/08/2026", pr: "media", e: 100, s: "concluida" },
];

export function TelaPlano() {
  return (
    <Moldura titulo="5 · Plano de ação (5W2H)" url="controladoria.horizonaj.com.br/planos/2026">
      <BarraTopo grupo="Conformidade" item="Planos de ação" />
      <div className="grid grid-cols-[1fr_420px]">
        <div className="space-y-4 p-6">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold">Plano de ação 2026</h2>
              <p className="text-sm text-muted-foreground">31 ações · 5 atrasadas · execução média 46%</p>
            </div>
            <Button className="h-9"><Plus aria-hidden="true" /> Nova ação</Button>
          </div>
          <div className="flex gap-2 text-sm">
            {["Origem: todas", "Unidade: todas", "Situação: abertas", "Prioridade: todas"].map((f) => (
              <span key={f} className="flex h-8 items-center gap-1.5 rounded-(--radius) border border-input bg-card px-2.5">{f}<ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" /></span>
            ))}
          </div>
          <Cartao className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs font-bold text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2.5">Ação</th>
                  <th className="px-3 py-2.5">Responsável</th>
                  <th className="px-3 py-2.5">Prazo</th>
                  <th className="px-3 py-2.5">Prioridade</th>
                  <th className="px-3 py-2.5">Execução</th>
                  <th className="px-3 py-2.5">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ACOES.map((a, i) => (
                  <tr key={a.t} className={cn(i === 0 && "bg-accent/60 shadow-[inset_3px_0_0_var(--primary)]")}>
                    <td className="px-3 py-2.5">
                      <span className="block font-semibold leading-snug">{a.t}</span>
                      <span className="text-xs text-muted-foreground">{a.o}</span>
                    </td>
                    <td className="px-3 py-2.5">{a.r}<span className={cn("block text-xs text-muted-foreground", codigo)}>{a.u}</span></td>
                    <td className={cn("px-3 py-2.5 whitespace-nowrap", codigo, a.s === "atrasada" && "font-bold text-perigo")}>{a.p}</td>
                    <td className="px-3 py-2.5"><Prioridade p={a.pr} /></td>
                    <td className="w-28 px-3 py-2.5">
                      <span className={cn("text-xs font-semibold", codigo)}>{a.e}%</span>
                      <Barra valor={a.e} className="mt-1 h-1.5" cor={a.e === 100 ? "bg-sucesso" : "bg-primary"} />
                    </td>
                    <td className="px-3 py-2.5"><Situacao s={a.s} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>
        </div>
        <aside className="border-l bg-card p-5">
          <div className="flex items-center gap-2">
            <Situacao s="emAndamento" />
            <Prioridade p="alta" />
          </div>
          <h3 className="mt-2 text-lg leading-snug font-bold">Encaminhar à Câmara projeto de lei de reestruturação da controladoria</h3>
          <dl className="mt-4 divide-y rounded-(--radius) border text-sm">
            {[
              ["O quê", "Elaborar e encaminhar projeto de lei que reestrutura a Controladoria-Geral, com as quatro macrofunções."],
              ["Por quê", "Não atende à OT 05/2024, item I (estrutura e autonomia)."],
              ["Onde", "Gabinete do Prefeito e Procuradoria-Geral"],
              ["Quem", "Gabinete do Prefeito — João Pereira (chefe de gabinete)"],
              ["Quando", "30/11/2026"],
              ["Como", "Minuta pela controladoria, revisão jurídica e envio à Câmara."],
              ["Quanto custa", "R$ 0,00 (sem impacto orçamentário imediato)"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[96px_1fr] gap-3 px-3 py-2">
                <dt className="font-bold text-primary">{k}</dt>
                <dd className={k === "Quando" ? codigo : undefined}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="font-bold">Execução</span><span className={cn("font-bold", codigo)}>40%</span></div>
            <Barra valor={40} />
            <ul className="mt-2 space-y-1 text-sm">
              <li className="flex items-center gap-2"><CircleCheck aria-hidden="true" className="size-4 text-sucesso" /> Minuta elaborada <span className="ml-auto text-xs text-muted-foreground">10/09</span></li>
              <li className="flex items-center gap-2"><CircleCheck aria-hidden="true" className="size-4 text-sucesso" /> Revisão da Procuradoria <span className="ml-auto text-xs text-muted-foreground">25/09</span></li>
              <li className="flex items-center gap-2 text-muted-foreground"><span className="size-4 rounded-full border-2 border-input" /> Envio à Câmara <span className="ml-auto text-xs">até 30/11</span></li>
            </ul>
          </div>
        </aside>
      </div>
    </Moldura>
  );
}

/* 6 · Demanda */
const EVENTOS: { s: ChaveSituacao; quem: string; quando: string; texto?: string; anexos?: string[] }[] = [
  { s: "enviada", quem: "Maria Controladora", quando: "01/10/2026 09:12", texto: "Solicito a lista de espera atualizada da regulação, por especialidade, com data de entrada de cada paciente." },
  { s: "visualizada", quem: "Carlos Mendes · Secretário de Saúde", quando: "01/10/2026 14:30" },
  { s: "respondida", quem: "Carlos Mendes · Secretário de Saúde", quando: "02/10/2026 10:05", texto: "Segue a lista extraída do sistema de regulação em 01/10 e a nota técnica com a metodologia.", anexos: ["lista-espera-regulacao-out2026.xlsx · 480 KB", "nota-tecnica-regulacao.pdf · 1,2 MB"] },
  { s: "emAnalise", quem: "Maria Controladora", quando: "02/10/2026 11:20" },
];

export function TelaDemanda() {
  return (
    <Moldura titulo="6 · Demanda e tramitação" url="controladoria.horizonaj.com.br/demandas/2026-001">
      <BarraTopo grupo="Atuação" item="Demandas" />
      <div className="grid grid-cols-[1fr_340px] gap-6 p-6">
        <div>
          <Trilha partes={["Atuação", "Demandas", "001/2026"]} />
          <div className="mt-2 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold"><span className={cn("text-primary", codigo)}>001/2026</span> — Lista de espera da regulação</h2>
              <p className="mt-1 text-sm text-muted-foreground">Enviada à <b className="text-foreground">Secretaria Municipal de Saúde (SESAU)</b> · origem: Medida 03/2026</p>
            </div>
            <Situacao s="emAnalise" />
          </div>
          <h3 className="mt-6 mb-3 text-sm font-bold tracking-wide text-muted-foreground uppercase">Histórico de tramitação</h3>
          <ol className="relative space-y-0">
            {EVENTOS.map((e, i) => {
              const { icone: Icone } = SITUACOES[e.s];
              const ultimo = i === EVENTOS.length - 1;
              return (
                <li key={e.quando} className="relative flex gap-4 pb-5">
                  {!ultimo && <span className="absolute top-9 bottom-0 left-[17px] w-0.5 bg-border" aria-hidden="true" />}
                  <span className={cn("z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2 bg-card", ultimo ? "border-alerta text-alerta" : "border-primary text-primary")}>
                    <Icone aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Situacao s={e.s} />
                      <span className="text-sm font-semibold">{e.quem}</span>
                      <span className={cn("ml-auto text-xs text-muted-foreground", codigo)}>{e.quando}</span>
                    </div>
                    {e.texto && <p className="mt-2 rounded-(--radius) border bg-card p-3 text-sm leading-relaxed">{e.texto}</p>}
                    {e.anexos && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {e.anexos.map((a) => (
                          <span key={a} className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-semibold"><Paperclip aria-hidden="true" className="size-3.5 text-primary" />{a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock aria-hidden="true" className="size-3.5" /> Histórico imutável: os registros não podem ser editados nem excluídos.</p>
        </div>
        <aside className="space-y-3">
          <Cartao className="divide-y text-sm">
            {[
              ["Prazo", "15/10/2026", "vence em 13 dias"],
              ["Prioridade", null, null],
              ["Destinatário", "Carlos Mendes", "Secretário de Saúde"],
              ["Criada por", "Maria Controladora", "01/10/2026"],
            ].map(([k, v, d]) => (
              <div key={k} className="flex items-start justify-between px-4 py-2.5">
                <span className="text-muted-foreground">{k}</span>
                {k === "Prioridade" ? <Prioridade p="alta" /> : (
                  <span className="text-right"><b className={k === "Prazo" ? codigo : undefined}>{v}</b><span className="block text-xs text-muted-foreground">{d}</span></span>
                )}
              </div>
            ))}
          </Cartao>
          <Cartao className="space-y-3 p-4">
            <p className="text-sm font-bold">Analisar resposta</p>
            <div className="min-h-20 rounded-(--radius) border border-input bg-card p-2.5 text-sm text-muted-foreground">Parecer da controladoria (opcional)…</div>
            <Button className="h-10 w-full bg-sucesso hover:bg-sucesso/90"><CircleCheck aria-hidden="true" /> Aceitar e concluir</Button>
            <Button variant="outline" className="h-10 w-full"><RotateCcw aria-hidden="true" /> Devolver para complementação</Button>
          </Cartao>
          <Cartao className="flex items-center gap-2 p-3 text-sm">
            <Sparkles aria-hidden="true" className="size-4 text-destaque-foreground" />
            <span>Analisar resposta com IA</span>
            <ChevronRight aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
          </Cartao>
        </aside>
      </div>
    </Moldura>
  );
}

/* 7 · Satélite */
const DEMANDAS_SAT = [
  { n: "001/2026", a: "Lista de espera da regulação", p: "15/10/2026", f: "Em análise pela controladoria", s: "emAnalise" as const, tom: "neutro" },
  { n: "005/2026", a: "Escala de plantões das UBS — outubro", p: "05/10/2026", f: "vence em 3 dias", s: "visualizada" as const, tom: "alerta" },
  { n: "097/2025", a: "Contratos de manutenção de equipamentos", p: "30/09/2026", f: "vencida há 2 dias", s: "vencida" as const, tom: "perigo" },
];

function CartaoDemanda({ d, compacto = false }: { d: (typeof DEMANDAS_SAT)[number]; compacto?: boolean }) {
  return (
    <div className={cn("rounded-(--radius) border bg-card shadow-(--sombra-sm)", compacto ? "p-4" : "p-5", d.tom === "perigo" && "border-perigo/40")}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-sm font-semibold text-primary", codigo)}>{d.n}</span>
        <Situacao s={d.s} />
      </div>
      <p className={cn("mt-1.5 font-bold leading-snug", compacto ? "text-base" : "text-lg")}>{d.a}</p>
      <p className={cn("mt-2 flex items-center gap-1.5 text-sm font-semibold", d.tom === "perigo" ? "text-perigo" : d.tom === "alerta" ? "text-alerta" : "text-muted-foreground")}>
        <CalendarClock aria-hidden="true" className="size-4" /> Prazo {d.p} · {d.f}
      </p>
    </div>
  );
}

export function TelaSatelite() {
  return (
    <div className="grid grid-cols-[1fr_340px] items-start gap-8">
      <Moldura titulo="7 · Área do satélite (computador)" url="controladoria.horizonaj.com.br/satelite">
        <header className="flex h-16 items-center gap-4 bg-sidebar px-8">
          <MarcaAmeixa />
          <span className="ml-auto text-right text-sm leading-tight text-sidebar-foreground">
            <b className="block text-white">Carlos Mendes</b>Secretaria Municipal de Saúde
          </span>
          <span className="text-sm font-semibold text-sidebar-foreground underline underline-offset-2">Sair</span>
        </header>
        <div className="mx-auto max-w-4xl space-y-6 p-8">
          <div>
            <h2 className="text-2xl font-bold">Olá, Carlos</h2>
            <p className="text-muted-foreground">A controladoria enviou <b className="text-foreground">3 pedidos</b> para a Secretaria de Saúde. 1 está vencido.</p>
          </div>
          <div className="grid grid-cols-3 gap-4">{DEMANDAS_SAT.map((d) => <CartaoDemanda key={d.n} d={d} />)}</div>
          <Cartao className="space-y-4 p-6">
            <div className="flex items-start justify-between">
              <div>
                <span className={cn("text-sm font-semibold text-primary", codigo)}>005/2026</span>
                <h3 className="text-xl font-bold">Escala de plantões das UBS — outubro</h3>
              </div>
              <span className="rounded-md bg-alerta/10 px-3 py-1.5 text-sm font-bold text-alerta">Prazo 05/10 · vence em 3 dias</span>
            </div>
            <p className="leading-relaxed">Envie a escala de plantões de outubro de todas as Unidades Básicas de Saúde, com nome e horário de cada profissional.</p>
            <div className="rounded-(--radius) bg-muted p-3 text-sm"><b>Documentos pedidos:</b> escala de plantões (PDF ou planilha) · relação de profissionais por UBS</div>
            <div className="space-y-1.5">
              <label className="font-bold">Sua resposta</label>
              <div className="min-h-24 rounded-(--radius) border border-input bg-card p-3 text-muted-foreground">Escreva aqui…</div>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-(--radius) border-2 border-dashed border-input p-5 text-muted-foreground">
              <Upload aria-hidden="true" className="size-5" /> Arraste os arquivos ou <b className="text-primary underline">escolha no computador</b>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" className="h-12 px-5 text-base"><CalendarPlus aria-hidden="true" /> Pedir mais prazo</Button>
              <Button className="h-12 px-6 text-base"><Send aria-hidden="true" /> Enviar resposta</Button>
            </div>
          </Cartao>
        </div>
      </Moldura>

      <figure className="rounded-[2.6rem] border-[10px] border-[#1f1a2e] bg-background shadow-(--sombra-md)">
        <figcaption className="sr-only">7 · Área do satélite (celular)</figcaption>
        <div className="overflow-hidden rounded-[2rem]">
          <div className="flex h-7 items-center justify-between bg-sidebar px-6 text-[0.65rem] font-semibold text-white">
            <span>15:42</span><span>5G ▮▮▮</span>
          </div>
          <header className="flex items-center gap-3 bg-sidebar px-4 pb-3">
            <SeloAmeixa className="size-7 text-destaque" />
            <span className="text-sm font-bold text-white">Minhas demandas</span>
            <Menu aria-hidden="true" className="ml-auto size-6 text-white" />
          </header>
          <div className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">Secretaria Municipal de Saúde</p>
            {DEMANDAS_SAT.slice(1).map((d) => <CartaoDemanda key={d.n} d={d} compacto />)}
            <div className="space-y-3 rounded-(--radius) border bg-card p-4">
              <p className="font-bold">Responder 005/2026</p>
              <div className="min-h-20 rounded-(--radius) border border-input p-3 text-sm text-muted-foreground">Escreva aqui…</div>
              <Button variant="outline" className="h-12 w-full text-base"><Paperclip aria-hidden="true" /> Anexar arquivo</Button>
              <Button className="h-12 w-full text-base"><Send aria-hidden="true" /> Enviar resposta</Button>
              <p className="text-center text-sm font-semibold text-primary underline underline-offset-2">Pedir mais prazo</p>
            </div>
          </div>
          <nav aria-label="Satélite" className="grid grid-cols-2 border-t bg-card text-xs font-semibold">
            <span className="flex flex-col items-center gap-1 py-2.5 text-primary"><Inbox aria-hidden="true" className="size-5" />Demandas</span>
            <span className="flex flex-col items-center gap-1 py-2.5 text-muted-foreground"><MessageSquareText aria-hidden="true" className="size-5" />Painel da unidade</span>
          </nav>
        </div>
      </figure>
    </div>
  );
}