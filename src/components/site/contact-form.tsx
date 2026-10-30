"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";

const schema = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().min(1),
  message: z.string().min(1),
});

/**
 * Formulaire de contact — UI et validation zod uniquement (M5 branchera
 * l'enregistrement en base et le captcha Turnstile). Aucun appel réseau à la
 * saisie ni à la validation.
 */
export function ContactForm() {
  const t = useTranslations("contact");
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const data = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      message: String(fd.get("message") ?? "").trim(),
    };
    const parsed = schema.safeParse(data);
    if (parsed.success) {
      setErrors({});
      setSent(true);
      // Aucun envoi réseau pour l'instant (M5).
    } else {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key === "name") next.name = t("nameError");
        if (key === "email") next.email = t("emailError");
        if (key === "phone") next.phone = t("phoneError");
        if (key === "message") next.message = t("messageError");
      }
      setErrors(next);
      setSent(false);
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
        <Input id="contact-name" name="name" type="text" autoComplete="name" />
      </Field>
      <Field htmlFor="contact-email" label={t("emailLabel")} error={errors.email}>
        <Input id="contact-email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field htmlFor="contact-phone" label={t("phoneLabel")} error={errors.phone}>
        <Input id="contact-phone" name="phone" type="tel" autoComplete="tel" required />
      </Field>
      <Field htmlFor="contact-message" label={t("messageLabel")} error={errors.message}>
        <Textarea id="contact-message" name="message" rows={5} required />
      </Field>
      <div>
        <Button type="submit" variant="primary">
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
