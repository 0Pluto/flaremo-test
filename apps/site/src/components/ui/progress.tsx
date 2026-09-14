import { Progress as RadixProgress } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof RadixProgress.Root>) {
  return (
    <RadixProgress.Root
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-soft-surface",
        className,
      )}
      {...props}
    >
      <RadixProgress.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-signal transition-all duration-300"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </RadixProgress.Root>
  );
}

export { Progress };
