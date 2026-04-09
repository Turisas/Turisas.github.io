const state = {
  songs: [],
  infoPages: [],
  songLookup: new Map(),
  noteLookup: new Map(),
  query: "",
  openFolders: {
    info: true,
    songs: true
  }
};

const elements = {
  loadingState: document.getElementById("loading-state"),
  songNav: document.getElementById("song-nav"),
  pageContent: document.getElementById("page-content"),
  pageTitle: document.getElementById("page-title"),
  pageKicker: document.getElementById("page-kicker"),
  backLink: document.getElementById("back-link"),
  themeToggle: document.getElementById("theme-toggle"),
  searchInput: document.getElementById("song-search"),
  mobileNavToggle: document.getElementById("mobile-nav-toggle"),
  mobileNavBackdrop: document.getElementById("mobile-nav-backdrop"),
  songSidebar: document.getElementById("song-sidebar")
};

initialize();

function initialize() {
  try {
    if (!window.SONGS_DATA || !Array.isArray(window.SONGS_DATA.songs)) {
      throw new Error("songs-data.js is missing or invalid");
    }

    state.songs = window.SONGS_DATA.songs.map(normalizeSong);
    state.infoPages = Array.isArray(window.SONGS_DATA.infoPages) ? window.SONGS_DATA.infoPages.map(normalizeInfoPage) : [];
    state.songLookup = buildSongLookup(state.songs);
    state.noteLookup = buildNoteLookup(state.infoPages);

    initializeTheme();
    initializeControls();
    renderNavigation();
    renderCurrentRoute();
    showLoaded();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unknown renderer error");
  }
}

function initializeControls() {
  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener("resize", syncMobileNavState);
  document.addEventListener("keydown", handleDocumentKeydown);

  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    filterNavigation();
  });

  elements.themeToggle.addEventListener("click", () => {
    const currentTheme = document.body.dataset.theme === "dark" ? "dark" : "light";
    setTheme(currentTheme === "dark" ? "light" : "dark");
  });

  elements.mobileNavToggle.addEventListener("click", () => {
    if (document.body.classList.contains("nav-open")) {
      closeMobileNav();
      return;
    }

    openMobileNav();
  });

  elements.mobileNavBackdrop.addEventListener("click", closeMobileNav);
  elements.songNav.addEventListener("click", (event) => {
    const folderToggle = event.target.closest("[data-folder-toggle]");

    if (folderToggle) {
      toggleFolder(folderToggle.dataset.folderId);
      return;
    }

    if (event.target.closest(".nav-link")) {
      closeMobileNav();
    }
  });

  syncMobileNavState();
}

function initializeTheme() {
  const storedTheme = localStorage.getItem("saltland-viewer-theme");
  setTheme(storedTheme === "dark" ? "dark" : "light", false);
}

function setTheme(theme, persist = true) {
  document.body.dataset.theme = theme;
  const nextTheme = theme === "dark" ? "light" : "dark";

  elements.themeToggle.textContent = theme === "dark" ? "☀" : "☾";
  elements.themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
  elements.themeToggle.setAttribute("title", `Switch to ${nextTheme} theme`);

  if (persist) {
    localStorage.setItem("saltland-viewer-theme", theme);
  }
}

function normalizeSong(song) {
  const fileLabel = song.file.split("/").pop();
  const fileName = fileLabel.replace(/\.md$/i, "");
  const title = song.title || fileName;

  return {
    ...song,
    title,
    fileLabel,
    fileName,
    id: slugify(title),
    section: song.section || "Songs",
    tags: Array.isArray(song.tags) ? song.tags : [],
    markdown: typeof song.markdown === "string" ? song.markdown : "",
    searchText: `${fileName} ${fileLabel} ${title} ${song.section || ""}`.toLowerCase()
  };
}

