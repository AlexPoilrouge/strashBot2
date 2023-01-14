const PlayerManager= require('./player/playerDataManager');

const fs= require( 'fs' );
const path= require( 'path' );
const my_utils= require('../utils')
const { SlashCommandBuilder, ChannelType } = require("discord.js")

let hereLog= (...args) => {console.log("[playerModule]", ...args);};


let E_RetCode= my_utils.Enums.CmdRetCode

let playerDataManagers= {}



let fightersObj= undefined;

function __loadFightersObj(){
    var fn= path.resolve(__dirname,"./player/fighters.json")

    fightersObj= my_utils.fighterStuff.getFighters()
    if(!Boolean(fightersObj)){
        fightersObj= my_utils.fighterStuff.loadFighters(fn)
    }

    return fightersObj
}


async function S_S_CMD_player_tag(interaction, utils){
    let playerDataManager= playerDataManagers[interaction.guild.id]

    let nameOpt= interaction.options.getString('name') ?? ''
    let teamOpt= interaction.options.getString('team') ?? ''

    let isOnlyWhiteSpace= str => Boolean(str.match(/^\s*$/))

    nameOpt= isOnlyWhiteSpace(nameOpt)? interaction.user.username : nameOpt
    teamOpt= isOnlyWhiteSpace(teamOpt)? '' : teamOpt

    var n_ok= (await (playerDataManager.setPlayerName(interaction.user.id, nameOpt)));
    var t_ok= (await (playerDataManager.setPlayerTeam(interaction.user.id, teamOpt)));

    var post_chan_id= undefined;
    var post_chan= undefined;
    var old_msg_id= undefined;
    var old_msg= undefined;
    if(n_ok &&
        Boolean(post_chan_id=utils.settings.get(interaction.guild, "post_channel")) &&
        Boolean(post_chan=interaction.guild.channels.cache.get(post_chan_id)) &&
        Boolean(old_msg_id=(await (playerDataManager.getPlayerRosterMessage(interaction.user.id)))) &&
        Boolean(old_msg_id.match(/^[0-9]{8,32}$/))
    ){
        post_chan.messages.fetch(old_msg_id, false).then(msg => {
            if(Boolean(msg)){
                old_msg= msg;
            }
        }).catch(err => {
            hereLog(`[!player] Couldn't fetch message ${old_msg_id} - ${err}`);
        }).finally(() =>{
            if(Boolean(old_msg)){
                old_msg.edit(`${(t_ok && Boolean(teamOpt))?`[${teamOpt}] `:""}${nameOpt} (${interaction.user}):`).then(e_msg =>{
                    if(Boolean(e_msg)){
                        hereLog(`[!player] old message ${e_msg.id} edited`);
                    }
                }).catch(e_err =>{
                    hereLog(`[!player] couldn't edit old message ${e_msg.id} - ${e_err.message}`);
                })
            }
        })
    }

    if(n_ok){
        interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.SUCCESS)} `+
            `Your registered player tag: **${Boolean(teamOpt)?`[*${teamOpt}*] `:""}${nameOpt}**`
        )
    }
    else{
        interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.SUCCESS)} `+
            `Sorry, an error as occured…`
        )
    }
}

function processRosterFromInteraction(interaction){
    let noNum_rgx= /^\s*(.*\S)\s*$/
    let withNum_rgx= /^\s*(.*\S)\s+([0-9]+)\s*$/

    let getFighterObj= str => {
        if(!Boolean(str)) return undefined
        let m= undefined
        if(Boolean(m=str.match(withNum_rgx))){
            return {name: m[1], color: m[2]}
        }
        else if(Boolean(m=str.match(noNum_rgx))){
            return {name: m[1], color: "0"}
        }
        return {name: str, color: "0"}
    }

    let roster= []
    for(let i=1; i<=4; ++i){
        let fighter= getFighterObj(
            interaction.options.getString(`fighter${i}`)
        )

        if(Boolean(fighter)) roster.push(fighter)
    }

    return roster
}

