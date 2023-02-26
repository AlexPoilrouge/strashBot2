const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require("discord.js")

const fs= require( 'fs' );
const path= require('path')
const child_process= require("child_process");
const cron= require('node-cron');
const axios= require('axios');
const jwt= require("jsonwebtoken");
const fetch = require('node-fetch');
const {ActivityType}= require('discord.js');


const my_utils= require('../utils.js')


let hereLog= (...args) => {console.log("[Kart_Module]", ...args);};

var kart_settings= undefined;

var l_guilds= [];


const KART_JSON="data/kart.json"

function _loadKartJSON(){
    var fn= path.resolve(__dirname, KART_JSON)
    try{
        if(fs.existsSync(fn)){
            var data= fs.readFileSync(fn);

            var r= undefined;
            if(Boolean(data) && Boolean(r=JSON.parse(data))){
                return r;
            }
            else{
                hereLog(`[load_kart_json] Error reading data from '${KART_JSON}'`);
                return undefined;
            }
        }
        else{
            hereLog(`[load_kart_json] Error reading data; ${fn} doesn't seem to exists…'`);
            return undefined;
        }
    } catch(err){
        hereLog(`[load_kart_json] Critical erreur reading data from '${KART_JSON}'…\n\t${err}`)
        return undefined
    }
}


function __kartCmd(command){
    var ks= undefined, srv_cmd= undefined;
    return (Boolean(ks=kart_settings) && Boolean(command))?
                (Boolean(srv_cmd=ks.server_commands) && srv_cmd.through_ssh)?
                    Boolean(srv_cmd.server_ip) && Boolean(srv_cmd.distant_user)?
                        (`ssh ${srv_cmd.distant_user}@${srv_cmd.server_ip}`+
                            ((srv_cmd.server_port)?` -p ${srv_cmd.server_port}`:'')
                            + ` ${command}`
                        )
                    :       "false"
                :   command
            :   "false";
}

function _initAddonsConfig(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.init))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.init)
        child_process.execSync(cmd, {timeout: 32000});
        b= true;
    }
    catch(err){
        hereLog("Error while initializing addons: "+err);
        b= false;
    }
    return b;
}

function __clearScores(user=undefined){
    if(Boolean(kart_settings.config_commands.clear_score)){
        var cmd= __kartCmd(kart_settings.config_commands.clear_score)
        try{
            str=child_process.execSync(`${cmd}${(Boolean(user))?` ${user.id}`:''}`, {timeout: 16000}).toString();
        }
        catch(err){
            hereLog("[auto stop] error while clearing scores on autoStop: "+err.message);
            return false;
        }

        return (Boolean(str) && Boolean(str.match(/^(.*)SCORES?_CLEARED$/)))
    }
    else{
        return false;
    }
}

function _serverRunningStatus_API(){
    return new Promise( (resolve, reject) => {
        if (!Boolean(kart_settings)){
            hereLog(`[server status] bad config…`);
            reject("Bad info - couldn't access kart_settings…")
        }

        if(Boolean(kart_settings.api) && Boolean(kart_settings.api.host)){
            api_addr=`${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}${kart_settings.api.root}/service`
    
            axios.get(api_addr)
                .then(response => {
                    if( response.status===200 &&
                        Boolean(response.data) && Boolean(response.data.status)
                    ){
                        hereLog(`[server status] from ${kart_settings.api.root}/service: ${response.data.status.toUpperCase()}`)
                        resolve(response.data.status.toUpperCase());
                    }

                    resolve('UNAVAILABLE');
                }).catch(err => {
                    hereLog(`[server status] API ${api_addr} error - ${err}`)

                    resolve('UNAVAILABLE');
                });
        }
        else{
            hereLog(`[server status] bad api settings…`);
            reject("Bad api - no api set in settings…")
        }
    });
}

function _stopServer(force=false){
    var str=undefined
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.stop))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.stop)
        str=child_process.execSync(cmd+`${(force)?" FORCE":""}`, {timeout: 32000}).toString();
    }
    catch(err){
        hereLog("Error while stopping server: "+err);
        return "error";
    }
    
    return (Boolean(str))?str:"ok";
}


function _autoStopServer(utils){
    return _serverRunningStatus_API().then( r => {
        if(r==='UP'){
            __clearScores()

            hereLog("[auto stop] stopping server…");
            _stopServer(true);
            
            l_guilds.forEach( (g) =>{
                utils.settings.set(g, "auto_stop", true);
            });
        }
        else{
            hereLog("[auto stop] server already stopped…"); 
            l_guilds.forEach( (g) =>{
                utils.settings.set(g, "auto_stop", false);
            });
        }
    }).catch(e => {
        hereLog("[auto stop] server already stopped…"); 
        l_guilds.forEach( (g) =>{
            utils.settings.set(g, "auto_stop", false);
        });
    })
}

async function _isServerRunning(){
    return await _serverRunningStatus_API().then( r => {
        if(r==='UP'){
            return true
        }
        return false;
    }).catch(e => {
        return false
    })
}

function _startServer(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.start))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.start)
        child_process.execSync(cmd, {timeout: 32000});
        b= true;
    }
    catch(err){
        hereLog("Error while launching server: "+err);
        b= false;
    }
    return b;
}

function _autoStartServer(utils){
    var didAutoStop= l_guilds.some( (g) => {
        return Boolean(utils.settings.get(g, "auto_stop"))
    });
   
    return _serverRunningStatus_API().then( r => {
        if(r!=="UP" && didAutoStop){
            hereLog("[auto start] restarting server…");
            _startServer();
        }
    }).catch(e => {
        if(didAutoStop){
            hereLog("[auto start] restarting server…");
            _startServer();
        }
    }).finally(() => {
        l_guilds.forEach( (g) =>{
            utils.settings.set(g, "auto_stop", false);
        });
    })
}


function _askServInfos(address=undefined, port=undefined){
    var a= address, p= port;
    var m= undefined;
    if(Boolean(a) && Boolean(m=a.match(/(.*)\:([0-9]+)$/))){
        a= m[1];
        p= m[2];
    }
    var p= (Boolean(port) && Boolean(port.match(/^[0-9]+$/)))? port : p;

    var query=""
    if(Boolean(a))
        query+= `address=${a}`
    if(Boolean(p))
        query+= `${Boolean(query)?'&':''}port=${p}`
    query= (Boolean(query)?`?`:'')+query

    return new Promise( (resolve, reject) => {
        if (!Boolean(kart_settings)){
            hereLog(`[askServInfos] bad config…`);
            reject("Bad info - couldn't access kart_settings…")
        }

        if(Boolean(kart_settings.api) && Boolean(kart_settings.api.host)){
            ( ( Boolean(p) || Boolean(a))?
                    new Promise( (res, rej) => {rej("SKIP");} )
                :   _serverRunningStatus_API()
            )
                .catch(e => {
                    if (e==="SKIP") return { status: "SKIP" }
                    return { status: 'UNAVAILABLE' }
                })
                .then( service_res => {
                    let api_info_addr=`${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}${kart_settings.api.root}/info${query}`

                    if (service_res==='DOWN') resolve( {service_status: 'DOWN'} );
                    else {
                        hereLog(`[askServInfo] Asking API ${api_info_addr}…`);
                        axios.get(api_info_addr)
                            .then(response => {
                                if(response.status!=200){
                                    hereLog(`[askServInfo] API ${api_info_addr} bad response`);
                                    reject("Bad API response")
                                }

                                response.data.service_status= service_res

                                resolve(response.data)
                            }).catch(err => {
                                hereLog(`[askServInfo] API ${api_info_addr} error - ${err}`)
                                reject(`Error API /info - ${err}`)
                            });
                    }
                } )
                .catch(err => {
                    hereLog(`[askServInfo] API ${api_service_addr} error - ${err}`)
                    reject(`Error API /service - ${err}`)
                })
        }
        else{
            hereLog(`[askServInfos] bad api settings…`);
            reject("Bad api - no api set in settings…")
        }
    })
}

var _oldServInfos= undefined;

let PlayerNumSteps= [
    {   number: 4,
        message: "Looks like some guys wana race! 🏁",
        coolDownTime: 4*60*1000 //4 min
    },{ number: 8,
        message: "More people just joined the party! 🏎💨",
        coolDownTime: 4*60*1000 //4 min
    }, { number: 0,
        message: "Fun's over… Going back to sleep 🛌",
        comingFromTop: true
    }
]
let CheckTimeCycleInterval= 60*60*1000; //1 hour

var PlayerNumStepCheckInfos= {
    iterator: 0,
    lastNumOfPlayers: 0,
    lastCheckStartTimeStamp: 0,
    lastCheckStepTimeStamp: 0,
}
function __checkPlayerNumStep(numberOfPlayers){
    if(numberOfPlayers<0){
        PlayerNumStepCheckInfos= {
            iterator: 0,
            lastNumOfPlayers: 0,
            lastCheckStartTimeStamp: 0,
            lastCheckStepTimeStamp: 0,
        }

        return undefined;
    }

    let timeElapsed= Date.now()-PlayerNumStepCheckInfos.lastCheckStartTimeStamp;
    if(timeElapsed<CheckTimeCycleInterval) return undefined;

    if(PlayerNumStepCheckInfos.iterator===0 &&
        PlayerNumStepCheckInfos.lastCheckStepTimeStamp<=0
    ){  //allow for first step's coolDownTime to take effect
        PlayerNumStepCheckInfos.lastCheckStepTimeStamp= Date.now()
        return undefined;
    }

    var res= undefined;
    let timeStepElapsed= Date.now()-PlayerNumStepCheckInfos.lastCheckStepTimeStamp
    for(var i=PlayerNumStepCheckInfos.iterator; i<PlayerNumSteps.length; ++i){

        let testThreshold= PlayerNumSteps[i];
        if( ((  testThreshold.number>=PlayerNumStepCheckInfos.lastNumOfPlayers
                &&  (!Boolean(testThreshold.comingFromTop))
                &&  numberOfPlayers>=testThreshold.number
            ) || (
                testThreshold.comingFromTop
                &&  PlayerNumStepCheckInfos.iterator>0 //need to at least have crossed first threshold…
                &&  testThreshold.number<PlayerNumStepCheckInfos.lastNumOfPlayers
                && numberOfPlayers<=testThreshold.number
            )) && ( (!Boolean(testThreshold.coolDownTime)) || (testThreshold.coolDownTime<=timeStepElapsed) )
        ){
            PlayerNumStepCheckInfos.iterator= i+1;
            PlayerNumStepCheckInfos.lastCheckStepTimeStamp= Date.now()

            res= {number: testThreshold.number, message: testThreshold.message}
        }
    }
    PlayerNumStepCheckInfos.lastNumOfPlayers= numberOfPlayers;
    if(PlayerNumStepCheckInfos.iterator>=PlayerNumSteps.length){
        PlayerNumStepCheckInfos.iterator= 0;
        PlayerNumStepCheckInfos.lastCheckStepTimeStamp= 0
        PlayerNumStepCheckInfos.lastCheckStartTimeStamp= Date.now();
    }

    return res
}

