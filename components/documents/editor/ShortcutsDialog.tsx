"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  title: string;
  items: ShortcutItem[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: "Selection & Manipulation",
    items: [
      { keys: ["Click"], description: "Select single element" },
      { keys: ["Shift", "Click"], description: "Toggle multi-selection" },
      { keys: ["Drag on canvas"], description: "Marquee box selection" },
      { keys: ["↑", "↓", "←", "→"], description: "Nudge 0.5 mm precision" },
      { keys: ["Shift", "Arrow"], description: "Big nudge 5.0 mm" },
      { keys: ["Delete"], description: "Delete selected elements" },
      { keys: ["Esc"], description: "Clear current selection" },
    ],
  },
  {
    title: "Clipboard & History",
    items: [
      { keys: ["Ctrl", "Z"], description: "Undo last edit" },
      { keys: ["Ctrl", "Y"], description: "Redo undone edit" },
      { keys: ["Ctrl", "Shift", "Z"], description: "Alternative redo" },
      { keys: ["Ctrl", "C"], description: "Copy selected element" },
      { keys: ["Ctrl", "V"], description: "Paste from clipboard" },
      { keys: ["Ctrl", "D"], description: "Duplicate in place" },
      { keys: ["Ctrl", "S"], description: "Force save changes" },
    ],
  },
  {
    title: "Canvas & Navigation",
    items: [
      { keys: ["Space", "Drag"], description: "Pan canvas view" },
      { keys: ["Middle click", "Drag"], description: "Pan canvas view" },
      { keys: ["Ctrl", "Scroll"], description: "Zoom in / Zoom out" },
      { keys: ["Fit button"], description: "Fit entire page in view" },
      { keys: ["Shift", "Resize"], description: "Maintain aspect ratio" },
      { keys: ["Shift", "Rotate"], description: "Snap angle to 15° steps" },
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border bg-card">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Keyboard aria-hidden className="size-4" />
            </div>
            <DialogTitle className="text-base font-semibold">Studio Keyboard Shortcuts</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Master rapid layout editing and element manipulation with these productivity shortcuts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-3">
          {SHORTCUT_CATEGORIES.map((category) => (
            <div key={category.title} className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <h4 className="text-[11px] font-semibold tracking-wide text-foreground uppercase">
                {category.title}
              </h4>
              <ul className="space-y-2 text-xs">
                {category.items.map((item) => (
                  <li key={item.description} className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="inline-flex h-5 items-center rounded border border-border/80 bg-background px-1.5 font-mono text-[10px] font-semibold text-foreground shadow-2xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{item.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
