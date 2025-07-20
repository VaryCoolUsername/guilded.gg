const { Client, Embed } = require("guilded.js");
const axios = require("axios");
require("dotenv").config();
require("./server");

const client = new Client({ token: process.env.GUILDED_TOKEN });

const ALLOWED_SERVER = "jBqzL9AE";
const STOCK_CHANNELS = [
  { serverId: ALLOWED_SERVER, channelId: "6baabfad-2f60-40ec-8657-fcba7b0aba2f" }
];
const NOTIFICATION_CHANNEL = { serverId: ALLOWED_SERVER, channelId: "ddf5f19e-0342-49a2-a226-c9db77c5342f" };
const LAST_SEEN_CHANNEL_ID = "d128f1cd-63bd-461d-adfc-47a7cebc03b3";
const CMDS = "673138fa-3085-4662-8cfc-2f06e031900e";

const stockMessageIds = {};
const timerMessageIds = {};
const lastSeenMessageId = {};
let lastNotificationTimestamp = 0;

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0 || seconds > 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function calculateRestockTimes() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  function getNext(interval) {
    const delta = now.getTime() - today.getTime();
    return today.getTime() + Math.ceil(delta / interval) * interval;
  }
  return {
    seeds: getNext(5 * 60 * 1000),
    gear:  getNext(5 * 60 * 1000),
    egg:   getNext(30 * 60 * 1000),
    cosmetic: getNext(4 * 3600 * 1000),
    merchant: getNext(4 * 3600 * 1000),
    night:    getNext(4 * 3600 * 1000),
    tranquil: getNext(60 * 60 * 1000)
  };
}

const SEEDS = ["Carrot","Strawberry","Blueberry","Tomato","Daffodil","Watermelon","Pumpkin","Apple","Bamboo","Coconut","Cactus","Dragon Fruit","Mango","Grape","Mushroom","Pepper","Cacao","Beanstalk","Ember lily","Sugar Apple","Burning Bud","Giant Pinecone"];
const GEARS = ["Watering Can","Trowel","Recall Wrench","Basic Sprinkler","Advanced Sprinkler","Medium Toy","Medium Treat","Godly Sprinkler","Magnifying Glass","Tanning Mirror","Master Sprinkler","Cleaning Spray","Favorite Tool","Harvest Tool","Friendship Pot","Levelup Lolipop"];
const EGGS = ["Common Egg","Common Summer Egg","Rare Summer Egg","Mythical Egg","Paradise Egg","Bug Egg"];
const EVENTS = ["Zen Seed Pack","Zen Egg","Hot Springs","Zen Sand","Tranquil Radar","Zenflare","Zen Crate","Soft Sunshine","Koi","Zen Gnome Crate","Spiked Mango","Pet Shard Tranquil"];

async function fetchLastSeen(item) {
  try {
    const apiName = item.replace(/ /g, "_");
    const { data } = await axios.get(`https://api.joshlei.com/v2/growagarden/info/${encodeURIComponent(apiName)}`);
    if (data.in_stock) return `• ${item} - x${data.quantity ?? "?"}`;
    if (data.last_seen) return `• ${item} - ${formatCountdown(Date.now() - data.last_seen * 1000)}`;
    return `• ${item} - unknown`;
  } catch {
    return `• ${item} - unknown`;
  }
}

async function updateLastSeen() {
  const embed = new Embed().setTitle('👀 Last Seen').setColor(0x32343d);
  const categories = [
    { title: "🌱 Seeds", items: SEEDS },
    { title: "🔧 Gears", items: GEARS },
    { title: "🥚 Eggs", items: EGGS },
    { title: "🌸 Events", items: EVENTS }
  ];
  for (const cat of categories) {
    const lines = await Promise.all(cat.items.map(fetchLastSeen));
    embed.addField(cat.title, lines.join("\n"));
  }
  if (!lastSeenMessageId[LAST_SEEN_CHANNEL_ID]) {
    const m = await client.messages.send(LAST_SEEN_CHANNEL_ID, { embeds: [embed] });
    lastSeenMessageId[LAST_SEEN_CHANNEL_ID] = m.id;
  } else {
    await client.messages.update(LAST_SEEN_CHANNEL_ID, lastSeenMessageId[LAST_SEEN_CHANNEL_ID], { embeds: [embed] });
  }
}

