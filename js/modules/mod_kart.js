const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, InteractionContextType } = require("discord.js")

const fs= require( 'fs' );
const path= require('path')
const child_process= require("child_process");
const cron= require('node-cron');
const axios= require('axios');
const jwt= require("jsonwebtoken");
const fetch = require('node-fetch');
const {ActivityType}= require('discord.js');

const KS= require('./kart/kart_stuff')


const my_utils= require('../utils.js');
const { util } = require("config");


let hereLog= (...args) => {console.log("[Kart_Module]", ...args);};

var kart_stuff= undefined

var l_guilds= [];


function __kartCmd(command){
    var ks= undefined;
    var srv= {}
    return (Boolean(ks=kart_stuff) && Boolean(command))?
                (Boolean(kart_stuff.Settings.grf('server_commands.through_ssh')))?
                    Boolean(srv.ip=kart_stuff.Settings.grf('server_commands.server_ip')) && Boolean(srv.user=kart_stuff.Settings.grf('server_commands.distant_user'))?
                        (`ssh ${srv.user}@${srv.ip}`+
                            ((srv.port=kart_stuff.Settings.grf('server_commands.server_port'))?` -p ${srv.port}`:'')
                            + ` ${command}`
                        )
                    :       "false"
                :   command
            :   "false";
}

function _serverServiceStatus_API(karter=undefined){
    return new Promise( (resolve, reject) => {
        if ((!Boolean(kart_stuff)) || !Boolean(kart_stuff.Api)){
            hereLog(`[server status] bad config…`);
            reject("Bad info - couldn't access kart_settings…")
        }
        
       kart_stuff.Api.service(karter).then(handle => {
            handle
            .onSuccess(response => {
                if(Boolean(response.data) && Boolean(response.data.status)){
                    resolve(response.data.status.toUpperCase());
                }
                else{
                    hereLog(`[bad server service result] from "service" endpoint…`)

                    resolve('UNAVAILABLE');
                }
            }).catch(error_action => {
                hereLog(`[server status] API call to 'service' endpoint error - ${error_action}`)

                resolve('UNAVAILABLE');
            }).Parse()
        })
    });
}

function _kartServiceOp(auth, op="restart", karter="ringracers"){
    return kart_stuff.Api.service_op(
        `${op}`, auth, karter
    ).then( async handle => {
        return await (handle
        .onSuccess(response => {
            return response.data
        }).onCode(503, response => {
            let data= response.data
            if(data && data.state==="cooldown"){
                return data
            }
            else{
                throw new Error(`Error on '${op}' server - no data`)
            }
        }).catch(error_action => {
            throw new Error(`Error on '${op}' server - ${error_action}`)
        }).Parse())
    }).catch(err => {
        throw new Error(`Error on '${op}' server - ${err}`)
    })
}

let _stopServer= (karter="ringracers", auth) => _kartServiceOp(
    auth, "stop", karter
)
let _restartServer= (karter="ringracers", auth) => _kartServiceOp(
    auth, "restart", karter
)