let lastMessagesPerGuild= {}

function _checkServerStatus(utils){
    var bot= utils.getBotClient();

    _askServInfos().then(servInfo =>{
        if((!Boolean(servInfo.service_status)) || (servInfo.service_status!=='UP')){
            // hereLog(`SRB2Kart server service status is '${servInfo.service_status}'`);
            bot.user.setActivity('');
            __checkPlayerNumStep(-1)
        
            _oldServInfos= undefined;
        }
        else{
            if(!(Boolean(servInfo) && Boolean(servInfo.server) && servInfo.server.numberofplayer!==undefined)){
                throw "Fetched bad servinfo";
            }

            let numPlayer= servInfo.server.numberofplayer

            let infoStep= __checkPlayerNumStep(numPlayer);
            if(Boolean(infoStep)){
                bot.guilds.fetch().then(guilds => {
                    guilds.forEach(guild => {
                        post_status_channel_id= utils.settings.get(guild,"post_status_channel");

                        if(Boolean(post_status_channel_id)){
                            guild.fetch().then(g => {
                                g.channels.fetch(post_status_channel_id).then(post_channel => {
                                    let color= (infoStep.number>4) ?
                                                    0xff0000
                                                :   (infoStep.number>0) ?
                                                        0xffa500
                                                    :   0x666666
                                    var msg=lastMessagesPerGuild[guild.id]
                                    var msgContent= {
                                        embeds: [{
                                            color,
                                            title: `${numPlayer} playing`,
                                            fields: [{
                                                name: "StrashBot Karting",
                                                value: infoStep.message,
                                                inline: false
                                            }],
                                            footer: { text: 'strashbot.fr' }
                                        }]
                                    }

                                    ( (Boolean(msg)) ?
                                            msg.fetch().then(m => {return m.reply(msgContent)})
                                                .catch(err => {return post_channel.send(msgContent)})                                            
                                        :   post_channel.send(msgContent)
                                    ).then(message => {
                                        const channelSnowflake = message.channel.id;
                                        const messageSnowflake = message.id;

                                        lastMessagesPerGuild[guild.id]= (numPlayer>0)? message : undefined
                                        
                                        fs.appendFile(path.join(__dirname, 'numPlayerStatus_sendMessages.txt'), 
                                            `${channelSnowflake},${messageSnowflake}\n`,
                                            (err) => {
                                                if (err) hereLog(`Coundln't write ch;msg IDs to 'numPlayerStatus_sendMessages.txt''`);
                                            });
                                    });
                                }).catch(err => {
                                    hereLog(`Counldn't find post channel ${post_status_channel_id} in ${g} - ${err}`)
                                })
                            }).catch(err => {
                                hereLog(`Couldn't fetch guild ${guild} data - ${err}`)
                            })
                        }
                    })
                } ).catch(err => {
                    hereLog(`No guilds to this bot? - ${err}`)
                })
            }

            if( ( !Boolean(_oldServInfos) || !Boolean(_oldServInfos.server)) ||
                ( servInfo.server.numberofplayer !== _oldServInfos.server.numberofplayer )
            ){
                if(numPlayer>0){
                    hereLog(`Changes in srb2kart server status detected… (player count: ${numPlayer})`);
                    bot.user.setActivity('Hosting SRB2Kart Races', { type: ActivityType.Playing });
                }
                else{
                    hereLog(`Changes in srb2kart server status detected… (not enough player though)`);
                    bot.user.setActivity('');
                }

                _oldServInfos= servInfo;
            }
        }
    }).catch(err =>{
        bot.user.setActivity('');

        _oldServInfos= undefined;
        hereLog(`Error while checking status of SRB2Kart server… - ${err}`);
    })
}

var stop_job= undefined;
var start_job= undefined;
var status_job= undefined;

function kart_init(utils){
    if(!Boolean(kart_settings=_loadKartJSON())){
        hereLog("Not able to load 'kart.json' setting…");
        return
    }
    _initAddonsConfig();

    if(!Boolean(stop_job)){
        stop_job= cron.schedule('0 4 * * *', async () =>{
            hereLog("[schedule] 4 am: looking to stop srb2kart serv…");
            await _autoStopServer(utils);
        });
    }

    if(!Boolean(start_job)){
        start_job= cron.schedule('0 8 * * *', () =>{
            hereLog("[schedule] 8 am: looking to start srb2kart serv…");
            _autoStartServer(utils)
        });
    }

    if(!Boolean(status_job)){
        status_job= cron.schedule('*/1 * * * *', () =>{
            _checkServerStatus(utils)
        });
    }

    hereLog("initialiazing all the stuff 🏁")
}


var clean_jobs= []
function kart_init_per_guild(guild, utils){
    

    if( (!Boolean(utils.settings.get(guild,"post_status_channel")))
        &&  !Boolean(clean_jobs.find(gj => gj.id===guild.id))
    ){
        let clean_job= cron.schedule('0 6 * * *', async () => {
            // Read the channel and message snowflakes from the file
            const messageSnowflakes = fs.readFileSync(path.join(__dirname, 'numPlayerStatus_sendMessages.txt'), 'utf-8').split('\n');
            
            // Iterate over each line in the file and delete the corresponding message
            for (const line of messageSnowflakes) {
              if (line.trim() !== '') {
                const [channelSnowflake, messageSnowflake] = line.split(',');
                
                try {
                    const channel = await guild.channels.fetch(channelSnowflake);
                    await channel.messages.delete(messageSnowflake);
                    hereLog(`(clean_job){${guild}} Deleted message ${messageSnowflake} in channel ${channelSnowflake}`);
                } catch (error) {
                    hereLog(`(clean_job){${guild}} failed delete of ${messageSnowflake} in channel ${channelSnowflake}`,
                            error
                    );
                }
              }
            }
            
            // Clear the file
            fs.writeFile(path.join(__dirname, 'numPlayerStatus_sendMessages.txt'), '', (err) => {
                if (err)
                    hereLog(`(clean_job){${guild}} couldn't clear file 'numPlayerStatus_sendMessages.txt' `,
                        err
                    );
            });
        });

        clean_jobs.push({id: guild.id, job: clean_job})
    }
}

async function S_CMD__kartInfo(interaction, utils){
    await interaction.deferReply();
    
    var embed= {}
    embed.title= "Strashbot server";
    embed.color= 0xff0000 //that's red (i hope? this rgba, right?)

    return await _askServInfos().then(async serverInfos => {
        embed.fields=[];

        if(Boolean(serverInfos.service_status) && serverInfos.service_status==="DOWN"){
            embed.color= 0x808080
            embed.fields=[]
            embed.fields.push({
                name: "Strashbot server",
                value: "Le serveur semble inactif…",
                inline: false
            })
            embed.thumbnail= {
                url: 'http://strashbot.fr/img/server/inactive_thumb.png'
            }
        }
        else if(Boolean(serverInfos)){
            var ss= serverInfos.server
            if(Boolean(ss) && Boolean(ss.servername)
                && ss.servername.length>0
            ){
                embed.title= `${ss.servername}`
            }
            if(Boolean(ss) && Boolean(ss.application)
                && ss.application.length>0
            ){
                embed.footer= {
                    text:
                        `---\n${ss.application}` +
                        `${(Boolean(ss.version) && Boolean(ss.subversion))?
                            ` v${ss.version}.${ss.subversion}`
                        :   ''
                        }`
                }
            }

            if(Boolean(serverInfos) && Boolean(serverInfos.thumbnail)){
                embed.thumbnail= {
                    url: serverInfos.thumbnail
                }
            }

            if(Boolean(serverInfos) && Boolean(serverInfos.address)){
                embed.fields.push({
                    name: 'Adresse de connexion',
                    value: `\`${serverInfos.address}\``,
                    inline: true
                })
            }

            embed.fields.push({
                name: 'Map',
                value:
                    `${Boolean(ss)?
                        `${ss.mapname} - *${ss.maptitle}*`
                    :   'erreur'
                    }`,
                inline: true
            })
            embed.fields.push({
                name: "Population",
                value:
                    `${Boolean(ss)?
                        `${ss.numberofplayer} / ${ss.maxplayer}`
                    :   'erreur'
                    }`,
                inline: true
            })

            if(Boolean(ss) && [2,3].includes(ss.gametype)){
                embed.fields.push({
                    name: (ss.gametype===2)?'KartSpeed':'Gametype',
                    value: (ss.gametype===2 && Boolean(ss.kartspeed))?
                            ss.kartspeed
                        :   "Battle",
                    inline: true
                })
            }

            var modes= 
                (Boolean(serverInfos.modes) && Boolean(serverInfos.modes.status=="OK"))?
                    ( Boolean(serverInfos.modes.modes)? serverInfos.modes.modes : [] )
                :   undefined;
            if(Boolean(modes) && modes.length>0){
                embed.fields.push({
                    name: "Modes",
                    value: modes.join('; '),
                    inline: false
                })
            }

            var players= [], spectators= []
            var sp= serverInfos.players
            if(Boolean(sp) && sp.length>0){
                for (var player of sp){
                    if(!Boolean(player.team) || player.team.length<=0
                        || player.team==="UNKNOWN"
                    )
                        continue
                    else if(player.team==="SPECTATOR"){
                        spectators.push(player.name)
                    }
                    else{
                        players.push(player.name)
                    }
                }
            }
            var s_players='-', s_spectators='-'
            if(players.length>0){
                s_players=''
                for(var name of players){
                    s_players+= `*${name}*;\t `
                }
            }
            if(spectators.length>0){
                s_spectators=''
                for(var name of spectators){
                    s_spectators+= `*${name}*;\t `
                }
            }

            embed.fields.push({
                name: "Players",
                value: s_players,
                inline: false
            })
            embed.fields.push({
                name: "Spectators",
                value: s_spectators,
                inline: false
            })
        }
        else{
            hereLog(`[ !kart info ] Bad info from API…`)

            embed.color= 0x808080
            embed.fields=[]
            embed.fields.push({
                name: "Erreur",
                value: "Problème lors de la récupération des infos…",
                inline: false
            })
            embed.thumbnail= {
                url: 'https://cdn-icons-png.flaticon.com/512/7706/7706689.png'
            }
        }

        await interaction.editReply({embeds: [embed]})
    }).catch(async err => {
        hereLog(`[ !kart info ] No serv info - ${err}`)
        embed.color= 0x808080
        embed.fields=[]
        embed.fields.push({
            name: "Offline",
            value: "Le serveur semble injoignable…",
            inline: false
        })
        embed.thumbnail= {
            url: 'https://cdn-icons-png.flaticon.com/512/8018/8018865.png'
        }
        
        await interaction.editReply({embeds: [embed]})
    })
}