async function _post_roster(player, channel, playerDataManager){
    var rosterPath= ( await (playerDataManager.getPlayerIconRosterPath(player.id)) )

    // hereLog(`rosterPath: ${rosterPath}`)
    if(Boolean(rosterPath)){
        if(!fs.existsSync(rosterPath)){
            return {
                status: E_RetCode.ERROR_INTERNAL,
                message: `Internal error - cannot generate/send player's (${player}) roster...`
            };
        }

        var tag= (await playerDataManager.getPlayerTag(player.id));

        channel.send( {
            content: `${(Boolean(tag))?`${(tag.team)?`[${tag.team}] `:""} ${tag.name} (${player})`:`${player}`}:`,
            files : [ rosterPath ]
        }).then(async msg => {
            fs.unlink(rosterPath, err => {
                if(err){
                    hereLog(`[cleaning gen imgs] png_file: ${err.message}`)
                }
            });

            var old_msg_id= (await playerDataManager.getPlayerRosterMessage(player.id));
            if(Boolean(old_msg_id) && Boolean(old_msg_id.match(/^[0-9]{8,32}$/))){
                channel.messages.fetch(old_msg_id, false).then(message => {
                    if(Boolean(message)){
                        message.delete()
                    }
                    else{
                        hereLog(`[set roster][post roster] for ${player} - didn't found old post to delete`) 
                    }
                }).catch(err =>{
                    if(Boolean(err)) hereLog(`[!roster] couldn't fetch message ${old_msg_id} - ${err.message}`);
                })
            }

            playerDataManager.setPlayerRosterMessage(player.id, msg.id)
        }).catch(err => {
            if(err){
                hereLog(`[roster send] couldn't send roster: ${err.message}`)
            }
        })

        return {
            status:  E_RetCode.SUCCESS
        }
    }
    else if(!( await (playerDataManager.playerHasRoster(playerID)) )){
        return {
            status:  E_RetCode.ERROR_REFUSAL,
            message: "You don't have any roster registered."
        }
    }
}

async function S_S_CMD_player_roster(interaction, utils){
    let playerDataManager= playerDataManagers[interaction.guild.id]

    let roster= processRosterFromInteraction(interaction)

    if(roster.length<=0){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Can't read your roster input…`
        )
        return
    }

    var res= (await (playerDataManager.setRosterByNameAndColor(interaction.user.id, roster)))
    if(!Boolean(res)){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `Error trying to setup your current roster…`
        )
        return
    }
    else{
        var post_chan_id= utils.settings.get(interaction.guild, "post_channel");
        var post_chan= undefined
        if(Boolean(post_chan_id) && Boolean(post_chan=interaction.guild.channels.cache.get(post_chan_id))){
            let post_res= await _post_roster(interaction.user, post_chan, playerDataManager)

            if(post_res.status!==E_RetCode.SUCCESS){
                interaction.editReply(
                    `${my_utils.emoji_retCode(post_res.status)} `+
                    `Erreur occured trying to register your new roster`+
                    (post_res.message?`:\n\t${post_res.message}`:"…")
                )

                return
            }
        }
        else{
            hereLog(`[set roster] for ${interaction.user} - didn't post: no post-channel`)
        }

        if(res.length===0){
            interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.SUCCESS)} `+
                `New roster registered:\n\t`+
                `${roster.map(f => `- ${f.name} (skin n°${f.color})`).join('\n\t')}`
            )
        }
        else{
            interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `Could not match following names with any fighter:\n\t`+
                `${res.map(f => `- ${f.name} (skin n°${f.color})`).join('\n\t')}`
            )
        }
    }
}

async function S_S_CMD_player_delete(interaction, utils){
    let playerDataManager= playerDataManagers[interaction.guild.id]

    let b_removedFromData= false
    let b_removedFromChannel= false

    if(await playerDataManager.playerExists(interaction.user.id)){
        b_removedFromData= await playerDataManager.removePlayer(interaction.user.id)
    }
    else{
        interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Your data wasn't found in database…`
        )

        return
    }

    let m_id= await playerDataManager.getPlayerRosterMessage(interaction.user.id)
    if(Boolean(m_id)){
        var post_chan_id= utils.settings.get(interaction.guild, "post_channel");
        var post_chan= undefined
        if(Boolean(post_chan_id) && Boolean(post_chan=interaction.guild.channels.cache.get(post_chan_id))){
            var old_msg_id= (await (playerDataManager.getPlayerRosterMessage(interaction.user.id)));
            if(Boolean(old_msg_id)){
                await post_chan.messages.fetch(old_msg_id, false).then(async message => {
                    if(Boolean(message)){
                        try{
                            await message.delete()
                            b_removedFromChannel= true
                        }
                        catch(err){
                            hereLog(`[deletePlayer] couldn't remove old roster message for player ${interaction.user}…`)
                        }
                    }
                    else{
                        hereLog(`[deletePlayer] for ${interaction.user} - didn't found old post to delete`) 
                    }
                }).catch(err =>{
                    if(Boolean(err)) hereLog(`[!roster] couldn't fetch message ${old_msg_id} - ${err.message}`);
                })
            }
        }
    }

    if(b_removedFromData){
        interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.SUCCESS)} `+
            `Your data has been removed from database`
        )
    }
    else{
        interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `Sorry, and error occured trying to remove your data…`
        )
    }
}

async function S_S_CMD_player_about(interaction, utils){
    let playerDataManager= playerDataManagers[interaction.guild.id]

    let targetUser= interaction.options.getUser('user') ?? interaction.user

    
    let playerTag= await playerDataManager.getPlayerTag(targetUser.id)
    let playerRosterMessage= await playerDataManager.getPlayerRosterMessage(targetUser.id)

    if(Boolean(playerTag)){
        // let channel= interaction.channel
        let targetMember= await interaction.guild.members.fetch(targetUser.id)
        // await interaction.deleteReply()
        
        let payload= {
            content: `***${targetMember.nickname}***'s player infos:\n`+
                    `> ${playerTag.team?`[*${playerTag.team}*] `:''}${playerTag.name}`
        }

        let rosterMessage= undefined
        let post_chan_id= utils.settings.get(interaction.guild, "post_channel");
        var post_chan= undefined
        var attach= undefined
        var img_attach= undefined
        if(Boolean(playerRosterMessage) &&
            // Boolean(rosterMessage=channel) &&
            Boolean(post_chan_id) &&
            Boolean(post_chan=interaction.guild.channels.cache.get(post_chan_id)) &&
            Boolean(rosterMessage= await post_chan.messages.fetch(playerRosterMessage)) &&
            Boolean(attach= rosterMessage.attachments) &&
            Boolean(img_attach= attach.first())
        ){
            // payload.content+= `\n\n${img_attach.url}`
            payload.files= [ img_attach ]
        }
        else{
            hereLog(`[about] Player's ${targetUser} roster message wasn't found in db…`)
            let numRoster= await playerDataManager.getPlayerRoster(targetUser.id)
            // hereLog(`==> ${JSON.stringify(numRoster)}`)
            if(Boolean(numRoster)){
                let rosterStr= '\n'
                for(let numCh of numRoster){
                    let t= numCh.split('.')
                    let skin_num= t[0]
                    let skin_color= t[1]??'0'

                    if(fightersObj){
                        let fighter= Object.values(fightersObj).find(
                            f => f.number===skin_num
                        )
                        if(Boolean(fighter)){
                            rosterStr+= `> \t- ${fighter.name} (skin n°${skin_color})\n`
                        }
                    }
                }
                payload.content+= rosterStr
            }
        }

        // channel.send(payload)
        interaction.editReply(payload)
    }
    else{
        interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `Error; couldn't find player's data in database`
        )
    }
}

