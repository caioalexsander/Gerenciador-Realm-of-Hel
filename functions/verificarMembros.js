const { aplicarCargosParaMembro } = require("./aplicarCargos.js");
const { db, getLogChannel } = require("../database/db.js");

async function verificarMembros(guild) {
    const regras = db.prepare("SELECT * FROM rules WHERE guild_id = ?").all(guild.id);
    const logChannel = await getLogChannel(guild);

    const members = await guild.members.fetch();
    let processados = 0;

    for (const member of members.values()) {
        if (member.user.bot) continue;

        await aplicarCargosParaMembro(member, regras, guild);
        processados++;

        await new Promise(r => setTimeout(r, 400)); // Evita rate limit
    }

    logChannel?.send(`✅ Verificação completa: ${processados} membros processados.`);
}

module.exports = { verificarMembros };