const {
    Client,
    GatewayIntentBits,
    REST,
    Routes
} = require("discord.js");
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// Importar comandos
const commands = require("./commands/index.js");

// Importar interações
const interactionHandler = require("./interactions/index.js");

// Importar services
const killfeedService = require("./services/killfeedService.js");
const { updatePrices } = require('./services/priceUpdater');

// Registrar comandos globalmente
const rest = new REST({ version: "10" }).setToken(config.token);
(async () => {
    try {
        await rest.put(Routes.applicationCommands(config.clientId), { body: commands.map(c => c.toJSON()) });
        console.log("Comandos registrados com sucesso!");
    } catch (error) {
        console.error("Erro ao registrar comandos:", error);
    }
})();

// Evento interactionCreate
client.on("interactionCreate", async (interaction) => {
    await interactionHandler.handle(interaction);
});

// Evento ready
client.once("clientReady", () => {
    console.log("🤖 Bot online!");

    // Verificação periódica de membros em todos os guilds
    client.guilds.cache.forEach(guild => {
        const { verificarMembros } = require("./functions/verificarMembros.js");
        setInterval(() => verificarMembros(guild), 60 * 60 * 1000);
    });

    // Atualização de preços a cada 6h (de Itens)
    //const { updateItemPrices } = require("./services/craftingService.js");
    //const CACHE_DURATION = 6 * 60 * 60 * 1000;
    //setInterval(updateItemPrices, CACHE_DURATION);
	setInterval(updatePrices, 12 * 60 * 60 * 1000); // 12 horas

    // Iniciar polling do killfeed
    killfeedService.startPolling(client);
});

client.login(config.token);