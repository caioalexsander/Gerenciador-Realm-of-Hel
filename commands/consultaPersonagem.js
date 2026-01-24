const { SlashCommandBuilder } = require("discord.js");

const consultaPersonagem = new SlashCommandBuilder()
    .setName("consulta_personagem")
    .setDescription("Consulta informações de personagem(s) vinculado(s)")
    .addStringOption(opt => opt.setName("nome").setDescription("Nome exato do personagem").setRequired(false))
    .addUserOption(opt =>
        opt.setName("usuario")
            .setDescription("Mencione um usuário com personagem vinculado")
            .setRequired(false)
    );

const definirPrincipal = new SlashCommandBuilder()
    .setName("definir_principal")
    .setDescription("Define qual dos seus personagens vinculados será o principal (usado no nickname)")
    .addStringOption(option =>
        option
            .setName("personagem")
            .setDescription("Nome exato do personagem que será o principal")
            .setRequired(true)
            .setAutocomplete(true)
    );

const desvincular = new SlashCommandBuilder()
    .setName("desvincular")
    .setDescription("Remove um personagem vinculado da sua conta")
    .addStringOption(option =>
        option
            .setName("personagem")
            .setDescription("Nome exato do personagem a ser desvinculado")
            .setRequired(true)
            .setAutocomplete(true)
    );

const data = [consultaPersonagem, definirPrincipal, desvincular];

