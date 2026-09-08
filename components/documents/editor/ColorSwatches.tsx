"use client";

import { cn } from "@/lib/utils";

export interface ColorSwatch {
  label: string;
  hex: string;
}

/** Quick certificate-oriented color presets shared across editor panels. */
export const COLOR_SWATCHES: readonly ColorSwatch[] = [
  { label: "Black", hex: "#000000" },
  { label: "Navy", hex: "#0F2027" },
  { label: "Gold", hex: "#D4AF37" },
  { label: "Amber", hex: "#D97706" },
  { label: "Emerald", hex: "#064E3B" },
  { label: "Crimson", hex: "#881337" },
  { label: "Slate", hex: "#475569" },
  { label: "White", hex: "#FFFFFF" },
];

export interface ColorSwatchesProps {
  /** Currently applied color; the matching swatch is highlighted. */
  value?: string;
  onSelect: (hex: string) => void;
  className?: string;
}

export function ColorSwatches({ value, onSelect, className }: ColorSwatchesProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {COLOR_SWATCHES.map((swatch) => {
        const active = value?.toLowerCase() === swatch.hex.toLowerCase();
        return (
          <button
            key={swatch.hex}
            type="button"
            title={swatch.label}
            aria-label={`Set color ${swatch.label}`}
            aria-pressed={active}
            onClick={() => onSelect(swatch.hex)}
            style={{ backgroundColor: swatch.hex }}
            className={cn(
              "size-4 shrink-0 rounded-full border shadow-2xs transition-transform hover:scale-125",
              active ? "border-primary ring-2 ring-primary ring-offset-1" : "border-border/80",
            )}
          />
        );
      })}
    </div>
  );
}
