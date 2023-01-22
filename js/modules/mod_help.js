const { SlashCommandBuilder } = require("discord.js")

const my_utils= require('../utils.js')


let hereLog= (...args) => {console.log("[helpModule]", ...args);};


const help_page_url="https://strashbot.fr/docs/slash.html"


let helpSlash1= {
    data: new SlashCommandBuilder()
            .setName('help')
            .setDescription('get a bit of help and info about this bot'),
    async execute(interaction, utils){
        try{
            await interaction.reply({
                content: `For a bit of help and info, maybe check: ${help_page_url}`,
                ephemeral: true
            })
        }
        catch(err){
            hereLog(`[help] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }
    }
}

let E_RetCode= my_utils.Enums.CmdRetCode

function ogc_help(strashBotOldCmd, clearanceLvl, utils){
    try{
        let msg= strashBotOldCmd.msg_obj

        msg.reply("Just so you know, old style *!commands* are deprecated… 🤨\n"+
                `You're supposed to use slash commands now, for instance \`/help\`.\n\n`+
                `Anyway, you can look for help here: ${help_page_url}`)

        return E_RetCode.SUCCESS
    }
    catch(err){
        hereLog(`[help] Error! -\n\t${err} - ${err.message}`)

        return E_RetCode.ERROR_CRITICAL
    }
}

module.exports= {
    slash_builders: [
        helpSlash1
    ],
    oldGuildCommands: [
        {name: 'help', execute: ogc_help}
    ]
}
