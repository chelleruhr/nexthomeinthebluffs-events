// netlify/functions/events.js
// Combine City of Council Bluffs RSS + UnleashCB events into one JSON feed

const CITY_RSS_URL =
  "https://www.councilbluffs-ia.gov/RSSFeed.aspx?ModID=58&CID=Main-Calendar-14";
const UNLEASH_URL = "https://www.unleashcb.com/events/30_days/";

exports.handler = async function (event, context) {
  try {
    const [cityXml, unleashHtml] = await Promise.all([
      fetch(CITY_RSS_URL).then((r) => r.text()),
      fetch(UNLEASH_URL).then((r) => r.text()),
    ]);

    const cityEvents = parseCityRss(cityXml);
    const unleashEvents = parseUnleash(unleashHtml);

    const all = [...cityEvents, ...unleashEvents];

    const now = new Date();
    const filtered = all.filter((e) => {
      if (!e.dateObj) return true;
      const diff = (e.dateObj - now) / (1000 * 60 * 60 * 24);
      // keep events roughly from the last week through 60 days out
      return diff > -7 && diff < 60;
    });

    filtered.sort((a, b) => {
      if (!a.dateObj && !b.dateObj) return 0;
      if (!a.dateObj) return 1;
      if (!b.dateObj) return -1;
      return a.dateObj - b.dateObj;
    });

    const responseBody = filtered.map((e) => ({
      title: e.title,
      date: e.dateText || "",
      location: e.location || "",
      description: e.description || "",
      link: e.link || "",
      image:
        e.image ||
        "https://placehold.co/600x400/ff6600/ffffff?text=Council+Bluffs+Event",
      source: e.source,
    }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(responseBody),
    };
  } catch (err) {
    console.error("Error in events function:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to load events",
        details: String(err),
      }),
    };
  }
};

// ----------------- helpers -----------------

function parseTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  return m[1].replace(/<!\\[CDATA\\[|\\]\\]>/g, "").trim();
}

function stripHtml(str = "") {
  return str.replace(/<[^>]*>/g, "").trim();
}

function parseCityRss(xml) {
  const items = [];
  const itemRe = /<item>([\\s\\S]*?)<\\/item>/gi;
  let match;
  while ((match = itemRe.exec(xml))) {
    const block = match[1];
    const title = parseTag(block, "title");
    const link = parseTag(block, "link");
    const description = parseTag(block, "description");
    const pubDate = parseTag(block, "pubDate");

    let dateObj = null;
    if (pubDate) {
      const d = new Date(pubDate);
      if (!isNaN(d)) dateObj = d;
    }

    items.push({
      source: "City of Council Bluffs",
      title,
      link,
      description: stripHtml(description).slice(0, 240),
      dateText: pubDate || "",
      dateObj,
      location: "",
    });
  }
  return items;
}

function parseUnleash(html) {
  const events = [];
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Events look like: <a ...>Event Details {Title} {Date} | {Time}</a>
  const re =
    /<a[^>]+href="([^"]+)"[^>]*>\\s*Event Details\\s*([^<]+)<\\/a>/gi;

  let match;
  while ((match = re.exec(html))) {
    const href = match[1];
    const text = match[2].replace(/\\s+/g, " ").trim();

    let title = text;
    let dateText = "";
    let dateObj = null;

    let monthIndex = -1;
    for (const m of months) {
      const idx = text.indexOf(m + " ");
      if (idx !== -1) {
        monthIndex = idx;
        break;
      }
    }

    if (monthIndex !== -1) {
      title = text.slice(0, monthIndex).trim();
      dateText = text.slice(monthIndex).trim();

      const year = new Date().getFullYear();
      const clean = dateText
        .replace("|", "")
        .replace(/\\ba\\.m\\./gi, "AM")
        .replace(/\\bp\\.m\\./gi, "PM");
      const candidate = `${clean} ${year}`;
      const d = new Date(candidate);
      if (!isNaN(d)) dateObj = d;
    }

    events.push({
      source: "UnleashCB",
      title,
      link: href.startsWith("http")
        ? href
        : `https://www.unleashcb.com${href}`,
      description: "",
      dateText,
      dateObj,
      location: "",
    });
  }

  return events;
}
