"use client";

import { useState } from "react";
import { X } from "lucide-react";

function normalizeTag(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;
};

export function TagInput({ value, onChange, maxTags = 12 }: TagInputProps) {
  const [input, setInput] = useState("");

  function addTag() {
    const tag = normalizeTag(input);
    if (!tag) return;
    if (!value.includes(tag) && value.length < maxTags) {
      onChange([...value, tag]);
    }
    setInput("");
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label
          htmlFor="tags"
          className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
        >
          Tags
        </label>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {value.length}/{maxTags}
        </span>
      </div>
      <div className="min-h-12 rounded-lg border border-slate-200 bg-white px-3 py-2 transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:border-indigo-500 dark:focus-within:ring-indigo-900/40">
        <div className="flex flex-wrap items-center gap-2">
          {value.map((tag) => (
            <span key={tag} className="status-badge">
              #{tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== tag))}
                className="rounded-full text-indigo-400 transition hover:text-indigo-700 dark:hover:text-indigo-100"
                aria-label={`Remove ${tag} tag`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
          <input
            id="tags"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addTag();
              } else if (event.key === "Backspace" && !input && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            onBlur={addTag}
            maxLength={32}
            placeholder={
              value.length ? "Add another tag" : "project, health, meeting"
            }
            className="min-w-40 flex-1 bg-transparent px-1 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
      </div>
    </div>
  );
}