function _autoStopServer(utils){
    return _serverServiceStatus_API().then( r => {
        if(r==='UP'){
            hereLog("[auto stop] stopping server…");
            _stopServer(
                kart_stuff.Settings.DefaultRacer,
                _generateAuthPayload(undefined, utils)
            );
            
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

async function _isServerRunning(karter=undefined){
    return await _serverServiceStatus_API(karter).then( r => {
        if(r==='UP'){
            return true
        }
        return false;
    }).catch(e => {
        return false
    })
}

function _autoStartServer(utils){
    var didAutoStop= l_guilds.some( (g) => {
        return Boolean(utils.settings.get(g, "auto_stop"))
    });
   
    return _serverServiceStatus_API().then( r => {
        if(r!=="UP" && didAutoStop){
            hereLog("[auto start] restarting server…");
            _restartServer(
                kart_stuff.Settings.DefaultRacer,
                _generateAuthPayload(undefined, utils)
            )
        }
    }).catch(e => {
        if(didAutoStop){
            hereLog("[auto start] restarting server…");
            _restartServer(
                kart_stuff.Settings.DefaultRacer,
                _generateAuthPayload(undefined, utils)
            )
        }
    }).finally(() => {
        l_guilds.forEach( (g) =>{
            utils.settings.set(g, "auto_stop", false);
        });
    })
}

const ADDRESS_PORT_MATCH=/^(\S*):([1-9][0-9]*)$/

function __processConnectionString(coStr){
    if(!Boolean(coStr)){
        let karter= kart_stuff.Settings.DefaultRacer
        return {
            karter,
            address: karter
        }
    }

    if(kart_stuff.Settings.RacerNames.includes(coStr)){
        return {
            karter: coStr,
            address: coStr
        }
    }
    
    let match= coStr.match(ADDRESS_PORT_MATCH)
    if(Boolean(match)){
        return { address: match[1], port: Number(match[2])}
    }

    return { address: coStr }
}

function _askServInfos(connectionString=undefined){
    var connection= __processConnectionString(connectionString)

    let a= connection.address, p= connection.port;
    let karter= connection.karter

    return new Promise( (resolve, reject) => {
        if( Boolean(karter) ){
            _serverServiceStatus_API(karter)
                .then(service_status => resolve(service_status))
                .catch(e => {
                    hereLog(`[askServInfo] > [serverStatus] Error - ${e}`)
                    resolve("UNAVAILABLE")
                })
        }
        else resolve(undefined)
    }).then( service_status => {
        if(service_status==="DOWN"){
            return { service_status, connectionInfo: connection }
        }
        else{
            return kart_stuff.Api.info(a, p).then( async handle => {
                return await (handle.onSuccess(response => {
                    var kart_infos= response.data
                    kart_infos.service_status= service_status
                    kart_infos.connectionInfo= connection

                    return kart_infos
                }).fallBack(response => {
                    hereLog(`[askServInfo] API bad response status: ${response.status}`);
                    throw new Error("API info - bad response")
                }).catch(error_action => {
                    hereLog(`[askServInfo] API bad response - ${error_action}`);
                    throw new Error("API info - bad response")
                }).Parse())
            }).catch(err => {
                hereLog(`[askServInfo] API /info error - ${err}`)
                throw(new Error("API info - error"))
            });
        }
    });
}

var _oldServInfos= {};
var _oldServerPop= {};

let AppThresholds= {
    srb2kart: [
        {   number: 4,
            message: "Looks like some guys wana race on some good'ol SRB2Kart! 🏁",
            coolDownTime: 30*1000, //4 min
            color: 0x88ccff
        },{ number: 8,
            message: "More people just joined the SRB2Kart party!!! 🏎💨",
            coolDownTime: 30*1000, //4 min
            color: 0xa020f0
        }, { number: 0,
            message: "Fun's over… SRB2Kart is going back to sleep 🛌",
            comingFromTop: true,
            color: 0x666666
        }
    ],
    ringracers: [
        {   number: 4,
            message: "Looks like some guys are hungy for some rings! 🏁",
            coolDownTime: 30*1000, //4 min
            color: 0xffa500
        },{ number: 8,
            message: "More people are racing *at the next level*! 🏎💨",
            coolDownTime: 30*1000, //4 min
            color: 0xff0000
        }, { number: 0,
            message: "Fun's over… No more rings for robotnik… 🛌",
            comingFromTop: true,
            color: 0x666666
        }
    ]
}
let CheckTimeCycleInterval= 60*60*1000; //1 hour

var PlayerNumStepCheckInfos={
    srb2kart: {
        iterator: 0,
        lastNumOfPlayers: 0,
        lastCheckStartTimeStamp: 0,
        lastCheckStepTimeStamp: 0,
    },
    ringracers: {
        iterator: 0,
        lastNumOfPlayers: 0,
        lastCheckStartTimeStamp: 0,
        lastCheckStepTimeStamp: 0,
    },
}
function __checkPlayerNumStep(karter, numberOfPlayers){
    if(numberOfPlayers<0){
        PlayerNumStepCheckInfos[karter]= {
            iterator: 0,
            lastNumOfPlayers: 0,
            lastCheckStartTimeStamp: 0,
            lastCheckStepTimeStamp: 0,
        }

        return undefined;
    }

    let _karter_pnsci= PlayerNumStepCheckInfos[karter]
    if(!Boolean(_karter_pnsci)) return undefined

    let timeElapsed= Date.now()-_karter_pnsci.lastCheckStartTimeStamp;
    if(timeElapsed<CheckTimeCycleInterval) return undefined;

    if(_karter_pnsci.iterator===0 &&
        _karter_pnsci.lastCheckStepTimeStamp<=0
    ){  //allow for first step's coolDownTime to take effect
        PlayerNumStepCheckInfos[karter].lastCheckStepTimeStamp= Date.now()
        return undefined;
    }

    let karter_playerNumSteps= AppThresholds[karter]
    if(!Boolean(karter_playerNumSteps)) return undefined

    var res= undefined;
    let timeStepElapsed= Date.now()-_karter_pnsci.lastCheckStepTimeStamp
    for(var i=_karter_pnsci.iterator; i<karter_playerNumSteps.length; ++i){

        let testThreshold= karter_playerNumSteps[i];
        if( ((  testThreshold.number>=_karter_pnsci.lastNumOfPlayers
                &&  (!Boolean(testThreshold.comingFromTop))
                &&  numberOfPlayers>=testThreshold.number
            ) || (
                testThreshold.comingFromTop
                &&  _karter_pnsci.iterator>0 //need to at least have crossed first threshold…
                &&  testThreshold.number<_karter_pnsci.lastNumOfPlayers
                && numberOfPlayers<=testThreshold.number
            )) && ( (!Boolean(testThreshold.coolDownTime)) || (testThreshold.coolDownTime<=timeStepElapsed) )
        ){
            _karter_pnsci.iterator= i+1;
            _karter_pnsci.lastCheckStepTimeStamp= Date.now()

            res= {
                number: testThreshold.number,
                message: testThreshold.message,
                color: testThreshold.color
            }
        }
    }
    _karter_pnsci.lastNumOfPlayers= numberOfPlayers;
    if(_karter_pnsci.iterator>=karter_playerNumSteps.length){
        _karter_pnsci.iterator= 0;
        _karter_pnsci.lastCheckStepTimeStamp= 0
        _karter_pnsci.lastCheckStartTimeStamp= Date.now();
    }
    PlayerNumStepCheckInfos[karter]= _karter_pnsci

    return res
}

let lastMessagesPerGuild= {}

const APP_ID= {
    UNKNOWN: 0,
    SRB2K: 1,
    DRRR: 2
}

function ___AppNum_fromServDataObj(data){
    var str= kart_stuff.Settings.DefaultRacer
    if((typeof data)==='string'){
        str= data
    }
    else{
        str= Boolean(data)? data.application : ""
    }

    str= str.toLowerCase()
    return (str==='ringracers')? APP_ID.DRRR : ((str==='srb2kart')? APP_ID.SRB2K : APP_ID.UNKNOWN)
}

function _checkServerStatus(karter, utils){
    hereLog(`[checkStatus]{${karter}} checking status…`)
    var bot= utils.getBotClient();

    let _activityStatus= {
        'ringracers': "Hosting Dr Robotnik's Ring Races!",
        'srb2kart': "Hosting SRB2Kart Races!"
    }
    let _postCancelStatus= () => {
        for(var r in _oldServerPop){
            let p= _oldServerPop[r]
            if(p!==undefined && p>0){
                return _activityStatus[r] ?? ''
            }
        }
        return ''
    }

    let _kill= (k) => {
        __checkPlayerNumStep(k, -1)
    
        _oldServerPop[k]= undefined
        bot.user.setActivity(_postCancelStatus());

        return
    }

    kart_stuff.ApiCache.getPopulation(karter, true).then(pop => {
        if(pop===undefined){
            _kill(karter)
        }

        let AppNum= ___AppNum_fromServDataObj(karter)
        
        let infoStep= __checkPlayerNumStep(karter, pop);
        if(Boolean(infoStep)){
            bot.guilds.fetch().then(guilds => {
                guilds.forEach(guild => {
                    post_status_channel_id= utils.settings.get(guild,"post_status_channel");

                    if(Boolean(post_status_channel_id)){
                        guild.fetch().then(g => {
                            g.channels.fetch(post_status_channel_id).then(post_channel => {
                                let color= infoStep.color ?? 0xffffff
                                var msg=lastMessagesPerGuild[guild.id]
                                var msgContent= {
                                    embeds: [{
                                        color,
                                        title: `${pop} playing`,
                                        fields: [{
                                            name: `StrashBot Kart${AppNum===APP_ID.DRRR?'R':''}ing`,
                                            value: infoStep.message,
                                            inline: false
                                        }],
                                        footer: { text: 'strashbot.fr' }
                                    }]
                                };
                                

                                ( (Boolean(msg)) ?
                                        msg.fetch().then(m => {return m.reply(msgContent);})
                                            .catch(err => {return post_channel.send(msgContent);})                                            
                                    :   post_channel.send(msgContent)
                                ).then(message => {
                                    const channelSnowflake = message.channel.id;
                                    const messageSnowflake = message.id;

                                    lastMessagesPerGuild[guild.id]= (pop>0)? message : undefined
                                    
                                    fs.appendFile(path.join(__dirname, `numPlayerStatus_sendMessages_${message.guildId}.txt`), 
                                        `${channelSnowflake},${messageSnowflake}\n`,
                                        (err) => {
                                            if (err) hereLog(`Coundln't write ch;msg IDs to 'numPlayerStatus_sendMessages_${message.guildId}.txt''`);
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

        let old_pop= _oldServerPop[karter]
        if( (old_pop===undefined) || (pop !== old_pop) ){
            _oldServerPop[karter]= pop;
            
            if(pop>0){
                hereLog(`Changes in srb2kart server status detected… (player count: ${pop})`);
                bot.user.setActivity(`Hosting ${(AppNum>=APP_ID.DRRR)?"Dr Robotnik's Ring Races":"SRB2Kart Races"}`, { type: ActivityType.Playing });
            }
            else{
                hereLog(`Changes in srb2kart server status detected… (not enough player though)`);
                bot.user.setActivity(_postCancelStatus());
            }
        }
    }).catch(err => {
        hereLog(`[checkStatus]{${karter}} error - ${err}`)
        _kill(karter)
    })
}

var stop_job= undefined;
var start_job= undefined;
var status_job= undefined;
var status_racer_check_queue= undefined

function kart_init(utils){
    kart_stuff= new KS.KartStuff()

    status_racer_check_queue= kart_stuff.Settings.RacerNames

    if(!Boolean(stop_job)){
        stop_job= cron.schedule('0 4 * * *', async () =>{
            hereLog("[schedule] 4 am: looking to stop srb2kart serv…");
            try{
                await _autoStopServer(utils);
            } catch(err){
                hereLog(`[cron-job]{stop} failure stopping server - ${err}`)
            }
        });
    }

    if(!Boolean(start_job)){
        start_job= cron.schedule('0 8 * * *', () =>{
            hereLog("[schedule] 8 am: looking to start srb2kart serv…");
            try{
                _autoStartServer(utils)
            } catch(err){
                hereLog(`[cron-job]{start} failure starting server - ${err}`)
            }
        });
    }

    if(!Boolean(status_job)){
        status_job= cron.schedule('*/2 * * * *', () =>{
            try{
                let karter= status_racer_check_queue[0]
                _checkServerStatus(karter, utils)
                status_racer_check_queue=
                    [ status_racer_check_queue.pop() ].concat(
                        status_racer_check_queue
                    )
            } catch(err) {
                hereLog(`[cron-job]{status} failure checking status - ${err}`)
            }
        });
    }

    hereLog("initialiazing all the stuff 🏁")
}


var clean_jobs= []
function kart_init_per_guild(guild, utils){
    

    if( !Boolean(clean_jobs.find(gj => gj.id===guild.id)) ){
        let clean_job= cron.schedule('0 6 * * *', async () => {
            try{
                hereLog(`[schedule](${guild}) 6 am: cleaning status post channel…`);
                // Read the channel and message snowflakes from the file
                if(!fs.existsSync(path.join(__dirname, `numPlayerStatus_sendMessages_${guild.id}.txt`))){
                    hereLog(`file ${path.join(__dirname, `numPlayerStatus_sendMessages_${guild.id}.txt`)} not here…`)
                    return;
                }

                const messageSnowflakes = fs.readFileSync(path.join(__dirname, `numPlayerStatus_sendMessages_${guild.id}.txt`), 'utf-8').split('\n');
                
                // Iterate over each line in the file and delete the corresponding message
                for (const line of messageSnowflakes) {
                if (line.trim() !== '') {
                    const [channelSnowflake, messageSnowflake] = line.split(',');
                    
                    try {
                        const channel = await guild.channels.fetch(channelSnowflake);
                        if(Boolean(channel) && channel.guild.id===guild.id){
                            let message= await channel.messages.fetch(messageSnowflake);
                            message.delete();
                            hereLog(`(clean_job){${guild}} Deleted message ${messageSnowflake} in channel ${channelSnowflake}`);
                        }
                    } catch (error) {
                        hereLog(`(clean_job){${guild}} failed delete of ${messageSnowflake} in channel ${channelSnowflake}`,
                                error
                        );
                    }
                }
                }
                
                // Clear the file
                fs.writeFile(path.join(__dirname, `numPlayerStatus_sendMessages_${guild.id}.txt`), '', (err) => {
                    if (err)
                        hereLog(`(clean_job){${guild}} couldn't clear file 'numPlayerStatus_sendMessages_${guild.id}.txt' `,
                            err
                        );
                });
            } catch(err){
                hereLog(`[cron-job]{clean} failure cleaning post channel - ${err}`)
            }
        });

        clean_jobs.push({id: guild.id, job: clean_job})
    }
}

async function S_CMD__kartInfo(interaction, utils){
    await interaction.deferReply();

    let connectionStr= interaction.options.getString('server')
    
    var embed= {}
    embed.title= `Kart Server${Boolean(connectionStr)? ` @ \`${connectionStr}\``:''}`;
    embed.color= 0xff0000 //that's red (i hope? this rgba, right?)

    return await _askServInfos(connectionStr).then(async serverInfos => {
        embed.fields=[];

        let karter= serverInfos.connectionInfo.karter
        if(Boolean(karter)){
            embed.title= `Strashbot *${karter}* server`
        }

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

            let AppNum= ___AppNum_fromServDataObj(ss)

            embed.color= (AppNum===APP_ID.DRRR)?
                            0xff0000 //red for DRRR
                        :   (AppNum===APP_ID.SRB2K)?
                                0xa020f0 //purple for srb2k
                            :   0xff8844 //orange otherwise

            if(AppNum>APP_ID.UNKNOWN){
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
                        `${(AppNum===APP_ID.SRB2K)?`${ss.mapname} - `:''}*${ss.maptitle}*`
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

            if(AppNum>=APP_ID.DRRR && ss.gametypename){
                embed.fields.push({
                    name: 'Gametype',
                    value: `${ss.gametypename}`,
                    inline: true
                })
            }
            else if(Boolean(ss) && [2,3].includes(ss.gametype)){
                embed.fields.push({
                    name: (ss.gametype===2)?'KartSpeed':'Gametype',
                    value: (ss.gametype===2 && Boolean(ss.kartspeed))?
                            ss.kartspeed
                        :   "Battle",
                    inline: true
                })
            }

            if(AppNum>=APP_ID.DRRR && Boolean(ss.kartvars)){
                embed.fields.push({
                    name: "Server type",
                    value: (ss.kartvars.isdedicated)? "Dedicated" : "Listen",
                    inline: true
                })

                let gear= ss.kartvars.gear ?? 0
                embed.fields.push({
                    name: "Gear (speed)",
                    value: `${gear} (${(gear>2)?"hard":((gear===2)?"normal":"easy")})`,
                    inline: true
                })
            }

            if(AppNum>APP_ID.DRRR && ss.avgpwrlvl!==undefined){
                embed.fields.push({
                    name: "Average Powerlevel",
                    value: `${ss.avgpwrlvl}`
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

async function S_CMD__kartPassword(interaction, utils){
    let karter= interaction.options.getString('karter') ?? kart_stuff.Settings.DefaultRacer

    await interaction.deferReply({ ephemeral: true })
    await _serverServiceStatus_API(karter).then(async r => {
        if(r==="UP"){
            await (await kart_stuff.Api
                .get_password(
                    _generateAuthPayload(interaction.user.id, utils), karter
                )
            )
            .onCode(200, async response => {
                let pwd= response.data.password;
                await interaction.editReply(
                    `Server admin password: \`${pwd}\`\n` +
                    `\tUne fois connecté au serveur **${karter}**, ingame utilise la commande ` +
                    `\`login ${pwd}\` pour accéder à l'interface d'admin!`
                ).catch(err => 
                    hereLog(`[getPassword]{${karter}} reply error (7) - ${err}`)
                );
            })
            .onCode([401,403], async response => {
                hereLog(`[getPassword]{${karter}} access failure: ${response.status}`)
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                    `Authorization to fetch ${karter}'s password was denied…`
                ).catch(err => 
                    hereLog(`[getPassword]{${karter}} reply error (1) - ${err}`)
                );
            })
            .onCode(404, async response => {
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                    `No password for '${karter}' seems to be available…`
                ).catch(err => 
                    hereLog(`[getPassword]{${karter}} reply error (2) - ${err}`)
                );
            })
            .catch(async err => {
                hereLog(`[getPassword]{${karter}} response error (8) - ${err}`)
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                    `Error occured trying to fetch password for \`${karter}\`…`
                ).catch(err => 
                    hereLog(`[getPassword]{${karter}} reply error (6) - ${err}`)
                );
            }).Parse();
        }
        else{
            await interaction.editReply(`Aucun serveur '${karter}' actif…`);
        }
    }).catch(async err => {
        hereLog(`[getPassword]{${karter}} reply error (9) - ${err}`)
        await interaction.editReply(`Aucun serveur '${karter}' actif…`);
    })
}

async function __S_S_CMD_KartServer_Op(op="restart", interaction, utils){
    let force= (interaction.options.getBoolean('force') ?? false)
    let karter= (interaction.options.getString('karter') ?? kart_stuff.Settings.DefaultRacer)

    if(!kart_stuff.Settings.RacerNames.includes(karter)){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            `Unknown racer "*${karter}*"…`
        );

        return
    }

    let population= await kart_stuff.ApiCache.getPopulation(karter)

    if(Boolean(population) && !force){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
            "There might be some players remaining on Strashbot srb2kart server…\n"+
            `Are you sure you want to ${op} the server?\n`+
            `If so you need to set the \`force\` option to \`True\``
        );

        return
    }

    let res= await _kartServiceOp(
        _generateAuthPayload(interaction.user.id, utils),
        op, karter
    ).catch(e => {
        hereLog(`[Kart_Service]{${op}} Error api call - ${e}`)
    });
    if(res){
        if(res.state==='cooldown'){
            await interaction.editReply(
                `Cannot ${op} the ${karter} server at the moment… ⏳` +
                (Boolean(res.remaining_seconds)?
                        `\n(Please wait ${res.remaining_seconds} seconds to try again.)`
                    :   ''
                )
            );
        }
        else if(res.state==='ok'){
            await interaction.editReply(`Strashbot ${karter} server ${op} - success…`);
        }
        else{
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Error while trying to ${op} ${karter} server… 😰`
            );
        }
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `Error while trying to ${op} ${karter} server… 😰`
        );
    }
}

let S_S_CMD_KartServer_Stop= async (interaction, utils) => (await __S_S_CMD_KartServer_Op('stop', interaction, utils))
let S_S_CMD_KartServer_Restart= async (interaction, utils) => (await __S_S_CMD_KartServer_Op('restart', interaction, utils))


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
    if(!Boolean(addr=kart_stuff.Settings.grf('server_commands.server_ip')) || !Boolean(dUser=kart_stuff.Settings.grf('server_commands.distant_user'))){
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
        var p= undefined
        let ssh_cmd= `ssh ${dUser}@${addr}`+
            ( (Boolean(p=kart_stuff.Settings.grf('server_commands.server_port')))?
                ` -p ${p}`
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

async function S_CMD__kartServer(interaction, utils){
    await interaction.deferReply()

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='stop'){
        await S_S_CMD_KartServer_Stop(interaction, utils)
    }
    else if(subcommand==="restart"){
        await S_S_CMD_KartServer_Restart(interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`start\`,\`stop\`,\`restart\``
        )
    }
}

async function __Opt_S_S_CMD_kartAddon_loadOrder_Get(karter, interaction){
    await kart_stuff.Api.get_addon_load_order_config(karter).then( async handle => {
        await (handle.onSuccess(async response => {
            await interaction.editReply( {
                content: `## Strashbot's ${karter} server addons load order config\n`,
                files: [{
                    attachment: Buffer.from(response.data),
                    name: `addons_load_order.yaml`
                }]
            } ).catch(err => 
                hereLog(`[getAddonsLoadOrder]{${karter}} reply error (4) - ${err}`)
            )
        }).onCode(404, async response => {
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `No "*load order config*" found or set for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[getAddonsLoadOrder]{${karter}} reply error (1) - ${err}`)
            );
        }).fallBack(async response => {
            hereLog(`[getAddonsLoadOrder] unhandled status code: ${response.status}…`)

            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Error occured accession addons load order config from \`${karter}\`…`
            ).catch(err => 
                hereLog(`[getAddonsLoadOrder]{${karter}} reply error (2) - ${err}`)
            );
        }).catch(async error_action => {
            hereLog(`[getAddonsLoadOrder]{${karter}} error fetching addon load order config - ${error_action}`)

            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Error occured accession addons load order config from \`${karter}\`…`
            ).catch(err => 
                hereLog(`[getAddonsLoadOrder]{${karter}} reply error (2) - ${err}`)
            );
        }).Parse())
    }).catch(async err => {
        if(Boolean(err.response) && Boolean(err.response.status)){
            await status_parse(err.response.status, interaction)
        }
        else{
            hereLog(`[getAddonsLoadOrder]{${karter}} error fetching addon load order config - ${err}`)
            await status_parse(999, interaction)
        }
    })
}

async function __Opt_S_S_CMD_kartAddon_loadOrder_Set(url, karter, interaction, utils){
    var _url= my_utils.checkUrl(url)

    if(!Boolean(_url)){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Invalid url \`${_url}\`…`
        ).catch(err => 
            hereLog(`[setAddonsLoadOrder]{${karter}} reply error (0) - ${err}`)
        );
        return
    }

    await kart_stuff.Api.set_addon_load_order_config(
        _url, _generateAuthPayload(interaction.user.id, utils), karter
    ).then( async handle => {
        await (handle
        .onSuccess(async response => {
            await interaction.editReply(
                `## New *${karter}* addon load config upload\n\n`+
                `✅ Success`
            ).catch(err => 
                hereLog(`[setAddonsLoadOrder]{${karter}} reply error (6) - ${err}`)
            );
        }).onCode([401,403], async response => {
            hereLog(`[setAddonsLoadOrder]{${karter}} access failure: ${response.status}`)
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                `Access failure on "*load order config*" upload for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[setAddonsLoadOrder]{${karter}} reply error (1) - ${err}`)
            );
        }).onCode(404, async response => {
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `Can't upload "*load order config*" for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[setAddonsLoadOrder]{${karter}} reply error (2) - ${err}`)
            );
        }).onCode(415, async response => {
            let data= response.data
            await interaction.editReply({                    
                content: ( `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                            `Uploaded config for \`${karter}\` is invalid or badly constructed…` ),
                files: (data && data.details) ?
                            [{
                                attachment: Buffer.from(data.details),
                                name: `load_order.yaml.errors.txt`
                            }]
                        : undefined
            }).catch(err => 
                hereLog(`[setAddonsLoadOrder]{${karter}} reply error (7) - ${err}`)
            );
        }).onCode(440, async response => {
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `Upload file is too big!`
            ).catch(err => 
                hereLog(`[setAddonsLoadOrder]{${karter}} reply error (3) - ${err}`)
            );
        }).onCode([441,442], async response => {
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `"*Load order config*" has bad type, or extension`
            ).catch(err => 
                hereLog(`[setAddonsLoadOrder]{${karter}} reply error (4) - ${err}`)
            );
        }).onCode(513, async response => {
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Upload error on server…`
            ).catch(err => 
                hereLog(`[setAddonsLoadOrder]{${karter}} reply error (5) - ${err}`)
            );
        }).fallBack(async response => {
            hereLog(`[setAddonsLoadOrder] unhandled status code: ${response.status}…`)

            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Error occured installing new *load order config* for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[setAddonsLoadOrder]{${karter}} reply error (6) - ${err}`)
            );
        }).catch(async action_error => {
            hereLog(`[setAddonsLoadOrder]{${karter}} error setting addon load order config - ${err}`)

            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Error occured installing new *load order config* for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[setAddonsLoadOrder]{${karter}} reply error (7) - ${err}`)
            );
        }).Parse())
    }).catch(async err => {
        hereLog(`[setAddonsLoadOrder]{${karter}} error setting addon load order config - ${err}`)

        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `Error occured installing new *load order config* for \`${karter}\`…`
        ).catch(err => 
            hereLog(`[setAddonsLoadOrder]{${karter}} reply error (8) - ${err}`)
        );
    })
}

