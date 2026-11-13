"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { ActivityLibrary } from "@/lib/data/sessions";
import { byName } from "@/lib/library";
import type { LinkedItem } from "@/lib/outline";

type LibraryState = ActivityLibrary & {
  /** Adds a station created from the picker, so every column offers it. */
  addStation: (station: LinkedItem) => void;
  /** Adds an exercise created from the picker; with a station, it supports it. */
  addExercise: (exercise: LinkedItem, supportedBy: string | null) => void;
};

const LibraryContext = createContext<LibraryState | null>(null);

/**
 * The stations and exercises the week page's activity picker offers. Items
 * created from the picker are added here, so all columns see them at once.
 */
export function ActivityLibraryProvider({
  library,
  children,
}: {
  /** Null without edit access: then nothing can be linked. */
  library: ActivityLibrary | null;
  children: ReactNode;
}) {
  const [state, setState] = useState(library);
  if (state === null) {
    return children;
  }
  const value: LibraryState = {
    ...state,
    addStation: (station) =>
      setState((s) => s && {
        ...s,
        stations: [...s.stations, station].sort(byName),
        // A station the user creates is personal, so they may edit it.
        editableStationIds: [...s.editableStationIds, station.id],
      }),
    addExercise: (exercise, supportedBy) =>
      setState((s) => s && {
        ...s,
        exercises: [...s.exercises, exercise].sort(byName),
        supports: supportedBy
          ? { ...s.supports, [supportedBy]: [...(s.supports[supportedBy] ?? []), exercise.id] }
          : s.supports,
      }),
  };
  return <LibraryContext value={value}>{children}</LibraryContext>;
}

/** The picker's library, or null outside a provider (view access). */
export function useActivityLibrary(): LibraryState | null {
  return useContext(LibraryContext);
}