async function fetchStockData() {
  try {
    const { data } = await axios.get("https://api.joshlei.com/v2/growagarden/stock");
    const { seed_stock = [], gear_stock = [], egg_stock = [], cosmetic_stock = [], eventshop_stock = [], travelingmerchant_stock = [], notification = [] } = data;

    const fmt = (emoji, title, arr) => `**${emoji} ${title}**\n` + arr.map(i => `• ${i.display_name} - x${i.quantity ?? "?"}`).join("\n") + "\n\n";

    const merchant = travelingmerchant_stock.length
      ? `**🛒 Traveling Merchant**\nType: ${travelingmerchant_stock[0].merchantName}\n` + travelingmerchant_stock.map(i => `• ${i.display_name} - x${i.quantity ?? "?"}`).join("\n") + "\n\n"
      : '';

    const zen = eventshop_stock.length ? fmt('🌸','Zen Shop',eventshop_stock) : '';

    return { stockData: fmt('🌱','Seed Stock',seed_stock) + fmt('🔧','Gear Stock',gear_stock) + fmt('🥚','Egg Stock',egg_stock) + fmt('🎨','Cosmetic Stock',cosmetic_stock) + merchant + zen, notifications: notification };
  } catch (e) {
    console.error(e);
    return { stockData: 'Failed to load stock data.', notifications: [] };
  }
}

async function fetchWeatherAndEvents() {
  try {
    const { data } = await axios.get("https://api.joshlei.com/v2/growagarden/weather");
    const active = Array.isArray(data.weather) ? data.weather.filter(w => w.active) : [];
    if (!active.length) return 'No active weather or events.';
    const now = Date.now();
    return active.map(w => `• ${w.weather_name} - ${formatCountdown(w.end_duration_unix * 1000 - now)}`).join("\n");
  } catch (e) {
    console.error(e);
    return '';
  }
}

async function leaveIfNotAllowed(serverId) {
  if (serverId !== ALLOWED_SERVER) {
    try { await client.servers.leave(serverId); } catch {}
  }
}

async function updateStockMessage() {
  const { stockData, notifications } = await fetchStockData();
  const weather = await fetchWeatherAndEvents();
  const restocks = calculateRestockTimes();
  const now = Date.now();

  const stockEmbed = new Embed()
    .setTitle('📦 Current Stock')
    .setColor(0x32343d)
    .setDescription(stockData + (weather ? `**☁ Weather:**\n${weather}` : ''));

  for (const { channelId, serverId } of STOCK_CHANNELS) {
    await leaveIfNotAllowed(serverId);
    if (!stockMessageIds[channelId]) {
      const m = await client.messages.send(channelId, { embeds: [stockEmbed] });
      stockMessageIds[channelId] = m.id;
    } else {
      await client.messages.update(channelId, stockMessageIds[channelId], { embeds: [stockEmbed] });
    }
  }

  const restockLines = [
    '**⌛ Restock Timers:**',
    `🌱 Seeds:      ${formatCountdown(restocks.seeds - now)}`,
    `🔧 Gear:       ${formatCountdown(restocks.gear - now)}`,
    `🥚 Eggs:       ${formatCountdown(restocks.egg - now)}`,
    `🎨 Cosmetics:  ${formatCountdown(restocks.cosmetic - now)}`,
    `🛒 Merchant:   ${formatCountdown(restocks.merchant - now)}`,
    `🌕 Night Event: ${formatCountdown(restocks.night - now)}`,
    `☸ Tranquil:    ${formatCountdown(restocks.tranquil - now)}`
  ].join("\n");

  const timerEmbed = new Embed()
    .setTitle('⏱ Restocks Schedule')
    .setColor(0x32343d)
    .setDescription(restockLines);

  for (const { channelId, serverId } of STOCK_CHANNELS) {
    await leaveIfNotAllowed(serverId);
    if (!timerMessageIds[channelId]) {
      const m = await client.messages.send(channelId, { embeds: [timerEmbed] });
      timerMessageIds[channelId] = m.id;
    } else {
      await client.messages.update(channelId, timerMessageIds[channelId], { embeds: [timerEmbed] });
    }
  }

  const latest = notifications[0];
  if (latest && latest.timestamp > lastNotificationTimestamp) {
    lastNotificationTimestamp = latest.timestamp;
    const notif = new Embed()
      .setTitle('📢 Notification')
      .setDescription(latest.message)
      .setColor(0x32343d)
      .setFooter(`Sent: ${new Date(latest.timestamp).toLocaleString()}`);
    await leaveIfNotAllowed(NOTIFICATION_CHANNEL.serverId);
    await client.messages.send(NOTIFICATION_CHANNEL.channelId, { embeds: [notif] });
  }

  await updateLastSeen();
}

setInterval(updateStockMessage, 999);

client.on('ready', async () => {
  console.log('✅ Bot online');
  client.servers.cache.forEach(s => leaveIfNotAllowed(s.id));
  await updateStockMessage();
});

client.on('messageCreate', async msg => {
  if (msg.channelId === CMDS && msg.content === '!ping') {
    await client.messages.send(msg.channelId, '🏓 Pong!');
  }
});

client.on('serverJoined', async s => await leaveIfNotAllowed(s.id));

client.login();