async function Interaction_checkKarter_StringOpt(interaction, utils){
    try{
        var karter= interaction.options.getString('karter') ?? kart_stuff.Settings.DefaultRacer
        if(!kart_stuff.Settings.RacerNames.includes(karter)){
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `Invalid karter "*${karter}*"…`
            )

            return undefined
        }
        return karter
    } catch(err){
        hereLog(`[checkKarter] karter check failed - err`)
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `Error selection racer's server…`
        )
        return undefined
    }
}

async function S_S_CMD_kartAddon_loadOrder(interaction, utils){
    var karter= await Interaction_checkKarter_StringOpt(interaction, utils)
    if(!Boolean(karter)) return

    let attachment= interaction.options.getAttachment('file_yaml')
    var url= interaction.options.getString('url')

    if(Boolean(attachment)){
        url= attachment.url
    }
    
    if(Boolean(url)){ //set
        await __Opt_S_S_CMD_kartAddon_loadOrder_Set(url, karter, interaction, utils)
    }
    else{ //get
        await __Opt_S_S_CMD_kartAddon_loadOrder_Get(karter, interaction)
    }
}

async function _addon_action(kartApiMethodName, addon_filename, auth, karter){
    return kart_stuff.Api[kartApiMethodName](addon_filename, auth, karter).then(async handle => {
        return await (handle
        .onSuccess(response=> {
            return {success: true, rc: response.status}
        }).fallBack(response => {
            return {success: false, rc: response.status}
        }).catch(error_action => {
            hereLog(`[addon_action](${kartApiMethodName}){${addon_filename}}{${karter}} error - ${error_action}`)
            return {success: false, rc: 999}
        }).Parse())
    }).catch(err => {
        if(Boolean(err.response) && Boolean(err.response.status)){
            return {success: false, rc: err.response.status}
        }
        else{
            throw err
        }
    })
}

