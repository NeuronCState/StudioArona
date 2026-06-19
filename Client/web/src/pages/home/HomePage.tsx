import { useDesignModeStore } from "@/stores/design-mode";
import { HomeCommandPage } from "./HomeCommandPage";
import { StudioHomePage } from "../studio/StudioHomePage";

export function HomePage() {
  const designMode = useDesignModeStore((s) => s.mode);

  if (designMode === "studio") {
    return <StudioHomePage />;
  }

  return <HomeCommandPage />;
}
