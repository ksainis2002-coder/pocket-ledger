import "./styles/tokens.css";
import "./styles/base.css";
import { openData } from "./app/data";
import { mountShell } from "./app/shell";
import { browserClockHost, createTodayClock } from "./app/today";
import { registerServiceWorker } from "./app/updates";

const root = document.getElementById("app");
if (root) {
  const clock = createTodayClock(browserClockHost());
  mountShell(root, clock);
  void registerServiceWorker();
  // The data layer opens in the background. Phase 2 connects it to the screens and shows
  // the "Can't open your data" and "updated" messages; until then, problems are only logged.
  openData(clock, (event) => console.warn(`Pocket Ledger storage: ${event}`)).catch((e: unknown) => {
    console.warn("Pocket Ledger storage could not be opened", e);
  });
}
