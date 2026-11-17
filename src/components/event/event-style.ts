import type { EventType } from "@/db/schema";

/** The accent of each event type: the same colour tokens as the season grid's labels. */
export const EVENT_ACCENT: Record<EventType, { bar: string; chip: string }> = {
  competition: {
    bar: "border-l-event-competition",
    chip: "bg-event-competition text-event-competition-foreground",
  },
  camp: {
    bar: "border-l-event-camp",
    chip: "bg-event-camp text-event-camp-foreground",
  },
  show: {
    bar: "border-l-event-show",
    chip: "bg-event-show text-event-show-foreground",
  },
  other: {
    bar: "border-l-event-other",
    chip: "bg-event-other text-event-other-foreground",
  },
};
