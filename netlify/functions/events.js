import fetch from "node-fetch";
import * as cheerio from "cheerio";

const CITY_RSS_URL =
  "https://www.councilbluffs-ia.gov/RSSFeed.aspx?ModID=58&CID=Main-Calendar-14";

const UNLEASH_URL = "https://www.unleashcb.com/events/30_days/";

export const handler = async () => {
  try {
    const cityXml = await fetch(CITY_RSS_URL).then((r) => r.text());
    const cityEvents = parseCityRss(cityXml);

    const unleashHtml = await fetch(UNLEASH_URL).then((r) => r.text());
    const unleashEvents = parseUnleashHtml(unleashHtml);

    const all = [...cityEvents, ...unleashEvents];

    const now = new Date();
    const upcoming = all.filter((e) => {
      if (!e.dateObj) return false;
      const diff = (e.dateObj - now) / 86400000;
      return diff >= -1 && diff <= 365;
    });

    upcoming.sort((a, b) => a.dateObj - b.dateObj);

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

function parseCityRss(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];

  $("item").each((i, el) => {
    const title = $(el).find("title").text().trim();
    const link = $(el).find("link").text().trim();
    const desc = stripHtml($(el).find("description").text().trim());
    const date = $(el).find("calendarEvent\\:EventDates").text().trim();
    const location = $(el).find("calendarEvent\\:Location").text().trim();
    const image = $(el).find("enclosure").attr("url") || null;

    const dateObj = date ? new Date(date) : null;

    out.push({
      source: "City of Council Bluffs",
      title,
      link,
      date,
      dateObj,
      location,
      description: desc,
      image:
        image ||
        "https://placehold.co/600x400/ff6600/ffffff?text=Council+Bluffs+Event",
    });
  });

  return out;
}

function parseUnleashHtml(html) {
  const $ = cheerio.load(html);
  const out = [];

  $(".card").each((i, el) => {
    const title = $(el).find(".card-title").text().trim();
    const date = $(el).find(".card-subtitle").text().trim();
    const img = $(el).find(".event-card-image img").attr("src");
    const link = $(el).closest("a").attr("href");

    if (!title) return;

    let dateObj = parseUnleashDate(date);

    out.push({
      source: "UnleashCB",
      title,
      link: link ? "https://www.unleashcb.com" + link : "",
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

function parseUnleashDate(dateText) {
  if (!dateText) return null;
  const cleaned = dateText.split("|")[0].trim();
  return new Date(cleaned);
}

function stripHtml(html) {
  return html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}
