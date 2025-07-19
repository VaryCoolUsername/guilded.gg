const { Client } = require("guilded.js");
const axios = require("axios");
const { Embed } = require("guilded.js");
require("./server");

const { JSONFile, Low } = require('lowdb');
const path = require('path');
const dbFile = path.join(__dirname, 'db.json'); 
const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

db.read();
db.data ||= { stockMessageIds: {} };
const stockMessageIds = db.data.stockMessageIds;

const client = new Client({ token: process.env.GUILDED_TOKEN });

const API_URL = "https://api.joshlei.com/v2/growagarden";
const STOCK_CHANNELS = [
  { serverId: "jBqzL9AE", channelId: "df5f4358-d57c-4cda-ba49-53f98270923f" },
  { serverId: "lvJDN9Wl", channelId: "c1fe848c-2a04-4603-8cbf-c5eb3eb15a26" },
];

function pad(n) {
  return n < 10 ? '0' + n : n;
}

async function updateStockMessage() {
  const { stockData, merchantStock } = await fetchStockData();
  const weather = await fetchWeatherData();
  const events = await fetchEventData();
  const restocks = calculateRestockTimes();

  const embed = new Embed()
    .setTitle("📦 Current Stock")
    .setColor(0x32343d)
    .setDescription(
      stockData +
      (merchantStock ? `\n\n**🛒 Traveling Merchant Stock:**\n${merchantStock}` : "") +
      `\n\n**🔁 Restock Timers:**\n` +
      `🌱 Seeds: ${restocks.seeds.countdown} (Last: ${restocks.seeds.timeSinceLastRestock})\n` +
      `🔧 Gear: ${restocks.gear.countdown} (Last: ${restocks.gear.timeSinceLastRestock})\n` +
      `🥚 Eggs: ${restocks.egg.countdown} (Last: ${restocks.egg.timeSinceLastRestock})\n` +
      `🎨 Cosmetic: ${restocks.cosmetic.countdown} (Last: ${restocks.cosmetic.timeSinceLastRestock})` +
      `\n\n**📅 Events:**\n` +
      `🛒 Traveling Merchant: ${restocks.event.countdown} (Last: ${restocks.event.timeSinceLastRestock})\n` +
      `🌙 Night Event: ${restocks.event.countdown} (Last: ${restocks.event.timeSinceLastRestock})` +
      `\n\n**☁ Weather:**\n` +
      weather
    )
    .setFooter("lildanlid © | Ex7d9Yvp");

  for (const { channelId } of STOCK_CHANNELS) {
    try {
      if (!stockMessageIds[channelId]) {
        const msg = await client.messages.send(channelId, { embeds: [embed] });
        stockMessageIds[channelId] = msg.id;
      } else {
        await client.messages.update(channelId, stockMessageIds[channelId], { embeds: [embed] });
      }
      await db.write();
    } catch (err) {
      console.error(`❌ Error updating stock message in channel ${channelId}:`, err.message);
    }
  }
}

client.on("ready", async () => {
  console.log("✅ Bot is online.");
  await updateStockMessage();
  setInterval(updateStockMessage, 1000);
});

client.on("messageCreate", async (msg) => {
  if (msg.authorId === client.user?.id) return;
  const isMonitored = STOCK_CHANNELS.some(c => c.serverId === msg.serverId);
  if (!isMonitored) return;

  if (msg.content === "!ping") {
    await msg.reply({ embeds: [{
      title: "🏓 Pong!",
      description: "Bot is online ✅",
      color: 0x32343d
    }] });
  }
});

client.login();
