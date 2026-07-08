"use client";

import { useMemo, useState } from "react";

import TypeaheadInput from "@/components/TypeaheadInput";
import {
  combineDisciplineValue,
  parseDisciplineValue,
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
  placeholder = "e.g. Barrel Racing, Dressage, Pole Bending",
  required,
  hint = "Select one or more disciplines.",
}: DisciplineInputProps) {
  const parsed = useMemo(() => parseDisciplineValue(value), [value]);
  const [otherInputVisible, setOtherInputVisible] = useState(
    () => parsed.custom.length > 0,
  );

  const showOtherInput = otherInputVisible || parsed.custom.length > 0;

  function updatePredefined(nextPredefined: string) {
    onChange(combineDisciplineValue(nextPredefined, parsed.custom));
  }

  function updateCustom(nextCustom: string) {
    onChange(combineDisciplineValue(parsed.predefined, nextCustom));
  }

  return (
    <div className="space-y-3">
      <TypeaheadInput
        id={id}
        label={label}
        value={parsed.predefined}
        onChange={updatePredefined}
        placeholder={placeholder}
        required={required && !parsed.custom.trim()}
        suggestions={DISCIPLINE_SUGGESTIONS_WITH_OTHER}
        appendOnSelect
        hint={hint}
        onSuggestionSelect={(suggestion) => {
          if (suggestion === DISCIPLINE_OTHER) {
            setOtherInputVisible(true);
            return false;
          }
          return true;
        }}
      />

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
            value={parsed.custom}
            onChange={(event) => {
              setOtherInputVisible(true);
              updateCustom(event.target.value);
            }}
            placeholder="Type your discipline"
            className={OTHER_INPUT_CLASS}
          />
        </div>
      ) : null}
    </div>
  );
}
