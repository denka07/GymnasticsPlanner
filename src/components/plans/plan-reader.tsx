"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MapIcon,
  MaximizeIcon,
  RotateCwIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PlansToRead } from "@/lib/data/session-plans";
import { clampView, FIT, panBy, ZOOM_STEP, zoomAt, type ZoomView } from "@/lib/drawing/zoom";
import { turnByDefault } from "@/lib/drawing/view";
import { planOfPart } from "@/lib/plan-reading";
import { cn } from "@/lib/utils";

import { PlanDrawing } from "./plan-drawing";
import { appliesTo, personInitials, planName, planNumbers } from "./plan-names";
import { SavePlanImage } from "./save-plan-image";

/*
 * Reading a session's plans on the phone's session page
 * (docs/implementation-plan.md, step 11). Plans are opened on demand: a
 * "Ritningar" button near the top and a "Ritning" button on each part with a
 * plan open a full-screen view, where the drawing is zoomed and dragged and a
 * station's number leads back to its activity.
 */

/** The element an activity of the session page is drawn in. */
export function activityElementId(activityId: string): string {
  return `activity-${activityId}`;
}

type Reader = {
  data: PlansToRead;
  date: string;
  open: (planId: string) => void;
  /** The latest request to show an activity, counted so a repeat is seen. */
  request: { activityId: string; count: number } | null;
};

const ReaderContext = createContext<Reader | null>(null);

/**
 * Tells an activity on the session page that it was asked for from a plan:
 * the number changes each time it is, and stays 0 until then.
 */
export function useActivityRequest(activityId: string): number {
  const reader = useContext(ReaderContext);
  return reader?.request?.activityId === activityId ? reader.request.count : 0;
}

/** Gives the session page its plans; without plans it only shows its children. */
export function PlanReader({ data, date, children }: { data: PlansToRead | null; date: string; children: ReactNode }) {
  const [planId, setPlanId] = useState<string | null>(null);
  // The plan last shown stays drawn while the view closes.
  const [shownId, setShownId] = useState<string | null>(null);
  if (planId !== null && planId !== shownId) {
    setShownId(planId);
  }
  const [request, setRequest] = useState<Reader["request"]>(null);
  const pending = useRef<string | null>(null);
  const open = useCallback((id: string) => setPlanId(id), []);
  const reader = useMemo(() => (data ? { data, date, open, request } : null), [data, date, open, request]);

  if (!reader || !data) {
    return children;
  }

  function showActivity(activityId: string) {
    pending.current = activityId;
    setRequest((r) => ({ activityId, count: (r?.count ?? 0) + 1 }));
    setPlanId(null);
  }

  /**
   * Where the focus goes when the view closes: the activity asked for,
   * scrolled to the middle of the screen, or else back where it came from.
   */
  function focusAfterClose(): HTMLElement | true {
    const id = pending.current;
    pending.current = null;
    const element = id ? document.getElementById(activityElementId(id)) : null;
    if (!element) {
      return true;
    }
    element.scrollIntoView({ block: "center" });
    return element.querySelector<HTMLElement>("button[aria-expanded]") ?? element;
  }

  return (
    <ReaderContext.Provider value={reader}>
      {children}
      <Dialog
        open={planId !== null}
        onOpenChange={(next) => !next && setPlanId(null)}
      >
        {shownId !== null && (
          <PlanView
            data={data}
            date={date}
            planId={shownId}
            onPlan={setPlanId}
            onActivity={showActivity}
            finalFocus={focusAfterClose}
          />
        )}
      </Dialog>
    </ReaderContext.Provider>
  );
}

/** "Ritningar" near the top of the session page; nothing without plans. */
export function PlansButton({ className }: { className?: string }) {
  const reader = useContext(ReaderContext);
  const t = useTranslations("PlanReading");
  if (!reader) {
    return null;
  }
  const count = reader.data.plans.length;
  return (
    <Button
      type="button"
      variant="outline"
      className={cn("h-11 px-4 text-base", className)}
      aria-label={t("openAll", { count })}
      onClick={() => reader.open(reader.data.plans[0].id)}
    >
      <MapIcon data-icon="inline-start" />
      {t("plansButton")}
    </Button>
  );
}

