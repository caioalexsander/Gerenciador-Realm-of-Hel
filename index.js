const {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} = require("discord.js");
const fs = require("fs");
const path = require("path");

// Carrega config.json de forma segura (global para usar em comandos)
let config = {};
try {
  const configPath = path.join(__dirname, "config.json");
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    console.log("config.json carregado com sucesso.");
  } else {
    console.warn("config.json não encontrado. Usando apenas variáveis de ambiente.");
  }
} catch (err) {
  console.error("Erro ao carregar config.json:", err.message);
  config = {}; // Continua sem crashar
}

// Função para carregar o token
function loadToken() {
  let envVars = {};

  // Prioridade 1: .env (arquivo que você adicionou)
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    console.log(".env encontrado e sendo carregado.");
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=").trim();
        if (key && value) {
          envVars[key.trim()] = value;
        }
      }
    });
  } else {
    console.warn(".env não encontrado.");
  }

  // Prioridade 2: config.json
  // Prioridade 3: process.env
  const token = envVars.DISCORD_TOKEN || config.token || process.env.DISCORD_TOKEN || "";

  if (!token.trim()) {
    console.error(
      "ERRO: Token do Discord não encontrado!\n" +
      "- Verifique .env na raiz com DISCORD_TOKEN=SEU_TOKEN\n" +
      "- Ou preencha \"token\" no config.json (apenas local)\n" +
      "Bot encerrando..."
    );
    process.exit(1);
  }

  console.log("Token carregado com sucesso.");
  return token;
}

const token = loadToken();

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

// Registrar comandos (com verificação de config.clientId)
const rest = new REST({ version: "10" }).setToken(token);
(async () => {
  try {
    const clientId = config.clientId || process.env.CLIENT_ID;
    if (!clientId) {
      throw new Error("clientId não encontrado no config.json nem em variável de ambiente CLIENT_ID");
    }

    await rest.put(Routes.applicationCommands(clientId), {
      body: commands.map((c) => c.toJSON()),
    });
    console.log("Comandos registrados com sucesso!");
  } catch (error) {
    console.error("Erro ao registrar comandos:", error.message);
    // Continua sem encerrar o bot
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

// Captura de erros globais
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("🔥 Uncaught Exception:", error.message, error.stack);
});

// clientReady
client.once("clientReady", async () => {
  console.log("🤖 Bot online!");

  client.guilds.cache.forEach((guild) => {
    const { verificarMembros } = require("./functions/verificarMembros.js");
    setInterval(() => verificarMembros(guild), 60 * 60 * 1000);
  });

  //try {
    //await updatePrices();
    //console.log("Atualização inicial de preços concluída.");
  //} catch (err) {
    //console.error("Erro na atualização inicial de preços:", err);
  //}
  setInterval(updatePrices, 12 * 60 * 60 * 1000);

  setInterval(() => {
    console.log("💓 Bot vivo:", new Date().toISOString());
  }, 30000);

  setInterval(() => {
    const used = process.memoryUsage();
    console.log(`Memória: RSS ${Math.round(used.rss / 1024 / 1024)}MB | Heap ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
  }, 60000);

  killfeedService.startPolling(client);
});

// Login
client.login(token).catch((err) => {
  console.error("Falha ao logar no Discord:", err.message);
  process.exit(1);
});