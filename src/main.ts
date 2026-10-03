import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import { startApp } from "./app/app";
import { openData } from "./app/data";
import { isIOSDevice, isStandaloneDisplay, shouldGate } from "./app/install";
import { safariBanner, showBlocked, showCantOpen, showInstallGate, showUpdated } from "./app/screens";
import { browserClockHost, createTodayClock } from "./app/today";
import { registerServiceWorker } from "./app/updates";
import { IS_PREVIEW } from "./app/env";
import { h } from "./components/dom";

const root = document.getElementById("app");
if (root) {
  const clock = createTodayClock(browserClockHost());
  void registerServiceWorker();
  const addExpense = new URLSearchParams(location.search).get("add") === "expense";
  let started = false;

  openData(clock, (event) => {
    if (event === "versionchange") showUpdated(root);
    else if (event === "blocked" && !started) showBlocked(root);
  })
    .then(async (ledger) => {
      const { settings } = await ledger.read();
      if (IS_PREVIEW) {
        // The preview page: no install gate; say plainly that this is a try-out.
        started = true;
        await startApp(root, clock, ledger, {
          addExpense,
          banner: h("div", { class: "banner", role: "note" }, h("p", { class: "banner-text" }, "Preview: try anything. Entries stay in this preview on this device only.")),
        });
        return;
      }
      const gate = shouldGate({
        isIOS: isIOSDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0),
        isStandalone: isStandaloneDisplay(),
        acknowledged: settings.iosBrowserAcknowledged === true,
      });
      const start = async (banner: boolean): Promise<void> => {
        started = true;
        await startApp(root, clock, ledger, { addExpense, ...(banner ? { banner: safariBanner() } : {}) });
      };
      if (gate === "gate") {
        showInstallGate(root, () => {
          void ledger
            .updateSettings({ iosBrowserAcknowledged: true })
            .then(() => start(true))
            .catch(() => showCantOpen(root));
        });
      } else {
        await start(gate === "safari-banner");
      }
    })
    .catch(() => showCantOpen(root));
}