async function execute(interaction) {
    const { db } = require("../database/db.js");
    const { consultarPersonagem } = require("../services/albionApi.js");
    const { aplicarCargosParaMembro } = require("../functions/aplicarCargos.js");
    const axios = require("axios");
    const { StringSelectMenuBuilder, ActionRowBuilder } = require("discord.js");

    const commandName = interaction.commandName;

    if (commandName === "consulta_personagem") {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser("usuario") || interaction.user;
        const nomeForcado = interaction.options.getString("nome")?.trim();

        // Caso 1: Informou nome → consulta DIRETO na API (não precisa estar vinculado)
        if (nomeForcado) {
            try {
                // Busca o personagem pelo nome na API
                const searchRes = await axios.get(
                    `https://gameinfo.albiononline.com/api/gameinfo/search?q=${encodeURIComponent(nomeForcado)}`
                );

                const players = searchRes?.data?.players ?? [];
                if (!players.length) {
                    return interaction.editReply(`❌ Nenhum personagem chamado **"${nomeForcado}"** encontrado na API do Albion.`);
                }

                // Pega o match exato (case insensitive) ou o primeiro resultado
                const player = players.find(p => p.Name.toLowerCase() === nomeForcado.toLowerCase()) ?? players[0];

                // Agora pega os detalhes completos
                const { embed } = await consultarPersonagem(player.Id) || {};

                return interaction.editReply({
                    content: `Consulta direta: **${player.Name}** (não precisa estar vinculado)`,
                    embeds: embed ? [embed] : []
                });
            } catch (err) {
                console.error(err);
                return interaction.editReply("❌ Erro ao consultar a API do Albion. Tente novamente mais tarde.");
            }
        }

        // Caso 2: NÃO informou nome → comportamento normal (seus vínculos + menu)
        const links = db.prepare("SELECT player_id, player_name, is_principal FROM links WHERE discord_id = ? ORDER BY is_principal DESC")
            .all(targetUser.id);

        if (links.length === 0) {
            return interaction.editReply(`❌ Nenhum personagem vinculado encontrado para ${targetUser.tag}.`);
        }

        if (links.length === 1) {
            const { embed } = await consultarPersonagem(links[0].player_id) || {};
            return interaction.editReply({
                embeds: embed ? [embed] : [],
                content: embed ? null : "❌ Erro ao carregar dados"
            });
        }

        // Múltiplos → abre menu (já limitado a 23 opções)
        const MAX_OPCOES_PERSONAGENS = 23;

        let opcoesPersonagens = links.map(link => ({
            label: link.player_name + (link.is_principal ? " ★" : ""),
            value: `ver_${link.player_id}`,
            description: link.is_principal ? "Principal" : "Secundário"
        }));

        if (opcoesPersonagens.length > MAX_OPCOES_PERSONAGENS) {
            opcoesPersonagens = opcoesPersonagens.slice(0, MAX_OPCOES_PERSONAGENS);
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`sel_char_${targetUser.id}_${interaction.user.id}`)
            .setPlaceholder("Escolha um personagem para ver detalhes...")
            .addOptions([
                { label: "Ver todos (resumo)", value: "todos", emoji: "📊" },
                ...opcoesPersonagens
            ]);

        const row = new ActionRowBuilder().addComponents(menu);

        let contentMsg = `**${targetUser.tag}** possui **${links.length}** personagens vinculados.\nQual deseja consultar?`;

        if (links.length > MAX_OPCOES_PERSONAGENS + 1) {
            contentMsg += `\n\n⚠️ Mostrando apenas os primeiros ${MAX_OPCOES_PERSONAGENS}. Use o parâmetro "nome" para consultar qualquer personagem.`;
        }

        await interaction.editReply({
            content: contentMsg,
            components: [row]
        });
    }

    if (commandName === "definir_principal") {
        await interaction.deferReply({ ephemeral: true });

        const nomeEscolhido = interaction.options.getString("personagem").trim();

        const personagem = db.prepare("SELECT player_id, player_name FROM links WHERE discord_id = ? AND player_name = ?")
            .get(interaction.user.id, nomeEscolhido);

        if (!personagem) {
            return interaction.editReply("❌ Você não possui um personagem com esse nome vinculado.");
        }

        // Zera todos os principais
        db.prepare("UPDATE links SET is_principal = 0 WHERE discord_id = ?").run(interaction.user.id);
        // Define o novo
        db.prepare("UPDATE links SET is_principal = 1 WHERE discord_id = ? AND player_id = ?")
            .run(interaction.user.id, personagem.player_id);

        await interaction.editReply(`✅ **${personagem.player_name}** definido como personagem principal com sucesso!`);

        // Opcional: aplicar cargos/nickname imediatamente
        const regras = db.prepare("SELECT * FROM rules WHERE guild_id = ?").all(interaction.guild.id);
        await aplicarCargosParaMembro(interaction.member, regras, interaction.guild);
        interaction.followUp({ content: "Cargos e nickname atualizados!", ephemeral: true });
    }

    if (commandName === "desvincular") {
        await interaction.deferReply({ ephemeral: true });

        const nomeEscolhido = interaction.options.getString("personagem").trim();

        const personagem = db.prepare("SELECT player_id, player_name, is_principal FROM links WHERE discord_id = ? AND player_name = ?")
            .get(interaction.user.id, nomeEscolhido);

        if (!personagem) {
            return interaction.editReply("❌ Você não possui um personagem com esse nome vinculado.");
        }

        // Confirmação simples (pode melhorar com botão se quiser)
        if (personagem.is_principal === 1) {
            const confirmacao = await interaction.editReply({
                content: `⚠️ **${personagem.player_name}** é seu personagem principal. Tem certeza que deseja remover?`,
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("confirm_remover")
                            .setLabel("Sim, remover")
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId("cancelar")
                            .setLabel("Cancelar")
                            .setStyle(ButtonStyle.Secondary)
                    )
                ]
            });
            // A lógica do botão está em interactions/buttons.js
        } else {
            db.prepare("DELETE FROM links WHERE discord_id = ? AND player_id = ?")
                .run(interaction.user.id, personagem.player_id);

            await interaction.editReply(`🗑️ Personagem **${personagem.player_name}** desvinculado com sucesso.`);

            // Opcional: reaplicar cargos/nickname
            const regras = db.prepare("SELECT * FROM rules WHERE guild_id = ?").all(interaction.guild.id);
            await aplicarCargosParaMembro(interaction.member, regras, interaction.guild);
        }
    }
}

module.exports = { data, execute };