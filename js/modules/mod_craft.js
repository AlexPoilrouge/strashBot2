const { SlashCommandBuilder, roleMention } = require("discord.js")

const fs= require( 'fs' );
const path= require('path')
const child_process= require("child_process");
const axios= require('axios');
const crypto= require('crypto')

const my_utils= require('../utils.js');


let hereLog= (...args) => {console.log("[craftModule]", ...args);};


let E_RetCode= my_utils.Enums.CmdRetCode


var craft_settings= undefined;

let tmp_allowlist_json_file= "data/allowlist.json.tmp"
const CRAFT_JSON="data/craft.json"

let CRAFT_PRIVILEGE= {
    Blocked: -1,
    Outsider: 0,
    Visitor: 1,
    Crafter: 2,
    Operator: 3,

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

        return String(ret).trim()==="active"
    }
    catch(err){
        return false
    }
}

let id_link_json_file="data/craft_id_link.json"

async function linkUserDiscordMinecraft(discordId, uuid){
    var idLink_obj= {}

    let fn_links= path.resolve(__dirname,id_link_json_file)

    if(fs.existsSync(fn_links)){
        idLink_obj = my_utils.loadJSONFile(fn_links)
    }

    if(Boolean(idLink_obj)){
        let previousUUIDlinkedToDiscordID= idLink_obj[discordId]
        if(previousUUIDlinkedToDiscordID===uuid){
            return {status: 'ok'}
        }
        
        var uuidAlreadyInUse= false
        for(var dID in idLink_obj){
            if(idLink_obj[dID]===uuid){
                uuidAlreadyInUse= true
                break
            }
        }
        if(uuidAlreadyInUse){
            throw {status: 'uuid_already_used'}
        }

        idLink_obj[discordId]= uuid
        if(my_utils.writeJSON(idLink_obj, fn_links)){
            return (Boolean(previousUUIDlinkedToDiscordID)) ?
                        {status: 'changed', previous_uuid: previousUUIDlinkedToDiscordID}
                    :   {status: 'ok'}
        }
        else{
            throw {status: 'error_write'}
        }
    }
    else throw {status: 'error_load'}
}

async function rmUserDiscordMinecraftLink(id){
    let fn_links= path.resolve(__dirname,id_link_json_file)

    if(!fs.existsSync(fn_links)){
        return {status: 'nothing_to_do'}
    }

    var idLink_obj = my_utils.loadJSONFile(fn_links)
    if(Boolean(idLink_obj)){
        if(id in idLink_obj){
            delete idLink_obj[id]
            if(my_utils.writeJSON(idLink_obj, fn_links))
                return {status: 'remove_discord_id', discord_id: id, uuid: idLink_obj[id]}
            else
                throw {status: 'error_write'}
        }

        var d_id= Object.keys(idLink_obj).find(k => idLink_obj[k]===id)
        if(Boolean(d_id)){
            delete idLink_obj[d_id]
            if(my_utils.writeJSON(idLink_obj, fn_links))
                return {status: 'remove_uuid', discord_id: d_id, uuid: id}
            else
                throw {status: 'error_write'}
        }
    }
    else throw {status: 'error_load'}
}

async function getLink(id){
    let fn_links= path.resolve(__dirname,id_link_json_file)

    if(!fs.existsSync(fn_links)){
        return {status: 'nothing'}
    }

    var idLink_obj = my_utils.loadJSONFile(fn_links)
    if(Boolean(idLink_obj)){
        let uuid= idLink_obj[id]
        if(uuid) return {status: 'found_discord_id', discord_id: id, uuid}

        let d_id= Object.keys(idLink_obj).find(k => idLink_obj[k]===id)
        if(d_id) return {status: 'found_uuid', discord_id: d_id, uuid: id}

        return {status: 'not_found'}
    }
    else throw {status: 'error_load'}
}


async function getCraftPrivilege(interaction, utils){
    var privileges= await utils.settings.safe.get(interaction.guild, "roles_privileges")
    if(privileges){
        var privMax= CRAFT_PRIVILEGE.Outsider;
        for(var status in privileges){
            let role_id= privileges[status]
            if(Boolean(interaction.member.roles.resolveId(role_id))){
                var priv= CRAFT_PRIVILEGE[status]
                privMax= (priv<CRAFT_PRIVILEGE.Outsider || priv>privMax)? privMax : priv
            }
        }
        return priv
    }

    return CRAFT_PRIVILEGE.Outsider;
}


