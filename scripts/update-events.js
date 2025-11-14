const fs = require('fs-extra');
const path = require('path');

// Zapier will send JSON into this variable
const eventsRaw = process.env.ZAPIER_EVENTS || '[]';

async function run() {
  try {
    const events = JSON.parse(eventsRaw);

    const filePath = path.join(__dirname, '..', 'public', 'events.json');
    await fs.ensureFile(filePath);
    await fs.writeJson(filePath, events, { spaces: 2 });

    console.log(`✅ Updated events.json with ${events.length} events`);
  } catch (err) {
    console.error('❌ Error updating events.json', err);
    process.exit(1);
  }
}

run();
