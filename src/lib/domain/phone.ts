import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";
import { COUNTRY_NAMES } from "./country-names";

export interface PhoneOk {
  ok: true;
  e164: string; // +919876543210
  country: string; // IN
  international: string; // +91 98765 43210
}
export interface PhoneErr {
  ok: false;
  error: string;
}

export const DEFAULT_COUNTRY = "IN";

/** ISO country codes that libphonenumber knows about. */
const COUNTRY_SET = new Set<string>(getCountries());

export function isCountry(c: string | null | undefined): c is CountryCode {
  return !!c && COUNTRY_SET.has(c.toUpperCase());
}

/**
 * Validates a phone number against a country. A number written with a leading
 * "+" carries its own country code and wins over the selected country.
 */
export function validatePhone(number: unknown, country: unknown): PhoneOk | PhoneErr {
  const raw = typeof number === "string" ? number.trim() : "";
  if (!raw) return { ok: false, error: "Phone number is required" };
  if (!/^[+\d\s().-]+$/.test(raw)) return { ok: false, error: "Phone number can only contain digits, spaces, + ( ) - ." };

  const c = typeof country === "string" ? country.trim().toUpperCase() : "";
  if (!raw.startsWith("+")) {
    if (!c) return { ok: false, error: "Select a country code" };
    if (!isCountry(c)) return { ok: false, error: `Unknown country code "${c}"` };
  } else if (c && !isCountry(c)) {
    return { ok: false, error: `Unknown country code "${c}"` };
  }

  const parsed = parsePhoneNumberFromString(raw, isCountry(c) ? (c as CountryCode) : undefined);
  if (!parsed) return { ok: false, error: "That doesn't look like a phone number" };
  if (!parsed.isValid()) {
    return {
      ok: false,
      error: `Not a valid phone number${isCountry(c) && !raw.startsWith("+") ? ` for ${countryName(c)}` : ""} — check the digits and country code`,
    };
  }
  if (!parsed.country) return { ok: false, error: "Could not determine the country for this number" };
  return { ok: true, e164: parsed.number, country: parsed.country, international: parsed.formatInternational() };
}

export function countryName(code: string) {
  return COUNTRY_NAMES[code] ?? code;
}

export interface CountryOption {
  code: string;
  name: string;
  dial: string;
}

/** All countries with their calling codes, India first, then alphabetical. */
export function countryOptions(): CountryOption[] {
  const list = getCountries().map((code) => ({
    code,
    name: countryName(code),
    dial: `+${getCountryCallingCode(code)}`,
  }));
  // Deterministic sort (no locale data), so server and browser produce the same order.
  const key = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  list.sort((a, b) => (key(a.name) < key(b.name) ? -1 : key(a.name) > key(b.name) ? 1 : 0));
  const pin = list.findIndex((c) => c.code === DEFAULT_COUNTRY);
  if (pin > 0) list.unshift(...list.splice(pin, 1));
  return list;
}

/** Splits a stored E.164 number into the country and national number shown in forms. */
export function splitPhone(e164: string | null | undefined, fallbackCountry?: string | null) {
  const parsed = e164 ? parsePhoneNumberFromString(e164) : undefined;
  return {
    country: parsed?.country ?? fallbackCountry ?? DEFAULT_COUNTRY,
    national: parsed?.nationalNumber ?? "",
  };
}

/** "+91 98765 43210" for display, or null for legacy leads without a number. */
export function formatPhone(e164: string | null | undefined) {
  if (!e164) return null;
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