function normalizeInfoPage(page) {
  const fileLabel = page.label || page.file.split("/").pop();
  const fileName = fileLabel.replace(/\.md$/i, "");
  const title = page.title || fileName;

  return {
    ...page,
    id: page.id || fileName,
    title,
    fileLabel,
    fileName,
    markdown: typeof page.markdown === "string" ? page.markdown : "",
    isIndex: Boolean(page.isIndex),
    searchText: `${fileName} ${fileLabel} ${title}`.toLowerCase()
  };
}

function buildSongLookup(songs) {
  const lookup = new Map();

  for (const song of songs) {
    const variants = [song.id, song.title, song.fileName, song.title.replace(/\([^)]*\)/g, " ")];

    for (const variant of variants) {
      const key = normalizeLookupKey(variant);

      if (key && !lookup.has(key)) {
        lookup.set(key, song);
      }
    }
  }

  return lookup;
}

function buildNoteLookup(pages) {
  const lookup = new Map();

  for (const page of pages) {
    const variants = [page.id, page.title, page.fileName, page.fileLabel];

    for (const variant of variants) {
      const key = normalizeLookupKey(variant);

      if (key && !lookup.has(key)) {
        lookup.set(key, page);
      }
    }
  }

  return lookup;
}

function renderNavigation() {
  const infoLinks = state.infoPages.map((page) => {
    return renderTreeLink({
      href: page.isIndex ? "#songs" : `#note/${encodeURIComponent(page.id)}`,
      label: page.fileName,
      searchText: page.searchText,
      entryKey: `note:${page.id}`
    });
  });
  const songLinks = [...state.songs]
    .sort((left, right) => left.fileLabel.localeCompare(right.fileLabel, undefined, { sensitivity: "base" }))
    .map((song) => {
      return renderTreeLink({
        href: `#song/${song.id}`,
        label: song.fileName,
        searchText: song.searchText,
        entryKey: `song:${song.id}`
      });
    });

  elements.songNav.innerHTML = [renderTreeFolder("info", "info", infoLinks), renderTreeFolder("songs", "songs", songLinks)].join("");

  filterNavigation();
}

function renderTreeFolder(folderId, label, links) {
  return `
    <section class="tree-folder" data-folder-id="${folderId}">
      <button class="tree-folder-toggle" type="button" data-folder-toggle data-folder-id="${folderId}" aria-expanded="${String(isFolderOpen(folderId))}">
        <span class="tree-folder-caret" aria-hidden="true">▾</span>
        <span class="tree-folder-name">${escapeHtml(label)}</span>
      </button>
      <div class="tree-folder-children">
        ${links.join("")}
      </div>
    </section>
  `;
}

function renderTreeLink({ href, label, searchText, entryKey }) {
  return `
    <a class="nav-link tree-file-link" href="${href}" data-entry-key="${escapeAttribute(entryKey)}" data-search="${escapeAttribute(searchText)}">${escapeHtml(label)}</a>
  `;
}

function isFolderOpen(folderId) {
  return state.openFolders[folderId] !== false;
}

function toggleFolder(folderId) {
  state.openFolders[folderId] = !isFolderOpen(folderId);
  filterNavigation();
}

