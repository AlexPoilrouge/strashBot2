const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;

const PlayerManager= require('./player/playerDataManager');
const fs= require( 'fs' );
const { post } = require('request');

const cron= require('node-cron');



let hereLog= (...args) => {console.log("[cmd_player]", ...args);};



let playerDataManagers= {}




async function __cleanPostChannel(postChannel){
    if(!Boolean(postChannel) || !Boolean(postChannel.guild)) return;

    var playerDataManager= playerDataManagers[postChannel.guild.id];
    if(!Boolean(playerDataManager)) return;
    
    var lastID= undefined
    while(true){
        var options= { limit: 100};
        if(Boolean(lastID)) options['before']= lastID

        const messages= await postChannel.messages.fetch(null, false);

        messages.each( (async msg => {
            if(Boolean(msg) && !( await (playerDataManager.isMessageIDReferenced(msg.id)) )){
                msg.delete().then( m =>{
                    if(Boolean(m)){
                        hereLog(`[clean posts] deleting unreferenced message ${msg}`)
                    }
                }).catch(error =>{
                    if(Boolean(error)) hereLog(`[clean posts] couldn't delete message ${msg} - ${error.message}`);
                })
            }
        }))

        lastID= messages.last().id;

        if((!Boolean(messages)) || (messages.size < 100)) break;
    }

    hereLog("[clean posts] done.")
}




var clean_job= undefined;


function cmd_init(utils){
    clean_job= cron.schedule('0 2 * * *', () =>{
        if(Boolean(playerDataManagers)){
            for(var guild of Object.keys(playerDataManagers)){
                var chan_id= undefined;
                var chan= undefined;
                if( Boolean(guild) &&
                    Boolean(chan_id= utils.settings.get(guild, 'post_channel')) &&
                    Boolean(chan= message.guild.channels.cache.get(chan_id))
                ){
                    hereLog(`Daily post-channel (${chan}) cleaning routine`);
                    __cleanPostChannel(chan);
                }
            }
        }
    });
}



async function cmd_init_per_guild(utils, guild){
    if(!Boolean(playerDataManagers[guild.id])){
        playerDataManagers[guild.id]= new PlayerManager.PlayerDataManager(utils.getDataBase(guild))
    }

    var cmd_chan_id= utils.settings.get(guild, 'command_channel');
    var post_chan_id= utils.settings.get(guild, 'post_channel');
    if(Boolean(cmd_chan_id) && !Boolean(guild.channels.cache.get(cmd_chan_id))){
        utils.settings.remove(guild, 'command_channel');
    }
    if(Boolean(post_chan_id) && !Boolean(guild.channels.cache.get(post_chan_id))){
        utils.settings.remove(guild, 'post_channel');
        playerDataManagers[guild.id].removeAllRosterMessages();
    }
}

