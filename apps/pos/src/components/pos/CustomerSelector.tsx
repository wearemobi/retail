import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button, Input } from "@retail/common";
import { fetchCustomers, type Customer } from "../../lib/api";
import { useDebouncedValue } from "../../lib/useDebouncedValue";

const MIN_SEARCH_LENGTH = 2;

interface CustomerSelectorProps {
  selected: Customer | null;
  onSelect: (customer: Customer) => void;
  onClear: () => void;
}

function customerName(customer: Customer): string {
  return customer.legal_name || customer.commercial_name || "Cliente";
}

export default function CustomerSelector({
  selected,
  onSelect,
  onClear,
}: CustomerSelectorProps) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const debouncedTerm = useDebouncedValue(term.trim(), 300);

  useEffect(() => {
    let cancelled = false;

    if (debouncedTerm.length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setIsSearching(false);
      setError("");
      return () => {
        cancelled = true;
      };
    }

    setIsSearching(true);
    setError("");
    fetchCustomers(debouncedTerm)
      .then((customers) => {
        if (!cancelled) setResults(customers);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedTerm]);

  const handleSelect = (customer: Customer) => {
    setTerm("");
    setResults([]);
    setError("");
    onSelect(customer);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="pos-customer-search" className="text-[11px] text-muted-foreground">
        Buscar cliente
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="pos-customer-search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Nombre, razón social o NIT…"
          autoComplete="off"
          className="h-9 pl-8 text-xs"
        />
        {isSearching && (
          <Loader2
            className="absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}

      {!error && debouncedTerm.length < MIN_SEARCH_LENGTH && !selected && (
        <p className="text-[11px] text-muted-foreground">
          Escribe al menos {MIN_SEARCH_LENGTH} caracteres para buscar en el maestro.
        </p>
      )}

      {!error &&
        debouncedTerm.length >= MIN_SEARCH_LENGTH &&
        !isSearching &&
        results.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No se encontraron clientes activos.</p>
        )}

      {results.length > 0 && (
        <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background">
          {results.map((customer) => (
            <li key={customer.id ?? customer.tax_id ?? customer.legal_name}>
              <button
                type="button"
                onClick={() => handleSelect(customer)}
                className="flex w-full flex-col gap-0.5 px-2.5 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="truncate text-xs font-medium text-foreground">
                  {customerName(customer)}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {customer.tax_id}
                  {customer.commercial_name && customer.commercial_name !== customer.legal_name
                    ? ` · ${customer.commercial_name}`
                    : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
          <div className="min-w-0">
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Cliente seleccionado
            </p>
            <p className="truncate text-xs font-medium text-foreground">
              {customerName(selected)}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{selected.tax_id}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label="Quitar cliente"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
