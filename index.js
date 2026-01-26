const {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} = require("discord.js");
const fs = require("fs");
const path = require("path");

// Função para carregar o token de forma segura
function loadToken() {
  let envVars = {};

  // 1. Prioridade máxima: env.txt (arquivo que você adicionou no deploy)
  const envPath = path.join(__dirname, "env.txt");
  if (fs.existsSync(envPath)) {
    console.log("env.txt encontrado e sendo carregado.");
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
    console.warn("env.txt não encontrado na raiz do projeto.");
  }

  // 2. Fallback: config.json
  const configPath = path.join(__dirname, "config.json");
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      console.log("config.json carregado com sucesso.");
    } catch (err) {
      console.error("Erro ao ler config.json:", err.message);
    }
  } else {
    console.warn("config.json não encontrado.");
  }

  // 3. Prioridade final: process.env (se Discloud carregar de algum jeito)
  const token = envVars.DISCORD_TOKEN || config.token || process.env.DISCORD_TOKEN || "";

  if (!token.trim()) {
    console.error(
      "ERRO: Token do Discord não encontrado!\n" +
      "- Verifique se env.txt está na raiz do projeto e tem a linha: DISCORD_TOKEN=SEU_TOKEN_REAL\n" +
      "- Ou preencha \"token\": \"SEU_TOKEN_AQUI\" no config.json (apenas local)\n" +
      "- Bot encerrando..."
    );
    process.exit(1);
  }

  console.log("Token carregado com sucesso (de env.txt, config.json ou env).");
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

// Registrar comandos
const rest = new REST({ version: "10" }).setToken(token);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(config.clientId), {
      body: commands.map((c) => c.toJSON()),
    });
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
  console.error("🔥 Uncaught Exception:", error.message, error.stack);
});

// clientReady
client.once("clientReady", async () => {
  console.log("🤖 Bot online!");

  client.guilds.cache.forEach((guild) => {
    const { verificarMembros } = require("./functions/verificarMembros.js");
    setInterval(() => verificarMembros(guild), 60 * 60 * 1000);
  });

  try {
    await updatePrices();
    console.log("Atualização inicial de preços concluída.");
  } catch (err) {
    console.error("Erro na atualização inicial de preços:", err);
  }
  setInterval(updatePrices, 12 * 60 * 60 * 1000);

  setInterval(() => {
    console.log("💓 Bot vivo:", new Date().toISOString());
  }, 30000);

  setInterval(() => {
    const used = process.memoryUsage();
    console.log(
      `Memória: RSS ${Math.round(used.rss / 1024 / 1024)}MB | Heap ${Math.round(
        used.heapUsed / 1024 / 1024
      )}MB`
    );
  }, 60000);

  killfeedService.startPolling(client);
});

// Login com o token carregado
client.login(token).catch((err) => {
  console.error("Falha ao logar no Discord:", err.message);
  process.exit(1);
});