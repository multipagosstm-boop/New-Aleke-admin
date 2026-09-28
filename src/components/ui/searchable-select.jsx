import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Selector con búsqueda por escritura (combobox).
 * Reutilizable en todos los módulos para listas largas.
 *
 * Props:
 * - options: [{ value, label, searchKey? }]
 * - value: valor seleccionado
 * - onValueChange: (value) => void
 * - placeholder, searchPlaceholder
 * - includeNull: muestra opción "Sin vinculación" → onValueChange(null)
 * - triggerClassName, popoverClassName
 */
export default function SearchableSelect({
  options = [],
  value,
  onValueChange,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Buscar...",
  includeNull = false,
  nullLabel = "Sin vinculación",
  triggerClassName,
  popoverClassName,
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.value) === String(value));
  const isNullSelected = includeNull && (!value || value === "" || value === null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "justify-between font-normal w-full px-2",
            !selected && !isNullSelected && "text-muted-foreground",
            triggerClassName
          )}
        >
          <span className="truncate">{selected ? selected.label : isNullSelected ? nullLabel : placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-0", popoverClassName)}
        align="start"
        style={{ width: "var(--radix-popover-trigger-width)", minWidth: "min(280px, 88vw)", maxWidth: "92vw" }}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList>
            <CommandEmpty>No encontrado.</CommandEmpty>
            {includeNull && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => { onValueChange(null); setOpen(false); }}
                  className="text-xs text-muted-foreground"
                >
                  <Check className={cn("mr-1 h-3 w-3", isNullSelected ? "opacity-100" : "opacity-0")} />
                  {nullLabel}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.searchKey || opt.label}
                  onSelect={() => { onValueChange(opt.value); setOpen(false); }}
                  className="text-xs"
                >
                  <Check className={cn("mr-1 h-3 w-3", String(opt.value) === String(value) ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}