function _getPassword(){
    b= false;
    stdout= undefined;
    try{
        var cmd= __kartCmd("eval 'cat ${HOME}/.TMP_PASS'");
        stdout=child_process.execSync(cmd,{timeout: 16000}).toString().replace('\n','');
        b= true;
    }
    catch(err){
        hereLog("Accessing srb2k server password: "+err);
        b= false;
    }

    if(!Boolean(stdout) || !b){
        return "password not found";
    }

    return stdout;
};

async function S_CMD__kartPassword(interaction, utils){
    await interaction.deferReply({ ephemeral: true })
    _serverRunningStatus_API().then(async r => {
        if(r==="UP"){
            pwd= _getPassword();
            await interaction.editReply(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`)
        }
        else{
            await interaction.editReply(`Aucun SRB2Kart actif…`);
        }
    }).catch(async err => {
        await interaction.editReply(`Aucun SRB2Kart actif…`);
    })
}


function _startServer(){
    b= false;
    try{
        var cmd= __kartCmd(kart_settings.server_commands.start)
        child_process.execSync(cmd, {timeout: 32000});
        b= true;
    }
    catch(err){
        hereLog("Error while launching server: "+err);
        b= false;
    }
    return b;
}

async function S_S_CMD_KartServer_Start(interaction, utils){
    let notUp= async () => {
        var success= _startServer();

        if(!success){
            _stopServer(true);
            await interaction.editReply(`[kart command] unable to start SRB2Kart server…`);
        }
        else{
            await interaction.editReply(`Strashbot's SRB2Kart server is starting!`)
        }
    }

    _serverRunningStatus_API().then(async r => {
        if(r==="UP"){
            str="Server SRB2Kart is already running…";
            await interaction.editReply(str);
        }
        else await notUp()
    }).catch(async err => {
        await notUp()
    })
}

function _stopServer(force=false){
    var str=undefined
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.stop))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.stop)
        str=child_process.execSync(cmd+`${(force)?" FORCE":""}`, {timeout: 32000}).toString();
    }
    catch(err){
        hereLog("Error while stopping server: "+err);
        return "error";
    }
    
    return (Boolean(str))?str:"ok";
}

async function S_S_CMD_KartServer_Stop(interaction, utils){
    let force= (interaction.options.getBoolean('force') ?? false)

    let population= await _askServInfos().then(async serverInfos => {
        if(Boolean(serverInfos && serverInfos.server)){
            return serverInfos.server.numberofplayer
        }
        return undefined
    }).catch(err => {
        return undefined
    })

    if(Boolean(population) && !force){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            "There might be some players remaining on Strashbot srb2kart server…\n"+
            "Are you sure you want to stop the server?\n"+
            `If so you need to set the \`force\` option to \`True\``
        );

        return
    }

    let res= _stopServer(force);
    if(res!=="error"){
        await interaction.editReply("Strashbot srb2kart server stopped…");
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            "Error while trying to stop server… 😰"
        );
    }
}

function _restartServer(force=false){
    str=undefined;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.restart))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.restart)
        str= child_process.execSync(cmd+`${(force)?" FORCE":""}`, {timeout: 32000}).toString();
    }
    catch(err){
        hereLog("Error while restarting server: "+err);
        return "error"
    }

    return (Boolean(str))?str:"ok";
}

async function S_S_CMD_KartServer_Restart(interaction, utils){
    let force= (interaction.options.getBoolean('force') ?? false)

    let population= await _askServInfos().then(async serverInfos => {
        if(Boolean(serverInfos && serverInfos.server)){
            return serverInfos.server.numberofplayer
        }
        return undefined
    }).catch(err => {
        return undefined
    })

    if(Boolean(population) && !force){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            "There might be some players remaining on Strashbot srb2kart server…\n"+
            "Are you sure you want to restart the server?\n"+
            `If so you need to set the \`force\` option to \`True\``
        );

        return
    }

    let res= _restartServer(force);
    if(res==="error"){
        var str=`${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Error while restarting server…`
        if (await _isServerRunning()){
            str+="\n\tServer seems to remain active…";
        }
        else{
            str+="\n\tServer seems stopped… ";
        }
        await interaction.editReply(str);
    }
    else{
        await interaction.editReply("Strashbot srb2kart server restarted…")
    }    
}

async function S_S_CMD_KartServer_Logs(interaction, utils){
    var str= undefined
    try{
        var cmd= __kartCmd(kart_settings.config_commands.get_log);
        str= child_process.execSync(cmd, {timeout: 16000}).toString();
    }
    catch(err){
        hereLog("Error while looking for log.txt: "+err);
        str= undefined
    }

    if(Boolean(str)){
        if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
            if(Boolean(kart_settings.http_url) ){
                await interaction.editReply(`Server's last recorded logs: ${kart_settings.http_url}/${str}`)
            }
            else{
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    "server internal error"
                );
            }
        }
        else{
            await interaction.editReply(`Server's last recorded logs:`,
                {files: [{
                    attachment: `${str}`,
                    name: `log.txt`
                }]}
            );
        }
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            "server internal error"
        );
    }
}


async function url_availabe(url){
    return new Promise((resolve)=>{
        fetch(url, {method: 'HEAD'}).then(()=>{resolve(true)}).catch(()=>{resolve(false)})
    })
}

async function __downloading(url, destDir, utils, fileName=undefined){
    var filename= (!Boolean(fileName))? url.split('/').splice(-1)[0] : fileName;


    var retries= 16
    while(retries>0 && !(await url_availabe(url))){
        --retries;
        await my_utils.sleep()
    }
    if (retries<=0){
        // channel.send(`❌ L'url \`${url}\` ne semble pas exister…`);
        return
    }

    var pct= 0;
    // var dl_msg= await channel.send(
    //     `Downloading \`${filename}\` on server …\t[${pct} %]`
    // );

    // let _error= (msg='') => {
    //     if (Boolean(dl_msg)){
    //         dl_msg.edit(`Downloading \`${filename}\` on server …\t[ERROR!]`+
    //             ((Boolean(msg))?`\n\t(${msg})`:'')
    //         );

    //         dl_msg.react('❌');
    //     }
    // }

    // if(Boolean(dl_msg)){
        let filepath= destDir+'/'+filename;
        const file = fs.createWriteStream(filepath);
        var receivedBytes = 0;
        var totalBytes= 0;

        var t= Date.now();

        let exe_p= ( async () => { return new Promise( (resolve,reject) =>{
            request.get(url)
                .on('response', (response) => {
                    // if (response.statusCode !== 200) {
                    //     _error('Response status was ' + response.statusCode);
                    // }

                    totalBytes= response.headers['content-length'];
                })
                .on('data', (chunk) => {
                    receivedBytes += chunk.length;

                    if (Boolean(dl_msg) && (Date.now()-t>=2000)){
                        dl_msg.edit(`Downloading \`${filename}\` on server …\t[${(receivedBytes/totalBytes)*100} %]`);
                        t= Date.now();
                    }
                })
                .pipe(file)
                .on('error', (err) => {
                    fs.unlink(filepath, err => {
                        hereLog(`[file dl error] ${err}`)
                    });
                    // _error();

                    resolve(false);
                });

            file.on('finish', () => {
                file.close();

                if (Boolean(dl_msg)){
                    dl_msg.edit(`Downloading \`${filename}\` on server …\t[Done!]`);

                    dl_msg.react('✅');
                }

                resolve(true)
            });
        
            file.on('error', (err) => {
                fs.unlink(filepath, err => {
                    hereLog(`[file dl error] ${err}`)
                });
                // _error(err.message);
                resolve(false);
            });
        }); })

        return (await exe_p())
    // }

    // return false;
}

