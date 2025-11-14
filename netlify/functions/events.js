// netlify/functions/events.js
// Combines City of Council Bluffs RSS + UnleashCB JSON into one feed

const CITY_RSS_URL =
  "https://www.councilbluffs-ia.gov/RSSFeed.aspx?ModID=58&CID=Main-Calendar-14";

const UNLEASH_API_URL = "https://www.unleashcb.com/api/event/listing";

exports.handler = async function (event, context) {
  try {
    // Fetch RSS + JSON in parallel
    const [cityXml, unleashJson] = await Promise.all([
      fetch(CITY_RSS_URL).then((r) => r.text()),
      fetch(UNLEASH_API_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36",
          Accept: "application/json",
        },
      }).then(async (r) => {
        const text = await r.text();

        // If the API returns HTML instead of JSON, throw an error
        if (text.trim().startsWith("<")) {
          throw new Error("UnleashCB returned HTML instead of JSON");
        }

        return JSON.parse(text);
      }),
    ]);

    const cityEvents = parseCityRss(cityXml);
    const unleashEvents = parseUnleash(unleashJson);

    const combined = [...cityEvents, ...unleashEvents];

    // Filter to events -7 days to +60 days
    const now = new Date();
    const filtered = combined.filter((ev) => {
      if (!ev.dateObj) return false;
      const diff = (ev.dateObj - now) / (1000 * 60 * 60 * 24);
      return diff > -7 && diff < 60;
    });

    // Sort by date
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
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message,
      }),
    };
  }
};

/* -------------------------------
   PARSE CITY RSS
-------------------------------- */
function parseCityRss(xml) {
  const parser = /<item>([\s\S]*?)<\/item>/g;
  const items = [];
  let match;

  while ((match = parser.exec(xml)) !== null) {
    const block = match[1];

    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].trim() : "";
    };

    const title = get("title");
    const description = get("description")
      .replace(/<[^>]+>/g, " ")
      .trim();
    const link = get("link");
    const location = get("calendarEvent:Location");
    const eventDate = get("calendarEvent:EventDates");
    const eventTime = get("calendarEvent:EventTimes");

    // Create date string
    const dateStr = `${eventDate} ${eventTime}`.trim();
    const dateObj = parseDate(dateStr);

    items.push({
      source: "City of Council Bluffs",
      title,
      description,
      date: dateStr,
      dateObj,
      location,
      link,
      image:
        "https://placehold.co/600x400/ff6600/ffffff?text=Council+Bluffs+Event",
    });
  }

  return items;
}

/* -------------------------------
   PARSE UNLEASHCB JSON
-------------------------------- */
function parseUnleash(json) {
  if (!json || !json.data) return [];

  return json.data.map((ev) => {
    const dateStr = ev.date || "";
    const dateObj = parseDate(dateStr);

    return {
      source: "UnleashCB",
      title: ev.title || "",
      description: ev.body || "",
      date: dateStr,
      dateObj,
      location: ev.location || "",
      link: ev.slug
        ? `https://www.unleashcb.com/events/${ev.slug}/`
        : "https://www.unleashcb.com/",
      image:
        ev.image?.src ||
        "https://placehold.co/600x400/00629B/ffffff?text=UnleashCB+Event",
    };
  });
}

/* -------------------------------
   DATE PARSER
-------------------------------- */
function parseDate(str) {
  if (!str) return null;

  // First try normal Date()
  let d = new Date(str);
  if (!isNaN(d)) return d;

  // Try splitting MM/DD/YYYY
  const m = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    return new Date(`${m[3]}-${m[1]}-${m[2]}`);
  }

  return null;
}
