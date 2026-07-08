"use client";

import { useMemo, useState } from "react";

import TypeaheadInput from "@/components/TypeaheadInput";
import {
  addPredefinedDiscipline,
  getDisciplineParts,
  removeDiscipline,
  setCustomDisciplines,
} from "@/lib/format-discipline";
import {
  DISCIPLINE_OTHER,
  DISCIPLINE_SUGGESTIONS_WITH_OTHER,
} from "@/lib/horse-form-suggestions";

const OTHER_INPUT_CLASS =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none";

type DisciplineInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
};

export default function DisciplineInput({
  id,
  label,
  value,
  onChange,
  placeholder = "Search disciplines to add…",
  required,
  hint = "Select one or more disciplines.",
}: DisciplineInputProps) {
  const [draftQuery, setDraftQuery] = useState("");
  const [otherInputVisible, setOtherInputVisible] = useState(false);

  const { predefined, custom } = useMemo(
    () => getDisciplineParts(value),
    [value],
  );

  const selectedChips = useMemo(
    () => [...predefined, ...custom],
    [predefined, custom],
  );

  const availableSuggestions = useMemo(
    () =>
      DISCIPLINE_SUGGESTIONS_WITH_OTHER.filter(
        (suggestion) =>
          suggestion === DISCIPLINE_OTHER ||
          !predefined.some(
            (selected) =>
              selected.toLowerCase() === suggestion.toLowerCase(),
          ),
      ),
    [predefined],
  );

  const showOtherInput = otherInputVisible || custom.length > 0;
  const customDisplayValue = custom.join(", ");

  function handleAddDiscipline(discipline: string) {
    if (discipline === DISCIPLINE_OTHER) {
      setOtherInputVisible(true);
      setDraftQuery("");
      return;
    }

    onChange(addPredefinedDiscipline(value, discipline));
    setDraftQuery("");
  }

  function handleRemoveDiscipline(discipline: string) {
    const nextValue = removeDiscipline(value, discipline);
    onChange(nextValue);

    const nextCustom = getDisciplineParts(nextValue).custom;
    if (nextCustom.length === 0) {
      setOtherInputVisible(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
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

        {selectedChips.length > 0 ? (
          <ul className="mb-3 flex flex-wrap gap-2">
            {selectedChips.map((discipline) => (
              <li key={discipline}>
                <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                  {discipline}
                  <button
                    type="button"
                    onClick={() => handleRemoveDiscipline(discipline)}
                    className="rounded-full px-1 text-accent/80 transition hover:text-white"
                    aria-label={`Remove ${discipline}`}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <TypeaheadInput
          id={id}
          label=""
          value={draftQuery}
          onChange={setDraftQuery}
          placeholder={placeholder}
          required={required && selectedChips.length === 0}
          suggestions={availableSuggestions}
          hint={hint}
          onSuggestionSelect={(suggestion) => {
            handleAddDiscipline(suggestion);
            return false;
          }}
        />
      </div>

      {showOtherInput ? (
        <div>
          <label
            htmlFor={`${id}-other`}
            className="mb-2 block text-xs font-medium text-zinc-400"
          >
            Other discipline
          </label>
          <input
            id={`${id}-other`}
            type="text"
            value={customDisplayValue}
            onChange={(event) => {
              setOtherInputVisible(true);
              onChange(setCustomDisciplines(value, event.target.value));
            }}
            placeholder="Type one or more disciplines, separated by commas"
            className={OTHER_INPUT_CLASS}
          />
        </div>
      ) : null}
    </div>
  );
}