async function __ssh_download_cmd(cmd, url, utils, fileName=undefined){
    hereLog(`[ssh dl] cmd: ${cmd} - url: ${url}`)
    var filename= (!Boolean(fileName))? url.split('/').splice(-1)[0] : fileName;

    
    var retries= 16
    while(retries>0 && !(await url_availabe(url))){
        --retries;
        await my_utils.sleep()
    }
    if (retries<=0){
        return
    }
    var addr=undefined, dUser=undefined;
    if(!Boolean(addr=kart_settings.server_commands.server_ip) || !Boolean(dUser=kart_settings.server_commands.distant_user)){
        // hereLog("[ssh dl] missing distant user or addr info…")
        // channel.send(`❌ Internal error…`);
        return
    }

    var pct= '\t0';
    // var dl_msg= await channel.send(
    //     `Downloading \`${filename}\` on server …\t[${pct} %]`
    // );

    // let _error= (msg='') => {
    //     if (Boolean(dl_msg)){
    //         dl_msg.edit(`Downloading \`${filename}\` on server …\t[ERROR!]`+
    //             ((Boolean(msg))?`\n\t(${msg})`:'')
    //         );

    //         dl_msg.react('❌');
    //     }
    // }


    let exe_p= ( async () => { return new Promise( (resolve,reject) =>{
        let ssh_cmd= `ssh ${dUser}@${addr}`+
            ( (Boolean(kart_settings.server_commands.server_port))?
                ` -p ${kart_settings.server_commands.server_port}`
                : ``
            ) +
            ` ${cmd} ${url} ${Boolean(fileName)?fileName:''}`;
        var cmd_process= child_process.exec(ssh_cmd, {timeout:120000});

        var t= Date.now();

        cmd_process.stdout.on('data', function (data) {
            var lines= data.split('\n');
            var res=""
            if(lines.length>0){
                res= lines[lines.length-1];
            }
            if(Boolean(res)){
                pct=res

                if (Boolean(dl_msg) && (Date.now()-t>=1000)){
                    // dl_msg.edit(`Downloading \`${filename}\` on server …\t[${pct}]`);
                    t= Date.now();
                }
            }
        });

        cmd_process.stderr.on('data', function (data) {
            hereLog(`[file dl error] ${data}`)
        });

        cmd_process.on('error', function (err){
            hereLog(`[file dl process error] ${err}`);

            // _error();

            resolve(false)
        });

        cmd_process.on('close', function (code) {
            if(code!==0){
                hereLog(`[ssh dl] returned ${code}`);
                // _error();
                resolve(false)
            }
            else{
                // if (Boolean(dl_msg)){
                //     dl_msg.edit(`Downloading \`${filename}\` on server …\t[Done!]`);

                //     dl_msg.react('✅');
                // }

                resolve(true);
            }
        });
    }) });

    return await exe_p();
}

async function S_S_CMD_KartServer_Config(interaction, utils){
    let setAttachmentOpt= interaction.options.getAttachment('set')

    if(!Boolean(setAttachmentOpt)){
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.get_config);
            str= child_process.execSync(cmd, {timeout: 32000}).toString();
        }
        catch(err){
            hereLog("Error while keeping addons: "+err);
            str= undefined
        }

        if(Boolean(str)){
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                if(Boolean(kart_settings.http_url)){
                    await interaction.editReply(`Srb2kart server's startup user config file: ${kart_settings.http_url}/${str}`);
                }
                else{
                    await interaction.editReply(
                        `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                        "Can't access srb2kart server's config file…"
                    )
                }
            }
            else if(fs.existsSync(str)){
                await interaction.editReply({
                    content: "Srb2kart server's startup user config file:",
                    files: [{
                        attachment: `${str}`,
                        name: `startup.cfg`
                    }]
                });
            }
            else{
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    "Can't access server's config file…"
                )
            }
        }
        else{
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                "Server internal error…"
            )
        }
    }
    else{
        let url= setAttachmentOpt.url

        if ( !Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ){
            hereLog("[cfg upload] no dest directory for cfg dl");
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `server internal error`
            );
        }
        else if(url.endsWith('.cfg')){
            var _b= false;
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                _b= await __ssh_download_cmd(
                    kart_settings.config_commands.add_config_url,
                    url, utils
                );
            }
            else{
                _b= await __downloading(url,
                    kart_settings.dirs.main_folder, utils, "new_startup.cfg"
                );
            }

            if(!_b){
                hereLog("[uploading cfg] command fail");
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `internal error preventing .cfg upload…`
                );
                return
            }

            var str= undefined
            try{
                var cmd= __kartCmd(kart_settings.config_commands.change_config);
                str= child_process.execSync(cmd+" new_startup.cfg", {timeout: 16000}).toString();
            }
            catch(err){
                hereLog("Error while changing config: "+err);
                str= undefined
            }

            if(Boolean(str)){
                // hereLog(`[change cfg] ret: ${str}`)
                let payload= (str==="updated" && !kart_settings.server_commands.through_ssh)?
                    {
                        files: [{
                            attachment: `${str}`,
                            name: `startup.cfg.diff`
                        }]
                    } : {}
                if(await _isServerRunning()){
                    payload.content=
                        `\`startup.cfg\` a bien été mis à jour.\n`+
                        `Cependant, cela n'aura aucun effet pour la session déjà en cours\n` +
                        ( (kart_settings.server_commands.through_ssh)?
                            `\nDiff: ${kart_settings.http_url}/startup.cfg.diff`
                            : "Diff generated file"
                        )
                }
                else{
                    payload.content= 
                        (kart_settings.server_commands.through_ssh)?
                                `\nDiff: ${kart_settings.http_url}/startup.cfg.diff`
                            :   "Diff generated file" 
                }
                interaction.editReply(payload)
            }
            else{
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `internal error while trying to update *startup.cfg*…`
                );
            }
        }
        else{
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `only .cfg files…`
            );
        }
    }
}

async function S_CMD__kartServer(interaction, utils){
    await interaction.deferReply()

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='start'){
        await S_S_CMD_KartServer_Start(interaction, utils)
    }
    else if(subcommand==='stop'){
        await S_S_CMD_KartServer_Stop(interaction, utils)
    }
    else if(subcommand==="restart"){
        await S_S_CMD_KartServer_Restart(interaction, utils)
    }
    else if(subcommand==='logs'){
        await S_S_CMD_KartServer_Logs(interaction, utils)
    }
    else if(subcommand==='config'){
        await S_S_CMD_KartServer_Config(interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`start\`,\`stop\`,\`restart\`,\`logs\`, or \`config\``
        )
    }
}

async function S_S_CMD_kartAddon_GetOrder(interaction, utils){
    var str= undefined
    try{
        var cmd= __kartCmd(kart_settings.config_commands.get_addon_load_config);
        str= child_process.execSync(cmd, {timeout: 32000}).toString();
    }
    catch(err){
        hereLog("Error while looking for addons order file: "+err);
        str= undefined
    }

    if(Boolean(str)){
        if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
            if(Boolean(kart_settings.http_url)){
                await interaction.editReply(
                    `Srb2kart server's addons load order config file: ${kart_settings.http_url}/${str}`
                );
            }
            else{
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    "Can't access srb2kart server's addons load order config file…"
                )
            }
        }
        else if(fs.existsSync(str)){
            await interaction.editReply(
                {
                    content: "Srb2kart server's addons load order config file:",
                    files: [{
                        attachment: `${str}`,
                        name: `addon_load_order.txt`
                    }]
                }
            );
        }
        else{
            await interaction.editReply(
                `${E_RetCode.ERROR_INTERNAL} `+
                "Can't access server's addons load order config file…"
            )
        }
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            "Can't access srb2kart server's addons load order config file…"
        )
    }
}

async function S_S_CMD_kartAddon_SetOrder(interaction, utils){
    let attachment= interaction.options.getAttachment('order_config_file')

    if(Boolean(attachment)){
        var url= attachment.url;
        
        if ( !Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ){
            hereLog("[upload] no dest directory for addon order config dl");
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `server internal error`
            );
        }
        else{
            var _b= false;
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                _b= await __ssh_download_cmd(
                    kart_settings.config_commands.add_addon_order_config_url,
                    url, utils
                );
            }
            else{
                _b= await __downloading(url,
                    kart_settings.dirs.main_folder, utils, "new_addon_load_order.txt"
                );
            }

            if(!_b){
                hereLog("[uploading load order config] command fail");
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `❌ internal error preventing addon order config upload…`
                );
                return
            }

            var str= undefined
            try{
                var cmd= __kartCmd(kart_settings.config_commands.change_addon_order_config);
                str= child_process.execSync(cmd+" new_addon_load_order.txt", {timeout: 16000}).toString();
            }
            catch(err){
                hereLog("Error while changing addon order config: "+err);
                str= undefined
            }

            if(Boolean(str)){
                // hereLog(`[change cfg] ret: ${str}`)
                let payload= (str==="updated" && !kart_settings.server_commands.through_ssh)?
                    {
                        files: [{
                            attachment: `${str}`,
                            name: `addon_load_order.txt.diff`
                        }]
                    } : {}
                
                let runNot= () => {
                    payload.content=
                        ( (kart_settings.server_commands.through_ssh)?
                                `\nDiff: ${kart_settings.http_url}/addon_load_order.txtdiff`
                            :   "Diff generated file"
                        )
                }
                await _serverRunningStatus_API().then( r => {
                    if(r==='UP'){
                        payload.content=
                            `\`addon_load_order.txt\` a bien été mis à jour.\n`+
                            `Cependant, cela n'aura aucun effet pour la session déjà en cours\n` +
                            ( (kart_settings.server_commands.through_ssh)?
                                    `\nDiff: ${kart_settings.http_url}/addon_load_order.txt.diff`
                                :   "Diff generated file"
                            )
                    }
                    else{
                        runNot()
                    }
                }).catch(e => {
                    runNot()
                })

                await interaction.editReply(payload)
            }
            else{
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `internal error while trying to update *addon_load_order.txt.cfg*…`
                );
            }
        }
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Config file expected…`
        );
    }
}

function _listAddonsConfig(arg=""){
    var str= undefined;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.list))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.list)
        str= child_process.execSync(cmd+((Boolean(arg))?` ${arg}`:""), {timeout: 16000}).toString();
    }
    catch(err){
        if(Boolean(err.status) && err.status===3){
            str="No result found…";
        }
        else{
            hereLog("Error while listing addons: "+err);
            str= undefined;
        }
    }
    return str;    
}

async function __addonUpload(url, interaction, utils){
    var filename= url.split('/').slice(-1)[0]

    let _serv_run= await _isServerRunning();

    let ext= [".pk3",".wad",".lua",".kart",".pk7"];
    var _ls="";
    if((_ls=_listAddonsConfig(url.split('/').splice(-1)[0]))!=="No result found…"){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `The following addons already exist on server:\n${_ls}`
        );
    }
    else if(!Boolean(url) || !ext.some(e => {return url.endsWith(e)})){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `Seuls les fichiers addons d'extension \`${ext}\` sont acceptés…`
        )
    }
    else if (!Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ||
        (!_serv_run && !Boolean(kart_settings.dirs.dl_dirs.permanent)) ||
        !Boolean(kart_settings.dirs.dl_dirs.temporary)
    ){
        hereLog("[addons add] no dest directory for addon dl");
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `❌ server internal error`
        );
    }
    else{
        var destDir= (_serv_run)?
            kart_settings.dirs.dl_dirs.temporary :
            kart_settings.dirs.dl_dirs.permanent;
        
        var _b=false;
        if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
            _b= (await __ssh_download_cmd(
                    kart_settings.config_commands.addon_url,
                    url, utils
                ) );
        }
        else{
            _b = (await __downloading(url, destDir, utils) );
        }

        if(!_b || !_updateAddonsConfig()){
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `An error as occured, can't properly add \`${filename}\` to the server addons…`
            );
            return
        }

        if(_serv_run){
            var str= `\`${filename}\` a bien été ajouté au serveur.\n`+
                `Cependant, il ne peut être utilisé pour une session déjà en cours`;
            await interaction.editReply(str+'.')         
        }
        else{
            await interaction.editReply(
                `\`${filename}\` a bien été ajouté et sera disponible prêt à l'emploi lors de la prochaine session.`
            );
        }
    }
}

