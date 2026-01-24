const { getLogChannel } = require("../database/db.js");
const { db } = require("../database/db.js");
const axios = require("axios");

async function aplicarCargosParaMembro(member, regras, guild) {
    const logChannel = await getLogChannel(guild);
    const players = db.prepare("SELECT * FROM links WHERE discord_id = ?").all(member.id);

    const cargosAplicar = new Set();
    let tagParaUsar = null;

    if (players.length === 0) {
        for (const regra of regras) {
            const roles = db.prepare("SELECT role_id FROM rule_roles WHERE rule_id = ?").all(regra.id).map(r => r.role_id);
            for (const roleId of roles) {
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId).catch(() => { });
                    logChannel?.send(`❌ ${member.user.tag} sem vínculo → cargo removido: <@&${roleId}>`);
                }
            }
        }
        return;
    }

    for (const player of players) {
        const res = await axios.get(`https://gameinfo.albiononline.com/api/gameinfo/players/${player.player_id}`).catch(() => null);
        if (!res || !res.data) continue;

        const guildRegra = regras.find(r => r.type === "guild" && res.data.GuildId === r.albion_id);
        if (guildRegra) {
            const roles = db.prepare("SELECT role_id FROM rule_roles WHERE rule_id = ?").all(guildRegra.id).map(r => r.role_id);
            roles.forEach(r => cargosAplicar.add(r));
            if (!tagParaUsar) tagParaUsar = guildRegra.tag;
        }

        const allianceRegra = regras.find(r => r.type === "alliance" && res.data.AllianceId === r.albion_id);
        if (allianceRegra) {
            const roles = db.prepare("SELECT role_id FROM rule_roles WHERE rule_id = ?").all(allianceRegra.id).map(r => r.role_id);
            roles.forEach(r => cargosAplicar.add(r));
        }
    }

    const todosCargosRegra = new Set();
    regras.forEach(regra => {
        db.prepare("SELECT role_id FROM rule_roles WHERE rule_id = ?").all(regra.id).map(r => r.role_id).forEach(r => todosCargosRegra.add(r));
    });

    for (const roleId of todosCargosRegra) {
        if (member.roles.cache.has(roleId) && !cargosAplicar.has(roleId)) {
            await member.roles.remove(roleId).catch(() => { });
            logChannel?.send(`❌ Cargo removido de ${member.user.tag}: <@&${roleId}>`);
        }
    }

    for (const roleId of cargosAplicar) {
        if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId).catch(() => { });
            logChannel?.send(`✅ Cargo adicionado para ${member.user.tag}: <@&${roleId}>`);
        }
    }

    // Usar o personagem principal para nickname
    if (tagParaUsar && players.length > 0) {
        let principal = players.find(p => p.is_principal === 1);
        if (!principal) principal = players[0]; // Fallback se nenhum principal
        let novoNick = `${tagParaUsar} ${principal.player_name}`;
        if (novoNick.length > 32) novoNick = novoNick.substring(0, 32);
        if (member.nickname !== novoNick) {
            await member.setNickname(novoNick).catch(() => { });
            logChannel?.send(`📛 Nickname alterado: ${member.user.tag} → ${novoNick}`);
        }
    }
}

module.exports = { aplicarCargosParaMembro };