let enable_addon = async (addon_filename, auth, karter) =>
    ( await _addon_action( 'enable_addon', addon_filename, auth, karter) )

let disable_addon = async (addon_filename, auth, karter) =>
    ( await _addon_action( 'disable_addon', addon_filename, auth, karter) )

let remove_addon = async (addon_filename, auth, karter) =>
    ( await _addon_action( 'remove_addon', addon_filename, auth, karter) )

async function S_S_CMD_kartAddon_Install(interaction, utils) {
    var karter= await Interaction_checkKarter_StringOpt(interaction, utils)
    if(!Boolean(karter)) return

    let attachment= interaction.options.getAttachment('addon_file')
    var url= interaction.options.getString('addon_direct_url')
    let b_enable= interaction.options.getBoolean('enable_addon') ?? true

    if(Boolean(attachment)){
        url= attachment.url
    }
    
    if(!Boolean(url)){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Need either a *file attachment* or an *url* of the addon to install`
        ).catch(err => 
            hereLog(`[addInstall]{${karter}} reply error (0) - ${err}`)
        );
    }
    else{
        var _url= my_utils.checkUrl(url)

        if(!Boolean(_url)){
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `Invalid url \`${_url}\`…`
            ).catch(err => 
                hereLog(`[addInstall]{${karter}} reply error (1) - ${err}`)
            );
            return
        }

        let auth= _generateAuthPayload(interaction.user.id, utils)
        await kart_stuff.Api.install_addon_from_url(_url, auth, karter).then(async handle => {
            await (handle
            .onSuccess(async response => {
                var addon_filename= my_utils.getFromFieldPath(response,'data.result.addon')
                var base_url=  undefined
                try{
                    base_url= kart_stuff.Settings.grf('addons_http_source', karter)
                } catch(err){
                    hereLog(`[addInstall]{${karter}} 'addons_http_source' fetch fail - ${err}`)
                }

                var msg= (`## Addons installed on *${karter}* server!\n\n` +
                        ((Boolean(addon_filename))?
                            ((Boolean(base_url))?
                                `### [${addon_filename}](${base_url}/${addon_filename})\n`
                            :   `### ${addon_filename}\n` )
                        :   '') )

                var xable_res= {success: false}
                try{
                    if(b_enable) xable_res= await enable_addon(addon_filename, auth, karter)
                    else xable_res= await disable_addon(addon_filename, auth, karter)
                } catch(err){
                    hereLog(`[addInstall]{${karter}} Error trying to ${b_enable?'en':'dis'}able addon after install - ${err}`)
                }

                if(xable_res.success){
                    msg+= `> addon ${b_enable?'en':'dis'}abled (but only effective next reboot)`
                }
                else{
                    msg+= `> ⚠ error occured trying to ${b_enable?'en':'dis'}able addon…`
                }

                await interaction.editReply(msg)
                    .catch(err => 
                        hereLog(`[addInstall]{${karter}} reply error (6) - ${err}`)
                    );
            }).onCode([401,403], async response => {
                hereLog(`[addInstall]{${karter}} access failure: ${response.status}`)
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                    `Access failure on "*addon_install*" for \`${karter}\`…`
                ).catch(err => 
                    hereLog(`[addInstall]{${karter}} reply error (2) - ${err}`)
                );
            }).onCode(404, async response => {
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                    `Addon install for \`${karter}\` seems unavailable…`
                ).catch(err => 
                    hereLog(`[addInstall]{${karter}} reply error (3) - ${err}`)
                );
            }).onCode(440, async response => {
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                    `Addon file is too big!`
                ).catch(err => 
                    hereLog(`[addInstall]{${karter}} reply error (4) - ${err}`)
                );
            }).onCode([441,442], async response => {
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                    `"Addon file has bad type, or extension`
                ).catch(err => 
                    hereLog(`[addInstall]{${karter}} reply error (5) - ${err}`)
                );
            }).onCode(513, async response => {
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Upload error on server…`
                ).catch(err => 
                    hereLog(`[addInstall]{${karter}} reply error (6) - ${err}`)
                );
            }).fallBack(async response => {
                hereLog(`[addInstall]{${karter}} unhandled status code: ${response.status}…`)
    
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Error occured install addon for \`${karter}\`…`
                ).catch(err => 
                    hereLog(`[addInstall]{${karter}} reply error (7) - ${err}`)
                );
            }).catch(async error_action => {
                hereLog(`[addInstall]{${karter}} error installing addon from '${_url}'- ${err}`)

                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Error occured install addon for \`${karter}\`…`
                ).catch(err => 
                    hereLog(`[addInstall]{${karter}} reply error (8) - ${err}`)
                );
            })
            .Parse())
        }).catch(async err => {
            hereLog(`[addInstall]{${karter}} error installing addon from '${_url}'- ${err}`)

            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Error occured install addon for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[addInstall]{${karter}} reply error (9) - ${err}`)
            );
        })
    }    
}

async function __Opt_S_S_CMD_kartAddon_Action_actionAddon(action, karter, addon_filename, interaction, utils) {
    var action_res= {success: false}
    let auth= _generateAuthPayload(interaction.user.id, utils)

    //default: enable
    var action_emoji= '✅'
    var action_ing= "enabling"
    var action_done= "enabled"
    try{
        if(action==='disable'){
            try{
                action_res= await disable_addon(addon_filename, auth, karter)
            } catch(err){
                hereLog(`[actionAddon]<${action}>{${karter}} Error trying to ${action} addon - ${err}`)
            }
            action_emoji= '⏹'
            action_ing= "disabling"
            action_done= "disabled"
        }
        else if(action==='remove'){
            try{
                action_res= await remove_addon(addon_filename, auth, karter)
            } catch(err){
                hereLog(`[actionAddon]<${action}>{${karter}} Error trying to ${action} addon - ${err}`)
            }
            action_emoji= '❎'
            action_ing= "removing"
            action_done= "removed"
        }
        else{
            action_res= await enable_addon(addon_filename, auth, karter)
        }
    } catch(err){
        hereLog(`[actionAddon]<${action}>{${karter}} Error trying to ${action} addon - ${err}`)
    }

    let status_parse= async (rc, interaction) => {
        try{
            if(rc===200){
                return true
            }
            else if(rc===201){
                hereLog(`[actionAddon]<${action}>{${karter}} unexpected: ${rc}`)
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} `+
                    `"*addon_${action}*" \`${addon_filename}\` for \`${karter}\` responsed unexpectedly…`
                ).catch(err => 
                    hereLog(`[actionAddon]<${action}>{${karter}} reply error (5) - ${err}`)
                );
            }
            else if(rc===400){
                hereLog(`[actionAddon]<${action}>{${karter}} bad request: ${rc}`)
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                    `"*addon_${action}*" \`${addon_filename}\` for \`${karter}\` seems like bad request…`
                ).catch(err => 
                    hereLog(`[actionAddon]<${action}>{${karter}} reply error (1) - ${err}`)
                );
            }
            else if(rc===401 || rc===403){
                hereLog(`[actionAddon]<${action}>{${karter}} access failure: ${rc}`)
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                    `Access failure on "*addon_${action}*" for \`${karter}\`…`
                ).catch(err => 
                    hereLog(`[actionAddon]<${action}>{${karter}} reply error (2) - ${err}`)
                );
            }
            else if(rc===404){
                hereLog(`[actionAddon]<${action}>{${karter}} not found?: ${rc}`)
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                    `Addon ${action_ing} \`${addon_filename}\` on \`${karter}\` seems unavailable…`
                ).catch(err => 
                    hereLog(`[actionAddon]<${action}>{${karter}} reply error (3) - ${err}`)
                );
            }
            else if(rc===513){
                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Addon ${action_ing} \`${addon_filename}\` on \`${karter}\` failure…`
                ).catch(err => 
                    hereLog(`[actionAddon]<${action}>{${karter}} reply error (4) - ${err}`)
                );
            }
            else{
                if(rc!==999){
                    hereLog(`[actionAddon]<${action}>{${karter}} unhandled status code: ${rc}…`)
                }

                await interaction.editReply(
                    `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                    `Error occured ${action_ing} addon \`${addon_filename}\` for \`${karter}\`…`
                ).catch(err => 
                    hereLog(`[actionAddon]<${action}>{${karter}} reply error (7) - ${err}`)
                );
            }

            return false
        } catch(err){
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `Error occured ${action_ing} addon \`${addon_filename}\` for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[actionAddon]<${action}>{${karter}} reply error (8) - ${err}`)
            );

            return false
        }
    }

    var base_url=  undefined
    try{
        base_url= kart_stuff.Settings.grf('addons_http_source', karter)
    } catch(err){
        hereLog(`[actionAddon]<${action}>{${karter}} 'addons_http_source' fetch fail - ${err}`)
    }

    if(action_res.success && status_parse(action_res.rc)){
        await interaction.editReply(
            `## Addon ${action_done} on StrashBot's *${karter}* server\n\n`+
            ( Boolean(base_url)? 
                `${action_emoji} [${addon_filename}](${base_url}/${addon_filename})\n`
            :   `${action_emoji} ${addon_filename}\n` ) +
            `(takes effect on next server restart…)`
        )
    }
    else{
        hereLog(`[actionAddon]<${action}>{${karter}} error ${action_ing} addon - ${err}`)
        await status_parse(999, interaction)
    }
}