async function S_S_CMD_kartAddon_UploadNew(interaction, utils){
    let attachment= interaction.options.getAttachment('kart_addon_file')

    if(Boolean(attachment)){
        let url= attachment.url

        await __addonUpload(url, interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `SRB2Kart addon file expected as attachment…`
        );
    }
}

async function S_S_CMD_kartAddon_LinkNew(interaction, utils){
    let url= interaction.options.getString('addon_url')
    let url_rgx= /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/;

    if(Boolean(url) && Boolean(url.match(url_rgx))){
        await __addonUpload(url, interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Required option needs to be a __direct__ URL to a SRB2Kart addon file…`
        );
    }
}

function _removeAddonsConfig(arg){
    var str= undefined;
    var r=false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.remove))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.remove)
        str= child_process.execSync(cmd+` ${arg}`, {timeout: 32000}).toString();
        r=true;
    }
    catch(err){
        hereLog("Error while removing addons: "+err);
    }
    return [r,str]; 
}

function _updateAddonsConfig(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.update))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.update)
        child_process.execSync(cmd, {timeout: 32000});
        b= true;
    }
    catch(err){
        hereLog("Error while updating addons: "+err);
        b= false;
    }
    return b;
}

async function S_S_CMD_kartAddon_Remove(interaction, utils){
    let addon_name= interaction.options.getString('addon_name')

    if(Boolean(addon_name)){
        var resp= _removeAddonsConfig(addon_name);
        if(Boolean(resp) && resp[0] && Boolean(resp[1])){
            if(resp[1]==="SCHEDULED_FOR_REMOVAL\n"){
                await interaction.editReply(
                    "Addons will be removed on server restart:\n\t"+addon_name
                );
            }
            else if(_updateAddonsConfig()){
                await interaction.editReply(
                    "Removed addons for srb2kart server:\n"+resp[1]
                )
            }
            else{
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    "internal error…"
                )
            }
        }
        else{
            hereLog("[rm] got bad resp: "+resp);
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Unable to remove${(Boolean(resp[1]))?(`:\n*\t${resp[1]}*`):"…"}`
            );
        }
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `The __full__ addon file name is required (including extension)…`
        );
    }
}

async function S_CMD__kartAddonManager(interaction, utils){
    await interaction.deferReply()

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='get_order'){
        await S_S_CMD_kartAddon_GetOrder(interaction, utils)
    }
    else if(subcommand==='set_order'){
        await S_S_CMD_kartAddon_SetOrder(interaction, utils)
    }
    else if(subcommand==='upload_new'){
        await S_S_CMD_kartAddon_UploadNew(interaction, utils)
    }
    else if(subcommand==='link_new'){
        await S_S_CMD_kartAddon_LinkNew(interaction, utils)
    }
    else if(subcommand==='remove'){
        await S_S_CMD_kartAddon_Remove(interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`get_order\`,\`set_order\`,\`upload_new\`,\`link_new\`, or \`remove\``
        )
    }
}

async function S_S_CMD_kartAddons_List(interaction, utils){
    let pattern= interaction.options.getString('search') ?? ""
    var list= _listAddonsConfig(pattern)

    if(Boolean(list)){
        if(!Boolean(pattern) && Boolean(kart_settings) && Boolean(kart_settings.http_url)){
            list+=`\n\nStrashbot addons download: ${kart_settings.http_url}/strashbot_addons.zip`
        }

        var resp= "# Addons list for srb2kart server:\n"+list.replace(/\s+/g,'\n');
        

        await interaction.editReply({
            content: `List of ${Boolean(pattern)?'found ':''}installed addons.`,
            files:[{
                attachment: Buffer.from(resp),
                name: `addon_list_${Date.now()}.md`
            }]
        })
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `No such addon found…`
        )
    }
}

async function S_S_CMD_kartAddons_Zip(interaction, utils){
    if(Boolean(kart_settings) && Boolean(kart_settings.http_url)){
        await interaction.editReply(
            `You can try downloading the SRB2Kart server's addons at: ${kart_settings.http_url}/strashbot_addons.zip`
        );
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `Addons direct download link unavailable, sorry… 😩`
        );
    }
}

async function S_CMD__kartAddons(interaction, utils){
    await interaction.deferReply()

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='list'){
        await S_S_CMD_kartAddons_List(interaction, utils)
    }
    else if(subcommand==='zip'){
        await S_S_CMD_kartAddons_Zip(interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`list\`, or \`zip\``
        )
    }
}

function __cmd_fetchJsonInfo(kcmd){
    if(!Boolean(kcmd)){
        hereLog(`[fetchInfos] bad cmd config…`);
        return undefined;
    }

    var str= undefined
    try{
        var cmd= __kartCmd(kcmd);
        str= child_process.execSync(`${cmd}`, {timeout: 32000}).toString();
    }
    catch(err){
        hereLog(`Error while fetching maps infos…\n\t${err}`);
        str= undefined
    }


    if(!Boolean(str)) return undefined

    var obj= undefined
    try{
        obj= JSON.parse(str)
    } catch(err){
        hereLog(`[setServMode] couldn't get server mode info:\n\t${err}`)
        obj= undefined
    }
    return obj
}

async function S_S_CMD_kartInGames_Maps(interaction, utils, justCount=false){
    let pattern= interaction.options.getString('search')
    let search_terms= Boolean(pattern)? pattern.split(/\s/) : []
    let mapType= interaction.options.getString('type')
    mapType= ['battle','hell','banned'].includes(mapType)?mapType:undefined
    let includeSections= interaction.options.getString('sections') ?? 'all'
    includeSections= ['all','section_only','no_section'].includes(includeSections)?includeSections:'all'

    if(!Boolean(kart_settings) || !Boolean(kart_settings.config_commands)){
        hereLog(`[fetchInfos] bad config…`);
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            "Internal error"
        )
        return
    }

    let mapObj= __cmd_fetchJsonInfo(kart_settings.config_commands.maps_info)

    if(!(Boolean(mapObj)) || !(Boolean(mapObj.maps))){
        hereLog(`[mapInfos] couldn't fetch maps infos…`)
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            "Data access error"
        )
        return
    }    
    
    var mapIDs= Object.keys(mapObj.maps)

    mapIDs= mapIDs.filter(mapID => {
        var map= mapObj.maps[mapID]

        return (
            (   (   
                    (mapType==='battle' && map.type==='Battle') ||
                    (mapType==='hell' && map.hell) ||
                    (mapType==='banned' && map.type==='Discarded') ||
                    (   (!Boolean(mapType)) &&
                        (!['Battle','Discarded'].includes(map.type)) &&
                        !map.hell
                    )
                ) && ( 
                    includeSections==='all' ||
                    (includeSections==='section_only' && map.sections) ||
                    (includeSections==='no_section' && (!map.sections) )
                )
            ) &&
            (
                (search_terms.length<=0) || (
                    search_terms.some(st =>{
                        var lc_st= st.toLowerCase()
                        return (
                            mapID.toLowerCase().includes(lc_st) ||
                            map.title.toLowerCase().includes(lc_st) ||
                            map.zone.toLowerCase().includes(lc_st) ||
                            map.subtitle.toLowerCase().includes(lc_st)
                        )
                    })
                )
            )
        )
    })

    var l_ret= mapIDs.map(mapID => {
        var map= mapObj.maps[mapID]
        return `🔹 [MAP${mapID}]: *${map.title} ${map.zone}*`+
                `${(map.subtitle && map.subtitle.length>0)?` (*${map.subtitle}*)`:''}`+
                `${(Boolean(map.hell))?" > HELL <":""}`
    })

    if (l_ret.length>0 && !justCount){
        await interaction.editReply({
            content: `Found ${l_ret.length} maps.`,
            files: [{
                attachment: Buffer.from(`# Found racers ${Boolean(pattern)?`(search '${pattern}') `:""}:\n\n`
                                        +l_ret.join('\n')),
                name: `found_maps_${Date.now()}.md`
            }]
        })
    }
    else if (l_ret.length>0)
        await interaction.editReply(`Found ${l_ret.length} maps!`)
    else
        await interaction.editReply(`No map found…`)
}

const SKIN_NUM_LIMIT= 255

