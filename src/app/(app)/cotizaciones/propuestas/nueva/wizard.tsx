"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/ui";
import { TEMPLATES } from "@/lib/proposals/templates";
import { wizardSteps, type WizQuestion } from "@/lib/proposals/wizard";
import { costCatalog, catalogToBudgetSections, internalCost, clientTotals, type CostSection } from "@/lib/proposals/budget";
import { createProposal } from "../actions";

type Answers = Record<string, string>;
type Pricing = {
  price: number; setPrice: (n: number) => void;
  discountPct: number; setDiscountPct: (n: number) => void;
  contingencyPct: number; iva: number;
};

export function ProposalWizard({
  catalogByType = {},
  defaults,
}: {
  catalogByType?: Record<string, CostSection[]>;
  defaults?: { iva: number; contingencyPct: number };
}) {
  const [tpl, setTpl] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(0); // 0 = preguntas (tras elegir plantilla)
  const [answers, setAnswers] = React.useState<Answers>({});
  const [catalog, setCatalog] = React.useState<CostSection[]>([]);
  const [price, setPrice] = React.useState(0);
  const [discountPct, setDiscountPct] = React.useState(0);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const contingencyPct = defaults?.contingencyPct ?? 10;
  const iva = defaults?.iva ?? 19;
  const pricing: Pricing = { price, setPrice, discountPct, setDiscountPct, contingencyPct, iva };

  const steps = tpl ? wizardSteps(tpl) : [];
  const total = steps.length;
  const q: WizQuestion | undefined = steps[step];

  function pick(key: string) {
    setTpl(key);
    // Usa el catálogo INTERNO de la BD (estandarizado) si existe; si no, el de respaldo.
    const fromDb = catalogByType[key];
    setCatalog(fromDb && fromDb.length ? fromDb.map((s) => ({ s: s.s, items: s.items.map((i) => ({ ...i })) })) : costCatalog(key));
    setStep(0);
    setAnswers({});
    setPrice(0);
    setDiscountPct(0);
  }

  function setAnswer(key: string, value: string) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  const canAdvance = !q || q.optional || q.input === "budget" || (answers[q.key]?.trim()?.length ?? 0) > 0;

  function next() {
    setError(null);
    if (step < total - 1) setStep((s) => s + 1);
    else finish();
  }
  function back() {
    setError(null);
    if (step > 0) setStep((s) => s - 1);
    else setTpl(null);
  }

  function finish() {
    if (!tpl) return;
    const budgetSections = catalogToBudgetSections(catalog);
    // Precio al cliente: el que fijó el equipo, o el costo interno (+ contingencia) si no.
    const cost = internalCost(budgetSections, contingencyPct);
    const finalPrice = price > 0 ? price : cost.total;
    start(async () => {
      try {
        await createProposal(tpl, answers, budgetSections, { price: finalPrice, discountPct, contingencyPct });
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear la propuesta");
      }
    });
  }

  // ── Paso 1: elegir plantilla ──
  if (!tpl) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-10">
        <Link href="/cotizaciones" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Cotizaciones
        </Link>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Paso 1 · Tipo de propuesta</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">¿Qué vamos a proponer?</h1>
        <p className="mt-1 text-sm text-muted-foreground">Elige una plantilla. El asistente arma la propuesta con tus respuestas.</p>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => pick(t.key)}
              className="group flex flex-col rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:border-primary hover:shadow-md"
            >
              <span className="text-3xl">{t.icon}</span>
              <span className="mt-3 font-semibold">{t.name}</span>
              <span className="mt-1 text-sm text-muted-foreground">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const tplDef = TEMPLATES.find((t) => t.key === tpl)!;
  const progress = Math.round(((step + 1) / total) * 100);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-2xl flex-col px-4 py-8 sm:px-8 sm:py-10">
      {/* Progreso */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wider">
            Paso {step + 1} de {total} · {tplDef.icon} {tplDef.name}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Pregunta */}
      <div className="flex-1">
        {q ? <QuestionView q={q} value={answers[q.key] ?? ""} onChange={(v) => setAnswer(q.key, v)} catalog={catalog} setCatalog={setCatalog} pricing={pricing} onEnter={() => canAdvance && next()} /> : null}
      </div>

      {error ? <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      {/* Navegación */}
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
        <button onClick={back} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
          <ArrowLeft className="size-4" /> Atrás
        </button>
        <button
          onClick={next}
          disabled={!canAdvance || pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : step === total - 1 ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
          {step === total - 1 ? "Finalizar" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}

function QuestionView({
  q,
  value,
  onChange,
  catalog,
  setCatalog,
  pricing,
  onEnter,
}: {
  q: WizQuestion;
  value: string;
  onChange: (v: string) => void;
  catalog: CostSection[];
  setCatalog: React.Dispatch<React.SetStateAction<CostSection[]>>;
  pricing: Pricing;
  onEnter: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{q.label}</h2>
      {q.help ? <p className="mt-1.5 text-sm text-muted-foreground">{q.help}</p> : null}
      {q.optional && q.input !== "budget" ? <p className="mt-1 text-xs text-muted-foreground">Opcional — puedes dejarlo vacío.</p> : null}

      <div className="mt-5">
        {q.input === "text" ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onEnter(); }}
            placeholder={q.ph}
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
          />
        ) : null}

        {q.input === "textarea" ? (
          <textarea
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={q.ph}
            rows={4}
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
          />
        ) : null}

        {q.input === "select" ? (
          <select
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Selecciona…</option>
            {q.opts?.map((o) => (<option key={o.v} value={o.v}>{o.t ?? o.v}</option>))}
          </select>
        ) : null}

        {q.input === "options" ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {q.opts?.map((o) => {
              const on = value === o.v;
              return (
                <button
                  key={o.v}
                  onClick={() => onChange(o.v)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                    on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:bg-accent/50",
                  )}
                >
                  {o.i ? <span className="text-2xl leading-none">{o.i}</span> : null}
                  <span>
                    <span className="block font-semibold">{o.t ?? o.v}</span>
                    {o.d ? <span className="mt-0.5 block text-sm text-muted-foreground">{o.d}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {q.input === "budget" ? <BudgetBuilder catalog={catalog} setCatalog={setCatalog} pricing={pricing} /> : null}
      </div>
    </div>
  );
}

function BudgetBuilder({ catalog, setCatalog, pricing }: { catalog: CostSection[]; setCatalog: React.Dispatch<React.SetStateAction<CostSection[]>>; pricing: Pricing }) {
  const sections = catalogToBudgetSections(catalog);
  const cost = internalCost(sections, pricing.contingencyPct);
  const basePrice = pricing.price > 0 ? pricing.price : cost.total;
  const client = clientTotals({ price: basePrice, discountPct: pricing.discountPct, iva: pricing.iva });
  const margin = basePrice - cost.total;

  function patch(si: number, ii: number, field: "on" | "q" | "v", value: boolean | number) {
    setCatalog((prev) =>
      prev.map((sec, s) =>
        s !== si ? sec : { ...sec, items: sec.items.map((it, i) => (i !== ii ? it : { ...it, [field]: value })) },
      ),
    );
  }

  return (
    <div className="space-y-4">
      {catalog.map((sec, si) => (
        <div key={si} className="overflow-hidden rounded-xl border border-border">
          <div className="bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sec.s}</div>
          <div className="divide-y divide-border">
            {sec.items.map((it, ii) => (
              <div key={ii} className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5", !it.on && "opacity-50")}>
                <label className="flex flex-1 items-center gap-2.5">
                  <input type="checkbox" checked={it.on} onChange={(e) => patch(si, ii, "on", e.target.checked)} className="size-4 rounded border-input" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{it.t}</span>
                    <span className="block text-xs text-muted-foreground">{it.d}</span>
                  </span>
                </label>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="number" min={0} value={it.q} disabled={!it.on} onChange={(e) => patch(si, ii, "q", Number(e.target.value) || 0)} className="w-14 rounded-md border border-input bg-background px-2 py-1 text-right tabular-nums" />
                  <span>{it.u}</span>
                </div>
                <input type="number" min={0} step={50000} value={it.v} disabled={!it.on} onChange={(e) => patch(si, ii, "v", Number(e.target.value) || 0)} className="w-28 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums" />
              </div>
            ))}
          </div>
        </div>
      ))}
      {/* Costo interno (no lo ve el cliente) */}
      <div className="rounded-xl border border-dashed border-amber-300/60 bg-amber-50/50 px-4 py-2.5 text-xs text-muted-foreground dark:bg-amber-500/5">
        🔒 <strong className="text-amber-800 dark:text-amber-300">Costo interno</strong>: servicios {formatMoney(cost.items, "COP")} + {pricing.contingencyPct}% transporte/imprevistos ({formatMoney(cost.contingency, "COP")}) = <strong className="tabular-nums text-foreground">{formatMoney(cost.total, "COP")}</strong>
      </div>
      {/* Precio AL CLIENTE */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Precio al cliente <span className="font-normal text-muted-foreground">· esto verá el cliente</span></p>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Precio (COP)
            <input type="number" min={0} step={50000} value={pricing.price || ""} placeholder={`Sugerido: ${cost.total}`} onChange={(e) => pricing.setPrice(Number(e.target.value) || 0)} className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm tabular-nums" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Descuento (%)
            <input type="number" min={0} max={100} value={pricing.discountPct || ""} onChange={(e) => pricing.setDiscountPct(Number(e.target.value) || 0)} className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm tabular-nums" />
          </label>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2.5">
          <span className="text-sm font-medium text-muted-foreground">Total al cliente (IVA {pricing.iva}%)</span>
          <span className="text-lg font-bold tabular-nums">{formatMoney(client.total, "COP")}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">Margen estimado: <strong className={margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>{formatMoney(margin, "COP")}</strong>. Si dejas el precio en blanco, se usa el costo interno.</p>
      </div>
    </div>
  );
}