function renderCurrentRoute() {
  const route = parseRoute(location.hash);
  const song = route.songId ? findSongById(route.songId) : null;
  const note = route.noteId ? findNoteById(route.noteId) : null;
  const indexPage = getIndexPage();

  if (song) {
    renderSongPage(song);
    markActiveEntry(`song:${song.id}`);
  } else if (note && !note.isIndex) {
    renderNotePage(note);
    markActiveEntry(`note:${note.id}`);
  } else {
    renderIndexPage();
    markActiveEntry(indexPage ? `note:${indexPage.id}` : "");
  }

  filterNavigation();
  closeMobileNav();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function handleHashChange() {
  renderCurrentRoute();
}

function handleDocumentKeydown(event) {
  if (event.key === "Escape") {
    closeMobileNav();
  }
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function openMobileNav() {
  if (!isMobileViewport()) {
    return;
  }

  document.body.classList.add("nav-open");
  syncMobileNavState();
  elements.searchInput.focus({ preventScroll: true });
}

function closeMobileNav() {
  document.body.classList.remove("nav-open");
  syncMobileNavState();
}

function syncMobileNavState() {
  const isMobile = isMobileViewport();
  const isOpen = isMobile && document.body.classList.contains("nav-open");

  if (!isMobile) {
    document.body.classList.remove("nav-open");
  }

  elements.mobileNavToggle.hidden = !isMobile;
  elements.mobileNavToggle.setAttribute("aria-expanded", String(isOpen));
  elements.songSidebar.setAttribute("aria-hidden", String(isMobile && !isOpen));
  elements.mobileNavBackdrop.hidden = !isMobile;
}

function parseRoute(hash) {
  const value = hash || "#songs";
  const songMatch = value.match(/^#song\/(.+)$/);
  const noteMatch = value.match(/^#note\/(.+)$/);

  if (songMatch) {
    return { type: "song", songId: decodeURIComponent(songMatch[1]), noteId: "" };
  }

  if (noteMatch) {
    return { type: "note", songId: "", noteId: decodeURIComponent(noteMatch[1]) };
  }

  const fallbackMatch = value.match(/^#([\p{L}\p{N}-]+)$/u);

  if (fallbackMatch && fallbackMatch[1] !== "songs") {
    return { type: "song", songId: fallbackMatch[1], noteId: "" };
  }

  return { type: "index", songId: "", noteId: "" };
}

function findSongById(songId) {
  const normalized = normalizeLookupKey(songId);
  return state.songLookup.get(normalized) || null;
}

function findNoteById(noteId) {
  const normalized = normalizeLookupKey(noteId);
  return state.noteLookup.get(normalized) || null;
}

function getIndexPage() {
  return state.infoPages.find((page) => page.isIndex) || null;
}

function renderIndexPage() {
  const indexPage = getIndexPage();

  if (indexPage) {
    renderNotePage(indexPage, true);
    return;
  }

  elements.pageTitle.textContent = "!Songs";
  elements.pageKicker.textContent = "";
  elements.pageKicker.classList.add("hidden");
  elements.backLink.classList.add("hidden");
  document.title = "!Songs - SaltLand Crew";

  elements.pageContent.innerHTML = `
    <section class="note-block">
      ${renderIndexMarkdown(window.SONGS_DATA.indexMarkdown || "")}
    </section>
    <div class="footer-spacer"></div>
  `;
}

function renderNotePage(note, isIndex = false) {
  elements.pageTitle.textContent = note.title;
  elements.pageKicker.textContent = isIndex ? "" : "info";
  elements.pageKicker.classList.toggle("hidden", isIndex);
  elements.backLink.classList.toggle("hidden", isIndex);
  document.title = `${note.title} - SaltLand Crew`;

  elements.pageContent.innerHTML = `
    <section class="note-block">
      ${renderIndexMarkdown(note.markdown || "")}
    </section>
    <div class="footer-spacer"></div>
  `;
}

function renderSongPage(song) {
  elements.pageTitle.textContent = song.title;
  elements.pageKicker.textContent = song.section;
  elements.pageKicker.classList.remove("hidden");
  elements.backLink.classList.remove("hidden");
  document.title = `${song.title} - SaltLand Crew`;

  elements.pageContent.innerHTML = `${renderSong(song, false)}<div class="footer-spacer"></div>`;
}

function renderIndexMarkdown(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const parts = [];
  let paragraphLines = [];
  let currentCallout = null;

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }

    parts.push(paragraphLines.map((line) => `<p>${renderInlineMarkdown(line)}</p>`).join(""));
    paragraphLines = [];
  };

  const flushCallout = () => {
    if (!currentCallout) {
      return;
    }

    const body = currentCallout.lines
      .filter((line) => line.trim().length > 0)
      .map((line) => `<p class="callout-line">${renderInlineMarkdown(line)}</p>`)
      .join("");

    parts.push(`
      <section class="callout">
        <div class="callout-title">${escapeHtml(currentCallout.title || currentCallout.type)}</div>
        <div class="callout-body">${body}</div>
      </section>
    `);
    currentCallout = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const calloutMatch = trimmed.match(/^>\[!([^\]]+)\]\s*(.*)$/);

    if (calloutMatch) {
      flushParagraph();
      flushCallout();
      currentCallout = {
        type: calloutMatch[1],
        title: calloutMatch[2].trim(),
        lines: []
      };
      continue;
    }

    if (currentCallout) {
      if (!trimmed) {
        continue;
      }

      currentCallout.lines.push(trimmed.startsWith(">") ? stripQuotePrefix(line) : line.trim());
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushCallout();

  return parts.join("");
}

function renderSong(song, includeHeader = true) {
  const parsed = parseSongMarkdown(song.markdown);
  const tagsHtml = song.tags.length
    ? `<div class="song-tags">${song.tags.map((tag) => `<span class="song-tag">${escapeHtml(tagLabel(tag))}</span>`).join("")}</div>`
    : "";
  const metaHtml = parsed.metaLines.length
    ? `
        <section class="song-meta">
          ${parsed.metaLines.map((line) => `<p>${renderInlineMarkdown(line)}</p>`).join("")}
        </section>
      `
    : "";
  const headerHtml = includeHeader
    ? `
        <header class="song-header">
          <div class="song-title-row">
            <h2 class="song-title">${escapeHtml(song.title)}</h2>
            <a class="song-link" href="#song/${song.id}">#</a>
          </div>
        </header>
      `
    : "";

  return `
    <article class="song-note ${includeHeader ? "" : "standalone"}" id="song-${song.id}">
      ${headerHtml}
      ${tagsHtml}
      ${metaHtml}
      <section class="song-content">
        ${parsed.blocks.map((block) => renderSongBlock(block)).join("")}
      </section>
    </article>
  `;
}

function parseSongMarkdown(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const metaLines = [];
  const blocks = [];
  let bodyStarted = false;
  let currentBlock = null;

  const ensureLyricsBlock = (marker = "") => {
    if (!currentBlock || currentBlock.type !== "lyrics") {
      currentBlock = { type: "lyrics", marker, lines: [] };
      blocks.push(currentBlock);
      return currentBlock;
    }

    if (marker) {
      currentBlock = { type: "lyrics", marker, lines: [] };
      blocks.push(currentBlock);
    }

    return currentBlock;
  };

  const ensureQuoteBlock = () => {
    if (!currentBlock || currentBlock.type !== "quote") {
      currentBlock = { type: "quote", lines: [] };
      blocks.push(currentBlock);
    }

    return currentBlock;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!bodyStarted && /^>\[!QUOTE\][+-]?/.test(trimmed)) {
      continue;
    }

    if (!bodyStarted && trimmed.startsWith(">")) {
      const content = normalizeSpecialCalloutLine(stripQuotePrefix(line));

      if (content) {
        metaLines.push(content);
      }
      continue;
    }

    const markerMatch = trimmed.match(/^`\{(.+)\}`$/);

    if (markerMatch) {
      bodyStarted = true;
      currentBlock = { type: "lyrics", marker: markerMatch[1], lines: [] };
      blocks.push(currentBlock);
      continue;
    }

    if (trimmed.startsWith(">")) {
      bodyStarted = true;
      const content = normalizeSpecialCalloutLine(stripQuotePrefix(line));
      const quoteBlock = ensureQuoteBlock();
      quoteBlock.lines.push(content);
      continue;
    }

    if (!trimmed) {
      if (currentBlock && currentBlock.lines.length) {
        currentBlock.lines.push("");
      }
      continue;
    }

    bodyStarted = true;
    const lyricsBlock = ensureLyricsBlock();
    lyricsBlock.lines.push(line.trim());
  }

  return {
    metaLines,
    blocks: blocks.filter((block) => block.lines.some((line) => line.trim().length > 0))
  };
}

function renderSongBlock(block) {
  if (block.type === "quote") {
    return `
      <blockquote>
        ${renderParagraphs(block.lines)}
      </blockquote>
    `;
  }

  return `
    <section class="lyrics-block">
      ${block.marker ? `<div class="block-marker">${escapeHtml(block.marker)}</div>` : ""}
      ${renderParagraphs(block.lines)}
    </section>
  `;
}

function renderParagraphs(lines) {
  const groups = [];
  let current = [];

  for (const line of lines) {
    if (!line.trim()) {
      if (current.length) {
        groups.push(current);
        current = [];
      }
      continue;
    }

    current.push(line.trim());
  }

  if (current.length) {
    groups.push(current);
  }

  return groups.map((group) => `<p>${group.map((line) => renderInlineMarkdown(line)).join("<br />")}</p>`).join("");
}

function renderInlineMarkdown(text) {
  const prepared = String(text).replace(/\\([\[\]])/g, "$1");
  let html = escapeHtml(prepared);

  html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const resolved = resolveContentTarget(target);
    const linkLabel = label || target;

    if (!resolved) {
      return escapeHtml(linkLabel);
    }

    const href = resolved.kind === "song" ? `#song/${resolved.id}` : resolved.isIndex ? "#songs" : `#note/${encodeURIComponent(resolved.id)}`;

    return `<a class="markdown-link" href="${href}">${escapeHtml(linkLabel)}</a>`;
  });
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    return `<a class="markdown-link" href="${url}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  html = html.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  return html;
}

function resolveContentTarget(rawTarget) {
  return resolveSongTarget(rawTarget) || resolveNoteTarget(rawTarget);
}

function resolveSongTarget(rawTarget) {
  const key = normalizeLookupKey(rawTarget);
  const song = state.songLookup.get(key);

  return song ? { ...song, kind: "song" } : null;
}

function resolveNoteTarget(rawTarget) {
  const key = normalizeLookupKey(rawTarget);
  const note = state.noteLookup.get(key);

  return note ? { ...note, kind: "note" } : null;
}

function normalizeLookupKey(value) {
  return slugify(String(value).replace(/\([^)]*\)/g, " ").replace(/[🆕🅰️🅱️]/gu, " "));
}

function normalizeSpecialCalloutLine(line) {
  return line.replace(/^\[![^\]]+\][+-]?\s*/, "").trim();
}

function stripQuotePrefix(line) {
  return line.replace(/^>+\s?/, "");
}

function groupSongsBySection(songs) {
  const groups = new Map();

  for (const song of songs) {
    if (!groups.has(song.section)) {
      groups.set(song.section, []);
    }
    groups.get(song.section).push(song);
  }

  return [...groups.entries()];
}

function filterNavigation() {
  const query = state.query;

  for (const link of elements.songNav.querySelectorAll(".tree-file-link")) {
    const matches = !query || link.dataset.search.includes(query);
    link.classList.toggle("hidden", !matches);
  }

  for (const folder of elements.songNav.querySelectorAll(".tree-folder")) {
    const visibleLinks = folder.querySelectorAll(".tree-file-link:not(.hidden)").length;
    const folderId = folder.dataset.folderId;
    const expanded = query ? visibleLinks > 0 : isFolderOpen(folderId);

    folder.classList.toggle("hidden", visibleLinks === 0);
    folder.classList.toggle("collapsed", !expanded);
    folder.querySelector(".tree-folder-toggle").setAttribute("aria-expanded", String(expanded));
  }
}

function markActiveEntry(entryKey) {
  for (const link of elements.songNav.querySelectorAll(".nav-link")) {
    link.classList.toggle("active", Boolean(entryKey) && link.dataset.entryKey === entryKey);
  }
}

function tagLabel(tag) {
  if (tag === "new") {
    return "🆕 New";
  }

  if (tag === "acapella") {
    return "🅰️ A cappella";
  }

  if (tag === "bside") {
    return "🅱️ B-side";
  }

  return tag;
}

function showLoaded() {
  elements.loadingState.classList.add("hidden");
  elements.pageContent.classList.remove("hidden");
}

function showError(message) {
  elements.loadingState.classList.remove("hidden");
  elements.loadingState.classList.add("is-error");
  elements.loadingState.textContent = message;
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[🆕🅰️🅱️]/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
