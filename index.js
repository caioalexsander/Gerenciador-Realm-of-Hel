const {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// Importar comandos
const commands = require("./commands/index.js");

// Importar interações
const interactionHandler = require("./interactions/index.js");

// Importar services
const killfeedService = require("./services/killfeedService.js");
const { updatePrices } = require("./services/priceUpdater");

// Registrar comandos
const rest = new REST({ version: "10" }).setToken(config.token);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands.map(c => c.toJSON()) }
    );
    console.log("Comandos registrados com sucesso!");
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
})();

// Interactions
client.on("interactionCreate", async (interaction) => {
  try {
    await interactionHandler.handle(interaction);
  } catch (err) {
    console.error("❌ Erro em interactionCreate:", err);
  }
});

// 🔥 CAPTURA DE ERROS GLOBAIS
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("🔥 Uncaught Exception:", error);
});

// clientReady
client.once("clientReady", () => {
  console.log("🤖 Bot online!");

  client.guilds.cache.forEach(guild => {
    const { verificarMembros } = require("./functions/verificarMembros.js");
    setInterval(() => verificarMembros(guild), 60 * 60 * 1000);
  });

  setInterval(updatePrices, 12 * 60 * 60 * 1000);
  
  setInterval(() => {
  console.log("💓 Bot vivo:", new Date().toISOString());
}, 30000);


  killfeedService.startPolling(client);
});

client.login(config.token);