async function S_S_CMD_kartInGames_Racers(interaction, utils, justCount= false){
    let pattern= interaction.options.getString('search') ?? ""
    let search_terms= pattern.split(/\s/)

    let speed_lookup= interaction.options.getNumber('speed') ?? undefined
    let weight_lookup= interaction.options.getNumber('weight') ?? undefined

    if(!Boolean(kart_settings) || !Boolean(kart_settings.config_commands)){
        hereLog(`[fetchInfos] bad config…`);
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            "Internal error"
        )
        return
    }

    let skinObj= __cmd_fetchJsonInfo(kart_settings.config_commands.skins_info)

    if(!(Boolean(skinObj)) || !(Boolean(skinObj.skins))){
        hereLog(`[skinInfos] couldn't fetch skins infos…`)
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            "Data access error"
        )
        return
    } 

    var skinNames= Object.keys(skinObj.skins).filter(skinName => {
        skin= skinObj.skins[skinName]

        return (
            (speed_lookup==undefined || skin.speed==speed_lookup) &&
            (weight_lookup==undefined || skin.weight==weight_lookup) &&
            (search_terms.length<=0 || (
                search_terms.some(st =>{
                    var lc_st= st.toLowerCase()
                    return (
                        skinName.toLowerCase().includes(lc_st) ||
                        skin.realname.toLowerCase().includes(lc_st)
                    )
                })
            ))
        )
    })

    var l_ret= skinNames.map(skinName =>{
        skin= skinObj.skins[skinName]

        return `🔸 *${skin.realname}* (\`${skinName}\`) [${skin.speed}, ${skin.weight}]`
    })


    var response= `No skin found…`
    if (l_ret.length>0)
        response= `Found ${l_ret.length} skins!`

    var alert= undefined
    if (Boolean(skinObj.alert) && (alert=Number(skinObj.alert))
        && !isNaN(alert) && alert>SKIN_NUM_LIMIT
    ){
        response+= `!\n\t⚠ Skins limit reached (*some skins might be missing*)!`
    }

    
    if (l_ret.length>0 && !justCount){
        await interaction.editReply({
            content: response,
            files: [{
                attachment: Buffer.from(`# Found racers ${Boolean(pattern)?`(search '${pattern}') `:""}:\n\n`
                                        +l_ret.join('\n')),
                name: `found_skins_${Date.now()}.md`
            }]
        })
    }
    else await interaction.editReply(response);        
}

async function S_CMD__kartInGames(interaction, utils){
    await interaction.deferReply()

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='maps'){
        await S_S_CMD_kartInGames_Maps(interaction, utils)
    }
    else if(subcommand==='map_count'){
        await S_S_CMD_kartInGames_Maps(interaction, utils, true)
    }
    else if(subcommand==='racers'){
        await S_S_CMD_kartInGames_Racers(interaction, utils)
    }
    else if(subcommand==='racer_count'){
        await S_S_CMD_kartInGames_Racers(interaction, utils, true)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`maps\`, \`map_count\`, \`racers\` or \`racer_count\``
        )
    }
}

let __Update_Keys= {
    mem_keys: {},
    last: 0,
    allowed_diff: 300000 //should be 5 min
}

function __readkey_from_file(configEntryName){
    var key= __Update_Keys.mem_keys[configEntryName]

    let now= Date.now()
    if(!Boolean(key) || ((now-__Update_Keys.last)>__Update_Keys.allowed_diff)){
        __Update_Keys.last= now
        key= fs.readFileSync(path.resolve(kart_settings.api.token_keys[configEntryName]))
        __Update_Keys.mem_keys[configEntryName]= key
    }

    return key
}

let JWT_SIGN_OPTIIONS= {
    expiresIn: '1m',
    algorithm:  "RS256"
}

function __api_generateUserPrivilegedToken(user, admin=false){
    var key= undefined
    if(Boolean(kart_settings.api && kart_settings.api.token_keys)){
        try{
            if(admin &&
                Boolean(kart_settings.api.token_keys.adminSignkey)
            ){
                key= __readkey_from_file('adminSignkey')
            }
            else if(Boolean(kart_settings.api.token_keys.discorduserSignkey)){
                key= __readkey_from_file('discorduserSignkey')
            }
            else{
                hereLog(`[api_priviledged_tokens] couldn't get proper token for clearanceLvl (no key?)...`)
                return undefined
            }
        } catch(err){
            hereLog(`[api_priviledged_tokens] couldn't get proper token for clearanceLvl (no key files?)...`)
            return undefined;
        }
    }else{
        hereLog(`[api_priviledged_tokens] couldn't get proper token for clearanceLvl (no key files settings?)...`)
        return undefined
    }

    let auth= {
        role: (admin)?'ADMIN':'DISCORD_USER',
        id: user.id
    }

    return jwt.sign({auth}, key, JWT_SIGN_OPTIIONS)
}

async function __send_clipInfo_req(clipID ,interaction, utils, newClip=false){
    let api_clip_addr=`${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}`+
                    `${kart_settings.api.root}/clip/${clipID}`

    return axios.get(api_clip_addr).then(async response => {
        if(response.status===200){
            let clip= response.data

            var embed= {}
            embed.title= newClip?
                            `New clip on the Strashthèque! (n°${clipID})`
                        :   `Strashthèque clip id: ${clipID}`
            embed.url= `${kart_settings.web_page.base_url}/${kart_settings.web_page.clips_page}?clip=${clipID}`
            embed.timestamp=clip.timestamp
            if(Boolean(clip.thumbnail)) embed.thumbnail= { url: clip.thumbnail }
            if(Boolean(clip.description)) embed.description= clip.description
            if(Boolean(clip.submitter_id)){
                await interaction.guild.members.fetch(clip.submitter_id).then(m =>{
                    var name= m.displayName

                    embed.author= {
                        name,
                        iconURL: m.displayAvatarURL
                    }
                }).catch(err =>{
                    hereLog(`[clip info] couldn't find user ${clip.submitter_id} on this guild ${interaction.guild}: ${err}`)
                })
            }
            embed.fields= [
                {name: "Type", value: clip.type, inline: false},
                {name: "Direct link", value: clip.url, inline: true}
            ]
            embed.footer= { text: "Published on https://strashbot.fr/gallery.html"}

            let payload= {embeds: [embed]}

            interaction.editReply(payload)

            if(newClip){
                interaction.channel.send(`${clip.url}\n${clip.description}`)
            }
        }
        else{
            hereLog(`[clipApiInfo] bad api response on '${api_clip_addr}' - status: ${response.status}`)
            if(newClip)
                await interaction.editReply(
                    `New clip at Strashtèque! https://strashbot.fr/gallery.html?clip=${clipID}`
                )
            else
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Error looking up from clip ${clipID}`
                )
        }
    }).catch(async err =>{
        if(Boolean(err.response) && err.response.status===404){
            hereLog(`[clipApiInfo] got 404 - ${JSON.stringify(err.response.data)}`)
            if(newClip)
                await interaction.editReply(
                    `New clip at Strashtèque! https://strashbot.fr/gallery.html?clip=${clipID}`
                )
            else
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                    `**Clip not found**: No clip was found under id: ${clipID} …`
                )
        }
        else{
            hereLog(`[clipApiInfo] api error on '${api_clip_addr}' - ${err}`)
            if(newClip)
                await interaction.editReply(
                    `New clip at Strashtèque! https://strashbot.fr/gallery.html?clip=${clipID}`
                )
            else
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Error looking up from clip ${clipID}`
                )
        }
    })
}

async function _addNewKartClip(url, description, interaction, utils){
    let data= {
        submitter_id: interaction.user.id,
        description,
        url
    }
    
    let token= __api_generateUserPrivilegedToken(
        interaction.user, utils.getMasterID()===interaction.user.id
    )
    if(!Boolean(token)){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `unable to grant necessary privileges to add new clip`
        )
        return
    }

    let api_clip_addr=
        `${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}`+
        `${kart_settings.api.root}/clip/new`

    return (await axios.post(api_clip_addr, data, {headers: {'x-access-token': token}})
        .then(async response => {
            if(response.status===200){
                if(Boolean(response.data && response.data.insertedId)){
                    await __send_clipInfo_req(
                        response.data.insertedId, interaction, utils,
                        true
                        )
                }
                else{
                    await interaction.editReply(
                        `New clip at Strashtèque! https://strashbot.fr/gallery.html?clip=${clipID}`
                    )
                }
            }
            else{
                hereLog(`[clipApiAdd] bad api response on '${api_clip_addr}' - status: ${response.status}`)
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Error trying to add new clip…`
                )
            }
        }).catch(async err =>{
            if(Boolean(err.response) && err.response.status===403){
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                    `{403} you lack necessary privileges to add new clip`
                )
            }
            else if(Boolean(err.response) && err.response.status===440){
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                    `{440} the url/file to try to register as clip isn't valid:\n`+
                    `Please only:\n\t* youtube links\n\t* streamable.com links\n\t* .gif,.mp4,.webm links/file`
                )
            }
            else if(Boolean(err.response) && err.response.status===400){
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                    `{400} missing or invalid url?`
                )
            }
            else if(Boolean(err.response) && err.response.status===441){
                hereLog(`[clipApiAdd] bad identification for user ${author.id} - ${JSON.stringify(response.data)}`)
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `{441} Error: user input rejected`
                )
            }
            else if(Boolean(err.response) && err.response.status===409){
                if(Boolean(response.data && response.data.resource)){
                    f_c_id= err.response.data.resource.split('/')[2]

                    await __send_clipInfo_req(f_c_id, interaction, utils)
                }
                else{
                    await interaction.editReply(
                        `Clip already found at Strashthèque: https://strashbot.fr/gallery.html?clip=${clipID}`
                    )
                }
            }
            else{
                hereLog(`[clipApiAdd] api error on '${api_clip_addr}' - ${err}`);
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Error trying to add new clip…`
                )
            }
        })
    )
}

async function _clipsState(){
    if(Boolean(kart_settings.api) && Boolean(kart_settings.api.host)){
        let api_info_addr=`${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}${kart_settings.api.root}/clips?perPage=1`

        // hereLog(`[clipsCount] Asking API ${api_info_addr}…`);
        return (await axios.get(api_info_addr).then(response => {
            if(response.status===200){
                return {
                    clipsNumber: response.data.availableClipsCount,
                    last_clip: response.data.clips[0]
                }
            }
            else if(response.status===204){
                hereLog(`[clipsCount] got 204 - ${JSON.stringify(response.data)}`)
                throw "no clips found"
            }
            else{
                hereLog(`[clipsCount] bad api response on '${api_info_addr}'`)
                throw "Bad API reponse"
            }
        }) )
    }
    else {
        hereLog(`[clipsCount] bad api settings`)
        throw "Bad api - no api set in settings…"
    }
}

async function _send_clipsState(interaction, utils){
    return await _clipsState().then(async info => {
        embed= {}
        embed.fields= []
        embed.title= `Strashthèque`
        embed.description= "Collection de clips de Strashbot Karting!"
        embed.url= `${kart_settings.web_page.base_url}/${kart_settings.web_page.clips_page}`
        embed.fields.push({
            name: "Number of clips",
            value: `${info.clipsNumber}`,
            inline: false
        })
        embed.fields.push({
            name: "Last clip",
            value: `${kart_settings.web_page.base_url}/${kart_settings.web_page.clips_page}?clip=${info.last_clip._id}`,
            inline: true
        })
        embed.thumbnail= { url: "https://strashbot.fr/img/clips_thumb.png" }

        await interaction.editReply({embeds: [embed]})
    }).catch(async err => {
        hereLog(`[clipState] trying to get clips state - ${err}`)
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `Error while fetching clips infos... :()`
        )
    })
}

async function S_S_CMD_kartClips_New(interaction, utils){
    let attachment= interaction.options.getAttachment('clip_file')
    let given_url= interaction.options.getString('clip_url')
    let descr= interaction.options.getString('description')

    let url_rgx= /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/;

    let url= (Boolean(attachment))?
            attachment.url
        :   (Boolean(given_url && given_url.match(url_rgx)) ?
                given_url.match(/^<*(.*)>*$/)[1]
            :   undefined
        )

    if(Boolean(url)){
        await _addNewKartClip(url, descr, interaction, utils)
    }
    else{
        await _send_clipsState(interaction, utils)
    }
}

async function S_S_CMD_kartClips_Info(interaction, utils){
    let opt_clip_id= interaction.options.getString('clip_id') ?? ""
    let clip_match= opt_clip_id.match(/([0-9]+)/)
    let clip_id= parseInt(Boolean(clip_match)? clip_match[1] : undefined)

    if(Boolean(clip_id)){
        await __send_clipInfo_req(clip_id, interaction, utils)
    }
    else{
        await _send_clipsState(interaction, utils)
    }
}

async function __remove_clip_req(clip_id, interaction, utils){
    let api_clip_addr=
        `${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}`+
        `${kart_settings.api.root}/clip/${clip_id}`

    let token= __api_generateUserPrivilegedToken(
        interaction.user, utils.getMasterID()===interaction.user.id
    )
    if(!Boolean(token)){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `unable to grant necessary privileges to add new clip`
        )
        return
    }

    return (await axios.delete(
            api_clip_addr,
            {headers: {'x-access-token': token}, data: {submitter_id: interaction.user.id}}
        )
        .then(async response => {
            if(response.status===200){
                await interaction.editReply(`Clip ${clip_id} removed!`)
            }
            else{
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Error trying to remove clip ${clip_id}`
                )
            }
        }).catch(async err =>{
            if(Boolean(err.response) && err.response.status===403){
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                    `you lack necessary privileges to remove clip id: ${clip_id}`
                )
            }
            else if(Boolean(err.response) && err.response.status===404){
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                    `{404} **Clip not found**: No clip was found under id: ${clip_id} …`
                )
            }
            else{
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Error trying to remove clip ${clip_id}`
                )
            }
        })
    )
}

async function S_S_CMD_kartClips_Remove(interaction, utils){
    let opt_clip_id= interaction.options.getString('clip_id') ?? ""
    let clip_match= opt_clip_id.match(/([0-9]+)/)
    let clip_id= parseInt(Boolean(clip_match)? clip_match[1] : undefined)

    if(Boolean(clip_id)){
        await __remove_clip_req(clip_id, interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Error while removing clips: invalid clip ID…`
        )
    }
}