/** "Ritning" on a part with a plan, its own or the main plan; nothing otherwise. */
export function PartPlanButton({ partId, partTitle }: { partId: string; partTitle: string }) {
  const reader = useContext(ReaderContext);
  const t = useTranslations("PlanReading");
  const plan = reader ? planOfPart(partId, reader.data.plans) : null;
  if (!reader || !plan) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-11 shrink-0 gap-1 px-2 text-sm text-muted-foreground"
      aria-label={t("openForPart", { part: partTitle })}
      onClick={() => reader.open(plan.id)}
    >
      <MapIcon className="size-5" />
      {t("planButton")}
    </Button>
  );
}

function PlanView({
  data,
  date,
  planId,
  onPlan,
  onActivity,
  finalFocus,
}: {
  data: PlansToRead;
  date: string;
  planId: string;
  onPlan: (planId: string) => void;
  onActivity: (activityId: string) => void;
  finalFocus: () => HTMLElement | true;
}) {
  const t = useTranslations("PlanReading");
  const tp = useTranslations("Plans");
  const { plans, parts, hall } = data;
  const index = Math.max(0, plans.findIndex((p) => p.id === planId));
  const plan = plans[index];
  const name = planName(plan, parts, tp);
  const numbers = planNumbers(plan, plans, parts);
  const initials = personInitials(tp);
  const previous = plans[index - 1];
  const next = plans[index + 1];

  return (
    <DialogContent
      showCloseButton={false}
      finalFocus={finalFocus}
      className="top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 ring-0 sm:max-w-none"
    >
      <header className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          disabled={!previous}
          aria-label={previous ? t("previousPlan", { plan: planName(previous, parts, tp) }) : t("noPrevious")}
          onClick={() => previous && onPlan(previous.id)}
        >
          <ChevronLeftIcon className="size-6" />
        </Button>
        <div className="grid min-w-0 flex-1 text-center">
          <DialogTitle className="truncate text-lg font-semibold">{name}</DialogTitle>
          <DialogDescription className="truncate text-sm">
            {plans.length > 1 && (
              <span className="tabular-nums">{t("position", { index: index + 1, count: plans.length })} · </span>
            )}
            {appliesTo(plan, plans, parts, tp)}
          </DialogDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          disabled={!next}
          aria-label={next ? t("nextPlan", { plan: planName(next, parts, tp) }) : t("noNext")}
          onClick={() => next && onPlan(next.id)}
        >
          <ChevronRightIcon className="size-6" />
        </Button>
        <DialogClose
          render={<Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t("close")} />}
        >
          <XIcon className="size-6" />
        </DialogClose>
      </header>

      <ZoomFrame key={plan.id} hall={hall}>
        {(turned) => (
          <PlanDrawing
            hall={hall}
            items={plan.items}
            numbers={numbers}
            initials={initials}
            label={tp("drawingLabel", { plan: name, hall: hall.name })}
            turned={turned}
            className="h-full w-full"
            numberAction={{
              label: (number) => t("showActivity", { number }),
              onActivate: onActivity,
            }}
          />
        )}
      </ZoomFrame>

      <footer className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
        <SavePlanImage
          hall={hall}
          items={plan.items}
          numbers={numbers}
          initials={initials}
          name={name}
          date={date}
          variant="ghost"
          className="h-11"
        />
        <p className="hidden text-sm text-muted-foreground min-[420px]:block">{t("tapNumber")}</p>
      </footer>
    </DialogContent>
  );
}

type Size = { width: number; height: number };

/**
 * The drawing in a frame that is zoomed with two fingers, the mouse wheel or
 * the buttons, and dragged. A drag does not count as a tap on a number.
 */