async function S_S_CMD_player_setPost(interaction, utils){
    let channel= interaction.options.getChannel('channel') ?? interaction.channel

    utils.settings.set(interaction.guild, "post_channel", channel.id)

    interaction.editReply(
        `Roster post-channel set to ${channel}…`
    )
}

async function S_CMD__player(interaction, utils){
    await interaction.deferReply({ephemeral: true})

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='tag'){
        await S_S_CMD_player_tag(interaction, utils)
    }
    else if(subcommand==='roster'){
        await S_S_CMD_player_roster(interaction, utils)
    }
    else if(subcommand==='delete'){
        await S_S_CMD_player_delete(interaction, utils)
    }
    else if(subcommand==='about'){
        await S_S_CMD_player_about(interaction, utils)
    }
    else if(subcommand==='set-post'){
        await S_S_CMD_player_setPost(interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`tag\`, or \`roster\``
        )
    }
}

function __filterAC(list, input){
    let _input= input.toLowerCase()
    let rgx= /(.+\S)\s+[0-9]?$/
    let res= []
    for(let item of list){
        let _n= item.name.toLowerCase()
        let test= _input
        let m= test.match(rgx)
        if(Boolean(m)){
            test= m[1]
        }
        if(_n===test)
            return [ item ]
        if(_n.startsWith(_input)){
            res.push(item)
        }
    }

    return res
}

