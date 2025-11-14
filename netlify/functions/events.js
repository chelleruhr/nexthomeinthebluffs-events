// netlify/functions/events.js
// Combines City of Council Bluffs RSS + UnleashCB API into one JSON feed

const CITY_RSS_URL =
  "https://www.councilbluffs-ia.gov/RSSFeed.aspx?ModID=58&CID=Main-Calendar-14";

const UNLEASH_API_URL =
  "https://www.unleashcb.com/api/external/events?days=30";

exports.handler = async function (event, context) {
  try {
    // Fetch both sources
    const [cityXml, unleashJson] = await Promise.all([
      fetch(CITY_RSS_URL).then((r) => r.text()),
      fetch(UNLEASH_API_URL).then((r) => r.json()),
    ]);

    const cityEvents = parseCity(cityXml);
    const unleashEvents = parseUnleashAPI(unleashJson);

    let all = [...cityEvents, ...unleashEvents];

    // Filter to next ~60 days
    const now = new Date();
    all = all.filter((e) => {
      if (!e.dateObj) return false;
      const diff = (e.dateObj - now) / (1000 * 60 * 60 * 24);
      return diff >= -7 && diff <= 60;
    });

    // Sort by date
    all.sort((a, b) => (a.dateObj > b.dateObj ? 1 : -1));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

function parseCity(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return items.map((item) => {
    const block = item[1];

    const title = get(block, "title");
    const link = get(block, "link");
    const description = get(block, "description");
    const location = get(block, "calendarEvent:Location");
    const date = get(block, "calendarEvent:EventDates");
    const image = getAttr(block, "enclosure", "url");

    let dateObj = null;
    if (date) {
      dateObj = new Date(date.replace(/<[^>]+>/g, "").trim());
    }

    return {
      source: "City of Council Bluffs",
      title,
      date,
      dateObj,
      location,
      description,
      link,
      image:
        image ||
        "https://placehold.co/600x400/ff6600/ffffff?text=Council+Bluffs+Event",
    };
  });
}

function parseUnleashAPI(json) {
  if (!Array.isArray(json)) return [];

  return json.map((e) => {
    const dt = new Date(e.date_start);

    return {
      source: "UnleashCB",
      title: e.title,
      date: e.human_date || e.date_start,
      dateObj: dt,
      location: e.location || "",
      description: e.description || "",
      link: e.url,
      image:
        e.image ||
        "https://placehold.co/600x400/00629B/ffffff?text=UnleashCB+Event",
    };
  });
}

function get(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : "";
}

function getAttr(xml, tag, attr) {
  const m = xml.match(
    new RegExp(`<${tag} [^>]*${attr}="([^"]+)"[^>]*>`, "i")
  );
  return m ? m[1] : "";
}
