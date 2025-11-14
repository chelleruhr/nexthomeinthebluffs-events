// netlify/functions/events.js
// Updated to support new City of CB XML structure + new UnleashCB HTML cards

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
      body: JSON.stringify(filtered),
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

// ----------------- City RSS PARSER -----------------

function parseCityRss(xml) {
  const events = [];
  const items = xml.split("<item>").slice(1);

  for (const raw of items) {
    const block = raw.split("</item>")[0];

    const title = extract(block, "title") || "City Event";
    const link = extract(block, "link") || "";
    const dateText = extract(block, "calendarEvent:EventDates");
    const timeText = extract(block, "calendarEvent:EventTimes");
    const location = extract(block, "calendarEvent:Location");

    let dateObj = null;
    if (dateText) {
      const d = new Date(dateText + " " + new Date().getFullYear());
      if (!isNaN(d)) dateObj = d;
    }

    events.push({
      source: "City of Council Bluffs",
      title,
      date: `${dateText} ${timeText}`.trim(),
      dateObj,
      location,
      description: "",
      link,
      image:
        "https://placehold.co/600x400/ff6600/ffffff?text=Council+Bluffs+Event",
    });
  }

  return events;
}

function extract(block, tag) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = block.indexOf(open);
  if (start === -1) return "";
  const end = block.indexOf(close, start);
  if (end === -1) return "";
  return block.slice(start + open.length, end).trim();
}

// ----------------- UNLEASH PARSER -----------------

function parseUnleash(html) {
  const events = [];

  // Find each card
  const cardRegex = /<article[\s\S]*?<\/article>/gi;
  const cards = html.match(cardRegex) || [];

  for (const card of cards) {
    const titleMatch = card.match(/<h2[^>]*>(.*?)<\/h2>/i);
    const dateMatch = card.match(/<p[^>]*>(.*?)<\/p>/i);
    const linkMatch = card.match(/<a[^>]+href="([^"]+)"/i);
    const imgMatch = card.match(/<img[^>]+src="([^"]+)"/i);

    const title = titleMatch ? strip(titleMatch[1]) : "UnleashCB Event";
    const dateText = dateMatch ? strip(dateMatch[1]) : "";
    const link = linkMatch ? linkMatch[1] : "";
    const image = imgMatch
      ? imgMatch[1]
      : "https://placehold.co/600x400/ff6600/ffffff?text=UnleashCB+Event";

    let dateObj = null;
    const cleaned = dateText.replace("|", "").trim();
    const d = new Date(cleaned + " " + new Date().getFullYear());
    if (!isNaN(d)) dateObj = d;

    events.push({
      source: "UnleashCB",
      title,
      date: dateText,
      dateObj,
      location: "",
      description: "",
      link,
      image,
    });
  }

  return events;
}

function strip(str) {
  return str.replace(/<[^>]*>/g, "").trim();
}
