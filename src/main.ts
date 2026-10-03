import "./styles/tokens.css";
import "./styles/base.css";
import { mountShell } from "./app/shell";
import { browserClockHost, createTodayClock } from "./app/today";
import { registerServiceWorker } from "./app/updates";

const root = document.getElementById("app");
if (root) {
  const clock = createTodayClock(browserClockHost());
  mountShell(root, clock);
  void registerServiceWorker();
}