async function S_S_CMD_kartAddon_action(interaction, utils) {
    var karter= await Interaction_checkKarter_StringOpt(interaction, utils)
    if(!Boolean(karter)) return

    let action= interaction.options.getString('action')
    let addon_filename= interaction.options.getString('addon_filename')
    
    if(['enable', 'disable', 'remove'].includes(action)){
        await __Opt_S_S_CMD_kartAddon_Action_actionAddon(action, karter, addon_filename, interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Invalid or unknown action \`${action}\`…`
        ).catch(err => 
            hereLog(`[sCmd_actionAddon]<${action}>{${karter}} reply error (0) - ${err}`)
        );
    }
}

async function S_CMD__kartAddonManager(interaction, utils){
    await interaction.deferReply()

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='load_order'){
        await S_S_CMD_kartAddon_loadOrder(interaction, utils)
    }
    else if(subcommand==='install'){
        await S_S_CMD_kartAddon_Install(interaction, utils)
    }
    else if(subcommand==='action'){
        await S_S_CMD_kartAddon_action(interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`load_order\`,\`install\`, or \`action\`…`
        )
    }
}

function _addonsInfo(karter){
    return kart_stuff.Api.get_addons(undefined, karter).then(async handle => {
        return await (handle
        .onSuccess(async response => {
            let response_data= response.data

            if(response_data.status==="not_found") return []
            if( Boolean(response_data.result) && Boolean(response_data.result.infos) ){
                if(response_data.status==="fetched"){
                    return response_data.result.infos
                } else if(response_data.status==="found"){
                    return [ response_data.info ]
                }
                else{
                    return []
                }
            }
            else{
                return []
            }
        }).onCode(404, async response => {
            return []
        }).catch(action_error => {
            hereLog(`[addonInfos_get] error on api call (1)? - ${action_error}`)

            throw({ status: "result_error" })
        }).Parse())
    })
    .catch(err => {
        if(Boolean(err.response) && err.response.status===404){
            return []
        }
        else if(err.status){
            throw err;
        }
        else{
            hereLog(`[addonInfos_get] error on api call (2)? - ${err}`)
            throw({status: "bad_response", error: err})
        }
    })
}

function __lookupNameInList(lookup, list){
    if(lookup.length>2 &&
        lookup.startsWith('/') && lookup.endsWith('/')   
    ){
        try{
            let rgx= new RegExp(lookup.slice(1,-1))
            return list.filter(e => rgx.test(e.name.toLowerCase()) || rgx.test(e.name))
        } catch(err){            
            throw new Error('bad_regex')
        }
    }
    else{
        return list.filter(e => e.name.toLowerCase().includes(lookup.toLowerCase()))
    }
}

async function _processAddonsInfoList(interaction, list, karter, lookup=undefined){
    let servAddons_infos=
        await _askServInfos(karter).then( kart_infos => {
            return {
                available: ((Boolean(kart_infos) && kart_infos.service_status==='UP')),
                addons: ((Boolean(kart_infos) && Boolean(kart_infos.addons))?
                        kart_infos.addons : [])
            }
        }).catch(err => {
            hereLog(`[cmd_kartAddons] askInfo(${karter}) fail - ${err}`)
            return { available: false, addons: [] }
        })
    var res_list= list
    var uninstalledButActiveAddons=
        (servAddons_infos.available)?
            servAddons_infos.addons.filter(e => Boolean(list.find(info => info.name!==e.name)))
        : []

    let withLookup= Boolean(lookup)
    if(withLookup){
        try{
            res_list= __lookupNameInList(lookup, list)

            uninstalledButActiveAddons= __lookupNameInList(lookup, uninstalledButActiveAddons)
        } catch(err){
            if (err && err.message==='bad_regex'){
                await interaction.editReply(
                        `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                        `\`${lookup}\` processed as RegExp, but invalid expression…`
                    )
            } else throw(err)
        }
    }


    var msg= `## Strashbot *${karter}* server installed addons\n` +
    ((withLookup)? `[matching \`${lookup}\` …]` : '') + "\n\n"

    var base_url=  undefined
    try{
        base_url= kart_stuff.Settings.grf('addons_http_source', karter)
    } catch(err){
        hereLog(`[cmd_kartAddons]{${karter}} 'addons_http_source' fetch fail - ${err}`)
    }

    let total_length= res_list.length + uninstalledButActiveAddons.length
    if(total_length<=0){
        msg+= "### no result, sorry… 😕"

        await interaction.editReply( msg ).catch(err =>
            hereLog(`[cmd_kartAddons]{${karter}} reply error (0) - ${err}`)
        )
    }
    else{
        if(total_length<=5){
            for(var addonInfo of res_list){
                msg+=
                    ((Boolean(base_url))?
                        `### [${addonInfo.name}](${base_url}/${addonInfo.name})\n`
                    :   `### ${addonInfo.name}\n` ) +
                    `> Size: ${my_utils.formatBytes(addonInfo.size)}\n`+
                    `> ${(addonInfo.enabled?"☑️ en":"▶️ dis")}abled\n`

                if(addonInfo.enabled && servAddons_infos.available){
                    msg+= ((Boolean(servAddons_infos.addons.find(info => info.name===addonInfo.name)))?
                            `> 💡 active\n`
                        :   `> 💤 inactive (wait server reboot?)\n`
                    )
                }

                if(Boolean(addonInfo.pendingOp)){
                    msg+= `> ⏳ pending \`${addonInfo.pendingOp}\` (next server restart)\n`
                }

                msg+= '\n'
            }
            for(var ghostAddon of uninstalledButActiveAddons){
                msg+= `### ~~${ghostAddon.name}~~\n`+
                    "> 👻 Loaded but unavailable…\n\n"
            }

            await interaction.editReply( msg ).catch(err =>
                hereLog(`[cmd_kartAddons]{${karter}} reply error (1) - ${err}`)
            )
        }
        else{
            let reduce= (obj => ({
                name: obj.name,
                size: obj.size,
                racer: obj.racer,
                active: ((servAddons_infos.available)? (servAddons_infos.addons.includes(obj.name)) : undefined),
                pendingOp: obj.pendingOp,
                url: ((Boolean(base_url))?`${base_url}/${obj.name}`:undefined)
            }))
            var resObj= {
                installed_addons: {
                    enabled: res_list.filter(e => e.enabled).map(reduce),
                    disabled: res_list.filter(e => !e.enabled).map(reduce),
                    ghosts: uninstalledButActiveAddons.map(e => ({ name: e.name }) )
                }
            }

            await interaction.editReply( {
                content: msg,
                files: [{
                    attachment: Buffer.from(JSON.stringify(resObj, null, 4)),
                    name: `strashbot_${karter}_addons.json`
                }]
            } ).catch(err => 
                hereLog(`[cmd_kartAddons]{${karter}} reply error (3) - ${err}`)
            )
        }
    }
}

async function S_CMD__kartAddons(interaction, utils){
    await interaction.deferReply()

    let karter= (interaction.options.getString('karter') ?? kart_stuff.Settings.DefaultRacer)
    let lookup= interaction.options.getString('lookup')

    await _addonsInfo(karter).then(addonsInfoList =>
        _processAddonsInfoList(interaction, addonsInfoList, karter, lookup)
    )
    .catch(err => {
        if(Boolean(err.status)){
            if(err.status==="result_error"){
                hereLog(`[cmd_kartAddons]{${karter}} result fetch problem`)
            }
            else{
                hereLog(`[cmd_kartAddons]{${karter}} recieved status '${err.status}'`)
            }
        }
        else{
            hereLog(`[cmd_kartAddons]{${karter}} fail acquire addon infos - ${err}`)
        }
        interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            "Data access error"
        ).catch(err => 
            hereLog(`[cmd_kartAddons]{${karter}} reply error - ${err}`)
        )
    })
}

function _customConfigInfo(karter){
    return kart_stuff.Api.get_custom_configs(karter).then(async handle => {
        return await (handle
        .onSuccess(response => {
            return response.data
        })
        .catch(action_error => {
            hereLog(`[configInfos_get] error on api call (1)? - ${error_action}`)
            throw({ status: "result_error" })
        })
        .Parse())
    })
    .catch(err => {
        hereLog(`[configInfos_get] error on api call (2)? - ${err}`)
        throw({status: "bad_response", error: err})
    })
}