function getMCUserInfo(user){
    let playerReq_addr= `${craft_settings.api.minecraft_player_url}/${user}`
    let profileReq_addr= `${craft_settings.api.minecraft_profile_url}/${user}`

    return axios.get(playerReq_addr).then(response => {
        let data= response.data
        if(data && Boolean(data.name)){
            return {player: {name: data.name, id: data.id}, result:"OK"}
        }
        hereLog(`[get MC User] Player not found (nodata)`)
        return {result:"NOT_FOUND"}
    }).catch(err =>{
        if(err.response && err.response.status===404){
            hereLog(`[get MC User] Player not found (404)`)
            return {result:"NOT_FOUND"}
        }
        else{
            return axios.get(profileReq_addr).then(response => {
                let data= response.data
                if(data && Boolean(data.name)){
                    return {player: {name: data.name, id: data.id}, result:"OK"}
                }
                hereLog(`[get MC User] Profile not found (nodata)`)
                return {result:"NOT_FOUND"}
            })
            .catch(err => {
                if(err.response && err.response.status===404){
                    hereLog(`[get MC User] Player not found (404)`)
                    return {result:"NOT_FOUND"}
                }
                else{
                    hereLog(`[get MC User] Error making http (${playerReq_addr}||${profileReq_addr}) request for \`${user}\` infos... ${err}`)
                    return {result:"ERROR"}
                }
            })
        }
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
    var isblocked= false
    try{ isblocked= await isDiscordMemberBlocked(interaction.member, utils)}
    catch(err){ isblocked= false;}

    if (isblocked){
        hereLog(`{cmd start} ye, ${interaction.member} is like block y'know`)
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `User access seems to be blocked…`
        )

        return;
    }

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
    var isblocked= false
    try{ isblocked= await isDiscordMemberBlocked(interaction.member, utils)}
    catch(err){ isblocked= false;}
            
    if(isblocked){
        hereLog(`{cmd ${cmdname}} ye, ${interaction.member} is like block y'know`)
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `User access seems to be blocked…`
        )

        return;
    }

    let force= (interaction.options.getBoolean('force') ?? false)

    var nb_players= 0
    try{
        var data= (await fetch_ServerInfo()).data;
        nb_players=
            (data && data.online)?
                (data.players? (data.players.online ?? 0) : 0)
            :   0
    }
    catch(err){
        hereLog(`[Stop] couldn't fetch players online from status api... ${err}`)
        nb_players= -1
    }

    var run_command= (nb_players<=0);
    if(!run_command && force){
        run_command= ((await getCraftPrivilege(interaction, utils))>=CRAFT_PRIVILEGE.Operator)
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
                (nb_players<0) ?
                        ( `There was a problem fetching server status. ` +
                         `As a security measure '${cmdname} is prohibited (new to use '*force*' option).` )
                    :   `Players seem to be playing (only ${cmdname} with '*force*' option can work).`
            );
        }
    }
}

async function isDiscordMemberBlocked(member, utils){
    var privileges= await utils.settings.safe.get(member.guild, 'roles_privileges')

    if(!Boolean(privileges)) throw {status: "NO_DATA", message:'unable to obtain provilege data'};

    return Boolean(privileges['Blocked']) && member.roles.cache.has(privileges['Blocked'])
}

