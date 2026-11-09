import { describe, it, expect } from "vitest";
import {
  ALGIERS_IANA,
  algiersComponents,
  algiersOffsetMinutes,
  startOfDayAlgiers,
  endOfDayAlgiers,
  startOfMonthAlgiers,
  endOfMonthAlgiers,
  dayRangeAlgiers,
  monthRangeAlgiers,
  isSameAlgiersDay,
  isSameAlgiersMonth,
} from "@/lib/admin/period";

/** 2026-11-09T00:30:00 à Alger = 2026-11-08T23:30:00Z (UTC+1). */
const Z = (s: string): Date => new Date(s + "Z");
const ordre00h30Alger = Z("2026-11-08T23:30:00"); // 00h30 heure d'Alger le 09/11

describe("périodes calculées en Africa/Algiers (jamais UTC)", () => {
  it("décalage Alger constant à +60 minutes", () => {
    expect(algiersOffsetMinutes(ordre00h30Alger)).toBe(60);
  });

  it("composantes civiles à Alger : 2026-11-09 00:30", () => {
    const c = algiersComponents(ordre00h30Alger);
    expect(c).toMatchObject({ year: 2026, month: 11, day: 9, hour: 0, minute: 30 });
  });

  it("commande à 00h30 locale Alger : le jour algérois est le 09/11 (démarre à 23:00Z le 08/11)", () => {
    const { start, end } = dayRangeAlgiers(ordre00h30Alger);
    expect(start).toBe("2026-11-08T23:00:00.000Z"); // minuit Alger 09/11 = 23:00Z 08/11
    expect(end).toBe("2026-11-09T23:00:00.000Z"); // minuit Alger 10/11
    const instant = ordre00h30Alger.getTime();
    expect(instant).toBeGreaterThanOrEqual(new Date(start).getTime());
    expect(instant).toBeLessThan(new Date(end).getTime());
  });

  it("une commande à 00h30 Alger le 09/11 est EXCLUE d'un filtre UTC naïf du jour 08/11", () => {
    // C'est précisément le piège : 23:30Z du 08/11 tombe dans le jour civil UTC du 08/11.
    const utcDayStart = Z("2026-11-08T00:00:00");
    const utcDayEnd = Z("2026-11-09T00:00:00");
    const instant = ordre00h30Alger.getTime();
    expect(instant).toBeGreaterThanOrEqual(utcDayStart.getTime());
    expect(instant).toBeLessThan(utcDayEnd.getTime());
    // La plage algéroise commence à 23:00Z le 08/11 : une grille UTC "00:00-24:00Z"
    // attribuerait faussement cette commande au 08/11 au lieu du 09/11.
    expect(new Date(dayRangeAlgiers(ordre00h30Alger).start).getTime()).toBeGreaterThan(
      utcDayStart.getTime(),
    );
  });

  it("commande à 00h30 Alger le 01/11 : le mois algérois est novembre (démarre le 31/10 à 23:00Z)", () => {
    const ordre = Z("2026-10-31T23:30:00"); // 00h30 Alger le 01/11
    const { start, end } = monthRangeAlgiers(ordre);
    expect(start).toBe("2026-10-31T23:00:00.000Z"); // minuit Alger 01/11
    expect(end).toBe("2026-11-30T23:00:00.000Z"); // minuit Alger 01/12 = 23:00Z 30/11
    expect(ordre.getTime()).toBeGreaterThanOrEqual(new Date(start).getTime());
    expect(ordre.getTime()).toBeLessThan(new Date(end).getTime());
  });

  it("bascule d'année : 00h30 Alger le 01/01/2027 appartient au mois janvier 2027", () => {
    const ordre = Z("2026-12-31T23:30:00"); // 00h30 Alger le 01/01/2027
    const { start } = monthRangeAlgiers(ordre);
    expect(start).toBe("2026-12-31T23:00:00.000Z");
  });

  it("même jour algérois ⇒ true même séparés de 23h ; jours civils différents ⇒ false", () => {
    const a = Z("2026-11-08T23:59:00"); // 00h59 Alger le 09/11
    const b = Z("2026-11-09T22:00:00"); // 23:00 Alger le 09/11
    expect(isSameAlgiersDay(a, b)).toBe(true);
    const c = Z("2026-11-09T23:30:00"); // 00h30 Alger le 10/11
    expect(isSameAlgiersDay(b, c)).toBe(false);
  });

  it("même mois algérois across frontière minuit UTC", () => {
    const a = Z("2026-10-31T23:59:00"); // 00h59 Alger le 01/11
    const b = Z("2026-11-30T22:00:00"); // 23:00 Alger le 30/11
    expect(isSameAlgiersMonth(a, b)).toBe(true);
    const dec = Z("2026-11-30T23:30:00"); // 00h30 Alger le 01/12
    expect(isSameAlgiersMonth(b, dec)).toBe(false);
  });

  it("endOfDayAlgiers exclusive = début du jour algérois suivant (+24h)", () => {
    const { start, end } = dayRangeAlgiers(ordre00h30Alger);
    expect(new Date(end).getTime()).toBe(new Date(start).getTime() + 86_400_000);
    // minuit Alger 10/11 = 23:00Z le 09/11
    expect(new Date(end).getUTCHours()).toBe(23);
  });

  it("ALGIERS_IANA vaut Africa/Algiers", () => {
    expect(ALGIERS_IANA).toBe("Africa/Algiers");
  });
});