async function _processConfigInfosData(interaction, config_info, karter){
    var msg= `## Strashbot *${karter}* server current custom config\n\n`

    let available_configs= my_utils.getFromFieldPath(config_info,'custom_cfg.available_configs')
    let enabled_custom_configs= config_info.enabled_custom_configs

    if((!enabled_custom_configs) || enabled_custom_configs.length<=0){
        msg+= "### None enabled\n"
    }
    else{
        msg+= "### Enabled\n"

        let id_available= available_configs.map(e => `${e.name}:${e.filename}`)
        for(enabled_cfg of enabled_custom_configs){
            msg+= `- *${enabled_cfg.name}* (*${enabled_cfg.file}*)`

            let id= `${enabled_cfg.name}:${enabled_cfg.file}`
            if(!id_available.includes(id)){
                msg+= ` [👻]`
            }
            msg+= "\n"
        }
    }
    msg+= "\n"

    if(available_configs && available_configs.length>0){
        msg+= "## Availabe configs\n"

        for(available_cfg of available_configs){
            msg+= `- *${available_cfg.name}* (*${available_cfg.filename}*)\n`
        }

        msg+= '\n'
    }

    let allowed_commands= my_utils.getFromFieldPath(config_info,'custom_cfg.allowed_commands')
    let b_send_allowed_cmd= Boolean(allowed_commands && allowed_commands.length>0)

    await interaction.editReply( {
        content: msg,
        files: ( 
            b_send_allowed_cmd ?
                    [{
                        attachment: Buffer.from(JSON.stringify({allowed_commands}, null, 4)),
                        name: `strashbot_${karter}_custom_config_allowed_commands.json`
                    }]
                :   []
        )
    }).catch(err => 
        hereLog(`[cmd_customConfigInfo]{${karter}} reply error (3) - ${err}`)
    )
}

async function S_S_CMD_kartCustomConfig_info(interaction, utils){
    let karter= (interaction.options.getString('karter') ?? kart_stuff.Settings.DefaultRacer)

    await _customConfigInfo(karter).then(config_info => {
        _processConfigInfosData(interaction, config_info, karter)
    })
    .catch(err => {
        if(Boolean(err.status)){
            if(err.status==="result_error"){
                hereLog(`[cmd_customConfigInfo]{${karter}} result fetch problem`)
            }
            else{
                hereLog(`[cmd_customConfigInfo]{${karter}} recieved status '${err.status}'`)
            }
        }
        else{
            hereLog(`[cmd_customConfigInfo]{${karter}} fail acquire addon infos - ${err}`)
        }
        interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            "Data access error"
        ).catch(err => 
            hereLog(`[cmd_kartAddons]{${karter}} reply error - ${err}`)
        )
    })
}

async function S_S_CMD_kartGetCustomConfig(interaction, utils) {
    let karter= (interaction.options.getString('karter') ?? kart_stuff.Settings.DefaultRacer)
    let config_name= interaction.options.getString('config')
    if(!config_name){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `No "*custom config*" provided \`${karter}\`…`
        ).catch(err => 
            hereLog(`[getCustomConfig]{${karter}} reply error (0) - ${err}`)
        );
    }

    await kart_stuff.Api.get_custom_yaml_config(config_name, karter).then( async handle => {
        await (handle
        .onSuccess( async response => {
            let filename= (config_name.endsWith('.yaml') || config_name.endsWith('.yml'))?
                                config_name
                            :   `${config_name}.yaml`
            await interaction.editReply( {
                content: `## Strashbot's ${karter} server addons load order config\n`,
                files: [{
                    attachment: Buffer.from(response.data),
                    name: `${filename}`
                }]
            } ).catch(err => 
                hereLog(`[getCustomConfig]{${karter}} reply error (4) - ${err}`)
            )
        }).onCode(404, async response => {
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `No custom config "*${config_name}*" found or set for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[getCustomConfig]{${karter}} reply error (1) - ${err}`)
            );
        }).fallBack(async response => {
            hereLog(`[getCustomConfig] unhandled status code: ${response.status}…`)

            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Error occured fetching custom config from \`${karter}\`…`
            ).catch(err => 
                hereLog(`[getCustomConfig]{${karter}} reply error (2) - ${err}`)
            );
        }).catch(async error_action => {
            hereLog(`[getCustomConfig]{${karter}} Error handle - ${error_action}`)
            
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `Error occured accession custom config '${config_name}' from  \`${karter}\`…`
            ).catch(err => 
                hereLog(`[getCustomConfig]{${karter}} reply error (3) - ${err}`)
            );
        }).Parse())
    }).catch(async err => {
        hereLog(`[getCustomConfig]{${karter}} error getting config '${config_name}' - ${err}`)

        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Error occured accession custom config '${config_name}' from  \`${karter}\`…`
        ).catch(err => 
            hereLog(`[getCustomConfig]{${karter}} reply error (4) - ${err}`)
        );
    })
}

async function S_CMD_kartCustomConfig(interaction, utils){
    await interaction.deferReply()

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='info'){
        await S_S_CMD_kartCustomConfig_info(interaction, utils)
    }
    else if(subcommand==='get'){
        await S_S_CMD_kartGetCustomConfig(interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`info\`, \`get\``
        )
    }
}

async function __Opt_S_S_CMD_kartCustomConfig_Set(url, karter, interaction, utils){
    var _url= my_utils.checkUrl(url)

    if(!Boolean(_url)){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Invalid url \`${_url}\`…`
        ).catch(err => 
            hereLog(`[setCustomConfig]{${karter}} reply error (0) - ${err}`)
        );
        return
    }

    await kart_stuff.Api.set_custom_yaml_config(
        _url, _generateAuthPayload(interaction.user.id, utils), karter
    ).then( async handle => {
        await (handle
        .onSuccess(async response => {
            await interaction.editReply(
                `## New *${karter}* custom config upload\n\n`+
                `✅ Success`
            ).catch(err => 
                hereLog(`[setCustomConfig]{${karter}} reply error (6) - ${err}`)
            );
        }).onCode(400, async response => {
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `Can't upload "*custom config*" for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[setCustomConfig]{${karter}} reply error (2) - ${err}`)
            );
        }).onCode([401, 403], async response => {
            hereLog(`[setCustomConfig]{${karter}} access failure: ${rc}`)
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                `Access failure on "*custom config*" upload for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[setCustomConfig]{${karter}} reply error (1) - ${err}`)
            );
        }).onCode(415, async response => {
            let data= response.data
            await interaction.editReply({                    
                content: ( `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                            `Uploaded config for \`${karter}\` is invalid or badly constructed…` ),
                files: (data && data.details) ?
                            [{
                                attachment: Buffer.from(data.details),
                                name: `custom_config.yaml.errors.txt`
                            }]
                        : undefined
            }).catch(err => 
                hereLog(`[setCustomConfig]{${karter}} reply error (7) - ${err}`)
            );
        }).onCode(440, async response => {
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `Upload file is too big!`
            ).catch(err => 
                hereLog(`[setCustomConfig]{${karter}} reply error (3) - ${err}`)
            );
        }).onCode([441,442], async response => {
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `"*Custom config*" has bad type, or extension`
            ).catch(err => 
                hereLog(`[setCustomConfig]{${karter}} reply error (4) - ${err}`)
            );
        }).onCode(513, async response => {
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Upload error on server…`
            ).catch(err => 
                hereLog(`[CustomConfig]{${karter}} reply error (5) - ${err}`)
            );
        }).fallBack(async response => {
            hereLog(`[setAddonsLoadOrder] unhandled status code: ${rc}…`)

            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Error occured installing new *custom config* for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[setCustomConfig]{${karter}} reply error (5) - ${err}`)
            );
        }).catch(async error_action => {
            hereLog(`[setAddonsLoadOrder] error setting custom config - ${error_action}`)

            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Error occured installing new *custom config* for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[setCustomConfig]{${karter}} reply error (6) - ${err}`)
            );
        }).Parse())
    }).catch(async err => {
        hereLog(`[setCustomConfig]{${karter}} error setting custom config - ${err}`)

        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Error occured installing new *load order config* for \`${karter}\`…`
        ).catch(err => 
            hereLog(`[setAddonsLoadOrder]{${karter}} reply error (8) - ${err}`)
        );
    })
}

async function S_S_CMD_kartCustomConfigAdmin_set(interaction, utils) {
    var karter= await Interaction_checkKarter_StringOpt(interaction, utils)
    if(!Boolean(karter)) return

    let attachment= interaction.options.getAttachment('file_yaml')
    var url= interaction.options.getString('url')

    if(Boolean(attachment)){
        url= attachment.url
    }
    
    if(Boolean(url)){ //set
        await __Opt_S_S_CMD_kartCustomConfig_Set(url, karter, interaction, utils)
    }
    else{
        hereLog(`[kartCustomConfigAdmin_set] Nothing to install (no 'url'?)…`)
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Couldn't access config input…`
        )
        return undefined
    }    
}