async function discardRole(role, utils, status=undefined){
    var privileges= await utils.settings.safe.get(role.guild, 'roles_privileges')
    
    if(!Boolean(privileges)) return

    var delete_priv= []
    for(var p_name in privileges){
        if(privileges[p_name]===role.id){
            delete_priv.push(p_name)
        }
    }
    var delete_priv= (Boolean(status) && (status in CRAFT_PRIVILEGE)) ?
            [ status ]
        :   Object.keys(privileges).map(k => privileges[k]===role.id)

    if(delete_priv.length>0){
        for(var privilege of delete_priv){
            delete privileges[privilege]
        }
        await utils.settings.safe.set(role.guild, 'roles_privileges', privileges)

        role.guild.members.fetch(async members => {
            for(var member of members){
                if(member.roles.cache.has(role)){
                    for(var privilege of delete_priv){
                        if(CRAFT_PRIVILEGE[privilege]>CRAFT_PRIVILEGE.Outsider){
                            try{
                                await disallowID(member.id)
                            }
                            catch(err){
                                hereLog(`{roleDelete}(${role}) error trying to disallow ${member}… - ${err}`)
                            }
                        }
                    }
                }
            }
        }).catch(err => {
            hereLog(`{roleDelete}(${role}) couldn't fetch members for disallowing… - ${err}`)
        })
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

    var isblocked= false
    try{ isblocked= await isDiscordMemberBlocked(interaction.member, utils)}
    catch(err){ isblocked= false;}
    if(isblocked){
        hereLog(`{cmd join} ye, ${interaction.member} is like block y'know`)
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `User access seems to be blocked…`
        )
    }
    else if(Boolean(username)){
        let res= await getMCUserInfo(username)
        if(res.result==='OK'){
            if(allowUser(res.player.name, res.player.id)){
                var nb_players= undefined
                try{
                    var data= (await fetch_ServerInfo()).data;
                    nb_players=
                        (data && data.online)?
                            (data.players? (data.players.online ?? 0) : 0)
                        :   0
                }
                catch(err){ nb_players= undefined; }

                try{
                    var linkRes= await linkUserDiscordMinecraft(interaction.user.id, res.player.id)
                    //this means a user changed his uuid => remove old uuid from allowlist
                    if(linkRes && linkRes.status==='changed'){
                        try{
                            removeUUIDFromAllowList(linkRes.previous_uuid)
                        }
                        catch(err){
                            hereLog(`Couldn't remove ${username}'s old id from allowlist… - ${err}`)
                        }
                    }
                }
                catch(err){
                    hereLog(`[user_join] couldn't link user ${interaction.user} with uuid ${res.player.id}…\n`
                            +`${JSON.stringify(err)}`)
                    if (Boolean(err.status) && err.status==='uuid_already_used'){
                        await interaction.editReply(
                            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                            `Given UUID was already in use by another player…`
                        )
                    }
                    else{
                        await interaction.editReply(
                            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                            `Internal error`
                        )
                    }

                    return;
                }

                let restart_server= ( nb_players>=0 && isServerServiceActive() )
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.SUCCESS)} `+
                    `Added player ${res.player.name} (${res.player.id}) to allowed list.\n`+
                    (restart_server?`(trying server restart)`:`(won't be effective until server restart though)`)
                );
                if(restart_server){
                    try{
                        child_process.execSync(craft_settings.server_commands.restart, {timeout: 32000});
                    }
                    catch(err){
                        hereLog(`(allow > restart_cmd)Error while running *${cmdname}* server: ${err}`);
                    }
                }
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

    var serv_version= undefined
    try{
        serv_version= String(fs.readFileSync(craft_settings.files.version)).trim()
    }
    catch(err){
        hereLog(`[info_cmd] couldn't read Bedrock Server's version file or data - ${err}`)
        serv_version= undefined
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
                }, {
                    name: 'server version',
                    inline: true,
                    value: serv_version ?? 'unknown'
                }
            ]
        }]
    })
}

//lookupStr can be: discord id, mc uuid, or mc username
async function lookupData(lookupStr){
    var mcReqRes= undefined
    try{
        mcReqRes= await getMCUserInfo((Boolean(link_info))?link_info.uuid:lookupStr)
    }
    catch(err){
        hereLog(`[about_cmd](1) couldn't lookup MC data for '${lookupStr}'…`)
        mcReqRes= undefined
    }

    var lookup= lookupStr
    if (mcReqRes.result && mcReqRes.result==='OK'){
        lookup= mcReqRes.player.id
    }
    
    var link_info= undefined
    try{
        link_info= await getLink(lookup)
    }
    catch(err){
        hereLog(`[about_cmd] link look up failed - ${err}`)
        link_info= undefined
    }

    if(Boolean(link_info) &&
        ((!Boolean(link_info.status)) || !link_info.status.startsWith('found'))
    ){
        hereLog(`[about_cmd] no mc_link info found for '${lookupStr}'…`)
        link_info= undefined
    }


    if(Boolean(mcReqRes)  && mcReqRes.result==='OK'){
        if(Boolean(link_info)){
            link_info.minecraft_name= mcReqRes.player.name
        }
        else{
            link_info= {uuid: mcReqRes.player.id, minecraft_name: mcReqRes.player.name}
        }
    }
    else if(Boolean(link_info)){ //retry getMCUserInfo in case param lookupStr wasn't uuid nor playername
        try{
            mcReqRes= await getMCUserInfo(link_info.uuid)
        }
        catch(err){
            hereLog(`[about_cmd](2) couldn't lookup MC data for '${lookupStr}'…`)
            mcReqRes= undefined
        }
        link_info.minecraft_name= mcReqRes.player.name
    }

    return link_info;
}

