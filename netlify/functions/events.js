// netlify/functions/events.js
// Combined Events Feed (Council Bluffs RSS + UnleashCB JSON)

import fetch from "node-fetch";
import * as cheerio from "cheerio";

const CITY_RSS_URL =
  "https://www.councilbluffs-ia.gov/RSSFeed.aspx?ModID=58&CID=Main-Calendar-14";

const UNLEASH_API =
  "https://www.unleashcb.com/api/events?days=60"; // JSON feed, not HTML

export const handler = async () => {
  try {
    // ---------------------------
    // FETCH CITY RSS FEED
    // ---------------------------
    const cityXml = await fetch(CITY_RSS_URL).then((r) => r.text());
    const cityEvents = parseCityRss(cityXml);

    // ---------------------------
    // FETCH UNLEASHCB JSON
    // ---------------------------
    const unleashJson = await fetch(UNLEASH_API).then((r) => r.json());
    const unleashEvents = parseUnleash(unleashJson);

    // ---------------------------
    // MERGE + FILTER
    // ---------------------------
    const all = [...cityEvents, ...unleashEvents];

    const now = new Date();
    const upcoming = all.filter((e) => {
      if (!e.dateObj) return false;
      const diff = (e.dateObj - now) / (1000 * 60 * 60 * 24);
      return diff >= -1 && diff <= 366; // from yesterday to 1 year out
    });

    // SORT
    upcoming.sort((a, b) => a.dateObj - b.dateObj);

    // RETURN JSON
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

// ---------------------------------------------------------------------
// PARSE CITY OF COUNCIL BLUFFS RSS
// ---------------------------------------------------------------------
function parseCityRss(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];

  $("item").each((i, el) => {
    const title = $(el).find("title").text().trim();
    const link = $(el).find("link").text().trim();
    const rawDesc = $(el).find("description").text().trim();

    const dateText = $(el).find("calendarEvent\\:EventDates").text().trim();
    const location = $(el).find("calendarEvent\\:Location").text().trim();
    const image = $(el).find("enclosure").attr("url");

    const cleanDesc = stripHtml(rawDesc);

    let dateObj = null;
    if (dateText) dateObj = new Date(dateText);

    out.push({
      source: "City of Council Bluffs",
      title,
      link,
      date: dateText,
      dateObj: dateObj ? dateObj.toISOString() : null,
      location,
      description: cleanDesc,
      image:
        image ||
        "https://placehold.co/600x400/ff6600/ffffff?text=Council+Bluffs+Event",
    });
  });

  return out;
}

// ---------------------------------------------------------------------
// PARSE UNLEASHCB JSON
// ---------------------------------------------------------------------
function parseUnleash(json) {
  if (!Array.isArray(json)) return [];

  return json.map((e) => {
    const dateObj = e.startDate ? new Date(e.startDate) : null;

    return {
      source: "UnleashCB",
      title: e.title || "Untitled Event",
      link: e.url || "",
      date: e.fullDate || "",
      dateObj: dateObj ? dateObj.toISOString() : null,
      location: e.location || "",
      description: e.description || "",
      image:
        e.image ||
        "https://placehold.co/600x400/00629B/ffffff?text=Council+Bluffs+Event",
    };
  });
}

// ---------------------------------------------------------------------
// HTML CLEANER
// ---------------------------------------------------------------------
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ") // remove tags
    .replace(/\s+/g, " ")
    .trim();
}
