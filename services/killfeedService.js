const { db } = require("../database/db.js");
const { calcularValorRealComDB, getAveragePriceAcrossCities } = require("../functions/calcularValor.js");
const { gerarImagemEquipamentos } = require("./imageService.js");
const axios = require('axios');

function startPolling(client) {
  setInterval(async () => {
    const configs = db.prepare("SELECT * FROM killfeed_channels").all();
    for (const cfg of configs) {
      try {
        const guild = client.guilds.cache.get(cfg.guild_id);
        if (!guild) continue;
        const channel = guild.channels.cache.get(cfg.channel_id);
        if (!channel?.isTextBased()) continue;

        let url = "https://gameinfo.albiononline.com/api/gameinfo/events?limit=51";
        if (cfg.filter_type === "player" && cfg.filter_id) {
          url = `https://gameinfo.albiononline.com/api/gameinfo/players/${cfg.filter_id}/events?limit=51`;
        }

        const { data: events = [] } = await axios.get(url, { timeout: 15000 });
        events.sort((a, b) => new Date(b.TimeStamp) - new Date(a.TimeStamp));

        let novos = 0;
        let ultimoId = cfg.last_event_id || 0;

        for (const ev of events.reverse()) {
          const eventId = ev.EventId;
          if (eventId <= ultimoId) continue;
          if (ev.Type !== "KILL") continue;

          const matches =
            cfg.filter_type === "global" ||
            (cfg.filter_type === "guild" &&
              (ev.Killer?.GuildId === cfg.filter_id ||
                ev.Victim?.GuildId === cfg.filter_id)) ||
            (cfg.filter_type === "alliance" &&
              (ev.Killer?.AllianceId === cfg.filter_id ||
                ev.Victim?.AllianceId === cfg.filter_id)) ||
            (cfg.filter_type === "player" &&
              (ev.Killer?.Id === cfg.filter_id || ev.Victim?.Id === cfg.filter_id));

          if (!matches) continue;
          if (!ev.Victim || !ev.Killer) continue;

          const category = (ev.Participants?.length || 0) >= 6 ? "ZvZ" : "Open World";

          // Equipamentos com proteção + inventário
          const victimEquipment = ev.Victim.Equipment || {};
          const killerEquipment = ev.Killer.Equipment || {};
          const allVictimItems = [
            ...Object.values(victimEquipment).filter(i => i && i.Type),
            ...(ev.Victim.Inventory || []).filter(i => i && i.Type)
          ];

          // Usa a nova função com preços médios do DB
          const valor = calcularValorRealComDB(allVictimItems); // ? Alterado aqui!

          if (valor < cfg.min_value) continue;

          let totalDano = 0;
          let danoKiller = 0;
          const participants = ev.Participants || [];
          participants.forEach(p => {
            const dmg = p.DamageDone || 0;
            totalDano += dmg;
            if (p.Id === ev.Killer?.Id) danoKiller = dmg;
          });

          const percentDano =
            totalDano > 0 ? ((danoKiller / totalDano) * 100).toFixed(1) : "0.0";

          const imagemBuffer = await gerarImagemEquipamentos({
            killerName: ev.Killer.Name,
            victimName: ev.Victim.Name,
            killerGuild: ev.Killer.GuildName,
            victimGuild: ev.Victim.GuildName,
            valor,
            time: new Date(ev.TimeStamp).toLocaleString("pt-BR"),
            victimEquipment,
            killerEquipment,
            inventory: ev.Victim.Inventory || []
          });

          const embed = {
            color: 0xe3b04b,
            author: { name: `${ev.Killer.Name} killed ${ev.Victim.Name}` },
            description: `**Dano do Killer:** ${percentDano}%\n**Valor estimado (média todas cidades):** ${valor.toLocaleString("pt-BR")} silver`,
            fields: [
              { name: "Categoria", value: category, inline: true },
              { name: "Zona", value: ev.Location?.Zone || "Desconhecida", inline: true },
              { name: "Guild Killer", value: ev.Killer.GuildName || "Sem guild", inline: true },
              { name: "Guild Vítima", value: ev.Victim.GuildName || "Sem guild", inline: true }
            ],
            timestamp: ev.TimeStamp,
            footer: { text: `Event ID: ${eventId}` },
            image: { url: "attachment://kill.png" }
          };

          await channel.send({
            embeds: [embed],
            files: [{ attachment: imagemBuffer, name: "kill.png" }]
          });

          novos++;
          ultimoId = Math.max(ultimoId, eventId);
        }

        if (novos > 0) {
          db.prepare("UPDATE killfeed_channels SET last_event_id = ? WHERE guild_id = ?")
            .run(ultimoId, cfg.guild_id);
        }
      } catch (err) {
        console.error(`Erro no killfeed (${cfg.guild_id}):`, err.message);
      }

      await new Promise(r => setTimeout(r, 8000));
    }
  }, 60000);
}

module.exports = { startPolling };