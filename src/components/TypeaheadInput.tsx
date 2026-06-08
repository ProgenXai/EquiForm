"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatDisciplineList } from "@/lib/format-discipline";

const TYPEAHEAD_INPUT_CLASS =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none";

type TypeaheadInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  suggestions: readonly string[];
  appendOnSelect?: boolean;
  hint?: string;
};

function appendTypeaheadValue(
  current: string,
  suggestion: string,
): string | null {
  const lastComma = current.lastIndexOf(",");
  const completedParts =
    lastComma >= 0
      ? current
          .slice(0, lastComma)
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : [];

  if (
    completedParts.some(
      (part) => part.toLowerCase() === suggestion.toLowerCase(),
    )
  ) {
    return null;
  }

  if (lastComma >= 0) {
    const prefix = current.slice(0, lastComma).trimEnd();
    return prefix ? `${prefix}, ${suggestion}` : suggestion;
  }

  return suggestion;
}

export default function TypeaheadInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  suggestions,
  appendOnSelect = false,
  hint,
}: TypeaheadInputProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = useMemo(() => {
    let query = value.trim().toLowerCase();
    if (appendOnSelect) {
      const lastComma = value.lastIndexOf(",");
      query = (lastComma >= 0 ? value.slice(lastComma + 1) : value)
        .trim()
        .toLowerCase();
    }

    const selectedValues = appendOnSelect
      ? value
          .split(",")
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const matches = !query
      ? [...suggestions]
      : suggestions.filter((suggestion) =>
          suggestion.toLowerCase().includes(query),
        );

    if (!appendOnSelect) {
      return matches;
    }

    return matches.filter(
      (suggestion) => !selectedValues.includes(suggestion.toLowerCase()),
    );
  }, [appendOnSelect, suggestions, value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-medium text-zinc-400"
      >
        {label}
        {required ? (
          <>
            {" "}
            <span className="text-red-500">*</span>
          </>
        ) : null}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (appendOnSelect && value.trim()) {
            const formatted = formatDisciplineList(value);
            if (formatted !== value) {
              onChange(formatted);
            }
          }
          setOpen(false);
        }}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={TYPEAHEAD_INPUT_CLASS}
      />
      {hint ? (
        <p className="mt-1 text-xs text-zinc-500">{hint}</p>
      ) : null}
      {open && filteredSuggestions.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-lg">
          {filteredSuggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (appendOnSelect) {
                    const nextValue = appendTypeaheadValue(value, suggestion);
                    if (nextValue !== null) {
                      onChange(`${nextValue}, `);
                    }
                    setOpen(true);
                    return;
                  }

                  onChange(suggestion);
                  setOpen(false);
                }}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