function ZoomFrame({ hall, children }: { hall: PlansToRead["hall"]; children: (turned: boolean) => ReactNode }) {
  const t = useTranslations("PlanReading");
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [view, setView] = useState<ZoomView>(FIT);
  const [turnedByUser, setTurnedByUser] = useState<boolean | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const sizeRef = useRef<Size>({ width: 1, height: 1 });

  useEffect(() => {
    const element = frame.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      sizeRef.current = next;
      setSize(next);
      setView((v) => clampView(v, next));
    });
    observer.observe(element);
    // The wheel zooms instead of scrolling the page, which needs a listener that is not passive.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setView((v) => zoomAt(v, Math.exp(-event.deltaY * 0.002), point, sizeRef.current));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", onWheel);
    };
  }, []);

  const area = { width: hall.widthCm, height: hall.lengthCm };
  const turned = turnedByUser ?? turnByDefault(area, size);

  function local(event: React.PointerEvent): { x: number; y: number } {
    const rect = frame.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: React.PointerEvent) {
    if (pointers.current.size === 0) {
      moved.current = false;
      start.current = local(event);
    }
    pointers.current.set(event.pointerId, local(event));
  }

  function onPointerMove(event: React.PointerEvent) {
    const before = pointers.current.get(event.pointerId);
    if (!before) {
      return;
    }
    const now = local(event);
    const all = [...pointers.current.entries()];
    if (!moved.current && start.current) {
      const distance = Math.hypot(now.x - start.current.x, now.y - start.current.y);
      if (distance < 6 && all.length === 1) {
        return;
      }
      moved.current = true;
      frame.current?.setPointerCapture(event.pointerId);
    }
    if (all.length >= 2) {
      const other = all.find(([id]) => id !== event.pointerId)![1];
      const oldMid = { x: (before.x + other.x) / 2, y: (before.y + other.y) / 2 };
      const newMid = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
      const oldDistance = Math.hypot(before.x - other.x, before.y - other.y) || 1;
      const newDistance = Math.hypot(now.x - other.x, now.y - other.y);
      const frameSize = sizeRef.current;
      setView((v) =>
        panBy(zoomAt(v, newDistance / oldDistance, oldMid, frameSize), newMid.x - oldMid.x, newMid.y - oldMid.y, frameSize),
      );
    } else {
      setView((v) => panBy(v, now.x - before.x, now.y - before.y, sizeRef.current));
    }
    pointers.current.set(event.pointerId, now);
  }

  function onPointerEnd(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId);
  }

  function zoomBy(factor: number) {
    const s = sizeRef.current;
    setView((v) => zoomAt(v, factor, { x: s.width / 2, y: s.height / 2 }, s));
  }

  return (
    <div className="relative min-h-0 flex-1 bg-muted/40">
      <div
        ref={frame}
        data-zoom-frame
        data-scale={view.scale.toFixed(2)}
        className="absolute inset-0 touch-none overflow-hidden select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(event) => {
          // The end of a drag or pinch is not a tap on a number.
          if (moved.current) {
            event.stopPropagation();
            event.preventDefault();
          }
        }}
      >
        <div
          className="absolute inset-0 p-2"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "0 0" }}
        >
          {size && children(turned)}
        </div>
      </div>
      <div className="absolute right-2 bottom-2 grid gap-1.5">
        <ZoomButton label={t("zoomIn")} onClick={() => zoomBy(ZOOM_STEP)}>
          <ZoomInIcon />
        </ZoomButton>
        <ZoomButton label={t("zoomOut")} onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <ZoomOutIcon />
        </ZoomButton>
        <ZoomButton label={t("fit")} onClick={() => setView(FIT)}>
          <MaximizeIcon />
        </ZoomButton>
        <ZoomButton
          label={t("turn")}
          onClick={() => {
            setTurnedByUser(!turned);
            setView(FIT);
          }}
        >
          <RotateCwIcon />
        </ZoomButton>
      </div>
    </div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-11 bg-background/90 shadow-sm"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
