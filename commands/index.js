const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

// Importar comandos individuais
const vincularCommand = require("./vincular.js").data;
const aplicarCargosCommand = require("./aplicarCargos.js").data;
const regrasCommands = require("./regras.js").data; // Array de comandos
const consultaCommands = require("./consultaPersonagem.js").data; // Array
const killfeedCommand = require("./killfeed.js").data;
const craftCommands = require("./craft.js").data; // Array

module.exports = [
    vincularCommand,
    aplicarCargosCommand,
    ...regrasCommands,
    ...consultaCommands,
    killfeedCommand,
    ...craftCommands
];