async function S_S_CMD_craftServer_about(interaction, utils){
    let memberOpt= interaction.options.getMember('mention')
    let mcinfoOpt= interaction.options.getString('minecraft_id')

    let lookupStr= (Boolean(memberOpt))? memberOpt.id : mcinfoOpt
    var resInfoUserStrList= []

    let allowedData= my_utils.loadJSONFile(craft_settings.files.allowlist)

    let usrDataToStr= (data) => {
        if(!Boolean(data)) return `[${memberOpt}/${mcinfoOpt}] no data`;
        
        return  `${Boolean(data.minecraft_name)?`${data.minecraft_name} `:''}`+
                `${Boolean(data.uuid)?`{${data.uuid}}`:''}`+
                `${(Boolean(data.minecraft_name) || Boolean(data.uuid))?' => ':''}`+
                `<@${data.discord_id}>`;
    }
    if(Boolean(lookupStr)){
        var res= await lookupData(lookupStr)
        var resStr= usrDataToStr(res)

        if(Boolean(memberOpt)){
            var isblocked= false
            try{ isblocked= await isDiscordMemberBlocked(interaction.member, utils)}
            catch(err){ isblocked= false;}
            if(isblocked) resStr+= " [BLOCKED]"
        }
        if(Boolean(res) && Boolean(res.uuid) && Boolean(allowedData)
            && Boolean(allowedData.find(item => item.uuid===res.uuid))
        ){
            resStr+= " [ALLOWED]"
        }

        resInfoUserStrList.push(resStr)
    }
    else{
        for(var item of allowedData){
            if(Boolean(item && item.uuid)){
                resInfoUserStrList.push( usrDataToStr(
                    await lookupData(item.uuid)
                ))
            }
            else{
                resInfoUserStrList.push(JSON.stringify(item))
            }
        }
    }

    if(resInfoUserStrList.length>0){
        await interaction.editReply( {
            embeds: [
                {
                    title: "Registered users",
                    color: 0xf20a00,
        
                    fields: [ {
                        name: "about players",
                        value: '- '+resInfoUserStrList.join('\n- ')
                    }]

                }
            ]
        } )
    }
    else {
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `no data found…`
        )
    }
}

async function S_CMD__craftServer(interaction, utils) {
    await interaction.deferReply({ ephemeral: true })

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
    else if(subcommand==='about'){
        await S_S_CMD_craftServer_about(interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`start\`,\`stop\`,\`restart\`, or \`join\``
        )
    }
}

async function S_S_CMD__checkStatus(interaction, utils, role){
    let all= (role===undefined)

    let privileges= await utils.settings.safe.get(interaction.guild, "roles_privileges") ?? {}

    if(all) {
        let status= Object.keys(privileges)
        await interaction.editReply( {
            embeds: [{
                title: "Bedrock server Roles",
                color: 0xf2850f,

                fields: [
                    {
                        name: 'Roles status',
                        value:
                            ( (status && status.length>0) ?
                                status.map(k => `- **${k}** : <@&${privileges[k]}>`).join('\n')
                            :   "*No role has been set for any status yet…*" )
                    }
                ]
            }]
        } )
    }
    else{
        var status= undefined

        for(var k in privileges){
            if(privileges[k]===role.id){
                status= k
                break
            }
        }

        await interaction.editReply(
            status  ?   `Role ${role} is set to be as \`${status}\``
                    :   `Role ${role} isn't set as anything regarding the Minecraft stuff…`
        )
    }
}

