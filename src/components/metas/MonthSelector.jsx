import React from "react";
import { Calendar } from "lucide-react";
import { formatMonthYear } from "@/lib/contabilidad";

export default function MonthSelector({ value, onChange, options }) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-muted-foreground" />
      <select
        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm font-medium"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {formatMonthYear(m)}
          </option>
        ))}
      </select>
    </div>
  );
}