function _processArgsQuoteMarks(args){
    var n_args= []
    var i=0;

    let startsWithQM= ( str => {
        return Boolean(str.match(/^[\"\«]/));
    })

    let endsWithQM= ( str => {
        return Boolean(str.match(/[\"\»]$/));
    })

    while(i<args.length){
        if(startsWithQM(args[i]) && !(args[i].length>1 && endsWithQM(args[i]))){
            var j=i+1;
            var endsmeet= false;
            while(j<args.length){
                if(endsmeet=(endsWithQM(args[j]))){
                    break;
                }
                ++j;
            }
            if(endsmeet){
                n_args.push(args.slice(i,j+1).join(' ').slice(1,-1))
                i= j;
            }
            else{
                n_args.push(args[i])
            }
        }
        else if(startsWithQM(args[i]) && endsWithQM(args[i])){
            n_args.push(args[i].slice(1,-1))
        }
        else{
            n_args.push(args[i])
        }
        ++i;
    }
    return n_args
}



async function cmd_main(cmdObj, clearanceLvl, utils){
    let command= cmdObj.command;
    let message= cmdObj.msg_obj;
    let playerDataManager= playerDataManagers[message.guild.id]

    var args= cmdObj.args;
    var index= undefined;
    if( ( index=(args.findIndex(arg=>{return (arg.includes('\n'))})) ) >=0 ){
        args= cmdObj.args.slice(0,index+1);
        args[-1].replace("\n","")

        message.author.send(
            `**Warning on** \`!${command}\`:\n`+
            `\t- One command per message!`+
            `\t- Command \`!${command}\` only considers first line…`+
            `\t\t => Read only: \`!${command} ${args.join(' ')}\``
        )
    }

    if(args[0]==="help"){
        return cmd_help(cmdObj, clearanceLvl);
    }

    let _channel_cmd= (cmd_name, settings_channel_name) => {
        if(args[0]===cmd_name){
            var chan_id= utils.settings.get(message.guild, settings_channel_name);
            if(["get", "which"].includes(args[1])){
                var str= `***!player ${cmd_name}*** command: `
                var chan= undefined
                if (!Boolean(chan_id)){
                    str+= `\n\tNo ${cmd_name} set…`
                }
                else if(!Boolean(chan=message.guild.channels.cache.get(chan_id))){
                    str+= `\n\tPlayer ${cmd_name} not availabe (deleted?)…`
                }
                else{
                    str+= `\n\tPlayer ${cmd_name} is #\"${chan.name}\" (${chan}).`
                }

                message.member.send(str).catch(err=>{hereLog(err);});

                return {done: true, ret: true};
            }
            else if(args[1]==="clear"){
                utils.settings.remove(message.guild, settings_channel_name)

                return {done: true, ret: true};
            }
            else{
                var chan= undefined
                if(!Boolean(message.mentions) || !Boolean(message.mentions.channels) || !Boolean(chan=message.mentions.channels.first())){
                    message.member.send(`[player command] No mention to any channel found… Format is:\n\t\`!player ${cmd_name} #channelmention\``);
        
                    return {done: true, ret: false};;
                }
        
                utils.settings.set(cmdObj.msg_obj.guild, settings_channel_name, chan.id);
        
                return {done: true, ret: true};
            }
        }
        return {done: false, ret: false}
    }

    if(clearanceLvl>CLEARANCE_LEVEL.NONE){
        if(args[0]==="clean"){
            var chan_id= utils.settings.get(message.guild, 'post_channel');
            var chan= message.guild.channels.cache.get(chan_id)
            if(Boolean(chan)){
                __cleanPostChannel(chan);
                return true
            }
            return false
        }

        for(c of [["command-channel","command_channel"],["post-channel","post_channel"]]){
            var r= _channel_cmd(c[0],c[1])
            if(r.done){
                return r.ret
            }
        }
    }
    
    var cmd_chan_id= utils.settings.get(message.guild, "command_channel");
    if(cmd_chan_id===message.channel.id){
        if(command==="roster"){
            let _post_roster= ( await (async (playerID, channel, post_send_func=null) =>{
                var rosterPath= ( await (playerDataManager.getPlayerIconRosterPath(playerID)) )
                if(Boolean(rosterPath)){
                    if(!fs.existsSync(rosterPath)){
                        message.member.send(`Internal error - cannot generate/send player's (${message.author}) roster...`)

                        return false;
                    }

                    var tag= (await (playerDataManager.getPlayerTag(message.author.id)));

                    channel.send(
                        `${(Boolean(tag))?`${(tag.team)?`[${tag.team}] `:""} ${tag.name} (${message.author})`:`${message.author}`}:`,
                        { files : [ rosterPath ] }
                    ).then(msg => {
                        fs.unlink(rosterPath, err => {
                            if(err){
                                hereLog(`[cleaning gen imgs] png_file: ${err.message}`)
                            }
                        });

                        if(Boolean(post_send_func)){
                            post_send_func(msg);
                        }
                    }).catch(err => {
                        if(err){
                            hereLog(`[roster send] couldn't send roster: ${err.message}`)
                        }
                    })

                    return true;
                }
                else if(!( await (playerDataManager.playerHasRoster(playerID)) )){
                    message.author.send("You don't have any roster registered.")

                    return false;
                }

                return false;
            }) )

            if(args.length<=0){

                return Boolean( await (_post_roster(message.author.id, message.channel)));
            }

            var roster= []
            var n_args= _processArgsQuoteMarks(args);
            var i= 0;
            while(i<n_args.length){
                var name= n_args[i]
                var color= "0"
                ++i
                if(i<n_args.length && Boolean(n_args[i].match(/^\-?[0-9]+$/))){
                    color= n_args[i]
                    ++i
                }
                roster.push({"name": name, "color": color});
                if(roster.length>4) break;
            }
            
            var res= (await (playerDataManager.setRosterByNameAndColor(message.author.id, roster)))
            if(!Boolean(res)){
                return false;
            }
            else{
                var post_chan_id= utils.settings.get(message.guild, "post_channel");
                var post_chan= undefined
                if(Boolean(post_chan_id) && Boolean(post_chan=message.guild.channels.cache.get(post_chan_id))){
                    _post_roster(message.author.id, post_chan, ( await ( async (msg) => {
                        var old_msg_id= (await (playerDataManager.getPlayerRosterMessage(message.author.id)));
                        var old_msg= undefined
                        if(Boolean(old_msg_id) && Boolean(old_msg_id.match(/^[0-9]{8,32}$/))){
                            post_chan.messages.fetch(old_msg_id, false).then(message => {
                                if(Boolean(message)){
                                    old_msg= message
                                }
                            }).catch(err =>{
                                if(Boolean(err)) hereLog(`[!roster] couldn't fetch message ${old_msg_id} - ${err.message}`);
                            }).finally(() =>{
                                if(Boolean(old_msg)){
                                    old_msg.delete();
                                }
                                else{
                                    hereLog(`[set roster][post roster] for ${message.author} - didn't found old post to delete`) 
                                }
                            })
                        }
                        else{
                            hereLog(`[set roster][post roster] for ${message.author} - didn't found old post to delete`)
                        }

                        playerDataManager.setPlayerRosterMessage(message.author.id, msg.id)
                    }) ) )
                }
                else{
                    hereLog(`[set roster] for ${message.author} - didn't post: no post-channel`)
                }

                if(res.length===0){
                    return true;
                }
                else{
                    var str= "Could match following names with any fighter:\n\t";
                    for(var f of res){
                        str+= `\"${f.name}\"; `
                    }
                    message.member.send(str);
                    return false;
                }
            }
        }
        else if(command==="player"){
            var n_args= _processArgsQuoteMarks(args);
            
            if(n_args.length>0){
                var team= ((n_args.length>1)?n_args[1]:"").slice(0,16);
                var name= n_args[0].slice(0,64);

                var n_ok= (await (playerDataManager.setPlayerName(message.author.id, name)));
                var t_ok= (await (playerDataManager.setPlayerTeam(message.author.id, team)));

                var post_chan_id= undefined;
                var post_chan= undefined;
                var old_msg_id= undefined;
                var old_msg= undefined;
                if(n_ok &&
                    Boolean(post_chan_id=utils.settings.get(message.guild, "post_channel")) &&
                    Boolean(post_chan=message.guild.channels.cache.get(post_chan_id)) &&
                    Boolean(old_msg_id=(await (playerDataManager.getPlayerRosterMessage(message.author.id)))) &&
                    Boolean(old_msg_id.match(/^[0-9]{8,32}$/))
                ){
                    post_chan.messages.fetch(old_msg_id, false).then(msg => {
                        if(Boolean(msg)){
                            old_msg= msg;
                        }
                    }).catch(err => {
                        if(err) hereLog(`[!player] Couldn't fetch message ${old_msg_id} - ${err.message}`);
                    }).finally(() =>{
                        if(Boolean(old_msg)){
                            old_msg.edit(`${(t_ok && Boolean(team))?`[${team}] `:""}${name} (${message.author}):`).then(e_msg =>{
                                if(Boolean(e_msg)){
                                    hereLog(`[!player] old message ${e_msg.id} edited`);
                                }
                            }).catch(e_err =>{
                                hereLog(`[!player] couldn't edit old message ${e_msg.id} - ${e_err.message}`);
                            })
                        }
                    })
                }

                return n_ok;
            }
            else{
                var tag= (await (playerDataManager.getPlayerTag(message.author.id)))

                if(Boolean(tag) && Boolean(tag.name)){
                    message.channel.send(`You player tag:\n\t${(Boolean(tag.team))?`[${tag.team}] `:""}${tag.name}`)

                    return true;
                }
                else{
                    message.author.send(`You player tag isn't registered.`);

                    return false;
                }
            }
        }
    }
    else if(!Boolean(cmd_chan_id)){
        message.member.send("[player command] no player “command-channel” is set…")

        return false;
    }
    else{
        var cmd_chan= undefined
        if(Boolean(cmd_chan=message.guild.channels.cache.get(cmd_chan_id))){
            message.member.send(`[player command] \`!${command}\` should be used in dedicated channel (${cmd_chan})`)
        }
        else{
            message.member.send(`[player command] Player command-channel not valid or not availabe (deleted?)… (id:${cmd_chan_id})`)
        }

        return false;
    }

    return false;
}


async function cmd_dm(cmdObj, clearanceLvl, utils, sharedGuilds){
    let command= cmdObj.command;
    let message= cmdObj.msg_obj;
    var args= _processArgsQuoteMarks(cmdObj.args);

    if(sharedGuilds.length===0){
        message.author.send("I don't know you...")
        return false;
    }
    else{
        let guild= undefined;
        if(sharedGuilds.length===1){
            guild= sharedGuilds[0];
        }
        else{
            if(!Boolean(args[0].match(/^[0-9]{8,32}$/))){
                var str= "Please tell me which guild you are from! Pass the guild's ID as first arugment. Here's the list:\n\n";
                for(var g of sharedGuilds){
                    str+= `\t- *${g.name}* : ${g.id}\n`;
                }
                str+=`\n\n__Examples:\n\t\`!${command} ${sharedGuilds[0].id} [whatever...]\``
                str+=`\n\t\`!${command} \"${sharedGuilds[0].name}\" [whatever...]\``

                message.author.send(str);

                return false;
            }
            else{
                var rg= sharedGuilds.find(g => {return (g.id===args[0] || g.name===args[0])})
                if(Boolean(rg)){
                    guild= rg;
                    args= args.slice(0, -1);
                }
            }
        }

        if(Boolean(guild)){
            let playerDataManager= playerDataManagers[guild.id]

            /** TODO
                Maybe...
            */
        }
    }

    return false
}




function cmd_help(cmdObj, clearanceLvl){
    var prt_cmd=
        (cmdObj.command==="roster")?
            "roster"
        : ( (cmdObj.command==="help")?
            (   (Boolean(cmdObj.args) && cmdObj.args[0]==="roster")?
                    "roster"
                :   "player"
            )
            : "player"
        );
    cmdObj.msg_obj.author.send(
        "========\n\n"+
        `__**player** & **roster** command___:\n\n`+
        ((clearanceLvl<CLEARANCE_LEVEL.ADMIN)? "": ("**Admins only:**\n\n"+
            `\t\`!${prt_cmd} command-channel #channelmention\`\n\n`+
            `\tset which channel gets to be the *designated channel* where users can post \`!player\` & \`!roster\` commands\n\n`+
            `\t\`!${prt_cmd} command-channel clear\`\n\n`+
            `\tunset the designated command channel\n\n`+
            `\t\`!${prt_cmd} command-channel which\`\n\n`+
            `\ttells which channel is set as the designated command channel\n\n`+
            `\t\`!${prt_cmd} post-channel #channelmention\`\n\n`+
            `\tset which channel gets to be the channel where the bot post the results of \`!player\` & \`!roster\` commands\n\n`+
            `\t\`!${prt_cmd} post-channel clear\`\n\n`+
            `\tunset the designated post channel\n\n`+
            `\t\`!${prt_cmd} post-channel which\`\n\n`+
            `\ttells which channel is set as the designated post channel\n\n`+
            `\t\`!${prt_cmd} clean\`\n\n`+
            `\tremoves messages from the designated 'post-channel' that are no longer referenced by/for any player\n\n`+
            "**All users commands:**\n"
        ))+
        `\n**Following commands are only usable in the designated \"command channel\"!**\n\n`+
        `\t\`!roster\`\n\n`+
        `\tdisplay your currently registered roster\n\n`+
        `\t\`!roster \"main character\" [ < \"secondary character\" [skin_number] > ... ] \`\n\n`+
        `\tSets your current roster according to the given character name and optional following skin number (4 character max)\n`+
        `\t__Example__:\t\`!roster \"mario\" 3 \"luigi\" \"link\" 5\`\n\n`+
        `\t\`!player\`\n\n`+
        `\tdisplay your currently registered player tag\n\n`+
        `\t\`!player \"player name\" [ \"team/structure name\" ]\`\n\n`+
        `\tsets your *player name*; secondary parameter to set the name of your team or structure\n`+
        `\t__Example__:\t\`!player \"Sarassa\" \"O2\"\`\n\n`
    );

    return true;
}




function cmd_event(eventName, utils){
    hereLog(`[cmd_event] recieved event ${eventName}`)
    if(eventName==="channelDelete"){
        var channel= arguments[2];

        var cmd_chan_id= utils.settings.get(channel.guild, "command_channel");
        var post_chan_id= utils.settings.get(channel.guild, "post_channel");

        if(!Boolean(channel)) return false;
        
        let playerDataManager= playerDataManagers[channel.guild.id]

        var b= false;
        if(channel.id===cmd_chan_id){
            b= true
            utils.settings.remove(message.guild, "command_channel");
        }
        if(channel.id===post_chan_id){
            b= true
            utils.settings.remove(message.guild, "post_channel");
            playerDataManager.removeAllRosterMessages();
        }

        return b
    }
    if(eventName==="messageDelete"){
        var message= arguments[2];

        if(!Boolean(message)) return false;
        
        let playerDataManager= playerDataManagers[message.guild.id]

        var post_chan_id= utils.settings.get(message.guild, "post_channel");
        if(message.id===post_chan_id){
            playerDataManager.removeRosterMessage(message.id);

            return true;
        }
    }
    if(eventName==="guildMemberRemove"){
        var member= arguments[2];

        if(!Boolean(member)) return false;

        let playerDataManager= playerDataManagers[member.guild.id]

        var post_chan_id= utils.settings.get(member.guild, "post_channel");
        var post_chan= undefined;
        var msg_id= undefined;
        var msg= undefined;
        if(Boolean(post_chan_id) && Boolean(post_chan=member.guild.channels.cache.get(post_chan_id))
            && Boolean( msg_id=( await (playerDataManager.getPlayerRosterMessage(member.id)) ) )
        ){
            post_chan.messages.fetch(msg_id, false).then(m =>{
                if(Boolean(m)){
                    msg= m;
                }
            }).catch(err=>{
                if(Boolean(err)) hereLog(`[guildMemberRemove][${member}] can't fetch old message ${msg_id} - ${err.message}`);
            }).finally(()=>{
                if(Boolean(msg)){
                    msg.delete().then(d_m=>{
                        hereLog(`[guildMemberRemove][${member}] old message ${d_m.id} deleted`);
                    }).catch(d_err=>{
                        hereLog(`[guildMemberRemove][${member}] couldn't delete old message ${msg_id} - ${d_err.message}`);
                    })
                }
            })
        }

        playerDataManager.removePlayer(member.id);
    }

    return false;
}




function cmd_guild_clear(guild){}





module.exports.name= ['player','roster'];

module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, directMsg: cmd_dm, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};