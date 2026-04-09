const state = {
  songs: [],
  query: "",
  filter: "all"
};

const elements = {
  loadingState: document.getElementById("loading-state"),
  songsContainer: document.getElementById("songs-container"),
  songNav: document.getElementById("song-nav"),
  searchInput: document.getElementById("search-input"),
  filterRow: document.getElementById("filter-row"),
  totalCount: document.getElementById("total-count"),
  visibleCount: document.getElementById("visible-count"),
  librarySummary: document.getElementById("library-summary"),
  themeToggle: document.getElementById("theme-toggle")
};

initializeTheme();
initializeControls();
loadSongs();

async function loadSongs() {
  try {
    const manifestResponse = await fetch("songs-manifest.json", { cache: "no-store" });

    if (!manifestResponse.ok) {
      throw new Error("Could not load songs-manifest.json");
    }

    const manifest = await manifestResponse.json();
    const songs = await Promise.all(
      manifest.map(async (entry) => {
        const response = await fetch(encodeURI(entry.file), { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Could not load ${entry.file}`);
        }

        const markdown = await response.text();
        const parsed = parseSongMarkdown(markdown);

        return {
          ...entry,
          id: slugify(entry.title),
          markdown,
          subtitle: parsed.subtitle,
          metadata: parsed.metadata,
          segments: parsed.segments,
          searchText: `${entry.title} ${entry.section} ${entry.tags.join(" ")}`.toLowerCase()
        };
      })
    );

    state.songs = songs;
    renderSongs();
    updateCounts();
    showLoadedState();
  } catch (error) {
    showErrorState(error instanceof Error ? error.message : "Unknown loading error");
  }
}

function parseSongMarkdown(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const metadata = [];
  const segments = [];
  let currentSegment = { marker: "", lines: [] };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentSegment.lines.length) {
        currentSegment.lines.push("");
      }
      continue;
    }

    if (/^>\[!QUOTE\]\+/.test(trimmed) || /^>\[!QUOTE\]-/.test(trimmed)) {
      continue;
    }

    if (trimmed.startsWith(">")) {
      const parsedMeta = parseMetadataLine(trimmed);

      if (parsedMeta) {
        metadata.push(parsedMeta);
      }
      continue;
    }

    const markerMatch = trimmed.match(/^`\{(.+)\}`$/);

    if (markerMatch) {
      if (currentSegment.lines.some((segmentLine) => segmentLine.trim().length > 0)) {
        segments.push(normalizeSegment(currentSegment));
      }
      currentSegment = { marker: markerMatch[1], lines: [] };
      continue;
    }

    currentSegment.lines.push(line);
  }

  if (currentSegment.lines.some((segmentLine) => segmentLine.trim().length > 0)) {
    segments.push(normalizeSegment(currentSegment));
  }

  const instrument = metadata.find((item) => item.type === "instrument");

  return {
    subtitle: instrument ? instrument.value : "Markdown lyrics",
    metadata,
    segments
  };
}

function parseMetadataLine(line) {
  const content = line.slice(1).trim().replace(/\\([\[\]])/g, "$1");
  const instrumentMatch = content.match(/^🎹:\s*(.+)$/);
  const referenceMatch = content.match(/^📖:\s*(.+)$/);
  const mediaMatch = content.match(/^\[?YT\]?:?\s*(.+)$/i);

  if (instrumentMatch) {
    return {
      type: "instrument",
      label: "Arrangement",
      value: instrumentMatch[1].trim()
    };
  }

  if (referenceMatch) {
    return {
      type: "reference",
      label: "Reference",
      value: referenceMatch[1].trim()
    };
  }

  if (mediaMatch && /\]\(/.test(mediaMatch[1])) {
    return {
      type: "listen",
      label: "Listen",
      value: mediaMatch[1].trim()
    };
  }

  return null;
}

function normalizeSegment(segment) {
  const cleanedLines = [...segment.lines];

  while (cleanedLines.length && !cleanedLines[0].trim()) {
    cleanedLines.shift();
  }

  while (cleanedLines.length && !cleanedLines[cleanedLines.length - 1].trim()) {
    cleanedLines.pop();
  }

  return {
    marker: segment.marker,
    lines: cleanedLines
  };
}

function renderSongs() {
  const grouped = groupBySection(state.songs);
  elements.songsContainer.innerHTML = grouped
    .map(([sectionName, songs]) => renderSection(sectionName, songs))
    .join("");
  elements.songNav.innerHTML = grouped
    .map(([sectionName, songs]) => renderNavSection(sectionName, songs))
    .join("");
  elements.librarySummary.textContent = `${state.songs.length} songs loaded`;
  applyFilters();
}

function renderSection(sectionName, songs) {
  return `
    <section class="song-section" data-section="${escapeAttribute(sectionName)}">
      <div class="section-header">
        <h2>${escapeHtml(sectionName)}</h2>
        <span class="small-note"><span class="section-visible-count">${songs.length}</span> visible</span>
      </div>
      ${songs.map((song) => renderSongCard(song)).join("")}
    </section>
  `;
}

function renderSongCard(song) {
  const tags = renderTags(song.tags);
  const metadata = renderMetadata(song.metadata);
  const segments = song.segments.length
    ? song.segments.map((segment) => renderSegment(segment)).join("")
    : `<p class="empty-copy">No lyrics found in this file yet.</p>`;

  return `
    <article
      class="song-card"
      id="${song.id}"
      data-id="${song.id}"
      data-title="${escapeAttribute(song.title.toLowerCase())}"
      data-section="${escapeAttribute(song.section)}"
      data-tags="${escapeAttribute(song.tags.join(" "))}"
    >
      <div class="song-card-header">
        <div class="song-card-title">
          <h3>${escapeHtml(song.title)}</h3>
          <p class="song-subtitle">${escapeHtml(song.section)}</p>
        </div>
        <div class="song-actions">
          <a class="song-anchor" href="#${song.id}">Link to song</a>
          ${tags}
        </div>
      </div>
      ${metadata}
      <div class="song-body">
        ${segments}
      </div>
    </article>
  `;
}

function renderNavSection(sectionName, songs) {
  return `
    <div class="song-nav-group" data-section="${escapeAttribute(sectionName)}">
      <p class="nav-section-label">${escapeHtml(sectionName)}</p>
      ${songs.map((song) => renderNavLink(song)).join("")}
    </div>
  `;
}

function renderNavLink(song) {
  return `
    <a
      class="song-nav-link"
      href="#${song.id}"
      data-id="${song.id}"
      data-title="${escapeAttribute(song.title.toLowerCase())}"
      data-section="${escapeAttribute(song.section)}"
      data-tags="${escapeAttribute(song.tags.join(" "))}"
    >
      <span class="nav-link-title">${escapeHtml(song.title)}</span>
      <span class="nav-tag-row">${compactTags(song.tags)}</span>
    </a>
  `;
}

function renderTags(tags) {
  if (!tags.length) {
    return "";
  }

  return `<div class="song-tags">${tags.map((tag) => `<span class="tag ${tag}">${tagLabel(tag)}</span>`).join("")}</div>`;
}

function compactTags(tags) {
  return tags.map((tag) => `<span class="tag ${tag}">${compactTagLabel(tag)}</span>`).join("");
}

function renderMetadata(items) {
  if (!items.length) {
    return "";
  }

  return `
    <ul class="metadata-list">
      ${items
        .map(
          (item) => `
            <li class="metadata-item">
              <span class="metadata-label">${escapeHtml(item.label)}</span>
              <span>${renderInlineMarkdown(item.value)}</span>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function renderSegment(segment) {
  const groups = splitIntoParagraphs(segment.lines);
  const body = groups
    .map(
      (group) =>
        `<p>${group
          .map((line) => renderInlineMarkdown(line))
          .join("<br />")}</p>`
    )
    .join("");

  return `
    <section class="song-block">
      ${segment.marker ? `<span class="song-marker">${escapeHtml(segment.marker)}</span>` : ""}
      ${body}
    </section>
  `;
}

function splitIntoParagraphs(lines) {
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

  return groups;
}

function groupBySection(songs) {
  const groups = new Map();

  for (const song of songs) {
    if (!groups.has(song.section)) {
      groups.set(song.section, []);
    }
    groups.get(song.section).push(song);
  }

  return [...groups.entries()];
}

function initializeControls() {
  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  elements.filterRow.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-filter]");

    if (!chip) {
      return;
    }

    state.filter = chip.dataset.filter;
    for (const button of elements.filterRow.querySelectorAll("[data-filter]")) {
      button.classList.toggle("active", button === chip);
    }
    applyFilters();
  });

  elements.themeToggle.addEventListener("click", () => {
    const currentTheme = document.body.dataset.theme === "light" ? "dark" : "light";
    setTheme(currentTheme);
  });
}

function applyFilters() {
  const cards = [...document.querySelectorAll(".song-card")];
  const navLinks = [...document.querySelectorAll(".song-nav-link")];

  for (const card of cards) {
    const matches = matchesSong(card.dataset.title, card.dataset.tags);
    card.classList.toggle("hidden", !matches);
  }

  for (const link of navLinks) {
    const matches = matchesSong(link.dataset.title, link.dataset.tags);
    link.classList.toggle("hidden", !matches);
  }

  for (const section of document.querySelectorAll(".song-section")) {
    const visibleCards = section.querySelectorAll(".song-card:not(.hidden)").length;
    section.classList.toggle("hidden", visibleCards === 0);
    const visibleCount = section.querySelector(".section-visible-count");

    if (visibleCount) {
      visibleCount.textContent = String(visibleCards);
    }
  }

  for (const navGroup of document.querySelectorAll(".song-nav-group")) {
    const visibleLinks = navGroup.querySelectorAll(".song-nav-link:not(.hidden)").length;
    navGroup.classList.toggle("hidden", visibleLinks === 0);
  }

  updateCounts();
}

function matchesSong(title, tags) {
  const matchesQuery = !state.query || title.includes(state.query);
  const matchesFilter = state.filter === "all" || tags.split(" ").includes(state.filter);
  return matchesQuery && matchesFilter;
}

function updateCounts() {
  const visibleCards = document.querySelectorAll(".song-card:not(.hidden)").length;
  elements.totalCount.textContent = String(state.songs.length);
  elements.visibleCount.textContent = String(visibleCards);
}

function showLoadedState() {
  elements.loadingState.classList.add("hidden");
}

function showErrorState(message) {
  elements.loadingState.classList.remove("hidden");
  elements.loadingState.classList.add("is-error");
  elements.loadingState.innerHTML = `
    <p><strong>Could not load the song library.</strong></p>
    <p>${escapeHtml(message)}</p>
    <p class="footer-note">If you are opening this file directly from disk, use a local web server or GitHub Pages so the browser can fetch the markdown files.</p>
  `;
}

function renderInlineMarkdown(text) {
  let html = escapeHtml(text.replace(/\\([\[\]])/g, "$1"));

  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    return `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`;
  });
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  return html;
}

function initializeTheme() {
  const storedTheme = localStorage.getItem("saltland-theme");
  setTheme(storedTheme === "light" ? "light" : "dark", false);
}

function setTheme(theme, persist = true) {
  document.body.dataset.theme = theme;
  elements.themeToggle.textContent = theme === "light" ? "Switch to dark" : "Switch to light";

  if (persist) {
    localStorage.setItem("saltland-theme", theme);
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

function compactTagLabel(tag) {
  if (tag === "new") {
    return "🆕";
  }

  if (tag === "acapella") {
    return "🅰️";
  }

  if (tag === "bside") {
    return "🅱️";
  }

  return tag;
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
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
