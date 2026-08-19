// ==UserScript==
// @name         Creator Marketplace → Instagram-Profillinks
// @namespace    local.creator-marketplace-links
// @version      1.5
// @description  Blendet unter Creator-Handles im Meta Creator Marketplace eine Pille "zum Insta-Profil ↗" ein, die direkt zu instagram.com/<handle> führt
// @match        https://business.facebook.com/*
// @match        https://*.business.facebook.com/*
// @match        https://www.facebook.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const DEBUG = false;

  // Handle-Muster: 3–30 Zeichen, Kleinbuchstaben/Ziffern/Punkt/Unterstrich,
  // mindestens ein Buchstabe.
  const HANDLE_RE = /^(?=.*[a-z])[a-z0-9_][a-z0-9._]{1,28}[a-z0-9_]$/;

  const BLOCKLIST = new Set([
    'follower', 'aufrufe', 'interaktionen', 'entdecken', 'listen',
    'kampagnen', 'trends', 'suchen', 'mehr', 'zielgruppe', 'creator',
    'kontaktieren', 'responsive', 'relevanz',
  ]);

  const MARKER = 'data-igm-linked';
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'NOSCRIPT', 'SVG']);

  // ---------- Badge ----------

  function makeBadge(handle) {
    const s = document.createElement('span');
    s.textContent = 'zum Insta-Profil \u2197'; // Pillen-Text + kleiner Pfeil
    s.setAttribute(MARKER, '1');
    s.title = 'Instagram-Profil von @' + handle + ' öffnen';
    // Pillen-Optik: eigene Zeile unter dem Namen, pink, abgerundet
    s.style.display = 'block';
    s.style.width = 'fit-content';
    s.style.marginTop = '3px';
    s.style.padding = '1px 9px 2px';
    s.style.borderRadius = '999px';
    s.style.background = '#e1306c'; // Instagram-Pink
    s.style.color = '#ffffff';
    s.style.font = 'inherit';
    s.style.fontSize = '11px';
    s.style.fontWeight = '600';
    s.style.lineHeight = '16px';
    s.style.whiteSpace = 'nowrap';
    s.style.cursor = 'pointer';
    s.style.userSelect = 'none';
    s.addEventListener('mouseenter', () => { s.style.background = '#c1275a'; });
    s.addEventListener('mouseleave', () => { s.style.background = '#e1306c'; });
    for (const evt of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
      s.addEventListener(evt, (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (evt === 'click') {
          e.preventDefault();
          window.open('https://www.instagram.com/' + handle + '/', '_blank', 'noopener');
        }
      }, true);
    }
    return s;
  }

  // ---------- Scan (nur über den übergebenen Teilbaum) ----------

  function scan(root) {
    if (!root) return 0;
    // Nur Elementknoten mit Inhalt betrachten
    if (root.nodeType === Node.TEXT_NODE) root = root.parentElement;
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return 0;
    if (root.hasAttribute && root.hasAttribute(MARKER)) return 0;

    let count = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const matches = [];
    let node;
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue;
      // Billige Prüfungen zuerst: Länge, dann Regex – erst danach DOM-Zugriffe
      if (!raw) continue;
      const len = raw.length;
      if (len < 3 || len > 40) continue;
      const t = raw.trim();
      if (t.length < 3 || t.length > 30) continue;
      if (!HANDLE_RE.test(t)) continue;
      if (BLOCKLIST.has(t)) continue;

      const p = node.parentElement;
      if (!p) continue;
      if (SKIP_TAGS.has(p.tagName)) continue;
      if (p.hasAttribute(MARKER)) continue;
      if (p.isContentEditable) continue;

      matches.push([node, t]);
    }

    for (const [textNode, handle] of matches) {
      const parent = textNode.parentNode;
      if (!parent) continue;
      parent.insertBefore(makeBadge(handle), textNode.nextSibling);
      parent.setAttribute(MARKER, '1');
      count++;
      if (DEBUG) console.log('[IG-Links] markiere:', handle);
    }
    return count;
  }

  // ---------- Mutationen sammeln und gebündelt abarbeiten ----------

  const queue = new Set();
  let scheduled = false;
  let fullRescan = false;

  function flush() {
    scheduled = false;
    const roots = fullRescan ? [document.body] : [...queue];
    queue.clear();
    fullRescan = false;
    let total = 0;
    for (const r of roots) {
      if (!r.isConnected) continue;
      total += scan(r);
    }
    if (DEBUG && total) console.log('[IG-Links] neu markiert:', total);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    // In Leerlaufzeiten arbeiten, damit die Seite flüssig bleibt
    if ('requestIdleCallback' in window) {
      requestIdleCallback(flush, { timeout: 1000 });
    } else {
      setTimeout(flush, 300);
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        // Eigene Badges ignorieren
        if (n.nodeType === Node.ELEMENT_NODE && n.hasAttribute && n.hasAttribute(MARKER)) continue;
        queue.add(n);
        // Schutz: Wenn extrem viel auf einmal kommt, lieber einmal gesamt scannen
        if (queue.size > 200) { fullRescan = true; queue.clear(); }
      }
    }
    if (queue.size || fullRescan) schedule();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initialer Komplett-Scan (einmalig)
  fullRescan = true;
  schedule();
})();
