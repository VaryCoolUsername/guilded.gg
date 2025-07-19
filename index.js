const { Client, Embed } = require("guilded.js");
const axios = require("axios");
require("dotenv").config();
require("./server");

const client = new Client({ token: process.env.GUILDED_TOKEN });

const STOCK_CHANNELS = [
  { serverId: "jBqzL9AE", channelId: "6baabfad-2f60-40ec-8657-fcba7b0aba2f" },
  { serverId: "R4mePLxl", channelId: "65d2e224-12b2-4141-bb63-7b9d1f7d1e56" },
  { serverId: "lvJDN9Wl", chaanelId: "95c3f877-ab1c-404e-8329-ac031e9e29db" },
];

const stockMessageIds = {};

function pad(n) {
  return n < 10 ? '0' + n : n;
}

function calculateRestockTimes() {
  const now = new Date();
  const timezone = 'America/New_York';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone
    });
  }

  function timeSince(timestamp) {
    const nowMs = Date.now();
    const diff = nowMs - timestamp;

    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  function getResetTimes(interval) {
    const timeSinceStartOfDay = now.getTime() - today.getTime();
    const lastReset = today.getTime() + Math.floor(timeSinceStartOfDay / interval) * interval;
    const nextReset = today.getTime() + Math.ceil(timeSinceStartOfDay / interval) * interval;
    return { lastReset, nextReset };
  }

  const eggInterval = 30 * 60 * 1000;
  const gearInterval = 5 * 60 * 1000;
  const cosmeticInterval = 4 * 3600 * 1000;
  const eventInterval = 4 * 3600 * 1000;

  const eggTimes = getResetTimes(eggInterval);
  const gearTimes = getResetTimes(gearInterval);
  const cosmeticTimes = getResetTimes(cosmeticInterval);
  const eventTimes = getResetTimes(eventInterval);

  const eggCountdownMs = eggTimes.nextReset - now.getTime();
  const gearCountdownMs = gearTimes.nextReset - now.getTime();
  const cosmeticCountdownMs = cosmeticTimes.nextReset - now.getTime();
  const eventCountdownMs = eventTimes.nextReset - now.getTime();

  return {
    egg: {
      countdown: `${pad(Math.floor(eggCountdownMs / 3.6e6))}h ${pad(Math.floor((eggCountdownMs % 3.6e6) / 6e4))}m ${pad(Math.floor((eggCountdownMs % 6e4) / 1000))}s`,
      LastRestock: formatTime(eggTimes.lastReset),
      timeSinceLastRestock: timeSince(eggTimes.lastReset)
    },
    gear: {
      countdown: `${pad(Math.floor(gearCountdownMs / 6e4))}m ${pad(Math.floor((gearCountdownMs % 6e4) / 1000))}s`,
      LastRestock: formatTime(gearTimes.lastReset),
      timeSinceLastRestock: timeSince(gearTimes.lastReset)
    },
    seeds: {
      countdown: `${pad(Math.floor(gearCountdownMs / 6e4))}m ${pad(Math.floor((gearCountdownMs % 6e4) / 1000))}s`,
      LastRestock: formatTime(gearTimes.lastReset),
      timeSinceLastRestock: timeSince(gearTimes.lastReset)
    },
    cosmetic: {
      countdown: `${pad(Math.floor(cosmeticCountdownMs / 3.6e6))}h ${pad(Math.floor((cosmeticCountdownMs % 3.6e6) / 6e4))}m ${pad(Math.floor((cosmeticCountdownMs % 6e4) / 1000))}s`,
      LastRestock: formatTime(cosmeticTimes.lastReset),
      timeSinceLastRestock: timeSince(cosmeticTimes.lastReset)
    },
    event: {
      countdown: `${pad(Math.floor(eventCountdownMs / 3.6e6))}h ${pad(Math.floor((eventCountdownMs % 3.6e6) / 6e4))}m ${pad(Math.floor((eventCountdownMs % 6e4) / 1000))}s`,
      LastRestock: formatTime(eventTimes.lastReset),
      timeSinceLastRestock: timeSince(eventTimes.lastReset)
    }
  };
}

async function fetchStockData() {
  try {
    const { data } = await axios.get("https://growagarden.gg/api/stock");
    const { gearStock = [], eggStock = [], seedsStock = [], cosmeticsStock = [], travelingMerchantStock = [] } = data;

    const format = (emoji, title, stock) =>
      `**${emoji} ${title}**\n` +
      stock.map(i => `- ${i.name} - x${i.value ?? "?"}`).join("\n") + "\n\n";

    const merchantStock = travelingMerchantStock.length
      ? format("🛒", "Traveling Merchant Stock", travelingMerchantStock)
      : null;

    return {
      stockData:
        format("🌱", "Seed Stock", seedsStock) +
        format("🔧", "Gear Stock", gearStock) +
        format("🥚", "Egg Stock", eggStock) +
        format("🎨", "Cosmetic Stock", cosmeticsStock) +
        (merchantStock ? merchantStock : ""),
    };
  } catch (err) {
    console.error("❌ Failed to fetch stock data:", err.message);
    return { stockData: "Failed to load stock data." };
  }
}

async function fetchWeatherAndEvents() {
  try {
    const { data } = await axios.get("https://api.joshlei.com/v2/growagarden/weather");

    const active = Array.isArray(data.weather)
      ? data.weather.filter(w => w.active)
      : [];

    if (active.length) {
      return active.map(w =>
        `- ${w.weather_name}: ${Math.floor(w.duration / 60)} minutes left`
      ).join("\n");
    } else {
      return "There are currently no active weather effects or events.";
    }
  } catch (err) {
    console.error("❌ Weather/Event API error:", err.message);
    return "";
  }
}

async function updateStockMessage() {
  const { stockData } = await fetchStockData();
  const weather = await fetchWeatherAndEvents();
  const restocks = calculateRestockTimes();

  const embed = new Embed()
    .setTitle("📦 Current Stock")
    .setColor(0x32343d)
    .setDescription(
      stockData +
      `**🔁 Restock Timers:**\n` +
      `🌱 Seeds: ${restocks.seeds.countdown} (Last: ${restocks.seeds.timeSinceLastRestock})\n` +
      `🔧 Gear: ${restocks.gear.countdown} (Last: ${restocks.gear.timeSinceLastRestock})\n` +
      `🥚 Eggs: ${restocks.egg.countdown} (Last: ${restocks.egg.timeSinceLastRestock})\n` +
      `🎨 Cosmetic: ${restocks.cosmetic.countdown} (Last: ${restocks.cosmetic.timeSinceLastRestock})\n` +
      `🛒 Merchant/Night: ${restocks.event.countdown} (Last: ${restocks.event.timeSinceLastRestock})` +
      (weather ? `\n\n**☁ Weather:**\n${weather}` : "")
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
    } catch (err) {
      console.error(`❌ Error updating stock message in channel ${channelId}:`, err.message);
    }
  }
}

client.on("messageCreate", async (msg) => {
  if (msg.authorId === client.user?.id) return;
  const isMonitored = STOCK_CHANNELS.some(c => c.serverId === msg.serverId);
  if (!isMonitored) return;

  if (msg.content === "!ping") {
    await client.messages.send(msg.channelId, "🏓 Bot is online ✅");
  }
});

client.on("ready", async () => {
  console.log("✅ Bot is online.");
  await updateStockMessage();
  setInterval(updateStockMessage, 999); 
});

client.login();
