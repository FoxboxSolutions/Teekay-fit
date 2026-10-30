"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
  contrast,
  forbiddenTextPairs,
  nonTextPairs,
  palette,
  textPairs,
  type Pair,
} from "@/lib/design-system/palette";
import { cn } from "@/lib/ui/cn";
import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toast, ToastProvider, ToastViewport } from "@/components/ui/toast";

const COLOR_KEYS = Object.keys(palette) as Array<keyof typeof palette>;

const RULE_KEYS = [
  "redShare",
  "prices",
  "noRedOnBlack",
  "noRedOnRed",
  "grunge",
  "i18n",
  "rtl",
  "motion",
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function DesignSystemShowcase() {
  const t = useTranslations("designSystem");
  const locale = useLocale();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);

  const number = (value: number) =>
    `${new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)}:1`;

  const renderGroup = (title: string, pairs: readonly Pair[]) => (
    <div key={title} className="flex flex-col gap-2">
      <h3 className="font-display text-base font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 text-start font-medium text-ink-muted">
                {t("contrast.columns.pair")}
              </th>
              <th className="px-4 py-2.5 text-start font-medium text-ink-muted">
                {t("contrast.columns.ratio")}
              </th>
              <th className="px-4 py-2.5 text-start font-medium text-ink-muted">
                {t("contrast.columns.verdict")}
              </th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((pair) => {
              const ratio = contrast(palette[pair.fg], palette[pair.bg]);
              const ok = ratio >= pair.min;
              return (
                <tr
                  key={`${pair.fg}-${pair.bg}`}
                  className="border-b border-line last:border-b-0"
                >
                  <td className="px-4 py-2.5 text-ink">
                    {t("contrast.pair", {
                      fg: pair.fg,
                      bg: pair.bg,
                      rule: pair.rule,
                    })}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-ink">
                    {number(ratio)}
                  </td>
                  <td
                    className={cn("px-4 py-2.5", ok ? "text-ink" : "text-red-text")}
                  >
                    {ok ? t("contrast.pass") : t("contrast.fail")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-ink">
          {t("title")}
        </h1>
        <p className="max-w-prose text-ink-muted">{t("subtitle")}</p>
        <p className="text-sm text-red-text">{t("devBanner")}</p>
      </header>

      <Section title={t("logoSection.heading")}>
        <div className="flex flex-col gap-3">
          <div className="flex justify-center rounded-card border border-line bg-canvas p-8">
            <Image
              src="/logo-full.png"
              alt={t("logoSection.alt")}
              width={1254}
              height={1254}
              className="w-full max-w-md"
            />
          </div>
          <p className="text-sm text-ink-muted">{t("logoSection.onCanvas")}</p>
          <p className="text-sm text-ink-muted">{t("logoSection.deviation")}</p>
        </div>
      </Section>

      <Section title={t("colors.heading")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {COLOR_KEYS.map((key) => (
            <div
              key={key}
              className="overflow-hidden rounded-card border border-line bg-surface"
            >
              <div
                className="h-16 border-b border-line"
                style={{ backgroundColor: palette[key] }}
              />
              <div className="flex flex-col gap-1 p-3">
                <span className="font-display text-sm font-semibold uppercase text-ink">
                  {key}
                </span>
                <code className="text-xs text-ink-muted">{palette[key]}</code>
                <span className="text-xs text-ink-muted">
                  {t(`colors.tokens.${key}`)}
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-ink-muted">{t("colors.rule")}</p>
      </Section>

      <Section title={t("typography.heading")}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">{t("typography.displayLabel")}</p>
          <p className="font-display text-5xl font-semibold uppercase leading-none tracking-wide text-ink">
            {t("typography.headingSample")}
          </p>
          <p className="font-display text-2xl font-bold uppercase text-red-text">
            {t("typography.accentSample")}
          </p>
          <p className="text-sm text-ink-muted">{t("typography.bodyLabel")}</p>
          <p className="max-w-prose leading-relaxed text-ink">
            {t("typography.bodySample")}
          </p>
          <p className="text-xs text-ink-muted">{t("typography.arabicNote")}</p>
        </div>
      </Section>

      <Section title={t("buttons.heading")}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t("buttons.primary")}</Button>
          <Button variant="secondary">{t("buttons.secondary")}</Button>
          <Button variant="ghost">{t("buttons.ghost")}</Button>
          <Button disabled>{t("buttons.disabled")}</Button>
          <Button size="sm">{t("buttons.small")}</Button>
        </div>
      </Section>

      <Section title={t("forms.heading")}>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field htmlFor="ds-name" label={t("forms.nameLabel")}>
            <Input id="ds-name" placeholder={t("forms.namePlaceholder")} />
          </Field>
          <Field
            htmlFor="ds-email"
            label={t("forms.emailLabel")}
            error={t("forms.emailError")}
          >
            <Input id="ds-email" type="email" defaultValue="contact@" />
          </Field>
          <Field
            htmlFor="ds-message"
            label={t("forms.messageLabel")}
            className="sm:col-span-2"
          >
            <Textarea
              id="ds-message"
              placeholder={t("forms.messagePlaceholder")}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">
              {t("forms.selectLabel")}
            </span>
            <Select
              label={t("forms.selectLabel")}
              placeholder={t("forms.selectPlaceholder")}
              items={[
                { value: "starter", label: t("forms.offerStarter") },
                { value: "online", label: t("forms.offerOnline") },
                { value: "in-person", label: t("forms.offerInPerson") },
              ]}
            />
          </div>
          <div className="flex flex-col gap-4">
            <label
              className="flex items-center gap-2.5 text-sm text-ink"
              htmlFor="ds-terms"
            >
              <Checkbox id="ds-terms" />
              {t("forms.terms")}
            </label>
            <div className="flex flex-col gap-2">
              <span
                id="ds-mode-label"
                className="text-sm font-medium text-ink"
              >
                {t("forms.modeLabel")}
              </span>
              <RadioGroup
                defaultValue="in-person"
                aria-labelledby="ds-mode-label"
                className="flex flex-wrap gap-4"
              >
                <label
                  className="flex items-center gap-2.5 text-sm text-ink"
                  htmlFor="ds-mode-person"
                >
                  <RadioGroupItem id="ds-mode-person" value="in-person" />
                  {t("forms.modeInPerson")}
                </label>
                <label
                  className="flex items-center gap-2.5 text-sm text-ink"
                  htmlFor="ds-mode-online"
                >
                  <RadioGroupItem id="ds-mode-online" value="online" />
                  {t("forms.modeOnline")}
                </label>
              </RadioGroup>
            </div>
          </div>
        </div>
      </Section>

      <Section title={t("surfaces.heading")}>
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-6">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-lg font-semibold uppercase text-ink">
                {t("surfaces.cardTitle")}
              </span>
              <Badge variant="red">{t("surfaces.badgeRed")}</Badge>
            </div>
            <p className="font-display text-3xl font-bold text-ink">
              {t("surfaces.price")}
            </p>
            <p className="text-sm text-ink-muted">{t("surfaces.cardBody")}</p>
          </Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="red">{t("surfaces.badgeRed")}</Badge>
            <Badge>{t("surfaces.cardTitle")}</Badge>
          </div>
        </div>
      </Section>

      <Section title={t("dialogSection.heading")}>
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={t("dialogSection.title")}
          description={t("dialogSection.description")}
          closeLabel={t("dialogSection.close")}
          trigger={<Button variant="secondary">{t("dialogSection.open")}</Button>}
        >
          <p className="text-sm text-ink-muted">{t("dialogSection.body")}</p>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setDialogOpen(false)}>
              {t("dialogSection.action")}
            </Button>
          </div>
        </Dialog>
      </Section>

      <Section title={t("toastSection.heading")}>
        <ToastProvider>
          <Button variant="secondary" onClick={() => setToastOpen(true)}>
            {t("toastSection.show")}
          </Button>
          <Toast
            open={toastOpen}
            onOpenChange={setToastOpen}
            title={t("toastSection.title")}
            description={t("toastSection.description")}
            closeLabel={t("toastSection.close")}
          />
          <ToastViewport />
        </ToastProvider>
      </Section>

      <Section title={t("tabs.heading")}>
        <Tabs
          ariaLabel={t("tabs.ariaLabel")}
          items={[
            {
              value: "offers",
              label: t("tabs.offers"),
              content: <p className="text-ink-muted">{t("tabs.offersContent")}</p>,
            },
            {
              value: "method",
              label: t("tabs.method"),
              content: <p className="text-ink-muted">{t("tabs.methodContent")}</p>,
            },
            {
              value: "faq",
              label: t("tabs.faq"),
              content: <p className="text-ink-muted">{t("tabs.faqContent")}</p>,
            },
          ]}
        />
      </Section>

      <Section title={t("accordion.heading")}>
        <Accordion
          ariaLabel={t("accordion.ariaLabel")}
          items={[
            {
              value: "q1",
              title: t("accordion.question1"),
              content: t("accordion.answer1"),
            },
            {
              value: "q2",
              title: t("accordion.question2"),
              content: t("accordion.answer2"),
            },
          ]}
        />
      </Section>

      <Section title={t("contrast.heading")}>
        <p className="text-sm text-ink-muted">{t("contrast.intro")}</p>
        <div className="flex flex-col gap-6">
          {renderGroup(t("contrast.groups.text"), textPairs)}
          {renderGroup(t("contrast.groups.forbidden"), forbiddenTextPairs)}
          {renderGroup(t("contrast.groups.nonText"), nonTextPairs)}
        </div>
      </Section>

      <Section title={t("rules.heading")}>
        <ul className="flex flex-col gap-2">
          {RULE_KEYS.map((key) => (
            <li key={key} className="flex gap-3 text-sm text-ink-muted">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-red-bright"
              />
              <span>{t(`rules.items.${key}`)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
