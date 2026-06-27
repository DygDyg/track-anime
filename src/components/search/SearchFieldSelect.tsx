"use client";

import { siteClass } from "@/components/site/site-styles";

type Option = {
  value: string;
  label: string;
};

type Props = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
};

export function SearchFieldSelect({ label, value, options, onChange }: Props) {
  return (
    <label className="block">
      <span className={siteClass.label}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={siteClass.input}
      >
        {options.map((option) => (
          <option key={option.value || "__any"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
