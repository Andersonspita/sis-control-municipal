import { cn } from "@/lib/utils";

export function Emblema({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <path d="M16 2 4 7v8c0 7.2 5.1 13.4 12 15 6.9-1.6 12-7.8 12-15V7L16 2Z" fill="currentColor" opacity=".18" />
      <path
        d="M16 2 4 7v8c0 7.2 5.1 13.4 12 15 6.9-1.6 12-7.8 12-15V7L16 2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 13h12M11 13v7M16 13v7M21 13v7M9.5 21h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m16 8 5 3H11l5-3Z" fill="currentColor" />
    </svg>
  );
}

export function Marca({ className, compacta = false }: { className?: string; compacta?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Emblema className="shrink-0 text-sidebar-primary" />
      {!compacta && (
        <span className="flex flex-col leading-tight">
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.14em] opacity-75">Sistema de</span>
          <span className="font-heading text-base font-semibold">Controladoria Municipal</span>
        </span>
      )}
    </span>
  );
}
