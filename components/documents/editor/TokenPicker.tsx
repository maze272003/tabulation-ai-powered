"use client";

import { useState } from "react";
import { TOKEN_CATALOG } from "@/lib/documents/tokens";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

export interface TokenPickerProps {
  onInsert: (token: string) => void;
}

export function TokenPicker({ onInsert }: TokenPickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Insert field
        <ChevronDown aria-hidden className="size-3.5" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 max-h-64 w-52 overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          {TOKEN_CATALOG.map((def) => (
            <button
              key={def.token}
              type="button"
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
              onClick={() => {
                onInsert(def.token);
                setOpen(false);
              }}
            >
              <span>{def.label}</span>
              <code className="text-[10px] text-muted-foreground">{`{{${def.token}}}`}</code>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
