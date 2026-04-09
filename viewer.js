const state = {
  songs: [],
  songLookup: new Map()
};

const elements = {
  loadingState: document.getElementById("loading-state"),
  songNav: document.getElementById("song-nav"),
  pageContent: document.getElementById("page-content")
};

initialize();

function initialize() {
  try {
    if (!window.SONGS_DATA || !Array.isArray(window.SONGS_DATA.songs)) {
      throw new Error("songs-data.js is missing or invalid");
    }

    state.songs = window.SONGS_DATA.songs.map(normalizeSong);
    state.songLookup = buildSongLookup(state.songs);

    renderNavigation();
    renderPage();
    showLoaded();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unknown renderer error");
  }
}

function normalizeSong(song) {
  const fileName = song.file.split("/").pop().replace(/\.md$/i, "");
  const title = song.title || fileName;

  return {
    ...song,
    title,
    fileName,
    id: slugify(title),
    section: song.section || "Songs",
    tags: Array.isArray(song.tags) ? song.tags : [],
    markdown: typeof song.markdown === "string" ? song.markdown : ""
  };
}

function buildSongLookup(songs) {
  const lookup = new Map();

  for (const song of songs) {
    const variants = [song.title, song.fileName, song.title.replace(/\([^)]*\)/g, " ")];

    for (const variant of variants) {
      const key = normalizeLookupKey(variant);

      if (key && !lookup.has(key)) {
        lookup.set(key, song);
      }
    }
  }

  return lookup;
}

function renderNavigation() {
  const groups = groupSongsBySection(state.songs);

  elements.songNav.innerHTML = groups
    .map(([sectionName, songs]) => {
      const links = songs
        .map(
          (song) => `
            <a class="nav-link" href="#${song.id}">${escapeHtml(song.title)}</a>
          `
        )
        .join("");

      return `
        <section class="nav-group">
          <h2 class="nav-group-title">${escapeHtml(sectionName)}</h2>
          ${links}
        </section>
      `;
    })
    .join("");
}

function renderPage() {
  const indexHtml = renderIndexMarkdown(window.SONGS_DATA.indexMarkdown || "");
  const songsHtml = state.songs.map((song) => renderSong(song)).join("");

  elements.pageContent.innerHTML = `
    <section class="note-block">
      ${indexHtml}
    </section>
    ${songsHtml}
    <div class="footer-spacer"></div>
  `;
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

    parts.push(
      paragraphLines
        .map((line) => `<p>${renderInlineMarkdown(line)}</p>`)
        .join("")
    );
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

function renderSong(song) {
  const parsed = parseSongMarkdown(song.markdown);
  const metaHtml = parsed.metaLines.length
    ? `
        <section class="song-meta">
          ${parsed.metaLines.map((line) => `<p>${renderInlineMarkdown(line)}</p>`).join("")}
        </section>
      `
    : "";

  return `
    <article class="song-note" id="${song.id}">
      <header class="song-header">
        <div class="song-title-row">
          <h2 class="song-title">${escapeHtml(song.title)}</h2>
          <a class="song-link" href="#${song.id}">#</a>
        </div>
      </header>
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

  return groups
    .map((group) => `<p>${group.map((line) => renderInlineMarkdown(line)).join("<br />")}</p>`)
    .join("");
}

function renderInlineMarkdown(text) {
  const prepared = String(text).replace(/\\([\[\]])/g, "$1");
  let html = escapeHtml(prepared);

  html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const resolved = resolveSongTarget(target);
    const linkLabel = label || target;

    if (!resolved) {
      return escapeHtml(linkLabel);
    }

    return `<a class="markdown-link" href="#${resolved.id}">${escapeHtml(linkLabel)}</a>`;
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

function resolveSongTarget(rawTarget) {
  const key = normalizeLookupKey(rawTarget);
  return state.songLookup.get(key) || null;
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