async function __Opt_S_S_CMD_kartCustomConfig_action(action, karter, config_name, interaction, utils) {
    let auth= _generateAuthPayload(interaction.user.id, utils)

    //default: enable
    var action_emoji= '✅'
    var action_ing= "enabling"
    var action_done= "enabled"
    var handle= undefined

    try{
        if(action==='disable'){
            handle= await kart_stuff.Api.disable_custom_yaml_config(
                config_name, auth, karter
            )
            action_emoji= '⏹'
            action_ing= "disabling"
            action_done= "disabled"
        }
        else if(action==='remove'){
            handle= await kart_stuff.Api.remove_custom_yaml_config(
                config_name, auth, karter
            )
            action_emoji= '❎'
            action_ing= "removing"
            action_done= "removed"
        }
        else{
            var triggertime= interaction.options.getString('triggertime') ?? '* * * * *'
            handle= await kart_stuff.Api.enable_custom_yaml_config(
                config_name, triggertime, auth, karter
            )
        }

        await (handle
        .onSuccess(async response => {
            await interaction.editReply(
                `## Addon ${action_done} on StrashBot's *${karter}* server\n\n`+
                `${action_emoji} ${config_name}\n`+
                `(takes effect on next server restart…)`
            )
        }).onCode(400, async response => {
            hereLog(`[actionCustomConfig]<${action}>{${karter}} bad request: ${response.status}`)
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `"*custom_config_${action}*" \`${config_name}\` for \`${karter}\` seems like bad request…`
            ).catch(err => 
                hereLog(`[actionCustomConfig]<${action}>{${karter}} reply error (1) - ${err}`)
            );
        }).onCode([401, 403], async response => {
            hereLog(`[actionCustomConfig]<${action}>{${karter}} access failure: ${response.status}`)
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                `Access failure on "*custom_config_${action}*" for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[actionCustomConfig]<${action}>{${karter}} reply error (2) - ${err}`)
            );
        }).onCode(404, async response => {
            hereLog(`[actionCustomConfig]<${action}>{${karter}} not found?: ${response.status}`)
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
                `custom_config ${action_ing} \`${config_name}\` on \`${karter}\` seems unavailable…`
            ).catch(err => 
                hereLog(`[actionCustomConfig]<${action}>{${karter}} reply error (3) - ${err}`)
            );
        }).fallBack(async response => {
            hereLog(`[actionCustomConfig]<${action}>{${karter}} unhandled status code: ${response.status}…`)

            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Error occured ${action_ing} custom_config \`${config_name}\` for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[actionCustomConfig]<${action}>{${karter}} reply error (7) - ${err}`)
            );
        }).catch(async error_action => {
            hereLog(`[actionCustomConfig]<${action}>{${karter}} action error on request: ${error_action}…`)

            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
                `Error occured ${action_ing} custom_config \`${config_name}\` for \`${karter}\`…`
            ).catch(err => 
                hereLog(`[actionCustomConfig]<${action}>{${karter}} reply error (8) - ${err}`)
            );
        }).Parse())
    } catch(err){
        hereLog(`[actionCustomConfig]<${action}>{${karter}}(4) Error trying to ${action} custom config - ${err}`)

        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `Error occured ${action_ing} custom_config \`${config_name}\` for \`${karter}\`…`
        ).catch(err => 
            hereLog(`[actionCustomConfig]<${action}>{${karter}} reply error (9) - ${err}`)
        );
    }
}

async function S_S_CMD_kartCustomConfigAdmin_manage(interaction, utils){
    var karter= await Interaction_checkKarter_StringOpt(interaction, utils)
    if(!Boolean(karter)) return

    let action= interaction.options.getString('action')
    let config_name= interaction.options.getString('config')
    
    if(['enable', 'disable', 'remove'].includes(action)){
        await __Opt_S_S_CMD_kartCustomConfig_action(action, karter, config_name, interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Invalid or unknown action \`${action}\`…`
        ).catch(err => 
            hereLog(`[sCmd_actionCustomConfig]<${action}>{${karter}} reply error (0) - ${err}`)
        );
    }
}

async function S_CMD_kartCustomConfigAdmin(interaction, utils){
    await interaction.deferReply()

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='set'){
        await S_S_CMD_kartCustomConfigAdmin_set(interaction, utils)
    }
    else if(subcommand==='manage'){
        await S_S_CMD_kartCustomConfigAdmin_manage(interaction, utils)
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`set\`, \`manage\``
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
        key= fs.readFileSync(path.resolve(kart_stuff.Settings.get(`api.token_keys.${configEntryName}`)))
        __Update_Keys.mem_keys[configEntryName]= key
    }

    return key
}

let JWT_SIGN_OPTIIONS= {
    expiresIn: '1m',
    algorithm:  "RS256"
}

function _generateAuthPayload(userId= undefined, utils){
    if(!Boolean(userId)){
        return {
            role: 'ADMIN',
            id: utils.getBotClient().user.id
        }
    } else {
        return {
            role: 'DISCORD_USER',
            id: userId
        }
    }
}

