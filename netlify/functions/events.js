// netlify/functions/events.js
// Combine City of Council Bluffs RSS + UnleashCB HTML scraper

const CITY_RSS_URL =
  "https://www.councilbluffs-ia.gov/RSSFeed.aspx?ModID=58&CID=Main-Calendar-14";

const UNLEASH_HTML_URL = "https://www.unleashcb.com/events/30_days/";

exports.handler = async function () {
  try {
    const [cityXml, unleashHtml] = await Promise.all([
      fetch(CITY_RSS_URL).then((r) => r.text()),
      fetch(UNLEASH_HTML_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36",
        },
      }).then((r) => r.text()),
    ]);

    const cityEvents = parseCityRss(cityXml);
    const unleashEvents = parseUnleashHtml(unleashHtml);

    let events = [...cityEvents, ...unleashEvents];

    // FILTER 60 days forward, 7 days back
    const now = new Date();
    events = events.filter((e) => {
      if (!e.dateObj) return false;
      const diff = (e.dateObj - now) / (1000 * 60 * 60 * 24);
      return diff > -7 && diff < 60;
    });

    // SORT
    events.sort((a, b) => a.dateObj - b.dateObj);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(events),
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
  const events = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  for (const block of blocks) {
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].trim() : "";
    };

    const title = get("title");
    const link = get("link");
    const location = get("calendarEvent:Location");
    const date = get("calendarEvent:EventDates");
    const time = get("calendarEvent:EventTimes");

    const dateStr = `${date} ${time}`;
    const dateObj = parseDate(dateStr);

    events.push({
      source: "City of Council Bluffs",
      title,
      link,
      date: dateStr,
      dateObj,
      location,
      description: "",
      image:
        "https://placehold.co/600x400/ff6600/ffffff?text=Council+Bluffs+Event",
    });
  }

  return events;
}

// -------------------------
// PARSE UNLEASHCB HTML
// -------------------------
function parseUnleashHtml(html) {
  const events = [];

  const cardRegex = /<a class="event-card"([\s\S]*?)<\/a>/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const block = match[0];

    const get = (regex) => {
      const m = block.match(regex);
      return m ? m[1].trim() : "";
    };

    const link = get(/href="([^"]+)"/);
    const title = get(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const img = get(/<img[^>]*src="([^"]+)"/);

    // Extract date text if available
    const date = get(/<p class="event-date">([\s\S]*?)<\/p>/);

    const dateObj = parseDate(date);

    events.push({
      source: "UnleashCB",
      title,
      link: `https://www.unleashcb.com${link}`,
      date,
      dateObj,
      location: "",
      description: "",
      image:
        img ||
        "https://placehold.co/600x400/00629B/ffffff?text=UnleashCB+Event",
    });
  }

  return events;
}

// -------------------------
// DATE PARSER
// -------------------------
function parseDate(str) {
  if (!str) return null;

  let d = new Date(str);
  if (!isNaN(d)) return d;

  // Format like: "November 14 | 5:00 - 8:00 p.m."
  const m = str.match(/([A-Za-z]+) (\d{1,2})/);
  if (m) {
    const year = new Date().getFullYear();
    return new Date(`${m[1]} ${m[2]}, ${year}`);
  }

  return null;
}
