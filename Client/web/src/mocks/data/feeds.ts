import type { Feed } from "@/types/contracts";

export const mockFeeds: Feed[] = [
  {
    id: "f_hn",
    user_id: "u_zhang",
    url: "https://hnrss.org/frontpage",
    title: "Hacker News",
    enabled: true,
    created_at: "2026-05-01T08:00:00Z",
  },
  {
    id: "f_arxiv",
    user_id: "u_zhang",
    url: "http://export.arxiv.org/rss/cs.AI",
    title: "arXiv CS.AI",
    enabled: true,
    created_at: "2026-05-03T10:00:00Z",
  },
  {
    id: "f_techcrunch",
    user_id: "u_zhang",
    url: "https://techcrunch.com/feed/",
    title: "TechCrunch",
    enabled: true,
    created_at: "2026-04-20T09:00:00Z",
  },
  {
    id: "f_verge",
    user_id: "u_zhang",
    url: "https://www.theverge.com/rss/index.xml",
    title: "The Verge",
    enabled: true,
    created_at: "2026-04-22T11:00:00Z",
  },
];
