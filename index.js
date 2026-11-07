// MyGo Music plugin for Li Zhi's songs collected in
// https://github.com/nj-lizhi/song: one folder per album under audio/, each
// with a cover.png and its songs.

const REPO = "nj-lizhi/song";
const BRANCH = "main";
const CDN = `https://testingcf.jsdelivr.net/gh/${REPO}@${BRANCH}/`;
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
// jsDelivr won't serve a file of a GitHub repository over 20 MB.
const CDN_LIMIT = 20 * 1024 * 1024;
const CATALOG_TTL = 24 * 60 * 60 * 1000;
const RECENT_MAX = 50;

const t = (text) => host.t(text);
const ARTIST_ID = "lizhi";
const artistOf = () => ({ id: ARTIST_ID, name: t("Li Zhi"), imageUrl: `${CDN}audio/cover.png` });

function fail(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");
const AUDIO = /\.(mp3|flac|wav)$/i;

// The catalog is a list of {path, size}, size being unknown (0) when it came
// from the fallback list.

async function fromTree() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const { tree } = await res.json();
  return tree
    .filter((e) => e.type === "blob" && /^audio\/[^/]+\/[^/]+$/.test(e.path) && AUDIO.test(e.path))
    .map((e) => ({ path: e.path, size: e.size || 0 }));
}

// The repository's own list, made by its index.js. It leaves out what's over
// 20 MB, and isn't JSON, so the urls are picked out of it.
async function fromList() {
  const res = await fetch(`${CDN}audio/list-v2.js`);
  if (!res.ok) throw new Error(`jsDelivr ${res.status}`);
  const text = await res.text();
  const prefix = `${REPO}@${BRANCH}/`;
  const paths = [];
  const urls = /url:\s*["']([^"']+)["']/g;
  for (let m; (m = urls.exec(text)); ) {
    const i = m[1].indexOf(prefix);
    if (i >= 0) paths.push(decodeURI(m[1].slice(i + prefix.length)));
  }
  if (!paths.length) throw new Error("empty list");
  return paths.map((path) => ({ path, size: 0 }));
}

let catalog = null;

async function loadCatalog() {
  if (catalog) return catalog;
  const cached = host.storage.get("catalog");
  if (cached && Date.now() - cached.time < CATALOG_TTL) return (catalog = build(cached.files));
  let files;
  for (const source of [fromTree, fromList]) {
    try {
      files = await source();
      break;
    } catch (e) {
      console.log(`catalog: ${e.message}`);
    }
  }
  if (!files) {
    if (cached) return (catalog = build(cached.files));
    throw new Error(t("Could not load the song list"));
  }
  host.storage.set("catalog", { time: Date.now(), files });
  return (catalog = build(files));
}

// The app's JavaScript has no Intl, so names are sorted by hand: runs of digits
// by their value, everything else by code point.
const collator = {
  compare(a, b) {
    const pa = a.match(/\d+|\D+/g) || [];
    const pb = b.match(/\d+|\D+/g) || [];
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
      const x = pa[i];
      const y = pb[i];
      if (x === y) continue;
      if (/^\d/.test(x) && /^\d/.test(y)) return Number(x) - Number(y) || x.length - y.length;
      return x < y ? -1 : 1;
    }
    return pa.length - pb.length;
  },
};

function build(files) {
  const tracks = new Map();
  const albums = new Map();
  for (const { path, size } of files) {
    const [, folder, file] = path.split("/");
    if (!albums.has(folder)) {
      albums.set(folder, {
        album: { id: folder, name: folder, imageUrl: `${CDN}${encodePath(`audio/${folder}/cover.png`)}` },
        ids: [],
      });
    }
    const entry = albums.get(folder);
    const track = {
      id: path,
      name: file.replace(AUDIO, ""),
      album: entry.album,
      duration: 0,
      url: `https://github.com/${REPO}/blob/${BRANCH}/${encodePath(path)}`,
    };
    tracks.set(path, { track, size });
    entry.ids.push(path);
  }
  for (const entry of albums.values()) {
    entry.ids.sort((a, b) => collator.compare(tracks.get(a).track.name, tracks.get(b).track.name));
  }
  const order = [...albums.keys()].sort(collator.compare);
  return { tracks, albums, order };
}

// The artist's name follows the listener's language, so it's put on as tracks
// go out rather than kept in the catalog.
function withArtist(track) {
  const artist = artistOf();
  return { ...track, artists: [artist], album: { ...track.album, artists: [artist] } };
}
const albumOut = (album) => ({ ...album, artists: [artistOf()] });

async function tracksOf(ids) {
  const { tracks } = await loadCatalog();
  return ids.filter((id) => tracks.has(id)).map((id) => withArtist(tracks.get(id).track));
}
async function allIds() {
  const { albums, order } = await loadCatalog();
  return order.flatMap((folder) => albums.get(folder).ids);
}
async function allAlbums() {
  const { albums, order } = await loadCatalog();
  return order.map((folder) => albumOut(albums.get(folder).album));
}

// A shuffle that is the same all day, for the day's picks.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function today() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Pages.

