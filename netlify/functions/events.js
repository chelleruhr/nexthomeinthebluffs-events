import fetch from "node-fetch";
import * as cheerio from "cheerio";

const CITY_RSS_URL =
  "https://www.councilbluffs-ia.gov/RSSFeed.aspx?ModID=58&CID=Main-Calendar-14";

const UNLEASH_URL = "https://www.unleashcb.com/events/30_days/";

export const handler = async () => {
  try {
    // Fetch City RSS
    const cityXml = await fetch(CITY_RSS_URL).then((r) => r.text());
    const cityEvents = parseCityRss(cityXml);

    // Fetch UnleashCB HTML
    const unleashHtml = await fetch(UNLEASH_URL).then((r) => r.text());
    const unleashEvents = parseUnleashHtml(unleashHtml);

    // Merge + sort
    const all = [...cityEvents, ...unleashEvents];

    const now = new Date();
    const upcoming = all.filter((e) => {
      if (!e.dateObj) return false;
      const diff = (e.dateObj - now) / 86400000;
      return diff > -1 && diff <= 366;
    });

    upcoming.sort((a, b) => new Date(a.dateObj) - new Date(b.dateObj));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(upcoming, null, 2),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// -------------------------
// PARSE CITY RSS
// -------------------------
function parseCityRss(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];

  $("item").each((i, el) => {
    const title = $(el).find("title").text().trim();
    const link = $(el).find("link").text().trim();
    const description = stripHtml($(el).find("description").text().trim());
    const date = $(el).find("calendarEvent\\:EventDates").text().trim();
    const location = $(el).find("calendarEvent\\:Location").text().trim();
    const image = $(el).find("enclosure").attr("url");

    let dateObj = null;
    if (date) dateObj = new Date(date);

    out.push({
      source: "City of Council Bluffs",
      title,
      link,
      date,
      dateObj,
      location,
      description,
      image:
        image ||
        "https://placehold.co/600x400/ff6600/ffffff?text=Council+Bluffs+Event",
    });
  });

  return out;
}

// -------------------------
// PARSE UNLEASHCB HTML
// -------------------------
function parseUnleashHtml(html) {
  const $ = cheerio.load(html);
  const out = [];

  $(".listingCard").each((i, card) => {
    const title = $(card).find(".listingCard-title").text().trim();
    const link = "https://www.unleashcb.com" + $(card).find("a").attr("href");
    const date = $(card).find(".listingCard-date").text().trim();
    const img = $(card).find("img").attr("src");

    let dateObj = null;
    if (date) dateObj = parseUnleashDate(date);

    out.push({
      source: "UnleashCB",
      title,
      link,
      date,
      dateObj,
      location: "",
      description: "",
      image:
        img ||
        "https://placehold.co/600x400/00629B/ffffff?text=UnleashCB+Event",
    });
  });

  return out;
}

// Convert UnleashCB date text to Date()
function parseUnleashDate(text) {
  // Example: "November 14 | 5:00 - 8:00 p.m."
  let dayPart = text.split("|")[0].trim();
  return new Date(dayPart);
}

// Strip HTML tags
function stripHtml(html) {
  return html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}