function __api_generateUserPrivilegedToken(user, admin=false){
    var key= undefined
    if(Boolean(kart_stuff.Settings.grf('api.token_keys'))){
        try{
            if(admin &&
                Boolean(kart_stuff.Settings.grf('api.token_keys.adminSignkey'))
            ){
                key= __readkey_from_file('adminSignkey')
            }
            else if(Boolean(kart_stuff.Settings.grf('api.token_keys.discorduserSignkey'))){
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
    var p= undefined
    let api_clip_addr=`${kart_stuff.Settings.grf('api.host')}${(Boolean(p=kart_stuff.Settings.grf('api.port'))?`:${p}`:'')}`+
                    `${kart_stuff.Settings.grf('api.root')}/clip/${clipID}`

    return axios.get(api_clip_addr).then(async response => {
        if(response.status===200){
            let clip= response.data

            var embed= {}
            embed.title= newClip?
                            `New clip on the Strashthèque! (n°${clipID})`
                        :   `Strashthèque clip id: ${clipID}`
            embed.url= `${kart_stuff.Settings.getAt(web_page).base_url}/${kart_stuff.Settings.getAt(web_page).clips_page}?clip=${clipID}`
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

function __isURLDiscordEphermeralAttachment(url){
    let rgx= /https?\:\/\/cdn\.discordapp\.com\/ephemeral\-attachments\/[0-9]+\/[0-9]+\/\S+/
    return Boolean(url.match(rgx))
}

async function _addNewKartClip(url, description, interaction, utils){
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

    var p= undefined
    let api_clip_addr=
        `${kart_stuff.Settings.grf('api.host')}${(Boolean(p=kart_stuff.Settings.grf('api.port'))?`:${p}`:'')}`+
        `${kart_stuff.Settings.grf('api.root')}/clip/new`

    let ephemeralURL= __isURLDiscordEphermeralAttachment(url)
    return (
         ephemeralURL?
            (interaction.channel.send({
                content: description,
                files: [url]
            })).then( msg => { return {
                    submitter_id: interaction.user.id,
                    description,
                    url: (msg && msg.attachments.first() && msg.attachments.first().url)
                }
            })
        :   new Promise(resolve => {resolve(
                {
                    submitter_id: interaction.user.id,
                    description,
                    url 
                }
            );})
    ).then( async data => {
        axios.post(api_clip_addr, data, {headers: {'x-access-token': token}})
            .then(async response => {
                if(response.status===200){
                    if(Boolean(response.data && response.data.insertedId)){
                        await __send_clipInfo_req(
                            response.data.insertedId, interaction, utils,
                            !ephemeralURL
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
                        `Error trying to add new clip to *strashthèque*…`
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
    }).catch(async err => {
        hereLog(`[clipApiAdd] initial send error '${api_clip_addr}' - ${err}}`);
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `Error trying to add new clip to *strashthèque*…`
        )
    })
}

async function _clipsState(){
    if(Boolean(kart_stuff.Settings.grf('api.host'))){
        var p= undefined
        let api_info_addr=`${kart_stuff.Settings.grf('api.host')}${(Boolean(p=kart_stuff.Settings.api.port)?`:${p}`:'')}${kart_stuff.Settings.grf('api.root')}/clips?perPage=1`

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
        embed.url= `${kart_stuff.Settings.getAt('web_page').base_url}/${kart_stuff.Settings.getAt('web_page').clips_page}`
        embed.fields.push({
            name: "Number of clips",
            value: `${info.clipsNumber}`,
            inline: false
        })
        embed.fields.push({
            name: "Last clip",
            value: `${kart_stuff.Settings.getAt('web_page').base_url}/${kart_stuff.Settings.getAt('web_page').clips_page}?clip=${info.last_clip._id}`,
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
    var p= undefined
    let api_clip_addr=
        `${kart_stuff.Settings.grf('api.host')}${(Boolean(p=kart_stuff.Settings.api.port)?`:${p}`:'')}`+
        `${kart_stuff.Settings.grf('api.root')}/clip/${clip_id}`

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
    
    var p= undefined
    let api_clip_addr=`${kart_stuff.Settings.grf('api.host')}${(Boolean(p=kart_stuff.Settings.grf('api.port'))?`:${p}`:'')}`+
                    `${kart_stuff.Settings.grf('api.root')}/clip/${clip_id}`

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
            `\`new\`, \`info\`, \`remove\` or \`description\``
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

async function AC___addonsLookup(interaction){
    if(!Boolean(kart_stuff)) return

    const focusedOption = interaction.options.getFocused(true);
    if(!focusedOption.name==='lookup') return

    let txt= focusedOption.value.toLowerCase()
    if(txt.length<3) return

    let karter= interaction.options.getString('karter') ?? kart_stuff.Settings.DefaultRacer
    if(!Boolean(karter)) return

    let choices= []
    try{
        let addonsNames= await kart_stuff.ApiCache.getInstalledAddonsNames(karter)
        choices= addonsNames.filter(name => name.toLowerCase().includes(txt.toLowerCase()) )
                    .map(name => ({ name, value: name })).slice(0,5)
    } catch(err){
        hereLog(`[addons_lookup] fail fetching names - ${err}`)
        return
    }

    await interaction.respond(
        choices
    ); 
}

async function AC___customConfigLookup(interaction) {
    if(!Boolean(kart_stuff)) return

    const focusedOption = interaction.options.getFocused(true);
    if(focusedOption.name!=='config') return

    let txt= focusedOption.value.toLowerCase()
    if(txt.length<3) return

    let karter= interaction.options.getString('karter') ?? kart_stuff.Settings.DefaultRacer
    if(!Boolean(karter)) return

    let choices= []
    try{
        let configNames= await kart_stuff.ApiCache.getInstalledCustomConfigNames(karter) ?? []
        choices= configNames.filter(cfg_info => (
                                            cfg_info.name.toLowerCase().includes(txt.toLowerCase())
                                        ||  cfg_info.filename.includes(txt)
                                    ) )
                    .map(cfg_info => ({ name: cfg_info.name, value: cfg_info.name })).slice(0,5)
    } catch(err){
        hereLog(`[config_lookup] fail fetching config names - ${err}`)
        return
    }

    await interaction.respond(
        choices
    );
}

let slashKartInfo= {
    data: new SlashCommandBuilder()
            .setName('kart_info')
            .setDescription("Get current status of the Strashbot srb2kart server.")
            .addStringOption(option =>
                option
                .setName('server')
                .setDescription('srb2kart, ringracers, [alias], [address], or [address]:[port]')
            ),
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

let slashKartData_getKarterChoices= () => {
    let kSettings= new KS.KartSettings()
    kSettings.loadFromJSON()

    return kSettings.RacerNames.map(r_name => {
        return { name: r_name, value: r_name }
    })
}

let slashKartPassword= {
    data: new SlashCommandBuilder()
            .setName('kart_password')
            .setDescription("Get the Strashbot karting server's login")
            .setDefaultMemberPermissions(0)
            .addStringOption(option =>
                option
                .setName('karter')
                .setDescription('Which kart game?')
                .addChoices(...slashKartData_getKarterChoices())
            )
            .setContexts(InteractionContextType.Guild),
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
            .setDescription("Start the Strashbot kart's server")
            .setDefaultMemberPermissions(0)
            .addSubcommand(subcommand =>
                subcommand
                .setName('stop')
                .setDescription('Stop the Strashbot kart server')
                .addBooleanOption(option =>
                    option
                    .setName('force')
                    .setDescription('Force, even if there are player currently playing on the server')
                )
                .addStringOption(option =>
                    option
                    .setName('karter')
                    .setDescription('Which kart game?')
                    .addChoices(...slashKartData_getKarterChoices())
                )
            )
            .addSubcommand(subcommand =>
                subcommand
                .setName('restart')
                .setDescription('Restart the Strashbot kart server')
                .addBooleanOption(option =>
                    option
                    .setName('force')
                    .setDescription('Force, even if there are player currently playing on the server')
                )
                .addStringOption(option =>
                    option
                    .setName('karter')
                    .setDescription('Which kart game?')
                    .addChoices(...slashKartData_getKarterChoices())
                )
            )
            // .addSubcommand(subcommand =>
            //     subcommand
            //     .setName('logs')
            //     .setDescription('Fetch the Strashbot kart server\'s logfile')
            // )
            // .addSubcommand(subcommand =>
            //     subcommand
            //     .setName('config')
            //     .setDescription('Something about the server\'s config')
            //     .addAttachmentOption(option =>
            //         option
            //         .setName('set')
            //         .setDescription('Sumbit a new server config')
            //     )
            // )
            .setContexts(InteractionContextType.Guild),
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
    .setDescription("About Strashbot's racer servers addons")
    .setDefaultMemberPermissions(0)
    .addSubcommand(subcommand =>
        subcommand
        .setName('load_order')
        .setDescription("Get or Set the kart server's addons order load config")
        .addStringOption(option =>
            option
            .setName('karter')
            .setDescription('Which kart game?')
            .addChoices(...slashKartData_getKarterChoices())
        )
        .addAttachmentOption(option =>
            option
            .setName('file_yaml')
            .setDescription('Sumbit addon load order config as a .yaml file.')
        )
        .addStringOption(option =>
            option
            .setName('url')
            .setDescription('Download and set from url.')
        )
    )
    .addSubcommand(subcommand => 
        subcommand
        .setName('install')
        .setDescription("Install a new addon on the racer's server")
        .addStringOption(option =>
            option
            .setName('karter')
            .setDescription('Which kart game?')
            .addChoices(...slashKartData_getKarterChoices())
        )
        .addAttachmentOption(option =>
            option
            .setName('addon_file')
            .setDescription('Submit file to install as addon.')
        )
        .addStringOption(option =>
            option
            .setName('addon_direct_url')
            .setDescription('Download and install from url.')
        )
        .addBooleanOption(option =>
            option
            .setName('enable_addon')
            .setDescription('Enable the addon after install? (default: True)')
        )
    )
    .addSubcommand(subcommand => 
        subcommand
        .setName('action')
        .setDescription("Action to handle installed addons")
        .addStringOption(option =>
            option
            .setName('action')
            .setDescription('What to do?')
            .setRequired(true)
            .addChoices([
                { name: "Enable", value: 'enable' },
                { name: "Disable", value: 'disable' },
                { name: "Remove", value: 'remove' },
            ])
        )
        .addStringOption(option =>
            option
            .setName('addon_filename')
            .setDescription('the basename (with extension) of the addon file to handle')
            .setRequired(true)
            .setMaxLength(128)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
            option
            .setName('karter')
            .setDescription('Which kart game?')
            .addChoices(...slashKartData_getKarterChoices())
        )
    )
    .setContexts(InteractionContextType.Guild),
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
    },
    async autoComplete(interaction){
        try{
            await AC___addonsLookup(interaction)
        }
        catch(err){
            hereLog(`[addonsLookup_autoComplete] Error! -\n\t${err}`)
        }
    }    
}

let slashKartAddons= {
    data: new SlashCommandBuilder()
    .setName('kart_addons')
    .setDescription("About addons currently installed on the Strashbort's karting server")
    .addStringOption(option =>
        option
        .setName('karter')
        .setDescription('Which kart game?')
        .addChoices(...slashKartData_getKarterChoices())
    )
    .addStringOption(option =>
        option
        .setName('lookup')
        .setDescription('lookup for a specific addon…')
        .setMaxLength(128)
        .setAutocomplete(true)
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
    },
    async autoComplete(interaction){
        try{
            await AC___addonsLookup(interaction)
        }
        catch(err){
            hereLog(`[addonsLookup_autoComplete] Error! -\n\t${err}`)
        }
    }
}

let slashKartCustomConfig= {
    data: new SlashCommandBuilder()
    .setName('kart_custom_config')
    .setDescription("Info and handle of available custom configs for karter's server")
    .setDefaultMemberPermissions(0)
    .addSubcommand(subcommand =>
        subcommand
        .setName("info")
        .setDescription("Infos about karter's custom configs")
        .addStringOption(option =>
            option
            .setName('karter')
            .setDescription('Which kart game?')
            .addChoices(...slashKartData_getKarterChoices())
        )
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName("get")
        .setDescription("About a specific custom config")
        .addStringOption(option =>
            option
            .setName('config')
            .setDescription('Which custom config to fetch?')
            .setRequired(true)
            .setMaxLength(128)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
            option
            .setName('karter')
            .setDescription('Which kart game?')
            .addChoices(...slashKartData_getKarterChoices())
        )
    ),
    async execute(interaction, utils){
        try{
            await S_CMD_kartCustomConfig(interaction, utils)
        }
        catch(err){
            hereLog(`[kart_custom_cfg] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }  
    },
    async autoComplete(interaction){
        try{
            await AC___customConfigLookup(interaction)
        }
        catch(err){
            hereLog(`[customConfigLookup_autoComplete] Error! -\n\t${err}`)
        }
    }
}

let slashKartCustomConfigManager= {
    data: new SlashCommandBuilder()
    .setName('kart_custom_config_admin')
    .setDescription('Manage Racers custom configurations.')
    .setDefaultMemberPermissions(0)
    .addSubcommand(subcommand =>
        subcommand
        .setName("set")
        .setDescription("add or change a custom command config on the racer's server")
        .addStringOption(option =>
            option
            .setName('karter')
            .setDescription('Which kart game?')
            .addChoices(...slashKartData_getKarterChoices())
        )
        .addAttachmentOption(option =>
            option
            .setName('file_yaml')
            .setDescription('Sumbit a new custom config as a .yaml file')
        )
        .addStringOption(option =>
            option
            .setName('url')
            .setDescription('Download and set from url.')
        )
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName("manage")
        .setDescription("Manage custom config file for a racer's server.")
        .addStringOption(option =>
            option
            .setName('action')
            .setDescription('What to do?')
            .setRequired(true)
            .addChoices([
                { name: "Enable", value: 'enable' },
                { name: "Disable", value: 'disable' },
                { name: "Remove", value: 'remove' },
            ])
        )
        .addStringOption(option =>
            option
            .setName('config')
            .setDescription('the basename custom config to handle')
            .setRequired(true)
            .setMaxLength(128)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
            option
            .setName('karter')
            .setDescription('Which kart game?')
            .addChoices(...slashKartData_getKarterChoices())
        )
        .addStringOption(option =>
            option
            .setName('triggertime')
            .setDescription("[ENABLE only] set config triggertime (default: '* * * * *'")
            .setMaxLength(64)
        )
    )
    .setContexts(InteractionContextType.Guild),
    async execute(interaction, utils){
        try{
            await S_CMD_kartCustomConfigAdmin(interaction, utils)
        }
        catch(err){
            hereLog(`[kart_custom_cfg_admin] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }  
    },
    async autoComplete(interaction){
        try{
            await AC___customConfigLookup(interaction)
        }
        catch(err){
            hereLog(`[customConfigLookup_autoComplete](admin) Error! -\n\t${err}`)
        }
    }
}

let slashKartClip= {
    data: new SlashCommandBuilder()
    .setName('kart_clips')
    .setDescription("Cools clips from Strashbot's server and stuff")
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
    )
    .setContexts(InteractionContextType.Guild),
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
    )
    .setContexts(InteractionContextType.Guild),
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

    for(g in clean_jobs){
        if(Boolean(clean_jobs[g])){
            delete clean_jobs[g]
            clean_jobs[g]= undefined;
        }
    }
}

let E_RetCode= my_utils.Enums.CmdRetCode

async function ogc_kart(strashBotOldCmd, clearanceLvl, utils){
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
        //slashKartIngames,
        slashKartCustomConfig,
        slashKartCustomConfigManager,
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