export async function home() {
  const picks = shuffle(await allIds(), seeded(today())).slice(0, 30);
  const recentIds = host.storage.get("recent") || [];
  const sections = [
    {
      title: t("Today's Picks"),
      pageTitle: t("Today's Li Zhi"),
      subtitle: t("Picked at random, new every day"),
      tracks: await tracksOf(picks),
    },
    { title: t("Albums"), albums: await allAlbums(), morePage: "albums" },
  ];
  if (recentIds.length) {
    sections.push({ title: t("Recently Played"), tracks: await tracksOf(recentIds.slice(0, 10)) });
  }
  sections.push({
    title: t("Li Zhi"),
    artists: [artistOf()],
    links: [{ title: t("All Songs"), subtitle: `${(await allIds()).length} ${t("songs")}`, page: "all" }],
  });
  return { title: t("Li Zhi"), sections };
}

export async function browse({ page }) {
  if (page === "albums") {
    return { title: t("Albums"), sections: [{ albums: await allAlbums() }] };
  }
  if (page === "all") {
    const ids = await allIds();
    return { title: t("All Songs"), subtitle: `${ids.length} ${t("songs")}`, sections: [{ tracks: await tracksOf(ids) }] };
  }
  throw fail("unavailable", `no page ${page}`);
}

async function getAlbum({ id }) {
  const { albums } = await loadCatalog();
  const entry = albums.get(id);
  if (!entry) throw fail("unavailable", `no album ${id}`);
  return { album: albumOut(entry.album), tracks: await tracksOf(entry.ids) };
}

async function getArtist({ id }) {
  if (id !== ARTIST_ID) throw fail("unavailable", `no artist ${id}`);
  const picks = shuffle(await allIds(), seeded(today() + 1)).slice(0, 20);
  return { artist: artistOf(), tracks: await tracksOf(picks), albums: await allAlbums() };
}

export { getAlbum as album, getArtist as artist };

// Search.

const PAGE = 50;
const norm = (s) => s.toLowerCase().replace(/\s+/g, "");

export async function search({ query, kind, offset = 0 }) {
  const q = norm(query || "");
  if (!q) return { [kind]: [], more: false };
  let found = [];
  if (kind === "tracks") {
    const { tracks } = await loadCatalog();
    const ids = (await allIds()).filter((id) => {
      const { track } = tracks.get(id);
      return norm(track.name).includes(q) || norm(track.album.name).includes(q);
    });
    // Songs whose own name matches come before those found by their album.
    const own = (id) => (norm(tracks.get(id).track.name).includes(q) ? 0 : 1);
    ids.sort((a, b) => own(a) - own(b));
    found = await tracksOf(ids);
  } else if (kind === "albums") {
    found = (await allAlbums()).filter((a) => norm(a.name).includes(q));
  } else if (kind === "artists") {
    const a = artistOf();
    found = ["lizhi", "李志", "li zhi", norm(a.name)].some((n) => norm(n).includes(q)) ? [a] : [];
  }
  return { [kind]: found.slice(offset, offset + PAGE), more: offset + PAGE < found.length };
}

export async function suggest({ query }) {
  const q = norm(query || "");
  if (!q) return [];
  const { tracks } = await loadCatalog();
  const names = new Set();
  for (const id of await allIds()) {
    const name = tracks.get(id).track.name;
    if (norm(name).includes(q)) names.add(name);
    if (names.size >= 10) break;
  }
  return [...names];
}

// What the listener played and liked, kept on this device.

export async function recent() {
  return tracksOf(host.storage.get("recent") || []);
}
export function played({ id }) {
  const list = (host.storage.get("recent") || []).filter((x) => x !== id);
  list.unshift(id);
  host.storage.set("recent", list.slice(0, RECENT_MAX));
}

export async function liked({ offset = 0 }) {
  const ids = host.storage.get("liked") || [];
  const tracks = await tracksOf(ids.slice(offset, offset + PAGE));
  return { tracks, more: offset + PAGE < ids.length };
}
export function isLiked({ ids }) {
  const set = new Set(host.storage.get("liked") || []);
  return Object.fromEntries(ids.map((id) => [id, set.has(id)]));
}
export function like({ id, on }) {
  const list = (host.storage.get("liked") || []).filter((x) => x !== id);
  if (on) list.unshift(id);
  host.storage.set("liked", list);
}

// A station of the whole collection, shuffled.

export async function stations() {
  return [
    {
      id: "all",
      name: t("Shuffle All"),
      description: t("Every song in the collection, in random order"),
      imageUrl: `${CDN}audio/cover.png`,
    },
  ];
}
export async function stationNext({ id }) {
  if (id !== "all") throw fail("unavailable", `no station ${id}`);
  return tracksOf(shuffle(await allIds()).slice(0, 20));
}

// Audio.

const TYPES = { mp3: "mp3", flac: "flac", wav: "wav" };

export async function stream({ id }) {
  const { tracks } = await loadCatalog();
  const entry = tracks.get(id);
  if (!entry) throw fail("unavailable", `no song ${id}`);
  const ext = id.match(AUDIO)[1].toLowerCase();
  const base = entry.size > CDN_LIMIT ? RAW : CDN;
  return { url: base + encodePath(id), type: TYPES[ext], ...(entry.size ? { size: entry.size } : {}) };
}
