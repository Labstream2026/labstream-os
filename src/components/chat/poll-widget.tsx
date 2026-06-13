"use client";

import type { PollData } from "@/lib/chat-bus";

export function PollWidget({
  poll,
  myOptionId,
  onVote,
}: {
  poll: PollData;
  myOptionId: string | null;
  onVote: (optionId: string) => void;
}) {
  return (
    <div className="mt-1.5 rounded-lg border border-border bg-background p-3">
      <p className="text-sm font-medium">📊 {poll.question}</p>
      <div className="mt-2 space-y-1.5">
        {poll.options.map((o) => {
          const pct = poll.totalVotes ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
          const mine = myOptionId === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onVote(o.id)}
              className="relative block w-full overflow-hidden rounded-md border border-border px-2.5 py-1.5 text-left text-xs hover:border-primary/50"
            >
              <span
                className="absolute inset-y-0 left-0 bg-primary/15"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <span className="relative flex items-center justify-between gap-2">
                <span className="truncate">
                  {mine ? "● " : "○ "}
                  {o.text}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {o.votes} · {pct}%
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {poll.totalVotes} voto{poll.totalVotes === 1 ? "" : "s"} · toca una opción para votar
      </p>
    </div>
  );
}