async function AC___player(interaction){
    var choices= []
    const focusedOption = interaction.options.getFocused(true);

    let txt= focusedOption.value.toLowerCase()

    if((!Boolean(fightersObj)) || txt.length<2 ||
        (!focusedOption.name.startsWith('fighter'))
    )
        return;

    choices= Object.keys(fightersObj).map( fk => {
            return {name: fightersObj[fk].name, value: fk}
        })
    choices= __filterAC(choices, txt)

    let l= choices.length
    if(l>0 && l<=3){
        let _choices= choices
        choices= []
        let _t= false
        for(let j=0; (j<l && !_t); j++){
            let ch= _choices[j]
            for(let i=0; i<=Math.ceil(7/l); ++i){
                let chObj= {
                    name: `${ch.name} ${i}`,
                    value: `${ch.value} ${i}` 
                }
                if (txt.startsWith(chObj.name.toLowerCase())){
                    _t= true
                    choices= [ chObj ]
                    break;
                }
                choices.push(chObj)
            }
        }
    }

    await interaction.respond(
        choices
    );
}


let playerSlash1= {
    data: new SlashCommandBuilder()
        .setName('player')
        .setDescription('Set your player data')
        .setDefaultMemberPermissions(0)
        .addSubcommand(subcommand =>
            subcommand
            .setName('tag')
            .setDescription("Set player's tag and team")
            .addStringOption(option => 
                option
                .setName('name')
                .setDescription("Your player name.")
                .setMaxLength(64)
                .setRequired(true)
            )
            .addStringOption(option => 
                option
                .setName('team')
                .setDescription("Your team's tag.")
                .setMaxLength(8)
            )
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('roster')
            .setDescription("Set your character roster")
            .addStringOption(option => 
                option
                .setName('fighter1')
                .setDescription("Your main + skin number i.e.:\"Mario 5\"")
                .setMaxLength(64)
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption(option => 
                option
                .setName('fighter2')
                .setDescription("Your second + skin number i.e.:\"Link 0\"")
                .setMaxLength(64)
                .setAutocomplete(true)
            )
            .addStringOption(option => 
                option
                .setName('fighter3')
                .setDescription("Your n°3 + skin number i.e.:\"Steve 7\"")
                .setMaxLength(64)
                .setAutocomplete(true)
            )
            .addStringOption(option => 
                option
                .setName('fighter4')
                .setDescription("Your n°4 + skin number i.e.:\"Kirby 1\"")
                .setMaxLength(64)
                .setAutocomplete(true)
            )
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('delete')
            .setDescription("Delete your player data")
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('about')
            .setDescription("Fetch data")
            .addUserOption(option =>
                option
                .setName('user')
                .setDescription("About anoth user")
            )
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('set-post')
            .setDescription("Where to post players rosters")
            .addChannelOption(option =>
                option
                .setName('channel')
                .setDescription("the channel (current one if not given)")
                .addChannelTypes(ChannelType.GuildText)
            )
        ),
    async execute(interaction, utils){
        try{
            await S_CMD__player(interaction, utils)
        }
        catch(err){
            hereLog(`[player] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }  
    },
    async autoComplete(interaction){
        try{
            await AC___player(interaction)
        }
        catch(err){
            hereLog(`[top8_autoComplete] Error! -\n\t${err}`)
        }
    }
}

function ogc_player(strashBotOldCmd, clearanceLvl, utils){
    let command= strashBotOldCmd.command;
    let message= strashBotOldCmd.msg_obj;

    message.channel.send(`'sup? So… *!commands* are deprecated. lol 🤣\n\n`+
        `Perhaps try a slash command like \`/${command}\`, see if something happens 🤷`
    )

    return E_RetCode.REFUSAL
}

async function init_perGuild(guild, utils){
    if(!Boolean(playerDataManagers[guild.id])){
        playerDataManagers[guild.id]= new PlayerManager.PlayerDataManager(utils.getDataBase(guild))
    }

    var post_chan_id= utils.settings.get(guild, 'post_channel');
    if(Boolean(post_chan_id) && !Boolean(guild.channels.cache.get(post_chan_id))){
        utils.settings.remove(guild, 'post_channel');
        playerDataManagers[guild.id].removeAllRosterMessages();
    }
    
    __loadFightersObj()
}

module.exports= {
    slash_builders: [
        playerSlash1
    ],
    oldGuildCommands: [
        {name: 'player', execute: ogc_player},
        {name: 'roster', execute: ogc_player}
    ],
    // events: {
    //     channelDelete: event_channelDelete,
    //     messageDelete: event_messageDelete,
    //     guildMemberRemove: event_guildMemberRemove
    // },
    help_msg: "",
    initPerGuild: init_perGuild,
    devOnly: true
}
