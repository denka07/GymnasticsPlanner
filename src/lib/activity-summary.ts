export const SUMMARY_SHOWN = 2;

export type Summary = {
  /** The first names, at most `limit`. */
  shown: string[];
  /** How many names are not in `shown`. */
  more: number;
};

/** The first two names and how many are left out, for a one-row summary. */
export function summarize(names: string[], limit = SUMMARY_SHOWN): Summary {
  return { shown: names.slice(0, limit), more: Math.max(0, names.length - limit) };
}
