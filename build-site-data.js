const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const contentDir = resolveExistingDirectory([
  path.join(rootDir, "content"),
  path.join(rootDir, "Content")
]);
const infoDir = path.join(contentDir, "info");
const songsDir = path.join(contentDir, "songs");
const indexPath = resolveExistingFile([
  path.join(infoDir, "index.md"),
  path.join(infoDir, "!Songs.md"),
  path.join(infoDir, "welcome.md")
]);
const manifestPath = path.join(rootDir, "songs-manifest.json");
const bundledDataPath = path.join(rootDir, "songs-data.js");

main();

function main() {
  assertDirectoryExists(infoDir, "Info directory");
  assertDirectoryExists(songsDir, "Songs directory");

  const infoPages = readInfoRecords();
  const indexPage = infoPages.find((page) => page.isIndex);
  const indexMarkdown = indexPage ? indexPage.markdown : fs.readFileSync(indexPath, "utf8");
  const songRecords = readSongRecords();
  const recordsByLookupKey = buildRecordLookup(songRecords);
  const warnings = [];
  const usedPaths = new Set();
  const orderedEntries = parseIndexEntries(indexMarkdown, recordsByLookupKey, usedPaths, warnings);
  const extraEntries = buildExtraEntries(songRecords, usedPaths);
  const manifest = [...orderedEntries, ...extraEntries];
  const recordByRelativeFile = new Map(songRecords.map((record) => [record.relativePath, record]));
  const bundledSongs = manifest.map((entry) => ({
    ...entry,
    markdown: recordByRelativeFile.get(entry.file).markdown
  }));

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    bundledDataPath,
    `window.SONGS_DATA = ${JSON.stringify({ indexMarkdown, songs: bundledSongs, infoPages })};\n`,
    "utf8"
  );

  console.log(`Content root: ${path.relative(rootDir, contentDir) || "."}`);
  console.log(`Index note: ${path.relative(rootDir, indexPath)}`);
  console.log(`Info markdown files: ${infoPages.length}`);
  console.log(`Song markdown files: ${songRecords.length}`);
  console.log(`Manifest entries: ${manifest.length}`);
  console.log("Updated songs-manifest.json and songs-data.js");

  if (warnings.length) {
    console.log("");
    console.log("Warnings:");
    warnings.forEach((warning) => console.log(`- ${warning}`));
  }
}

function readInfoRecords() {
  return fs
    .readdirSync(infoDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
    .map((entry) => {
      const absolutePath = path.join(infoDir, entry.name);
      const markdown = fs.readFileSync(absolutePath, "utf8");
      const stem = entry.name.replace(/\.md$/i, "");
      const isIndex = path.normalize(absolutePath) === path.normalize(indexPath);

      return {
        id: createNoteId(path.relative(contentDir, absolutePath)),
        title: formatInfoTitle(stem, isIndex),
        label: entry.name,
        file: toPosixPath(path.relative(rootDir, absolutePath)),
        markdown,
        isIndex
      };
    })
    .sort((left, right) => {
      if (left.isIndex !== right.isIndex) {
        return left.isIndex ? -1 : 1;
      }

      return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
    });
}

function readSongRecords() {
  return fs
    .readdirSync(songsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
    .map((entry) => {
      const absolutePath = path.join(songsDir, entry.name);
      const markdown = fs.readFileSync(absolutePath, "utf8");
      const stem = entry.name.replace(/\.md$/i, "");

      return {
        absolutePath,
        markdown,
        stem,
        relativePath: toPosixPath(path.relative(rootDir, absolutePath)),
        title: stripBadgeSuffix(stem)
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));
}

function buildRecordLookup(records) {
  const lookup = new Map();

  for (const record of records) {
    const variants = [
      record.stem,
      record.title,
      record.stem.replace(/\([^)]*\)/g, " "),
      record.stem.replace(/[🆕🅰️🅱️]/gu, " ")
    ];

    for (const variant of variants) {
      const key = normalizeLookupKey(variant);

      if (key && !lookup.has(key)) {
        lookup.set(key, record);
      }
    }
  }

  return lookup;
}

function parseIndexEntries(indexMarkdown, lookup, usedPaths, warnings) {
  const entries = [];
  const seenFiles = new Set();
  const lines = indexMarkdown.replace(/\r/g, "").split("\n");
  let currentSection = "";

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      continue;
    }

    const calloutMatch = trimmed.match(/^>\[![^\]]+\]\s*(.*)$/);

    if (calloutMatch) {
      currentSection = calloutMatch[1].trim() || "Songs";
      continue;
    }

    const cleanLine = trimmed.replace(/^>+\s?/, "");

    if (!cleanLine || cleanLine.startsWith("`")) {
      continue;
    }

    const candidateTitle = extractCandidateTitle(cleanLine);

    if (!candidateTitle) {
      continue;
    }

    const record = lookup.get(normalizeLookupKey(candidateTitle));

    if (!record) {
      warnings.push(`No markdown file found for index entry \"${candidateTitle}\"`);
      continue;
    }

    if (seenFiles.has(record.relativePath)) {
      warnings.push(`Duplicate index entry ignored for \"${candidateTitle}\"`);
      continue;
    }

    const section = currentSection || inferFallbackSection(record);
    const tags = extractTags(cleanLine, section, record.stem);

    entries.push({
      title: record.title,
      file: record.relativePath,
      section,
      tags
    });

    usedPaths.add(record.absolutePath);
    seenFiles.add(record.relativePath);
  }

  return entries;
}

