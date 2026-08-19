"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface BorderBeamPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  beamColor?: string;
  duration?: number;
  borderWidth?: number;
  glow?: boolean;
  disabled?: boolean;
}

/**
 * BorderBeamPanel
 * An ultra-modern container primitive that features a subtle rotating conic beam
 * along its perimeter with optional ambient background glow.
 * Automatically respects `prefers-reduced-motion` with an accessible static border.
 */
export function BorderBeamPanel({
  children,
  className,
  containerClassName,
  beamColor,
  duration = 8,
  borderWidth = 1.5,
  glow = false,
  disabled = false,
  ...props
}: BorderBeamPanelProps) {
  return (
    <div
      className={cn(
        "group relative rounded-xl p-[1.5px] transition-all overflow-hidden",
        glow &&
          "before:absolute before:-inset-2 before:bg-gradient-to-r before:from-primary/20 before:via-sky-500/20 before:to-indigo-500/20 before:blur-xl before:opacity-70 before:pointer-events-none",
        containerClassName
      )}
      {...props}
    >
      {/* Animated rotating conic gradient beam */}
      {!disabled && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -inset-[100%] aspect-square opacity-100 will-change-transform",
            "bg-[conic-gradient(from_0deg,transparent_0_300deg,var(--primary)_335deg,oklch(0.685_0.169_237.32)_350deg,oklch(0.765_0.177_70.08)_360deg)]",
            beamColor,
            "motion-safe:animate-[border-spin_8s_linear_infinite]",
            "motion-reduce:hidden"
          )}
          style={{
            animationDuration: `${duration}s`,
          }}
        />
      )}

      {/* Static fallback border when animation is disabled or reduced motion is active */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] border border-border/80",
          !disabled && "motion-safe:hidden"
        )}
      />

      {/* Inner surface card container */}
      <div
        className={cn(
          "relative z-10 size-full rounded-[calc(var(--radius,0.625rem)-1px)] bg-card text-card-foreground shadow-sm transition-colors",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
