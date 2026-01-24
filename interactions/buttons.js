async function handle(interaction) {
    const { db } = require("../database/db.js");
    const { aplicarCargosParaMembro } = require("../functions/aplicarCargos.js");

    if (interaction.customId === "confirm_remover") {
        // Assumindo que o player_name ou id é passado de alguma forma (ex: armazenar em customId ou usar state)
        // Para simplificar, isso é placeholder - ajuste se precisar
        const personagem = { player_id: "ID_AQUI", player_name: "NOME_AQUI" }; // Pegue do contexto real

        db.prepare("DELETE FROM links WHERE discord_id = ? AND player_id = ?")
            .run(interaction.user.id, personagem.player_id);

        await interaction.update({ content: `🗑️ Personagem **${personagem.player_name}** desvinculado com sucesso.`, components: [] });

        // Reaplicar cargos/nickname
        const regras = db.prepare("SELECT * FROM rules WHERE guild_id = ?").all(interaction.guild.id);
        await aplicarCargosParaMembro(interaction.member, regras, interaction.guild);
    } else if (interaction.customId === "cancelar") {
        await interaction.update({ content: "Operação cancelada.", components: [] });
    }
}

module.exports = { handle };