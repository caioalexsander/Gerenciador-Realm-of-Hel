const { SlashCommandBuilder } = require("discord.js");

const data = new SlashCommandBuilder()
    .setName("aplicar_cargos")
    .setDescription("Aplica cargos e nickname com base nos seus personagens vinculados e nas regras do servidor");

async function execute(interaction) {
    const { db } = require("../database/db.js");
    const { aplicarCargosParaMembro } = require("../functions/aplicarCargos.js");

    const regras = db.prepare("SELECT * FROM rules WHERE guild_id = ?").all(interaction.guild.id);
    await aplicarCargosParaMembro(interaction.member, regras, interaction.guild);
    interaction.reply({ content: "✅ Cargos e nickname atualizados!", ephemeral: true });
}

module.exports = { data, execute };