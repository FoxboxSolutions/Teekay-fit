"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Turnstile } from "@/components/site/turnstile";

const schema = z.object({
  name: z.string().trim().min(2),
  email: z.union([z.literal(""), z.email()]),
  phone: z.string().trim().min(6),
  message: z.string().trim().min(5),
  consentRecontact: z.literal(true),
  consentAge18: z.literal(true),
});

type ErrorKey = "captcha" | "rateLimited" | "invalid" | "network";

/**
 * Formulaire de contact (source `contact`) — branché sur /api/contact (M5) :
 * consentements requis (recontact + 18 ans), marketing optionnel non coché,
 * honeypot, Turnstile échec fermé. Le message atterrit dans `leads.notes`
 * (ajout — jamais écrasé) via la transaction `submit_lead`.
 */
export function ContactForm() {
  const t = useTranslations("contact");
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [consentRecontact, setConsentRecontact] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [consentAge18, setConsentAge18] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = schema.safeParse({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      message: message.trim(),
      consentRecontact,
      consentAge18,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key === "name") next.name = t("nameError");
        if (key === "email") next.email = t("emailError");
        if (key === "phone") next.phone = t("phoneError");
        if (key === "message") next.message = t("messageError");
        if (key === "consentRecontact" || key === "consentAge18") {
          next.consents = t("consentError");
        }
      }
      setErrors(next);
      setSent(false);
      return;
    }

    setErrors({});
    setSubmitting(true);
    setErrorKey(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          message: parsed.data.message,
          consentRecontact,
          consentMarketing,
          consentAge18,
          turnstileToken,
          website: honeypot,
        }),
      });

      if (response.ok) {
        setSent(true);
        return;
      }
      if (response.status === 429) setErrorKey("rateLimited");
      else if (response.status === 403) setErrorKey("captcha");
      else setErrorKey("invalid");
    } catch {
      setErrorKey("network");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="rounded-card border border-line bg-surface p-6 text-ink">
        {t("sentNote")}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field htmlFor="contact-name" label={t("nameLabel")} error={errors.name}>
        <Input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field htmlFor="contact-email" label={t("emailLabel")} error={errors.email}>
        <Input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field htmlFor="contact-phone" label={t("phoneLabel")} error={errors.phone}>
        <Input
          id="contact-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+213 5.. .. .. .."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>
      <Field htmlFor="contact-message" label={t("messageLabel")} error={errors.message}>
        <Textarea
          id="contact-message"
          name="message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>

      {/* Honeypot : invisible pour un humain, rempli par les robots. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="contact-website">{t("honeypotLabel")}</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-ink-muted">
          <Checkbox
            checked={consentRecontact}
            onCheckedChange={(v) => setConsentRecontact(v === true)}
            className="mt-0.5 size-5"
          />
          <span>{t("consentRecontact")}</span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-ink-muted">
          <Checkbox
            checked={consentMarketing}
            onCheckedChange={(v) => setConsentMarketing(v === true)}
            className="mt-0.5 size-5"
          />
          <span>{t("consentMarketing")}</span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-ink-muted">
          <Checkbox
            checked={consentAge18}
            onCheckedChange={(v) => setConsentAge18(v === true)}
            className="mt-0.5 size-5"
          />
          <span>{t("consentAge18")}</span>
        </label>
      </div>
      {errors.consents && (
        <p role="alert" className="text-sm text-red-text">
          {errors.consents}
        </p>
      )}

      <Turnstile
        onToken={setTurnstileToken}
        label={t("captchaLabel")}
        errorLabel={t("captchaError")}
      />

      {errorKey && (
        <p role="alert" className="text-sm text-red-text">
          {t(`errors.${errorKey}`)}
        </p>
      )}

      <div>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? t("sending") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