async function __edit_clip_description(description, clip_id, interaction, utils){
    let desc= description ?? ""
    
    let api_clip_addr=`${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}`+
                    `${kart_settings.api.root}/clip/${clip_id}`

    let token= __api_generateUserPrivilegedToken(
        interaction.user, utils.getMasterID()===interaction.user.id
    )
    if(!Boolean(token)){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `unable to grant necessary privileges to add new clip`
        )
        return
    }

    let data= {submitter_id: interaction.user.id, description: desc}
    return (await axios.put(api_clip_addr, data, {headers: {'x-access-token': token}})
        .then(async response => {
            if(response.status===200){
                await interaction.editReply(`Clip ${clip_id} description edited!`)
            }
            else{
                hereLog(`[clipApiEdit] bad api response on '${api_clip_addr}' - status: ${response.status}`)
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Internal error editing clip ${clip_id}`
                )
            }
        }).catch(async err =>{
            if(Boolean(err.response) && err.response.status===403){
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                    `{403} you lack necessary privileges to access clip id: ${clip_id}`
                )
            }
            else if(Boolean(err.response) && err.response.status===404){
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                    `{404} **Clip not found**: No clip was found under id: ${clip_id} …`
                )
            }
            else{
                hereLog(`[clipApiEdit] api error on '${api_clip_addr}' - ${err}`)
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Internal error editing clip ${clip_id}`
                )
            }
        })
    )
}

async function S_S_CMD_kartClips_Description(interaction, utils){
    let opt_clip_id= interaction.options.getString('clip_id') ?? ""
    let clip_match= opt_clip_id.match(/([0-9]+)/)
    let clip_id= parseInt(Boolean(clip_match)? clip_match[1] : undefined)

    let description= interaction.options.getString('description') ?? ""

    if(Boolean(clip_id)){
        await __edit_clip_description(description, clip_id, interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Error while editing clip description: invalid clip ID…`
        )
    }
}

async function S_CMD__kartClips(interaction, utils){
    await interaction.deferReply()

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==="new"){
        await S_S_CMD_kartClips_New(interaction, utils)
    }
    else if(subcommand==="info"){
        await S_S_CMD_kartClips_Info(interaction, utils)
    }
    else if(subcommand==="remove"){
        await S_S_CMD_kartClips_Remove(interaction, utils)
    }
    else if(subcommand==="description"){
        await S_S_CMD_kartClips_Description(interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`new\`, \`ifno\`, \`remove\` or \`description\``
        )
    }
}

async function S_CMD_postStatusChannel(interaction, utils){
    await interaction.deferReply({ ephemeral: true })

    let subcommand= interaction.options.getSubcommand()
    if(subcommand==='post_status_channel'){
        let channel= interaction.options.getChannel('set')
        let stringOption= interaction.options.getString('do');

        if(Boolean(channel)){
            utils.settings.set(interaction.guild, 'post_status_channel', channel.id )

            await interaction.editReply(
                `Registered Status Posting Channel for player number tracking set to ${channel}.`
            )
        }
        else if(stringOption==='clear'){
            utils.settings.remove(interaction.guild, 'post_status_channel');

            await interaction.editReply(
                `Registered Status Posting Channel for player number tracking is cleared`
            )
        }
        else{
            let channel_id= utils.settings.get(interaction.guild, 'post_status_channel')
            if(Boolean(channel_id)){
                await interaction.guild.channels.fetch(channel_id).then(async channel => {
                    await interaction.editReply(
                        `Status Posting Channel for player number tracking is ${channel}`
                    )
                }).catch(async err => {
                    await interaction.editReply(
                        `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} internal error while`+
                        ` fetching the *status_post_channel*…`
                    )
                    hereLog(
                        `Couldn't fetch status_post_channel for '${channel_id}' - ${err}`
                    )
                })
            }
            else{
                await interaction.editReply(
                    `Status Posting Channel for player number tracking is not set…`
                )
            }
        }
    }
}