async function recheckDiscardanceFromBlockedRole(blocked_role){
    var idLink_obj= {}

    let fn_links= path.resolve(__dirname,id_link_json_file)

    if(fs.existsSync(fn_links)){
        idLink_obj = my_utils.loadJSONFile(fn_links)
    }

    if(idLink_obj){
        var mustDissalowIDs= []
        for(var discordID in idLink_obj){
            var member= undefined;
            try{
                member= await blocked_role.guild.members.fetch(discordID)
            }
            catch(err){
                hereLog(`[rdfbr] error: couldn't find member with id ${discordID} - ${err}`)
                continue
            }
            if(member && blocked_role.members.has(member.id)){
                mustDissalowIDs.push(member.id)
            }
        }
        for(var id of mustDissalowIDs){
            try{
                await disallowID(id)
            }
            catch(err){
                hereLog(`[rdfbr] error trying to disallow member ${id} - ${err}`)
            }
        }
    }
}

async function S_S_CMD__roleManage(interaction, utils, role, status){
    let erase= (!Boolean(role))

    var privileges= await utils.settings.safe.get(interaction.guild, "roles_privileges") ?? {}
    if(!erase){ //set role
        let rewritten_role= privileges[status]

        privileges[status]= role.id

        await utils.settings.safe.set(interaction.guild, "roles_privileges", privileges)

        var msg= ""
        if(rewritten_role){
            try{
                let gone_role= await interaction.guild.roles.fetch(rewritten_role)
                await discardRole(gone_role, utils, status)
            }
            catch(err){
                hereLog(`[roleManage] error trying to discard replaced role ${role}… - ${err}`)
            }
            msg= `*${status}* role went from '<@&${rewritten_role}>' to ${role}!`
        }
        else{
            let rolePriv_lvl= CRAFT_PRIVILEGE[status]
            if(Boolean(rolePriv_lvl) && (rolePriv_lvl<=CRAFT_PRIVILEGE.Outsider)){
                try{
                    await recheckDiscardanceFromBlockedRole(role)
                }
                catch(err){
                    hereLog(`[roleManage] error checking on member with previous belonging to role ${role} - ${err}`)
                }
            }

            msg= `*${status}* role is now '${role}'!`
        }

        await interaction.editReply(`${my_utils.emoji_retCode(E_RetCode.SUCCESS)} ${msg}`)
    }
    else{
        if(privileges[status]){
            delete privileges[status]
            try{
                await discardRole(role, utils)
            }
            catch(err){
                hereLog(`[roleManage] error trying to discard deleted role ${role}… - ${err}`)
            }

            await utils.settings.safe.set(interaction.guild, "roles_privileges", privileges)
        }
        
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.SUCCESS)} `+
            `No role is no longer set as *${status}*…`
        )
    }
}

const initialization_vector = "OBVENroyauifM1g6"

async function S_S_CMD__updateServer(interaction, utils){
    let versionNumOption= interaction.options.getString('version_number')
    var keyPass= interaction.options.getString('key_pass')

    if(!Boolean(versionNumOption)){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Need a num ver…`
        );

        return;
    }

    var updateKey= craft_settings.update_key
    let uk_l= updateKey.length
    updateKey= (uk_l<32)? (updateKey+('0'.repeat(32-uk_l))) : (updateKey.substring(0,32))
    const cipher= crypto.createCipheriv('aes-256-cbc', Buffer.from(updateKey), Buffer.from(initialization_vector))
    let hourSalt= `${Math.floor(Date.now()/3600000)}`
    let textTest= hourSalt+versionNumOption
    let compareEncrypted= cipher.update(textTest, 'utf8', 'hex')
    compareEncrypted+= cipher.final('hex')
    let passed= (keyPass===compareEncrypted.toString())
    if (!passed){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `You shall not pass!`
        );
        return;
    }

    var b= false
    var code= 0
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.stop))?cmd:"false";
        var cmd= `${craft_settings.config_commands.server_update} "${versionNumOption}"`
        child_process.execSync(cmd, {timeout: 876000}).toString();
        b= true
    }
    catch(err){
        hereLog("Error while stopping server: "+err);
        b= false
        code= err.status
    }

    if(b){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.SUCCESS)} `+
            `Server updated`
        );
    }
    else{
        let statusStr = [
            "Unknown error",
            `Failed to download server v${versionNumOption}`,
            `Server installation failure`,
            `Update is blocked atm…`
        ]
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `${statusStr[code ?? 0]}`
        );
    }
}

async function allowID(id){
    try{
        let userData= await getLink(id)

        if(userData && userData.status && userData.status.startsWith("found")){
            let res= await getMCUserInfo(userData.uuid)
            if(res.result==='OK'){
                if(allowUser(res.player.name, res.player.id)){
                    hereLog(`[allowID] Allowed user ${JSON.stringify(res.player)} data for id ${id}…`)
                }
                else{
                    hereLog(`[allowID] Error trying to fetch user data for id ${id}… - ${JSON.stringify(res)}`)
                }
            }
            else{
                hereLog(`[allowID] Error trying to fetch MC user info for id ${id}…`)
            }
        }
        else{
            hereLog(`[allowID] Error trying to fetch user data for id ${id}…`)
        }
    }
    catch(err){
        hereLog(`[allowID] error allowing from id ${id}… - ${err}`)
        throw undefined;
    }
}

function removeUUIDFromAllowList(uuid){
    var data= undefined
    if(data=my_utils.loadJSONFile(craft_settings.files.allowlist)){
        if(Boolean(data) && Array.isArray(data)){
            data= data.filter(e => (e.uuid!==uuid))

            if(!call_rewriteAllowlist_json(data)){
                hereLog(`[rmUUIDFromAllowlist](${uuid}) couldn't update allowlist`);
                throw undefined
            }
            hereLog(`[rmUUIDFromAllowlist](${uuid}) removing access from '${craft_settings.files.allowlist}'`);

            return data;
        }
        else{
            hereLog(`[rmUUIDFromAllowlist](${uuid}) Error reading data from '${craft_settings.files.allowlist}' (${JSON.stringify(r)})`);
            throw undefined;
        }
    }
    else{
        hereLog(`[rmUUIDFromAllowlist](${uuid}) `)
    }
}

