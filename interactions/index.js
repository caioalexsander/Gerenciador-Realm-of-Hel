async function handle(interaction) {
    if (interaction.isChatInputCommand()) {
        // Delegar para o execute do comando correspondente
        const commandFiles = [
            require("../commands/vincular.js"),
            require("../commands/aplicarCargos.js"),
            require("../commands/regras.js"),
            require("../commands/consultaPersonagem.js"),
            require("../commands/killfeed.js"),
            require("../commands/craft.js")
        ];

        const command = commandFiles.find(cmd => interaction.commandName === cmd.data.name || (Array.isArray(cmd.data) && cmd.data.some(d => d.name === interaction.commandName)));
        if (command) await command.execute(interaction);
    } else if (interaction.isAutocomplete()) {
        require("./autocomplete.js").handle(interaction);
    } else if (interaction.isStringSelectMenu()) {
        require("./selectMenu.js").handle(interaction);
    } else if (interaction.isButton()) {
        require("./buttons.js").handle(interaction);
    }
}

module.exports = { handle };