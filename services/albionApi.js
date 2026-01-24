const axios = require("axios");

async function consultarPersonagem(playerId) {
    const res = await axios.get(`https://gameinfo.albiononline.com/api/gameinfo/players/${playerId}`).catch(() => null);
    if (!res?.data) return null;

    const player = res.data;
    const pve = player.LifetimeStatistics?.PvE?.Total || 0;
    const craft = player.LifetimeStatistics?.Crafting?.Total || 0;

    const g = player.LifetimeStatistics?.Gathering || {};
    const fiber = g.Fiber?.Total || 0;
    const hide = g.Hide?.Total || 0;
    const ore = g.Ore?.Total || 0;
    const rock = g.Rock?.Total || 0;
    const wood = g.Wood?.Total || 0;
    const fishing = g.Fishing?.Total || 0;
    const tracking = g.Tracking?.Total || 0;
    const gatheringTotal = fiber + hide + ore + rock + wood + fishing + tracking;

    const pvp = player.KillFame || 0;
    const total = pve + pvp + craft + gatheringTotal;

    // Histórico de Guild (PvP)
    let history = [];
    try {
        const ev = await axios.get("https://gameinfo.albiononline.com/api/gameinfo/events", { params: { playerId: player.Id, limit: 200 } });
        let last = null;
        for (const e of ev.data.reverse()) {
            const gName = e.Killer?.Id === player.Id ? e.Killer?.GuildName : e.Victim?.Id === player.Id ? e.Victim?.GuildName : null;
            if (gName && gName !== last && gName !== "None") {
                history.push({ guild: gName, time: e.TimeStamp });
                last = gName;
            }
        }
    } catch { }

    const embed = {
        color: 0xf2a900,
        title: `Consulta de Personagem`,
        description: `**${player.Name}**`,
        fields: [
            { name: "🏆 Fama Total", value: total.toLocaleString(), inline: true },
            { name: "⚔️ PvP", value: pvp.toLocaleString(), inline: true },
            { name: "🧟 PvE", value: pve.toLocaleString(), inline: true },
            { name: "🛠️ Crafting", value: craft.toLocaleString(), inline: true },
            { name: "🌾 Gathering", value: gatheringTotal.toLocaleString(), inline: true },
            {
                name: "📦 Gathering Detalhado",
                value: `🌿 Fibra: ${fiber.toLocaleString()}\n🐗 Couro: ${hide.toLocaleString()}\n🌊 Pesca: ${fishing.toLocaleString()}\n🐾 Rastreador: ${tracking.toLocaleString()}\n⛏️ Minério: ${ore.toLocaleString()}\n🪨 Pedra: ${rock.toLocaleString()}\n🌲 Madeira: ${wood.toLocaleString()}`,
            },
            { name: "🏰 Guild Atual", value: player.GuildName || "Sem guild", inline: true },
            { name: "🔗 Aliança", value: player.AllianceName || "Sem aliança", inline: true }
        ],
        footer: { text: "Dados oficiais da API Albion Online • Atualizado em " + new Date().toLocaleString() }
    };

    if (history.length) {
        embed.fields.push({
            name: "📜 Histórico de Guild (PvP)",
            value: history.slice(-5).reverse().map(h => `• ${h.guild}`).join("\n")
        });
    }

    return { embed, player };
}

module.exports = { consultarPersonagem };