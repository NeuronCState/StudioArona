/**
 * Skills marketplace — 100% client-side service.
 *
 * No network calls. The catalog, categories, trending, and search results
 * are all derived from the bundled `MARKET_CATALOG` / `MARKET_CATEGORIES`
 * data in `marketplace-catalog.ts`.
 *
 * This replaces the previous flow that fetched `/api/skills/marketplace/*`
 * via `api/client.ts`, which silently failed in devbypass mode because
 * `api/client.ts` short-circuits with OFFLINE for `tokenMode === "local"`
 * users before MSW can intercept.
 *
 * API shape (return types) is preserved 1:1 with the previous backend
 * contract so `MarketplaceTab` doesn't need other refactors.
 */
import {
  buildMarketSkill,
  findCatalogTuple,
  MARKET_CATALOG,
  MARKET_CATEGORIES,
  type CategoriesResponse,
  type MarketSkill,
  type SearchResponse,
  type TrendingResponse,
} from "./marketplace-catalog";

export interface InstalledResponse {
  skills: MarketSkill[];
  slugs: string[];
  total: number;
}

export interface TrendingOptions {
  /** "all" | "week" | "month" — currently ignored (kept for API parity). */
  window: "all" | "week" | "month";
  /** Max number of skills to return. */
  limit: number;
}

export interface SearchOptions {
  q: string;
  category?: string | null;
  page?: number;
  limit?: number;
  sortBy?: "stars" | string | null;
}

/** Get all top-level marketplace categories. */
export async function getMarketCategories(): Promise<CategoriesResponse> {
  return {
    categories: [...MARKET_CATEGORIES],
    total: MARKET_CATEGORIES.length,
  };
}

/**
 * Get trending skills (sorted by stars, descending).
 * `window` is accepted for API parity but currently has no effect —
 * we always return the top-N by stars across the full catalog.
 */
export async function getMarketTrending(
  opts: TrendingOptions,
): Promise<TrendingResponse> {
  const limit = Math.max(1, opts.limit);
  const skills = MARKET_CATALOG.map(buildMarketSkill)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, limit);
  return { skills, total: skills.length, cached: true };
}

/**
 * Search skills by query string and/or category.
 * Query matches against name / description / author / tags (case-insensitive).
 * Empty / "skill" queries return everything in the chosen category.
 */
export async function searchMarketSkills(
  opts: SearchOptions,
): Promise<SearchResponse> {
  const q = (opts.q ?? "").toLowerCase();
  const category = opts.category ?? "";
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.max(1, opts.limit ?? 20);
  const sortBy = opts.sortBy ?? "stars";

  let matched = MARKET_CATALOG.map(buildMarketSkill).filter((s) => {
    if (category && s.category !== category) return false;
    if (!q || q === "skill") return true;
    const tagsJoined = s.tags.join(" ");
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.author.toLowerCase().includes(q) ||
      tagsJoined.toLowerCase().includes(q)
    );
  });

  if (sortBy === "stars") {
    matched = matched.sort((a, b) => b.stars - a.stars);
  }

  const total = matched.length;
  const start = (page - 1) * limit;
  const slice = matched.slice(start, start + limit);
  return { skills: slice, total, page };
}

/**
 * Return the list of marketplace skills currently installed.
 *
 * The single source of truth for "installed" lives in the browser IDB
 * via `useLocalResource`. This function is intentionally conservative:
 * it returns an empty list, and `MarketplaceTab` reflects the real
 * installed set via optimistic updates on the `marketplace-installed`
 * query cache (driven by `installMutation.onSuccess` / `uninstallMutation.onSuccess`).
 *
 * Kept as a function (vs. a constant) so the contract stays 1:1 with the
 * previous backend response, and so future callers can replace it with
 * an IDB read without changing call sites.
 */
export async function getMarketInstalled(): Promise<InstalledResponse> {
  return { skills: [], slugs: [], total: 0 };
}

/**
 * Build the response shape that the previous server endpoint used to
 * return from `POST /api/skills/marketplace/install`. Called by the
 * install mutation's local-only path so we don't need a server round-trip.
 */
export function buildInstalledSkill(
  payload: {
    slug: string;
    name?: string;
    source?: string;
    source_url?: string;
    detail_url?: string;
  },
): MarketSkill & { installed: true; installed_at: string } {
  const meta = findCatalogTuple(payload.slug);
  const built = meta ? buildMarketSkill(meta) : null;
  const name = payload.name ?? built?.name ?? payload.slug;
  const source_url = payload.source_url ?? built?.source_url ?? "";
  const detail_url = payload.detail_url || built?.detail_url || "";
  return {
    slug: payload.slug,
    name,
    description: built?.description ?? "",
    description_zh: built?.description_zh ?? "",
    source: payload.source ?? "marketplace",
    source_url,
    detail_url,
    author: built?.author ?? "skillsmp-community",
    stars: built?.stars ?? 0,
    tags: built?.tags ?? [],
    category: built?.category ?? "general",
    updated_at: built?.updated_at,
    installed: true,
    installed_at: new Date().toISOString(),
  };
}