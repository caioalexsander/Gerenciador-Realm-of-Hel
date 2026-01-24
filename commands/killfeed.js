const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

const data = new SlashCommandBuilder()
    .setName("killfeed")
    .setDescription("Configura o kill feed (PvP)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
        sub
            .setName("set")
            .setDescription("Define canal e configurações do kill feed")
            .addChannelOption(o => o.setName("canal").setDescription("Canal do feed").addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addIntegerOption(o => o.setName("min_value").setDescription("Valor mínimo em silver (default 1kk)").setRequired(false))
            .addStringOption(o => o.setName("filter").setDescription("Tipo de filtro").addChoices(
                { name: "Guild", value: "guild" },
                { name: "Alliance", value: "alliance" },
                { name: "Player", value: "player" },
                { name: "Global", value: "global" }
            ).setRequired(false))
            .addStringOption(o => o.setName("id").setDescription("ID da guild/alliance/player (obrigatório menos no global)").setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName("remove").setDescription("Desativa o kill feed neste servidor")
    )
    .addSubcommand(sub =>
        sub.setName("status").setDescription("Mostra configuração atual")
    );

async function execute(interaction) {
    const { db } = require("../database/db.js");

    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
        const canal = interaction.options.getChannel("canal");
        const minValue = interaction.options.getInteger("min_value") || 1000000;
        const filterType = interaction.options.getString("filter") || "guild";
        const filterId = interaction.options.getString("id");

        if (filterType !== "global" && !filterId) {
            return interaction.reply({ content: "❌ ID é obrigatório para filtros não globais.", ephemeral: true });
        }

        db.prepare(`
      INSERT OR REPLACE INTO killfeed_channels (guild_id, channel_id, min_value, filter_type, filter_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(interaction.guild.id, canal.id, minValue, filterType, filterId);

        interaction.reply(`✅ Kill feed configurado no canal ${canal.name} com min_value ${minValue} silver, filtro: ${filterType}${filterId ? ` (${filterId})` : ""}.`);
    }

    if (sub === "remove") {
        db.prepare("DELETE FROM killfeed_channels WHERE guild_id = ?").run(interaction.guild.id);
        interaction.reply("✅ Kill feed desativado neste servidor.");
    }

    if (sub === "status") {
        const cfg = db.prepare("SELECT * FROM killfeed_channels WHERE guild_id = ?").get(interaction.guild.id);
        if (!cfg) return interaction.reply("❌ Nenhum kill feed configurado.");

        interaction.reply(`**Status:** Canal: <#${cfg.channel_id}>, Min Value: ${cfg.min_value}, Filtro: ${cfg.filter_type}${cfg.filter_id ? ` (${cfg.filter_id})` : ""}`);
    }
}

module.exports = { data, execute };