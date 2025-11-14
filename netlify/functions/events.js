// netlify/functions/events.js
// Combine City of Council Bluffs RSS + UnleashCB events into one JSON feed

const CITY_RSS_URL =
  "https://www.councilbluffs-ia.gov/RSSFeed.aspx?ModID=58&CID=Main-Calendar-14";
const UNLEASH_URL = "https://www.unleashcb.com/events/30_days/";

exports.handler = async function () {
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
      return diff > -7 && diff < 60;
    });

    filtered.sort((a, b) => {
      if (!a.dateObj && !b.dateObj) return 0;
      if (!a.dateObj) return 1;
      if (!b.dateObj) return -1;
      return a.dateObj - b.dateObj;
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(
        filtered.map((e) => ({
          title: e.title,
          date: e.dateText || "",
          location: e.location || "",
          description: e.description || "",
          link: e.link || "",
          image:
            e.image ||
            "https://placehold.co/600x400/ff6600/ffffff?text=Council+Bluffs+Event",
          source: e.source,
        }))
      ),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to load events",
        details: err.message,
      }),
    };
  }
};

// ----------------- HELPERS -----------------

function parseCityRss(xml) {
  const items = [];
  const blocks = xml.split("<item>").slice(1);

  for (const block of blocks) {
    const section = block.split("</item>")[0];

    const title = extract(section, "title");
    const link = extract(section, "link");
    const description = stripHtml(extract(section, "description")).slice(0, 240);
    const pubDate = extract(section, "pubDate");

    let dateObj = null;
    if (pubDate) {
      const d = new Date(pubDate);
      if (!isNaN(d)) dateObj = d;
    }

    items.push({
      source: "City of Council Bluffs",
      title,
      link,
      description,
      dateText: pubDate || "",
      dateObj,
      location: "",
    });
  }
  return items;
}

function parseUnleash(html) {
  const events = [];
  const eventRegex = /<a[^>]+href="([^"]+)"[^>]*>\s*Event Details\s*([^<]+)<\/a>/g;

  let match;
  while ((match = eventRegex.exec(html))) {
    const href = match[1];
    const text = match[2].trim();
    const { title, dateText, dateObj } = splitTitleAndDate(text);

    events.push({
      source: "UnleashCB",
      title,
      link: href.startsWith("http")
        ? href
        : "https://www.unleashcb.com" + href,
      description: "",
      dateText,
      dateObj,
      location: "",
    });
  }
  return events;
}

function extract(block, tag) {
  const start = block.indexOf(`<${tag}>`);
  if (start === -1) return "";
  const end = block.indexOf(`</${tag}>`, start);
  if (end === -1) return "";
  return block.slice(start + tag.length + 2, end).trim();
}

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, "").trim();
}

function splitTitleAndDate(text) {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  for (let m of months) {
    const idx = text.indexOf(m);
    if (idx !== -1) {
      const title = text.slice(0, idx).trim();
      const dateText = text.slice(idx).trim();
      const year = new Date().getFullYear();
      const d = new Date(dateText + " " + year);

      return {
        title,
        dateText,
        dateObj: isNaN(d) ? null : d,
      };
    }
  }

  return { title: text, dateText: "", dateObj: null };
}
