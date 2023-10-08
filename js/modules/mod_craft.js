const { SlashCommandBuilder } = require("discord.js")

const fs= require( 'fs' );
const path= require('path')
const child_process= require("child_process");
const cron= require('node-cron');
const axios= require('axios');

const my_utils= require('../utils.js');
const { util } = require("config");


let hereLog= (...args) => {console.log("[craftModule]", ...args);};

var craft_settings= undefined;

let tmp_allowlist_json_file= "data/allowlist.json.tmp"
const CRAFT_JSON="data/craft.json"

let CRAFT_PRIVILEGE= {
    OUTSIDER: 0,
    VISITOR: 1,
    MEMBER: 2,
    OPERATOR: 3,

    ADMIN: 666
}


let _loadCraftJSON= () => my_utils.loadJSONFile(path.resolve(__dirname, CRAFT_JSON))

var lastPlayerStatus_data= undefined

async function fetchPlayerStatus(){
    var data= my_utils.loadJSONFile(path.resolve(__dirname, craft_settings.files.gamestatus))
    if(Boolean(data)){
        data.lastUpdate= Date.now()
        lastPlayerStatus_data= Object.assign({},data)

        return data
    }
    else
        throw {error: "failure reading playerStatus file"}
}

function fetch_ServerInfo(){
    let statsInfo_addr= `${craft_settings.api.bedrock_server_status_url}/${craft_settings.server.address}`

    return axios.get(statsInfo_addr)
}

function isServerServiceActive(){
    try{
        var ret=child_process.execSync(craft_settings.server_commands.is_active, {timeout: 32000});

        return ret==="active"
    }
    catch(err){
        return false
    }
}

function getCraftPrivileges(interaction, utils){
    return CRAFT_PRIVILEGE.MEMBER;
}


function getMCUserInfo(username){
    let playerReq_addr= `${craft_settings.api.minecraft_player_url}/${username}`

    return axios.get(playerReq_addr).then(async response => {
        let data= response.data
        if(data && Boolean(data.name)){
            return {player: data, result:"OK"}
        }
        hereLog(`[get MC User] Player not found (nodata)`)
        return {result:"NOT_FOUND"}
    }).catch(async err =>{
        if(err.response && err.response.status===404){
            hereLog(`[get MC User] Player not found (404)`)
            return {result:"NOT_FOUND"}
        }
        hereLog(`[get MC User] Error making http (${playerReq_addr}) request for \`${username}\` infos... ${err}`)
        return {result:"ERROR"}
    })
}

function call_rewriteAllowlist_json(allowedlist){
    var fn_allow= path.resolve(__dirname, tmp_allowlist_json_file)
    if(my_utils.writeJSON(allowedlist, fn_allow)){
        try{
            var cmd= `${craft_settings.config_commands.update_join} ${fn_allow}`
            child_process.execSync(cmd, {timeout: 32000});
            return true
        }
        catch(err){
            hereLog(`Error while updating allowlist (${craft_settings.files.allowedlist}): ${err}`);
            return false
        }
    }
    return false
}

function allowUser(name, uuid){
    var data= undefined
    if(data=my_utils.loadJSONFile(craft_settings.files.allowlist)){
        if(Boolean(data) && Array.isArray(data)){
            data= data.filter(e => (e.uuid!==uuid))
            data.push({name, uuid})

            if(!call_rewriteAllowlist_json(data)){
                hereLog(`[allowUser] couldn't update allowlist`);
                return undefined
            }

            return data;
        }
        else{
            hereLog(`[allowUser] Error reading data from '${craft_settings.files.allowlist}' (${JSON.stringify(r)})`);
            return undefined;
        }
    }
    else{
        hereLog(`[allowUser] Error reading data; ${craft_settings.files.allowlist} doesn't seem to exists…'`);
        return undefined;
    }
}


