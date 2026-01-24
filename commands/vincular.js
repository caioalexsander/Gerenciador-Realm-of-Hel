const { SlashCommandBuilder } = require("discord.js");
const axios = require("axios");

const data = new SlashCommandBuilder()
    .setName("vincular")
    .setDescription("Vincula um personagem do Albion ao seu ID do Discord (permite múltiplos)")
    .addStringOption(option =>
        option
            .setName("personagem")
            .setDescription("Nome exato do personagem no Albion Online")
            .setRequired(true)
    );

async function execute(interaction) {
    // Defer imediatamente para ganhar tempo (máx 15 min)
    await interaction.deferReply({ ephemeral: false }); // ou true se quiser privado

    const { db } = require("../database/db.js");
    const { getLogChannel } = require("../database/db.js");

    const nome = interaction.options.getString("personagem").trim();

    try {
        // Função auxiliar com retry simples para 429
        const fetchWithRetry = async (url, maxRetries = 2, delayMs = 8000) => {
            for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
                try {
                    const response = await axios.get(url, { timeout: 10000 });
                    return response;
                } catch (err) {
                    if (err.response?.status === 429 && attempt <= maxRetries) {
                        const resetTime = err.response.headers['ratelimit-reset'];
                        const waitTime = resetTime ? (resetTime * 1000 - Date.now() + 1000) : delayMs;
                        console.warn(`Rate limit 429 detectado. Tentativa ${attempt}. Aguardando ${Math.round(waitTime/1000)}s`);
                        await new Promise(r => setTimeout(r, waitTime));
                        continue;
                    }
                    throw err;
                }
            }
        };

        const search = await fetchWithRetry(
            `https://gameinfo.albiononline.com/api/gameinfo/search?q=${encodeURIComponent(nome)}`
        );

        if (!search.data?.players?.length) {
            return interaction.editReply({ content: "❌ Personagem não encontrado na API do Albion." });
        }

        const player = search.data.players.find(p => p.Name.toLowerCase() === nome.toLowerCase()) || search.data.players[0];

        const jaVinculado = db.prepare("SELECT discord_id FROM links WHERE player_id = ?").get(player.Id);

        if (jaVinculado) {
            if (jaVinculado.discord_id === interaction.user.id) {
                return interaction.editReply({ content: `⚠️ O personagem **${player.Name}** já está vinculado à sua conta.` });
            } else {
                return interaction.editReply({ content: "❌ Este personagem já está vinculado a outra conta do Discord." });
            }
        }

        // Define como principal se for o primeiro personagem
        const isFirst = db.prepare("SELECT COUNT(*) as count FROM links WHERE discord_id = ?").get(interaction.user.id).count === 0;
        const isPrincipal = isFirst ? 1 : 0;

        db.prepare(
            "INSERT INTO links (discord_id, player_id, player_name, is_principal) VALUES (?,?,?,?)"
        ).run(interaction.user.id, player.Id, player.Name, isPrincipal);

        await interaction.editReply(`✅ Personagem **${player.Name}** vinculado com sucesso!${isPrincipal ? " (definido como principal)" : ""}\nUse \`/aplicar_cargos\` para atualizar cargos e nickname.`);

        const logChannel = await getLogChannel(interaction.guild);
        logChannel?.send(`🔗 ${interaction.user.tag} vinculou personagem: **${player.Name}** (ID: ${player.Id})`);

    } catch (error) {
        console.error(`Erro ao vincular personagem para ${interaction.user.tag}:`, error.message);

        let mensagemErro = "❌ Ocorreu um erro ao tentar vincular o personagem.";
        
        if (error.response?.status === 429) {
            mensagemErro += " A API do Albion está com limite de requisições (rate limit). Tente novamente em alguns minutos.";
        } else if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
            mensagemErro += " A requisição demorou muito (timeout). Tente novamente.";
        }

        await interaction.editReply({ content: mensagemErro });
    }
}

module.exports = { data, execute };