function buildExtraEntries(records, usedPaths) {
  return records
    .filter((record) => !usedPaths.has(record.absolutePath))
    .map((record) => {
      const section = inferFallbackSection(record);

      return {
        title: record.title,
        file: record.relativePath,
        section,
        tags: extractTags("", section, record.stem)
      };
    })
    .sort((left, right) => {
      const sectionCompare = left.section.localeCompare(right.section, undefined, { sensitivity: "base" });

      if (sectionCompare !== 0) {
        return sectionCompare;
      }

      return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
    });
}

function extractCandidateTitle(line) {
  const wikiLinkMatch = line.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);

  if (wikiLinkMatch) {
    return wikiLinkMatch[1].trim();
  }

  return line.replace(/`[^`]*`/g, "").trim();
}

function extractTags(line, section, stem) {
  const tags = new Set();
  const source = `${line} ${stem}`;

  if (source.includes("🆕")) {
    tags.add("new");
  }

  if (source.includes("🅰️")) {
    tags.add("acapella");
  }

  if (source.includes("🅱️") || /b-side/i.test(section)) {
    tags.add("bside");
  }

  return [...tags];
}

function inferFallbackSection(record) {
  return record.stem.includes("🅱️") ? "B-side" : "Additional songs";
}

function createNoteId(relativePath) {
  return toPosixPath(relativePath).replace(/\.md$/i, "");
}

function formatInfoTitle(stem, isIndex) {
  if (isIndex) {
    return "!Songs";
  }

  return stem
    .replace(/[-_]+/g, " ")
    .replace(/\b\p{L}/gu, (match) => match.toUpperCase());
}

function stripBadgeSuffix(value) {
  return value.replace(/\(\s*[🆕🅰️🅱️\s]+\)/gu, "").trim();
}

function normalizeLookupKey(value) {
  return slugify(String(value).replace(/[🆕🅰️🅱️]/gu, " "));
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function resolveExistingDirectory(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return fs.realpathSync.native(candidate);
    }
  }

  throw new Error(`Could not find a content directory. Checked: ${candidates.join(", ")}`);
}

function resolveExistingFile(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return fs.realpathSync.native(candidate);
    }
  }

  throw new Error(`Could not find an index note. Checked: ${candidates.join(", ")}`);
}

function assertDirectoryExists(directoryPath, label) {
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    throw new Error(`${label} not found: ${directoryPath}`);
  }
}
