const {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} = require("discord.js");
const fs = require("fs");
const path = require("path");

// Carrega config.json de forma segura (com fallback se não existir ou inválido)
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

// Prioriza variável de ambiente (Discloud) > config.json
const token = process.env.DISCORD_TOKEN || config.token || "";

if (!token.trim()) {
  console.error(
    "ERRO: Token do Discord não definido!\n" +
    "1. Defina a variável de ambiente DISCORD_TOKEN no painel da Discloud (recomendado).\n" +
    "2. Ou preencha \"token\": \"SEU_TOKEN_AQUI\" no config.json (apenas para testes locais – NÃO commit!)\n" +
    "Bot encerrando..."
  );
  process.exit(1);
}

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

// 🔥 CAPTURA DE ERROS GLOBAIS (já estava, mantido e melhorado)
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("🔥 Uncaught Exception:", error.message, error.stack);
});

// clientReady
client.once("clientReady", async () => {
  console.log("🤖 Bot online!");

  // Verificação de membros em todos os guilds
  client.guilds.cache.forEach(guild => {
    const { verificarMembros } = require("./functions/verificarMembros.js");
    setInterval(() => verificarMembros(guild), 60 * 60 * 1000);
  });

  // Atualização de preços a cada 12h
  try {
    await updatePrices(); // Executa uma vez na inicialização (opcional, mas útil)
    console.log("Atualização inicial de preços concluída.");
  } catch (err) {
    console.error("Erro na atualização inicial de preços:", err);
  }
  setInterval(updatePrices, 12 * 60 * 60 * 1000);

  // Heartbeat (já estava)
  setInterval(() => {
    console.log("💓 Bot vivo:", new Date().toISOString());
  }, 30000);

  // Monitoramento de memória (já estava, mantido)
  setInterval(() => {
    const used = process.memoryUsage();
    console.log(`Memória: RSS ${Math.round(used.rss / 1024 / 1024)}MB | Heap ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
  }, 60000);

  // Inicia o killfeed
  killfeedService.startPolling(client);
});

// Login com token seguro
client.login(token).catch(err => {
  console.error("Falha ao logar no Discord:", err.message);
  process.exit(1);
});