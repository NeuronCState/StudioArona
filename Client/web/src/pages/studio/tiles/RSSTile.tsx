import { useNavigate } from "react-router-dom";
import { Rss } from "lucide-react";
import { useT } from "@/lib/i18n";

interface RSSItem {
  id: string;
  title: string;
  timeAgo: string;
}

export function RSSTile({ items }: { items: RSSItem[] }) {
  const navigate = useNavigate();
  const t = useT();
  const count = items.length;

  return (
    <div className="studio-tile h-full" onClick={() => navigate("/feeds")}>
      <div className="studio-tile-inner tile-anim-4">
        <div className="studio-tile-header">
          <h3>
            <Rss size={15} className="text-orange-400" />
            {t("tile.rss.title")}
          </h3>
        </div>

        {count === 0 ? (
          <div className="tile-empty">
            <Rss size={28} className="mb-1 opacity-30" />
            <span className="text-xs">{t("tile.rss.empty")}</span>
          </div>
        ) : (
          <div className="flex-1">
            {items.map((item) => (
              <div key={item.id} className="rss-item">
                <p className="line-clamp-2 text-[13px] font-medium leading-snug text-stone-700">
                  {item.title}
                </p>
                <span className="mt-0.5 inline-block text-[11px] text-stone-400">
                  {item.timeAgo}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
