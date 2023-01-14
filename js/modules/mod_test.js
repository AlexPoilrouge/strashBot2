const { SlashCommandBuilder } = require("discord.js")

const my_utils= require('../utils.js')


let hereLog= (...args) => {console.log("[testModule]", ...args);};



let testSlash1= {
    data: new SlashCommandBuilder()
            .setName('test')
            .setDescription('just a test'),
    async execute(interaction, utils){
        await interaction.reply('yep...')
    }
}

function event_messageCreate(utils){
    hereLog('yay new message!');
}

let E_RetCode= my_utils.Enums.CmdRetCode

function ogc_test(strashBotOldCmd, clearanceLvl, utils){
    hereLog("that's an old command style alright!")

    return E_RetCode.SUCCESS
}

function odm_sup(strashBotOldCmd, clearanceLvl, utils){
    hereLog("woha, old dm this is!")

    return E_RetCode.SUCCESS
}

function init(utils){
    hereLog("init yes")
}

function init_perGuild(guild, utils){
    hereLog(`indeed, init for ${guild}`)
}

module.exports= {
    slash_builders: [
        testSlash1
    ],
    oldGuildCommands: [
        {name: 'test', execute: ogc_test},
        {name: 'sup', execute: odm_sup, dm: true}
    ],
    events: {
        messageCreate: event_messageCreate,
        roleUpdate: undefined
    },
    help_msg: "",
    init: init,
    initPerGuild: init_perGuild,
    clearGuild: undefined,
    destroy: undefined,
    modMessage: undefined,
    devOnly: true
}
