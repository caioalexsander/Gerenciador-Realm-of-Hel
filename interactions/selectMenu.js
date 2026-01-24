async function handle(interaction) {
    const { db } = require("../database/db.js");
    const { consultarPersonagem } = require("../services/albionApi.js");

    const parts = interaction.customId.split("_");
    if (parts[0] !== "sel" || parts[1] !== "char") return;

    const targetUserId = parts[2];   // ID do usuário consultado
    const requesterId = parts[3];    // ID de quem executou o comando

    // Segurança: só quem abriu o menu pode interagir
    if (interaction.user.id !== requesterId) {
        return interaction.reply({
            content: "❌ Este menu foi criado por outra pessoa e só ela pode usá-lo.",
            ephemeral: true
        });
    }

    await interaction.deferUpdate();

    const links = db.prepare("SELECT player_id, player_name, is_principal FROM links WHERE discord_id = ?")
        .all(targetUserId);

    const selected = interaction.values[0];

    if (selected === "todos") {
        const resumo = links.map(l => `• **${l.player_name}** ${l.is_principal ? "(★ principal)" : ""}`).join("\n");
        return interaction.editReply({ content: `**Personagens vinculados:**\n${resumo}`, components: [], embeds: [] });
    }

    if (selected.startsWith("ver_")) {
        const playerId = selected.slice(4);
        const { embed, player } = await consultarPersonagem(playerId) || {};
        return interaction.editReply({
            content: `Detalhes: **${player?.Name || "???"}**`,
            embeds: embed ? [embed] : [],
            components: []
        });
    }
}

module.exports = { handle };