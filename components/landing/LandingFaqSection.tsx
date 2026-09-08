"use client";

import * as React from "react";
import { ChevronDown, HelpCircle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const FAQS = [
  {
    category: "Reliability & Wi-Fi",
    question: "What happens if the venue Wi-Fi is spotty or drops mid-event?",
    answer:
      "Tabulation features offline-resilient client caching. Judges can continue entering scores even if connectivity blinks out. All submissions are queued locally and automatically sync the moment connection restores, with zero lost marks.",
  },
  {
    category: "Scoring & Math",
    question: "Can we configure drop-highest/lowest and custom decimal weights?",
    answer:
      "Yes! Our scoring engine supports exact percentage decimal weights (e.g., 35.5% Talent, 40% Interview, 24.5% Poise), Olympic-style drop-highest and drop-lowest rules, point ranking systems, and automated multi-stage tie-breakers.",
  },
  {
    category: "Judge Access",
    question: "Do judges need to register, make accounts, or download an app?",
    answer:
      "No! Judges never need to create personal accounts or download software from app stores. They simply open any modern mobile, tablet, or laptop browser, enter your 6-character Event Code and their assigned disposable passkey.",
  },
  {
    category: "Auditing & Security",
    question: "Can scores be altered after a round is locked?",
    answer:
      "No. Once the organizer or Tabulation Chair locks a round, judge inputs are sealed. Any subsequent authorized admin adjustment is recorded in an immutable cryptographic audit log with timestamps, user credentials, and change history.",
  },
  {
    category: "Stage & Media",
    question: "How do we broadcast results to venue projectors or LED walls?",
    answer:
      "Every competition includes a dedicated Stage Display link (`/stage/[eventCode]`). Simply open this URL on the laptop connected to your venue projector or video switcher. You can reveal category winners, Top 5 finalists, and the final podium in fullscreen high definition.",
  },
  {
    category: "Billing & Local Payments",
    question: "What payment methods are supported in the Philippines?",
    answer:
      "Through our integrated PayMongo gateway, you can pay instantly using GCash, Maya, GrabPay, Visa, Mastercard, and Philippine Online Bank Transfers. You can also start immediately with our 100% Free forever tier without entering any card details.",
  },
];

export function LandingFaqSection() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <section id="faq" className="relative border-b border-border/60 bg-muted/20 py-24 md:py-32">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge
            variant="outline"
            className="mb-4 gap-1.5 border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary"
          >
            <HelpCircle className="size-3.5" />
            Clear Answers for Event Planners
          </Badge>
          <h2 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl text-balance">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base leading-relaxed">
            Everything you need to know about setting up, securing, and scoring your next competition.
          </p>
        </div>

        {/* FAQ Accordion List */}
        <div className="space-y-3.5">
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;

            return (
              <div
                key={faq.question}
                className={cn(
                  "rounded-xl border transition-all overflow-hidden",
                  isOpen
                    ? "border-primary/40 bg-card shadow-sm ring-1 ring-primary/20"
                    : "border-border/70 bg-card/60 hover:border-border hover:bg-card"
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  className="flex w-full items-center justify-between p-5 text-left transition-colors cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-3 pr-4">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-mono font-bold transition-colors",
                        isOpen
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="font-heading text-base font-bold text-foreground">
                      {faq.question}
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "size-5 shrink-0 text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180 text-primary"
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-sm leading-relaxed text-muted-foreground border-t border-border/40 pl-15">
                    <p>{faq.answer}</p>
                    <div className="mt-3">
                      <Badge variant="outline" className="text-[10px] text-muted-foreground/80">
                        {faq.category}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
