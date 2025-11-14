// netlify/functions/events.js
const fetch = require("node-fetch");
const cheerio = require("cheerio");

exports.handler = async () => {
  try {
    let finalEvents = [];

    // -------------------------------------------------------------------
    // 1️⃣ CITY OF COUNCIL BLUFFS — REAL RSS FEED
    // -------------------------------------------------------------------
    try {
      const cbRSS = "https://www.councilbluffs-ia.gov/RSSFeed.aspx?ModID=58&CID=Main-Calendar-14";
      const rssResponse = await fetch(cbRSS);
      const rssText = await rssResponse.text();

      const events = [...rssText.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(item => {
        const xml = item[1];

        const title = (xml.match(/<title>(.*?)<\/title>/)?.[1] || "").trim();
        const link = xml.match(/<link>(.*?)<\/link>/)?.[1] || "";
        const description = xml.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "";
        const eventDate = xml.match(/<calendarEvent:EventDates>(.*?)<\/calendarEvent:EventDates>/)?.[1] || "";
        const eventTime = xml.match(/<calendarEvent:EventTimes>(.*?)<\/calendarEvent:EventTimes>/)?.[1] || "";
        const location = xml.match(/<calendarEvent:Location>(.*?)<\/calendarEvent:Location>/)?.[1] || "";
        const enclosure = xml.match(/<enclosure url="(.*?)"/)?.[1];

        return {
          source: "City of Council Bluffs",
          title,
          link,
          date: `${eventDate} ${eventTime}`.trim(),
          dateObj: eventDate ? new Date(eventDate.trim()) : null,
          location,
          description,
          image: enclosure || "https://placehold.co/600x400/ff6600/ffffff?text=Council+Bluffs+Event",
        };
      });

      finalEvents.push(...events);
    } catch (err) {
      console.log("CB RSS error", err);
    }

    // -------------------------------------------------------------------
    // 2️⃣ UNLEASH CB — HTML SCRAPER
    // -------------------------------------------------------------------
    try {
      const unleashURL = "https://www.unleashcb.com/events/30_days/";
      const htmlResponse = await fetch(unleashURL);
      const html = await htmlResponse.text();

      const $ = cheerio.load(html);

      $(".col-md-4").each((i, el) => {
        const title = $(el).find("h3 a").text().trim();
        const link = $(el).find("h3 a").attr("href");
        const date = $(el).find(".event-date").text().trim();
        const image = $(el).find("img").attr("src");

        if (title) {
          finalEvents.push({
            source: "UnleashCB",
            title,
            link: link ? `https://www.unleashcb.com${link}` : "",
            date,
            dateObj: date ? new Date(date) : null,
            location: "",
            description: "",
            image: image ? `https://www.unleashcb.com${image}` : "",
          });
        }
      });
    } catch (err) {
      console.log("UnleashCB scraping failed", err);
    }

    // -------------------------------------------------------------------
    // SORT EVENTS BY DATE
    // -------------------------------------------------------------------
    finalEvents = finalEvents.filter(e => e.dateObj).sort((a, b) => a.dateObj - b.dateObj);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalEvents, null, 2),
    };

  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