async function disallowID(id){ //from discord_user_id or uuid
    try{
        let userData= await getLink(id)

        if(userData && userData.status && userData.status.startsWith("found")){
            var data= undefined
            try{
                data= removeUUIDFromAllowList(userData.uuid)
            }
            catch(err){
                throw err
            }
            try{
                await rmUserDiscordMinecraftLink(id)
            }
            catch(err){
                hereLog(`[disallowID] error removing id links for ${id}… - ${JSON.stringify(err)}`)
                throw undefined;
            }

            return data
        }
        else{
            hereLog(`[disallowID] Error trying to fetch user data for id ${id}…`)
            throw undefined;
        }
    }
    catch(err){
        hereLog(`[disallowID] error disallowing from id ${id}… - ${err}`)
        throw undefined;
    }
}

async function S_CMD__craftAdmin(interaction, utils) {
    await interaction.deferReply({ ephemeral: true })

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='disallow'){
        let mcUserOption= interaction.options.getString('user')
        let discordUserOption= interaction.options.getMember('mention')

        var msg= ""
        if(discordUserOption){
            let r_priv= await utils.settings.safe.get(interaction.guild, "roles_privileges")
            var roleRemoval= false
            if(Boolean(r_priv)){
                for(let r_s of ['Visitor', 'Crafter']){
                    try{
                        await discordUserOption.roles.remove(r_priv[r_s])
                        roleRemoval= true
                        msg+= `Disallowing ${discordUserOption}`
                    }
                    catch(err){}
                }
            }
            if(!roleRemoval){
                try{
                    await disallowID(discordUserOption.id)
                    msg+= `Disallowing ${discordUserOption}`
                }
                catch(err){
                    hereLog(`[disallow cmd] failed to disallow from discord user ${discordUserOption} (no set roles)… - ${err}`)
                }
            }
        }
        if(mcUserOption){
            var mcUserInfo= undefined
            try{
                mcUserInfo= await getMCUserInfo(mcUserOption)
                if(mcUserInfo && mcUserInfo.result==='OK')
                    await disallowID(mcUserInfo.player.id)
                else
                    await disallowID(mcUserInfo)
                msg+= `Disallowing MC user '${mcUserOption}'`
            }
            catch(err){
                if(!mcUserInfo){
                    hereLog(`[disallow cmd] couldn't fetch mcUsr info for ${mcUserInfo}`)
                }
                else{
                    hereLog(`[disallow cmd] failed trying to disallow ${mcUserOption} (${JSON.stringify(mcUserInfo)})…`)
                }
            }
        }

        if(Boolean(msg)){
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.SUCCESS)} `+
                msg
            )
        }
        else{
            hereLog(`[disallow cmd] failure to disallow (${discordUserOption} - ${mcUserOption})`)
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `Couldn't find user amongst the registered users…`
            )
        }
    }
    else if(subcommand==='roles'){
        let roleOption= interaction.options.getRole('role')
        let statusOption= interaction.options.getString('status')

        if(statusOption==="status"){
            await S_S_CMD__checkStatus(interaction, utils)
        }
        else if(Object.keys(CRAFT_PRIVILEGE).includes(statusOption)){
            await S_S_CMD__roleManage(interaction, utils, roleOption, statusOption)
        }
        else{
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `Unrecognized option value ('${statusOption}'); must be amongst: `+
                `\`Operator\`, \`Blocked\`, \`Craft\`, or \`status\`…`
            )
        }
    }
    else if(subcommand=='update_server'){
        await S_S_CMD__updateServer(interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`roles\`, \`disallow\` or \`update_server\``
        )
    }
}

