"use client";

import { useId, useMemo, useRef, useState } from "react";
import { countryOptions, DEFAULT_COUNTRY, validatePhone } from "@/lib/domain/phone";
import { Input, Label, Select } from "./form";

/**
 * Country code + phone number. Validated against the selected country's real
 * numbering rules as the user types; the browser blocks submission while invalid.
 * Submits `phone_country` (ISO code) and `phone_number`.
 */
export function PhoneField({
  defaultCountry = DEFAULT_COUNTRY,
  defaultNumber = "",
  required = true,
  label = "Phone number",
}: {
  defaultCountry?: string;
  defaultNumber?: string;
  required?: boolean;
  label?: string;
}) {
  const id = useId();
  const options = useMemo(() => countryOptions(), []);
  const [country, setCountry] = useState(defaultCountry);
  const [number, setNumber] = useState(defaultNumber);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const result = number.trim() === "" ? (required ? ({ ok: false, error: "Phone number is required" } as const) : null) : validatePhone(number, country);
  const error = result && !result.ok ? result.error : null;
  const international = result?.ok ? result.international : null;

  function sync(c: string, n: string) {
    const r = n.trim() === "" ? (required ? ({ ok: false, error: "Phone number is required" } as const) : null) : validatePhone(n, c);
    inputRef.current?.setCustomValidity(r && !r.ok ? r.error : "");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}{required ? " *" : ""}</Label>
      <div className="flex gap-2">
        <Select
          aria-label="Country code"
          name="phone_country"
          value={country}
          className="w-32 shrink-0 sm:w-40"
          onChange={(e) => {
            setCountry(e.target.value);
            sync(e.target.value, number);
          }}
        >
          {options.map((c) => (
            <option key={c.code} value={c.code}>
              {c.dial} {c.name}
            </option>
          ))}
        </Select>
        <Input
          id={id}
          ref={inputRef}
          name="phone_number"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          required={required}
          value={number}
          placeholder="98765 43210"
          aria-invalid={touched && !!error}
          aria-describedby={`${id}-msg`}
          onChange={(e) => {
            setNumber(e.target.value);
            sync(country, e.target.value);
          }}
          onBlur={() => {
            setTouched(true);
            sync(country, number);
          }}
          onInvalid={() => setTouched(true)}
        />
      </div>
      <p id={`${id}-msg`} role={touched && error ? "alert" : undefined} className={touched && error ? "text-[11px] text-danger" : "text-[11px] text-muted"}>
        {touched && error ? error : international ? `✓ ${international}` : "Include the country code; pick the country on the left."}
      </p>
    </div>
  );
}