let slashKartInfo= {
    data: new SlashCommandBuilder()
            .setName('kart_info')
            .setDescription("Get current status of the Strashbot srb2kart server."),
    async execute(interaction, utils){
        try{
            await S_CMD__kartInfo(interaction, utils)
        }
        catch(err){
            hereLog(`[kart_info] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }
    }
}

let slashKartPassword= {
    data: new SlashCommandBuilder()
            .setName('kart_password')
            .setDescription("Get the Strashbot SRB2Kart's server's login")
            .setDefaultMemberPermissions(0),
    async execute(interaction, utils){
        try{
            await S_CMD__kartPassword(interaction, utils)
        }
        catch(err){
            hereLog(`[kart_password] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                interaction.editReply(msg)
            else
                interaction.reply(msg)
        }
    }
}

let slashKartStartStop= {
    data: new SlashCommandBuilder()
            .setName('kart_server')
            .setDescription("Start the Strashbot SRB2Kart's server")
            .setDefaultMemberPermissions(0)
            .addSubcommand(subcommand =>
                subcommand
                .setName('start')
                .setDescription('Start the Strashbot SRB2Kart server')
            )
            .addSubcommand(subcommand =>
                subcommand
                .setName('stop')
                .setDescription('Stop the Strashbot SRB2Kart server')
                .addBooleanOption(option =>
                    option
                    .setName('force')
                    .setDescription('Force, even if there are player currently playing on the server')
                )
            )
            .addSubcommand(subcommand =>
                subcommand
                .setName('restart')
                .setDescription('Restart the Strashbot SRB2Kart server')
                .addBooleanOption(option =>
                    option
                    .setName('force')
                    .setDescription('Force, even if there are player currently playing on the server')
                )
            )
            .addSubcommand(subcommand =>
                subcommand
                .setName('logs')
                .setDescription('Fetch the Strashbot SRB2Kart server\'s logfile')
            )
            .addSubcommand(subcommand =>
                subcommand
                .setName('config')
                .setDescription('Something about the server\'s config')
                .addAttachmentOption(option =>
                    option
                    .setName('set')
                    .setDescription('Sumbit a new server config')
                )
            ),
    async execute(interaction, utils){
        try{
            await S_CMD__kartServer(interaction, utils)
        }
        catch(err){
            hereLog(`[kart_server] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }
    }
}

let slashKartAddonManage= {
    data: new SlashCommandBuilder()
    .setName('kart_addons_manage')
    .setDescription("About Strashbot SRB2Kart's server addons")
    .setDefaultMemberPermissions(0)
    .addSubcommand(subcommand =>
        subcommand
        .setName('get_order')
        .setDescription("Fetch the Strashbot's SRB2Kart server addon load order config")        
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName('set_order')
        .setDescription("Set the Strashbot's SRB2Kart server addon load order config")
        .addAttachmentOption(option =>
            option
            .setName('order_config_file')
            .setDescription('Sumbit a new server config')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName('upload_new')
        .setDescription("Add a new addon to the Strashbot's SRB2Kart server")
        .addAttachmentOption(option =>
            option
            .setName('kart_addon_file')
            .setDescription('Sumbit a new addon through file attachment')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName('link_new')
        .setDescription("Add a new addon to the Strashbot's SRB2Kart server")
        .addStringOption(option =>
            option
            .setName('addon_url')
            .setDescription('Sumbit a new addon config through url')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName('remove')
        .setDescription("Remove an addon from the Strashbot's SRB2Kart server")
        .addStringOption(option =>
            option
            .setName('addon_name')
            .setDescription("Addon's complete filename")
            .setRequired(true)
        )
    ),
    async execute(interaction, utils){
        try{
            await S_CMD__kartAddonManager(interaction, utils)
        }
        catch(err){
            hereLog(`[kart_addons_manager] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }
    }
    
}

let slashKartAddons= {
    data:  new SlashCommandBuilder()
    .setName('kart_addons')
    .setDescription("About the addons currenty installed on the Strashbot's SRB2Kart server")
    .addSubcommand(subcommand =>
        subcommand
        .setName("list")
        .setDescription("List some of the installed addons")
        .addStringOption(option => 
            option
            .setName('search')
            .setDescription("search for an addons matching the given pattern")
        )
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName("zip")
        .setDescription("Download a zip archive containing all of the  Strashbot's SRB2Kart server addons")
    ),
    async execute(interaction, utils){
        try{
            await S_CMD__kartAddons(interaction, utils)
        }
        catch(err){
            hereLog(`[kart_addons] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }
    }
}

let slashKartIngames= {
    data: new SlashCommandBuilder()
    .setName('kart_ingames')
    .setDescription("About maps/racers availabe in the current Strashbot SRB2Kart server")
    .addSubcommand(subcommand =>
        subcommand
        .setName("maps")
        .setDescription("About the maps")
        .addStringOption(option => 
            option
            .setName('search')
            .setDescription("search for maps matching the given pattern")
        )
        .addStringOption(option => 
            option
            .setName('type')
            .setDescription('type of maps')
            .addChoices(
                { name: 'Battle maps', value: 'battle' },
                { name: 'Hell maps', value: 'hell' },
                { name: 'Banned maps', value: 'banned' }
            )
        )
        .addStringOption(option => 
            option
            .setName('sections')
            .setDescription('section maps?')
            .addChoices(
                { name: 'Show all maps (default)', value: 'all' },
                { name: 'Only show section maps', value: 'section_only' },
                { name: 'Don\'t show section maps', value: 'no_section' }
            )
        )
    ).addSubcommand(subcommand =>
        subcommand
        .setName("map_count")
        .setDescription("Count the maps")
        .addStringOption(option => 
            option
            .setName('search')
            .setDescription("search for maps matching the given pattern")
        )
        .addStringOption(option => 
            option
            .setName('type')
            .setDescription('type of maps')
            .addChoices(
                { name: 'Battle maps', value: 'battle' },
                { name: 'Hell maps', value: 'hell' },
                { name: 'Banned maps', value: 'banned' }
            )
        )
        .addStringOption(option => 
            option
            .setName('sections')
            .setDescription('section maps?')
            .addChoices(
                { name: 'Show all maps (default)', value: 'all' },
                { name: 'Only show section maps', value: 'section_only' },
                { name: 'Don\'t show section maps', value: 'no_section' }
            )
        )
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName("racers")
        .setDescription("About the racers/skins")
        .addStringOption(option => 
            option
            .setName('search')
            .setDescription("search for skins matching the given pattern")
        )
        .addNumberOption(option =>
            option
            .setName('speed')
            .setDescription("the speed stats of the racer")
            .setMinValue(0)
            .setMaxValue(9)
        )
        .addNumberOption(option =>
            option
            .setName('weight')
            .setDescription("the weight stats of the racer")
            .setMinValue(0)
            .setMaxValue(9)
        )
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName("racer_count")
        .setDescription("Count the racers/skins")
        .addStringOption(option => 
            option
            .setName('search')
            .setDescription("search for skins matching the given pattern")
        )
        .addNumberOption(option =>
            option
            .setName('speed')
            .setDescription("the speed stats of the racer")
            .setMinValue(0)
            .setMaxValue(9)
        )
        .addNumberOption(option =>
            option
            .setName('weight')
            .setDescription("the weight stats of the racer")
            .setMinValue(0)
            .setMaxValue(9)
        )
    ),
    async execute(interaction, utils){
        try{
            await S_CMD__kartInGames(interaction, utils)
        }
        catch(err){
            hereLog(`[kart_ingames] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }        
    }
}

let slashKartClip= {
    data: new SlashCommandBuilder()
    .setName('kart_clips')
    .setDescription("Cools clips from Strashbot's SRB2Kart server and stuff")
    .addSubcommand(subcommand =>
        subcommand
        .setName("new")
        .setDescription("Add a new clip or check current ones (no options)")
        .addStringOption(option => 
            option
            .setName('clip_url')
            .setDescription("From youtube, streamable, or video direct url (.mp4/.ogg/.webm) or .gif")
        )
        .addAttachmentOption(option => 
            option
            .setName("clip_file")
            .setDescription("From a video file (.mp4/.ogg/.webm) or .gif")    
        )
        .addStringOption(option =>
            option
            .setName("description")
            .setDescription("short description")
            .setMaxLength(512)    
        )
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName("info")
        .setDescription("Fetch info from clip ID")   
        .addStringOption(option => 
            option
            .setName('clip_id')
            .setDescription("clip ID (a number)")
            .setMinLength(1)
        ) 
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName("remove")
        .setDescription("Remove clip from clip ID")   
        .addStringOption(option => 
            option
            .setName('clip_id')
            .setDescription("clip ID (a number)")
            .setRequired(true)
        ) 
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName("description")
        .setDescription("Clip description edit")   
        .addStringOption(option => 
            option
            .setName('clip_id')
            .setDescription("clip ID (a number)")
            .setMinLength(1)  
            .setRequired(true)
        ) 
        .addStringOption(option => 
            option
            .setName('description')
            .setDescription("new description")
            .setMaxLength(512) 
        ) 
    ),
    async execute(interaction, utils){
        try{
            await S_CMD__kartClips(interaction, utils)
        }
        catch(err){
            hereLog(`[kart_clips] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }  
    }
}

let slaskKartDiscord= {
    data: new SlashCommandBuilder()
    .setName('kart_discord')
    .setDescription('Link Strashbot Karting to discord through this bot.')
    .setDefaultMemberPermissions(0)
    .addSubcommand(subcommand => 
        subcommand
        .setName('post_status_channel')
        .setDescription('Where to post the server player number tracking.')
        .addChannelOption(option => 
            option
            .setName('set')
            .setDescription('In which channel to post')
        )
        .addStringOption(option => 
            option
            .setName('do')
            .setDescription('commands')
            .addChoices(
                { name: 'get', value: 'get' },
                { name: 'clear', value: 'clear' }
            )
        )
    ),
    async execute(interaction, utils){
        try{
            await S_CMD_postStatusChannel(interaction, utils)
        }
        catch(err){
            hereLog(`[kart_clips] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }  
    }
}

function kart_destroy(utils){
    hereLog("destroy…");
    if(Boolean(stop_job)){
        delete stop_job;
        stop_job= undefined;
    }
    if(Boolean(start_job)){
        delete start_job;
        start_job= undefined;
    }
    if(Boolean(status_job)){
        delete status_job;
        status_job= undefined;
    }
}

let E_RetCode= my_utils.Enums.CmdRetCode

function ogc_kart(strashBotOldCmd, clearanceLvl, utils){
    let message= strashBotOldCmd.msg_obj
    let args= strashBotOldCmd.args
    let cmd= strashBotOldCmd.command

    var msg_payload= undefined
    if(["server","info","about","?"].includes(args[0]))
        msg_payload= `This command is a relic of a bygone age. We use slash commands now, noob, lol.\n`+
                    `Try \`/kart_info\`, idk?`
    else if(["password","pwd","access","admin"].includes(args[0])){
        msg_payload= `Your misguided thirst for power led you to this dead end. Using an *old style* command? Pathertic.\n`+
                    `Anyway, try using  something like \`/kart_password\`, idk…`
    }
    else if(["run","launch","start","go","vroum"].includes(args[0])){
        msg_payload= `\**giggles*\* Now what kind of simpleton do we have here? Not using slash commands? ROFL\n`+
                    `Stop embarassing yourself any further and use \`/kart_server start\`, lol.`
    }
    else if(["clip","clips","replay","replays","video","vid","videos"].includes(args[0])){
        msg_payload= `Slash commands, motherfucker! Do you use it?\n`+
                    `This be like \`/kart_clips\` or some shit…`        
    }
    else if(["map","maps","race","races","level","levels","stage","stages"].includes(args[0])){
        msg_payload= `This isn't the command you are looking for…\n`+
                    `\`/kart_ingames maps\`, hm?`
    }
    else if(["skin", "skins", "char", "chara" ,"perso", "character", "racer", "racers", "characters"].includes(args[0])){
        msg_payload= `Nein nein nein nein!!!\n`+
                    `Sie müssen \`/kart_ingames racers\` verwenden!`
    }
    else if(["addons","add-ons","addon","add-on","module","modules","mod","mods"].includes(args[0])){
        msg_payload= `Yo, fam.\n`+
                    `Got anymore of those \`/kart_addons\` or \`/kart_addons_manage\` slash commands?`
    }

    if(Boolean(msg_payload)){
        message.reply(msg_payload)
    }
    else{
        message.reply(`AaaAaAArrrrg da fuck mannnd dddzeezfezf is this shsshshshhit?\n`+
                    `We use slash commands now, you doofus! => \`/kart_<something>\`, frick!`
        )
    }

    return E_RetCode.ERROR_INPUT
}


module.exports= {
    slash_builders: [
        slashKartInfo,
        slashKartPassword,
        slashKartStartStop,
        slashKartAddonManage,
        slashKartAddons,
        slashKartIngames,
        slashKartClip,
        slaskKartDiscord
    ],
    oldGuildCommands: [
        {name: 'kart', execute: ogc_kart}
    ],
    init: kart_init,
    initPerGuild: kart_init_per_guild,
    destroy: kart_destroy
}

