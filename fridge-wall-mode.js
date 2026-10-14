// ==UserScript==
// @name         Fridgle — wall mode
// @namespace    https://fridgle.net
// @version      3.0.0
// @description  Adds Wall Mode button; clicking it expands all word tile dropdowns in the word pool
// @match        https://fridgle.net/*
// @match        http://fridgle.net/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  const boot = document.createElement("script");
  boot.textContent = `(${page.toString()})();`;
  (document.documentElement || document.head).appendChild(boot);
  boot.remove();

  function page() {
    "use strict";

    const MARKER = "FRIDGLE_WALL_MODE_PATCH";
    const GAME = "game.js";
    const STYLE_ID = "fridgle-wall-mode-style";
    const BTN_ID = "fridgle-wall-mode-btn";

    const wall = {
      expandMode: false,
      closeMenus: null,
      openMenuForTile: null,
      relocateMenus() {
        requestAnimationFrame(() => {
          layoutPoolMenus();
          requestAnimationFrame(layoutPoolMenus);
        });
      },
      exitExpandMode() {
        if (!wall.expandMode) return;
        wall.expandMode = false;
        document.body.classList.remove("fridgle-expand-mode");
        syncButton();
        wall.closeMenus?.();
        unwrapPool();
      },
    };
    window.__fridgleWall = wall;

    installScriptHooks();

    function pool() {
      return document.getElementById("pool");
    }

    function unwrapPool() {
      const p = pool();
      if (!p) return;
      p.querySelectorAll(".fridgle-pool-item").forEach((wrap) => {
        if (wrap.querySelector(".fridgle-word-menu")) return;
        const tile = wrap.querySelector(":scope > .tile");
        if (tile) p.insertBefore(tile, wrap);
        wrap.remove();
      });
    }

    function mountMenuInPool(menu) {
      const idx = menu.dataset.tileIdx;
      if (idx == null) return;
      const p = pool();
      const tile = p?.querySelector(`.tile[data-idx="${idx}"]`);
      if (!p || !tile) return;

      let wrap = tile.parentElement;
      if (!wrap?.classList.contains("fridgle-pool-item")) {
        wrap = document.createElement("span");
        wrap.className = "fridgle-pool-item";
        p.insertBefore(wrap, tile);
        wrap.appendChild(tile);
      }
      menu.classList.add("fridgle-word-menu--pool");
      for (const k of ["position", "left", "top", "right", "bottom"]) menu.style.removeProperty(k);
      wrap.appendChild(menu);
    }

    function layoutPoolMenus() {
      if (!wall.expandMode) {
        unwrapPool();
        return;
      }
      document.querySelectorAll(".fridgle-word-menu:not(.fridgle-word-menu--pool)").forEach(mountMenuInPool);
      unwrapPool();
    }

    function patchGameJs(src) {
      if (src.includes(MARKER)) return src;
      if (!src.includes("let menuEl = null;")) {
        console.warn("[fridgle wall mode] game.js changed; patch skipped");
        return src;
      }

      src = `/* ${MARKER} */\n` + src;
      const rep = (from, to) => {
        if (!src.includes(from)) console.warn("[fridgle wall mode] missing anchor:", from.slice(0, 48));
        else src = src.replace(from, to);
      };

      rep("let menuEl = null;", "let menuEl = null;\n  const menuEls = new Map();");

      rep(
        "function closeMenu() {\n    if (menuEl) {\n      menuEl.remove();\n      menuEl = null;\n    }\n  }",
        `function closeMenu() {
    for (const m of menuEls.values()) m.remove();
    menuEls.clear();
    if (menuEl) { menuEl.remove(); menuEl = null; }
    if (!window.__fridgleWall?.expandMode) window.__fridgleWall?.relocateMenus();
  }`
      );

      rep(
        "function openMenu(idx) {\n    closeMenu();",
        `function openMenu(idx) {
    if (window.__fridgleWall?.expandMode) {
      const open = menuEls.get(idx);
      if (open) {
        open.remove();
        menuEls.delete(idx);
        if (menuEl === open) menuEl = null;
        window.__fridgleWall.relocateMenus();
        return;
      }
    } else closeMenu();`
      );

      rep(
        'menuEl.id = "menu";',
        `if (window.__fridgleWall?.expandMode) {
      menuEl.className = "fridgle-word-menu";
      menuEl.dataset.tileIdx = String(idx);
      menuEls.set(idx, menuEl);
    } else menuEl.id = "menu";
    menuEl = menuEl;`
      );

      rep(
        "if (menuEl && !menuEl.contains(e.target)) closeMenu();",
        "if (!window.__fridgleWall?.expandMode && menuEl && !menuEl.contains(e.target)) closeMenu();"
      );

      rep(
        "    menuEl.style.left = left + \"px\";\n    menuEl.style.top = top + \"px\";\n  }",
        `    menuEl.style.left = left + "px";
    menuEl.style.top = top + "px";
    if (window.__fridgleWall?.expandMode) window.__fridgleWall.relocateMenus();
  }`
      );

      rep(
        "  function startDragVisuals() {\n    const { el } = drag;\n    closeMenu();",
        `  function startDragVisuals() {
    window.__fridgleWall?.exitExpandMode();
    const { el } = drag;
    closeMenu();`
      );

      rep(
        "window.__fridgle = { buildPuzzle, weightsForDay, dayNumber, puzzle, shareText };",
        `window.__fridgle = Object.assign(window.__fridgleWall || {}, {
    buildPuzzle, weightsForDay, dayNumber, puzzle, shareText
  });
  window.__fridgleWall = window.__fridgle;
  window.__fridgleWall.closeMenus = closeMenu;
  window.__fridgleWall.openMenuForTile = openMenu;`
      );

      return src;
    }

    function injectStyles() {
      let el = document.getElementById(STYLE_ID);
      if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = `
body.fridgle-expand-mode #pool { align-items: flex-start; align-content: flex-start; }
body.fridgle-expand-mode #pool > .tile { align-self: flex-start; height: auto; }
body.fridgle-expand-mode #pool .fridgle-pool-item {
  display: inline-flex; flex-direction: column; align-items: flex-start;
  align-self: flex-start; vertical-align: top; max-width: 100%;
}
body.fridgle-expand-mode #pool .fridgle-pool-item > .tile { flex-shrink: 0; }
.fridgle-word-menu {
  z-index: 50; padding: 9px; max-height: 46vh; overflow-y: auto;
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
  background: #f4f3ee; border: 1px solid #d5d2c5;
  box-shadow: 0 6px 16px rgba(72, 60, 38, 0.14), 0 14px 34px rgba(72, 60, 38, 0.1);
}
.fridgle-word-menu:not(.fridgle-word-menu--pool) { position: fixed; }
.fridgle-word-menu--pool { position: relative; margin-top: 6px; align-self: flex-start; max-width: min(92vw, 320px); }
#fridgle-wall-mode-btn[aria-pressed="true"] { text-decoration: underline; }
body.dark .fridgle-word-menu { background: #2a2926; border-color: #45443e; }
body.dark #fridgle-wall-mode-btn[aria-pressed="true"] { color: #e8e6df; }
`;
    }

    function syncButton() {
      const btn = document.getElementById(BTN_ID);
      if (!btn) return;
      btn.setAttribute("aria-pressed", String(wall.expandMode));
      btn.textContent = wall.expandMode ? "wall mode on" : "wall mode";
      btn.disabled = document.body.classList.contains("done") || !wall.openMenuForTile;
    }

    function injectButton() {
      if (document.getElementById(BTN_ID)) return;
      const corner = document.querySelector("header .corner");
      if (!corner) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = BTN_ID;
      btn.className = "quiet";
      btn.textContent = "wall mode";
      btn.title = "Show every pool word form at once";
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (wall.expandMode) wall.exitExpandMode();
        else enterWallMode();
      });
      const help = document.getElementById("help-btn");
      if (help) corner.insertBefore(btn, help);
      else corner.appendChild(btn);
      syncButton();
    }

    function enterWallMode() {
      if (!wall.openMenuForTile) {
        console.warn("[fridgle wall mode] game.js not ready — hard refresh");
        return;
      }
      if (document.body.classList.contains("done") || document.body.classList.contains("wall-mode")) {
        return;
      }
      const stacked = document.querySelectorAll("#pool .tile.stacked");
      if (!stacked.length) return;

      wall.expandMode = true;
      document.body.classList.add("fridgle-expand-mode");
      syncButton();

      const open = wall.openMenuForTile;
      stacked.forEach((tile) => {
        const idx = Number(tile.dataset.idx);
        if (!Number.isNaN(idx)) open(idx);
      });
      layoutPoolMenus();
      wall.relocateMenus();
    }

    let gameLoaded = false;
    let gameLoad = null;

    function loadGame(url, placeholder) {
      if (gameLoaded) return gameLoad;
      gameLoad = fetch(url)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status + " " + url))))
        .then((code) => {
          if (gameLoaded) return;
          const tag = document.createElement("script");
          tag.textContent = patchGameJs(code);
          (placeholder.parentNode || document.documentElement).replaceChild(tag, placeholder);
          gameLoaded = true;
          injectStyles();
          if (!wall.openMenuForTile) throw new Error("openMenuForTile missing");
          syncButton();
        })
        .catch((err) => {
          console.error("[fridgle wall mode]", err);
          gameLoad = null;
        });
      return gameLoad;
    }

    function neutralize(script) {
      if (script.dataset.fridglePatch) return script.dataset.fridgleGameUrl || "";
      const raw = script.getAttribute("src") || script.src || "";
      if (!raw.includes(GAME)) return "";
      const abs = new URL(raw, document.baseURI).href;
      script.dataset.fridglePatch = "1";
      script.dataset.fridgleGameUrl = abs;
      script.removeAttribute("src");
      script.type = "application/javascript+blocked";
      return abs;
    }

    function hijack(node, parent, ref) {
      if (!node || node.tagName !== "SCRIPT") return false;
      const url = neutralize(node);
      if (!url) return false;
      if (parent) ref != null ? parent.insertBefore(node, ref) : parent.appendChild(node);
      else if (!node.parentNode) return false;
      loadGame(url, node);
      return true;
    }

    function installScriptHooks() {
      if (window.__fridgleHooks) return;
      window.__fridgleHooks = 1;

      const ac = Node.prototype.appendChild;
      const ib = Node.prototype.insertBefore;
      Node.prototype.appendChild = function (n) {
        return hijack(n, this, null) ? n : ac.call(this, n);
      };
      Node.prototype.insertBefore = function (n, ref) {
        return hijack(n, this, ref) ? n : ib.call(this, n, ref);
      };

      const sa = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if (name === "src" && this.tagName === "SCRIPT" && String(value).includes(GAME)) {
          neutralize(this);
          return;
        }
        return sa.call(this, name, value);
      };
    }

    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes" && m.attributeName === "class") {
          if (document.body.classList.contains("ready")) injectButton();
          syncButton();
          continue;
        }
        if (m.type !== "childList") continue;
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.tagName === "SCRIPT") hijack(n, null);
        }
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    injectStyles();
    window.openAllFridgleStacks = () => enterWallMode();
    window.closeAllFridgleMenus = () => wall.exitExpandMode();
  }
})();
