import { lazy, type ComponentType } from "react";

const lazyContent = (loader: () => Promise<{ [key: string]: ComponentType }>, name: string) =>
  lazy(() => loader().then((mod) => ({ default: mod[name] as ComponentType })));

export const blogContent: Record<string, ComponentType> = {
  "sake-for-beginners": lazyContent(() => import("./sake-for-beginners"), "SakeForBeginners"),
  "how-is-sake-made": lazyContent(() => import("./how-is-sake-made"), "HowIsSakeMade"),
  "history-of-sake": lazyContent(() => import("./history-of-sake"), "HistoryOfSake"),
  "sake-etiquette": lazyContent(() => import("./sake-etiquette"), "SakeEtiquette"),
  "types-of-sake": lazyContent(() => import("./types-of-sake"), "TypesOfSake"),
  "what-is-junmai-sake": lazyContent(() => import("./what-is-junmai-sake"), "WhatIsJunmaiSake"),
  "what-is-daiginjo-sake": lazyContent(() => import("./what-is-daiginjo-sake"), "WhatIsDaiginjoSake"),
  "honjozo-vs-junmai": lazyContent(() => import("./honjozo-vs-junmai"), "HonjozoVsJunmai"),
  "best-sake-apps-2026": lazyContent(() => import("./best-sake-apps-2026"), "BestSakeApps2026"),
  "sakescan-vs-vivino": lazyContent(() => import("./sakescan-vs-vivino"), "SakeScanVsVivino"),
  "sake-scanner-app-guide": lazyContent(() => import("./sake-scanner-app-guide"), "SakeScannerAppGuide"),
  "sakescan-review": lazyContent(() => import("./sakescan-review"), "SakeScanReview"),
};
