(() => {
  const host = location.hostname;
  const site = host === "x.com" || host === "twitter.com" ? "x"
    : host.includes("reddit.com") ? "reddit"
    : host === "www.linkedin.com" ? "linkedin"
    : host === "bsky.app" ? "bluesky"
    : host.endsWith("facebook.com") ? "facebook"
    : host.endsWith("instagram.com") ? "instagram" : "threads";
  const selectors = {
    x: 'article[data-testid="tweet"]',
    reddit: 'shreddit-post, article[data-testid="post-container"], .thing.link',
    linkedin: '.feed-shared-update-v2',
    bluesky: '[data-testid="feedItem"]',
    threads: 'article',
    facebook: '[aria-posinset], [role="article"], [data-pagelet^="FeedUnit"]',
    instagram: 'article'
  };
  let settings = { enabled: true };
  let records = new WeakMap();
  let generation = 0;
  let active = 0;
  let scanTimer;
  const revealedPosts = new Set();
  const queue = [];
  const observed = new WeakSet();
  const intersection = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) enqueue(entry.target);
  }, { rootMargin: "350px 0px" });

  function textOf(node) {
    let parts = [];
    if (site === "x") parts = [...node.querySelectorAll('[data-testid="tweetText"]')].slice(0, 1).map(el => el.innerText);
    if (site === "reddit") {
      const title = node.getAttribute("post-title") || node.querySelector("h3, .title > a")?.innerText;
      const body = node.querySelector('[slot="text-body"], [data-click-id="body"], .usertext-body, [id$="-post-rtjson-content"]')?.innerText;
      parts = [title, body];
    }
    if (site === "linkedin") parts = [...node.querySelectorAll('.update-components-text, .feed-shared-update-v2__description')].slice(0, 1).map(el => el.innerText);
    if (site === "bluesky") parts = [...node.querySelectorAll('[data-testid="postText"]')].slice(0, 1).map(el => el.innerText);
    if (site === "facebook") {
      const message = node.querySelector('[data-ad-rendering-role="story_message"], [data-ad-comet-preview="message"], [data-ad-preview="message"]');
      const body = message?.innerText?.trim() || [...node.querySelectorAll('[dir="auto"]')]
        .find(el => !el.closest('header, footer, button, [role="button"], [contenteditable="true"]')
          && !el.querySelector('[dir="auto"]') && el.innerText.trim().length >= 20)?.innerText;
      parts = [body];
    }
    if (site === "instagram") {
      const caption = node.querySelector('h1, ul > li:first-child');
      parts = [caption?.innerText];
      if (!parts[0]) {
        const fallback = [...node.querySelectorAll('span[dir="auto"]')]
          .find(el => !el.closest('header, footer') && el.innerText.trim().length >= 20);
        parts = [fallback?.innerText];
      }
    }
    if (site === "threads") {
      let text = node.innerText;
      for (const own of node.querySelectorAll(".jev-slop-badge, .jev-slop-cover")) text = text.replace(own.innerText, "");
      parts = [text];
    }
    return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 3000);
  }

  function badgeTarget(node) {
    if (site === "x") return node.querySelector('[data-testid="tweetText"]')?.parentElement || node;
    if (site === "reddit") return node.querySelector("h3, .title")?.parentElement || node;
    if (site === "linkedin") return node.querySelector('.update-components-text')?.parentElement || node;
    if (site === "bluesky") return node.querySelector('[data-testid="postText"]')?.parentElement || node;
    return node;
  }

  function clearCover(node, record) {
    record.cover?.remove();
    node.classList.remove("jev-slop-covered");
    for (const element of record.inerted || []) element.inert = false;
    record.inerted?.clear();
  }

  function clearMark(node, record) {
    if (!record) return;
    clearCover(node, record);
    record.badge?.remove();
  }

  function renderMark(node, record) {
    const { label, probability } = record;
    if (!record.badge?.isConnected) {
      record.badge = document.createElement("span");
      record.badge.className = "jev-slop-badge";
      record.badgeLabel = document.createElement("span");
      record.badgeButton = document.createElement("button");
      record.badgeButton.type = "button";
      record.badgeButton.className = "jev-slop-toggle";
      record.badgeButton.textContent = "Volver a ocultar";
      record.badgeButton.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (records.get(node) !== record) return;
        record.revealed = false;
        revealedPosts.delete(record.text);
        renderMark(node, record);
      });
      record.badge.append(record.badgeLabel, record.badgeButton);
      badgeTarget(node).prepend(record.badge);
    }
    if (record.badgeLabel.textContent !== label) record.badgeLabel.textContent = label;
    record.badgeButton.hidden = !settings.blurMatches || !record.revealed;
    record.badge.title = `${Math.round(probability * 100)} % de coincidencia con tu criterio`;
    record.badge.setAttribute("aria-label", `${label}: ${Math.round(probability * 100)} % de coincidencia`);

    if (!settings.blurMatches || record.revealed) {
      clearCover(node, record);
      return;
    }
    node.classList.add("jev-slop-covered");
    if (!record.cover?.isConnected) {
      record.cover = document.createElement("div");
      record.cover.className = "jev-slop-cover";
      const panel = document.createElement("div");
      panel.className = "jev-slop-cover-panel";
      const tag = document.createElement("span");
      tag.className = "jev-slop-cover-tag";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jev-slop-reveal";
      button.textContent = "Mostrar post";
      panel.append(tag, button);
      record.cover.append(panel);
      record.cover.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (records.get(node) !== record) return;
        record.revealed = true;
        revealedPosts.add(record.text);
        renderMark(node, record);
      });
      node.append(record.cover);
    }
    const tag = record.cover.querySelector(".jev-slop-cover-tag");
    if (tag.textContent !== label) tag.textContent = label;
    record.inerted ||= new Set();
    for (const child of node.children) {
      if (child !== record.cover && !child.inert) {
        child.inert = true;
        record.inerted.add(child);
      }
    }
  }

  function enqueue(node) {
    if (!settings.enabled || !node.isConnected) return;
    const text = textOf(node);
    if (text.length < 5) return;
    const previous = records.get(node);
    if (previous?.text === text) {
      if (previous.matches) renderMark(node, previous);
      return;
    }
    clearMark(node, previous);
    const record = { text, generation, revealed: revealedPosts.has(text) };
    records.set(node, record);
    queue.push({ node, record });
    pump();
  }

  function pump() {
    while (active < 2 && queue.length) {
      const { node, record } = queue.shift();
      if (!node.isConnected || record.generation !== generation || records.get(node) !== record) continue;
      active++;
      chrome.runtime.sendMessage({ type: "classify", text: record.text })
        .then(result => {
          if (!node.isConnected || record.generation !== generation || records.get(node) !== record) return;
          if (result?.matches) {
            record.matches = true;
            record.label = result.label;
            record.probability = result.probability;
            renderMark(node, record);
          }
        })
        .catch(() => {})
        .finally(() => { active--; pump(); });
    }
  }

  function scan() {
    scanTimer = undefined;
    if (!settings.enabled) return;
    for (const node of document.querySelectorAll(selectors[site])) {
      if (site === "facebook" && node.parentElement?.closest(selectors.facebook)) continue;
      if (!observed.has(node)) {
        observed.add(node);
        intersection.observe(node);
      } else {
        const rect = node.getBoundingClientRect();
        if (rect.bottom >= -350 && rect.top <= innerHeight + 350) enqueue(node);
      }
    }
  }

  function scheduleScan() {
    if (!scanTimer) scanTimer = setTimeout(scan, 220);
  }

  async function refreshSettings() {
    try { settings = await chrome.runtime.sendMessage({ type: "getSettings" }); } catch { return; }
    generation++;
    queue.length = 0;
    for (const node of document.querySelectorAll(selectors[site])) clearMark(node, records.get(node));
    records = new WeakMap();
    revealedPosts.clear();
    document.querySelectorAll(".jev-slop-badge, .jev-slop-cover").forEach(el => el.remove());
    document.querySelectorAll(".jev-slop-covered").forEach(el => el.classList.remove("jev-slop-covered"));
    scan();
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "settingsChanged") refreshSettings();
  });
  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  refreshSettings();
})();