let craftSlash= {
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
            .setDescription("Info about Minecraft Bedrock server")   
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName("about")
            .setDescription('information about MC users')
            .addMentionableOption(option =>
                option
                .setName('mention')
                .setDescription('discord user')
            )
            .addStringOption(option =>
                option
                .setName('minecraft_id')
                .setDescription('minecraft user')
            )
        )
        .setDMPermission(false),
    async execute(interaction, utils){
        try{
            await S_CMD__craftServer(interaction, utils)
        }
        catch(err){
            hereLog(`[craft_server] Error! -\n\t${err} - ${err && err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }
    }
}

let craftAdminSlash= {
    data: new SlashCommandBuilder()
        .setName('craft_admin')
        .setDescription('Admin the Minecraft Bedrock Server')
        .setDefaultMemberPermissions(0)
        .addSubcommand(subcommand =>
            subcommand
            .setName("disallow")
            .setDescription("Block user from entering the server")
            .addStringOption(option =>
                option
                .setName('user')
                .setDescription('minecraft username or uuid')
            )
            .addUserOption(option =>
                option
                .setName('mention')
                .setDescription('discord user')    
            )
            // .addBooleanOption(option =>
            //     option
            //     .setName("force_reboot")
            //     .setDescription('Force server reboot after operation for immediate effect')
            // )
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('roles')
            .setDescription("Manage discord roles status")
            .addStringOption(option => 
                option
                .setName("status")
                .setDescription("The discord operator role")
                .addChoices(
                    { name: 'Operator', value: 'Operator' },
                    { name: 'Blocked', value: 'Blocked' },
                    //{ name: 'Crafter', value: 'Crafter'},
                    { name: 'Check status', value: 'status' }
                )
                .setRequired(true)
            )
            .addRoleOption(option =>
                option
                .setName("role")
                .setDescription("Role to which to give the status (clear if empty)")
            )
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('update_server')
            .setDescription("Update server to given version")
            .addStringOption(option =>
                option
                .setName("version_number")
                .setDescription("Number of new version (e.g.:1.20.71.01)") 
                .setRequired(true)
            )
            .addStringOption(option =>
                option
                .setName("key_pass")
                .setDescription("key password") 
                .setRequired(true)
            )
        )
        .setDMPermission(false),
    async execute(interaction, utils){
        try{
            await S_CMD__craftAdmin(interaction, utils)
        }
        catch(err){
            hereLog(`[craft_admin] Error! -\n\t${err} - ${err && err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }
    }
}

async function event_roleDelete(role, utils){
    try{
        await discardRole(role, utils)
    }
    catch{
        hereLog(`{roleDelete}(${role}) error trying to discard role… - ${err}`)
    }
}

async function event_memberUpdate(oldMember, newMember, utils){
    var privileges= await utils.settings.safe.get(newMember.guild, 'roles_privileges')
    
    if(!Boolean(privileges)) return

    var removedRolesId= oldMember.roles.cache.filter(role => (!newMember.roles.cache.has(role.id))).map(r=>r.id)
    var addedRolesId= newMember.roles.cache.filter(role => (!oldMember.roles.cache.has(role.id))).map(r=>r.id)

    var removedPrivileges= Object.keys(privileges).filter(priv => removedRolesId.includes(privileges[priv]))
    var addedPrivileges= Object.keys(privileges).filter(priv => addedRolesId.includes(privileges[priv]))
    var currentPrivileges= Object.keys(privileges).filter(priv => newMember.roles.cache.has(privileges[priv]))

    let isNowAllowed= Boolean(privileges['Blocked']) && removedPrivileges.includes(privileges['Blocked'])
                    &&  Boolean(currentPrivileges.find(priv => CRAFT_PRIVILEGE[priv]>CRAFT_PRIVILEGE.Outsider))
    let isNowDisallowed= (!isNowAllowed)
                        && (!Boolean(currentPrivileges.find(priv => CRAFT_PRIVILEGE[priv]>CRAFT_PRIVILEGE.Outsider)))
                        && (Boolean(removedPrivileges.find(priv => CRAFT_PRIVILEGE[priv]>CRAFT_PRIVILEGE.Outsider)))
    if(isNowDisallowed){
        hereLog(`{roleTest} isNowDisallowed (${oldMember} - ${newMember} - ${JSON.stringify(privileges)})`)
        try{
            await disallowID(newMember.id)
            alreadyDissalowed= true
        }
        catch(err){
            hereLog(`{memberRoleRemove} error trying to disallow ${newMember} (lost [${privileges}] privilege)… - ${err}`)
        }
    }
    else if(isNowAllowed){
        hereLog(`{roleTest} isNowAllowed (${oldMember} - ${newMember} - ${JSON.stringify(privileges)})`)
        try{
            await allowID(newMember.id)
        }
        catch(err){
            hereLog(`{memberRoleRemove} error trying to allow ${newMember} (lost [${privileges}] privilege)… - ${err}`)
        }
    }

    //unless 'Blocked' is added, we process privilege list to see
    // and try to allow user according to granted privileges
    if(!addedPrivileges.includes('Blocked')){
        hereLog(`{roleTest}  no block (${oldMember} - ${newMember} - ${JSON.stringify(privileges)})`)
        if(Boolean(addedPrivileges.find(priv => CRAFT_PRIVILEGE[priv]>CRAFT_PRIVILEGE.Outsider))){
            try{
                await allowID(newMember.id)
            }
            catch(err){
                hereLog(`{memberRoleAdd} error trying to allow ${member} (new ${privilege} privilege)… - ${err}`)
            }
        }
    }
    else{
        hereLog(`{roleTest}  is block (${oldMember} - ${newMember} - ${JSON.stringify(privileges)})`)
        try{
            await disallowID(newMember.id)
        }
        catch(err){
            hereLog(`{memberRoleAdd} error trying to disallow ${member} (got 'Blocked' privilege)… - ${err}`)
        }
    }
}

async function event_memberRemove(member, utils){
    let userData= undefined
    try{
        userData= await getLink(member.id)
    }
    catch(err){
        hereLog(`{memberRemove} error fetching data of ${member} - ${JSON.stringify(err)}`)
        userData= undefined
    }

    if(userData && userData.status.startsWith("found")){
        try{
            await disallowID(userData.uuid)
            hereLog(`{memberRemove} removing data for ${member}`)
        }
        catch(err){
            hereLog(`{memberRemove} error dissallowing ${member} from ${userData.uuid} - ${err}`)
        }
    }
}


function craft_init(utils){
    if(!Boolean(craft_settings=_loadCraftJSON())){
        hereLog("Not able to load 'craftkart.json' setting…");
        return
    }
}

async function init_perGuild(guild, utils){
    hereLog(`[craft_init]{${guild}} initializing…`)

    let privileges= utils.settings.safe.get(guild, "roles_privileges")
    if(privileges){
        let blocked_role= privileges['Blocked'];
        if(blocked_role){
            await recheckDiscardanceFromBlockedRole(blocked_role)
        }
    }
}

module.exports= {
    slash_builders: [
        craftSlash,
        craftAdminSlash
    ],
    events: {
        roleDelete: event_roleDelete,
        guildMemberUpdate: event_memberUpdate,
        guildMemberRemove: event_memberRemove
    },
    help_msg: "",
    init: craft_init,
    initPerGuild: init_perGuild,
    clearGuild: undefined,
    destroy: undefined,
    modMessage: undefined
}
