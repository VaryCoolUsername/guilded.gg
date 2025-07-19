const express = require("express");
const cors = require("cors");
const { Client } = require("guilded.js");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const BOT_CREATION_DATE = new Date("2025-07-16T00:00:00+12:00");
let botStatus = "offline";
let lastOnline = new Date(0);

const client = new Client({ token: process.env.GUILDED_TOKEN });

let connectedServers = new Set();
let activeServers = new Set();

client.on("ready", () => {
  console.log("✅ Bot is online.");
  botStatus = "online";
  lastOnline = new Date();
});

client.on("messageCreate", (msg) => {
  connectedServers.add(msg.serverId);
  activeServers.add(msg.serverId);
});

client.login();

setInterval(() => {
  if (client.readyTimestamp) {
    botStatus = "online";
    lastOnline = new Date();
  } else {
    botStatus = "offline";
  }
}, 30000);

app.get("/api/status", (req, res) => {
  const now = new Date();
  res.json({
    status: botStatus,
    lastOnline,
    uptime: process.uptime() * 1000, 
    creationDate: BOT_CREATION_DATE.toISOString(),
    servers: Array.from(connectedServers),
    activeServers: Array.from(activeServers),
    inviteLink: "https://www.guilded.gg/Grow-A-Garden-"
  });
});

app.get("/", (req, res) => {
  res.send("Grow A Garden Bot API is running.");
});

app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));