async function S_S_CMD_craftServer_Start(interaction, utils){
    var b= false
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.stop))?cmd:"false";
        var cmd= craft_settings.server_commands.start
        child_process.execSync(cmd, {timeout: 32000}).toString();
        b= true
    }
    catch(err){
        hereLog("Error while stopping server: "+err);
        b= false
    }

    if(b){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.SUCCESS)} `+
            `Server started`
        );
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `Failure to start server`
        );
    }
}

async function _runningCmdIfNoPlayer(interaction, utils, cmdname, cmd){
    let force= (interaction.options.getBoolean('force') ?? false)

    var nb_players= 0
    try{
        var data= (await fetch_ServerInfo()).data;
        nb_players= data.players.online
    }
    catch(err){
        hereLog(`[Stop] couldn't fetch players online from status api... ${err}`)
        nb_players= 0
    }

    var run_command= false;
    if(nb_players>0){
        run_command= true
    }
    else if(force){
        run_command= (getCraftPrivileges(interaction, utils)>=CRAFT_PRIVILEGE.OPERATOR)
    }

    if(run_command){
        var b= false
        try{
            child_process.execSync(cmd, {timeout: 32000}).toString();
            b= true
        }
        catch(err){
            hereLog(`Error while running *${cmdname}* server: ${err}`);
            b= false
        }

        if(b){
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.SUCCESS)} `+
                `Server ${cmdname}: OK`
            );
        }
        else{
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Failure when running server ${cmdname}`
            );
        }
    }
    else{
        if(force){
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.BAD_ROLE)} `+
                `You are not allowed to run *force* ${cmdname} (only operators).`
            );
        }
        else{
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                `Players seem to be playing (only ${cmdname} with '*force*' option can work).`
            );
        }
    }
}

async function S_S_CMD_craftServer_Stop(interaction, utils){
    await _runningCmdIfNoPlayer(interaction, utils, 'stop', craft_settings.server_commands.stop)
}

async function S_S_CMD_craftServer_Restart(interaction, utils){
    await _runningCmdIfNoPlayer(interaction, utils, 'restart', craft_settings.server_commands.restart)
}

async function S_S_CMD_craftServer_join(interaction, utils){
    let username= interaction.options.getString('username');

    if(Boolean(username)){
        let res= await getMCUserInfo(username)
        if(res.result==='OK'){
            if(allowUser(res.player.name, res.player.id)){
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.SUCCESS)} `+
                    `Added player ${res.player.name} (${res.player.id}) to allowed list.`
                );
            }
            else{
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Internal error`
                )
            }
        }
        else if(res.result==='NOT_FOUND'){
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `Username "${username}" not found…`
            )
        }
        else{
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Cannot identify username "${username}"`
            )
        }
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing or bad username (${username})`
        )
    }
}

async function S_S_CMD_craftServer_info(interaction, utils){
    let active= isServerServiceActive()

    var servInfo= undefined
    try{
        let response= await fetch_ServerInfo();
        servInfo= {}
        if(response && response.data){
            servInfo.online= response.data.online
            servInfo.players= response.data.players 
        }
        else{
            servInfo.online= false
        }
    }
    catch(err){
        hereLog(`[info_cmd] couldn't fetch info on api \`${craft_settings.api.bedrock_server_status_url}\`: ${err}`)
    }

    var playersStatus= undefined
    try{
        playersStatus= await fetchPlayerStatus();
    }
    catch(err){
        hereLog(`[info_cmd] couldn't fetch players status on file \`${craft_settings.files.gamestatus}\`: ${err}`)
    }

    await interaction.editReply( {
        embeds: [{
            title: "Bedrock server Status",
            color: 0xf28500,

            fields: [
                {
                    name: 'name:',
                    value: craft_settings.server.name
                },{
                    name: 'address:',
                    value: craft_settings.server.address
                },
                {
                    name: 'service',
                    value: `${active?"running":"inactive"}`
                }, {
                    name: 'server status',
                    value: servInfo?(servInfo.online?'online':'offline'):'offline'
                },{
                    name: 'connected players count',
                    value: servInfo?
                            (   servInfo.players?
                                    `${servInfo.players.online}/${servInfo.players.max}`
                                :   'unknown'
                            ):  '-'
                }, {
                    name: 'players',
                    inline: false,
                    value: playersStatus?
                            (   playersStatus.playerlist?
                                    ('-'+playersStatus.playerlist.map(e=>`*${e}*`).join('\n-'))
                                :   '-'
                            ):  '-'
                }
            ]
        }]
    })
}

async function S_CMD__craftServer(interaction, utils) {
    await interaction.deferReply()

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='start'){
        await S_S_CMD_craftServer_Start(interaction, utils)
    }
    else if(subcommand==='stop'){
        await S_S_CMD_craftServer_Stop(interaction, utils)
    }
    else if(subcommand==='restart'){
        await S_S_CMD_craftServer_Restart(interaction, utils)
    }
    else if(subcommand==='join'){
        await S_S_CMD_craftServer_join(interaction, utils)
    }
    else if(subcommand==="info"){
        await S_S_CMD_craftServer_info(interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`start\`,\`stop\`,\`restart\`, or \`join\``
        )
    }
}

let testSlash1= {
    data: new SlashCommandBuilder()
        .setName('craft')
        .setDescription('Stuff about the Minecraft Bedrock Server')
        .setDefaultMemberPermissions(0)
        .addSubcommand(subcommand =>
            subcommand
            .setName("start")
            .setDescription("Start the minecraft bedrock server")    
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName("stop")
            .setDescription("Stop the minecraft bedrock server")
            .addBooleanOption(option =>
                option
                .setName('force')
                .setDescription('Force, even if there are player currently playing on the server')
            ) 
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName("restart")
            .setDescription("Restart the minecraft bedrock server")
            .addBooleanOption(option =>
                option
                .setName('force')
                .setDescription('Force, even if there are player currently playing on the server')
            )  
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName("join")
            .setDescription("Add your minecraft player id to the player whitelist for the minecraft bedrock server")
            .addStringOption(option =>
                option
                .setName('username')
                .setDescription('minecraft username')
                .setRequired(true)
            )
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName("info")
            .setDescription("Info about Minecraft Bedrock server...")   
        )
        .setDMPermission(false),
    async execute(interaction, utils){
        try{
            await S_CMD__craftServer(interaction, utils)
        }
        catch(err){
            hereLog(`[craft_server] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }
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

function craft_init(utils){
    if(!Boolean(craft_settings=_loadCraftJSON())){
        hereLog("Not able to load 'craftkart.json' setting…");
        return
    }
}

function init_perGuild(guild, utils){
    hereLog(`indeed, init for ${guild}`)
}

module.exports= {
    slash_builders: [
        testSlash1
    ],
    events: {
        messageCreate: event_messageCreate,
        roleUpdate: undefined
    },
    help_msg: "",
    init: craft_init,
    initPerGuild: init_perGuild,
    clearGuild: undefined,
    destroy: undefined,
    modMessage: undefined,
    devOnly: true
}
