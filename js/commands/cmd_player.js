
const PlayerManager= require('./player/playerDataManager');

//CLEARANCE LEVEL:
// A particular member can have 3 different clearance level:
//  - CLEARANCE_LEVEL.NONE = 0 = 0b000 - no clearance level
//  - CLEARANCE_LEVEL.ADMIN_ROLE = 0b010 = 2  - member is recognized admin
//  - CLEARANCE_LEVEL.MASTER_ID = 0b100 = 4  - member is the bot's master
// A fourth level exists, used to contextualized a message:
//  - CLEARANCE_LEVEL.CONTROL_CHANNEL = 1 = 0b001 - posted in context of a 'control channel'
// Ofc, these level are stackable:
//  A clearance level of 7:
//    7 = 1+2+4 = 0b111 = CONTROL_CHANNEL+ADMIN_ROLE+MASTER_ID
//      is obtained when the master, who here is also an admin, posted a message in a
//      control channel
const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;

let hereLog= (...args) => {console.log("[cmd_player]", ...args);};

let playerDataManagers= {};

//when the module is loaded, during the bot's launch,
//this function is called.
//  utils is an object provided by the bot, constructed as follow:
//    utils= {
//     settings: {
//        set: function (guild, field, value) ,
//        get: function (guild, field),
//        remove: function (guild, field)
//     },
//     getMemberClearanceLevel: function(member),
//     getBotClient: function(),
//     cache_message_management:{
//        keepTrackOf: function (msg),
//        untrack: function (msg),
//        isTracked: function (msg),
//     },
//     getMasterID: function()
//    }
//  Where:
//    'utils.settings.get(guild, field)' is a function you need to call when
//      you whant to access an saved object (json formatable) in this module's
//      persitent data.
//      Example: onlineRole= utils.settings.get(guild, 'online-role');
//    'utils.settings.set(guild, field, value)' is a function you need to call when
//      you want to save data (json formatable object) in this module's persistent
//      data.
//      Example: utils.settings.set(guild, 'number-of-cats', 5);
//    'utils.remove(guild, field)' is a function you need to call when you want to remove
//       a previously saved object of this module's persitent data.
//       Example: utils.remove(guild, 'online-role');
//    'utils.getMemberClearanceLevel(member)' is a function you need to call in order to know
//       the 'clearance level' of a particular guild member. (see below for clearance level)
//    'utils.getBotClient' return the discord bot client.
//    'utils.cache_message_management.keepTrackOf(msg)' is a function to want to call when you
//      want to make sure a message is kept in the cache indefinetely. This is usefull, for
//      example, when you are tracking reaction on a given message indefinetly, keep it from
//      eventually being thrown out of the cache, and not recieving any notifications about this
//      message anymore.
//    'utils.cache_message_management.untrack(msg)' is a function to call when you no longer need
//      for a particular message to being kept in cache.
//    'utils.getMasterID' returns the bot's master's user ID.
function cmd_init(utils){
}



//this function is called, during bot's launch (after 'cmd_init'),
//once per guild the bot is part of.
//It is the opprtunity, for example, to verify the data's integrity
//and coherence with the current state of the guild…
async function cmd_init_per_guild(utils, guild){
    if(!Boolean(playerDataManagers[guild.id])){
        playerDataManagers[guild.id]= new PlayerManager.PlayerDataManager(`${guild.id}.db`)
    }
}

function _processArgsQuoteMarks(args){
    var n_args= []
    var i=0;
    while(i<args.length){
        if(args[i].startsWith("\"") && !(args[i].length>1 && args[i].endsWith("\""))){
            var j=i+1;
            var endsmeet= false;
            while(j<args.length){
                if(endsmeet=(args[j].endsWith("\""))){
                    break;
                }
                ++j;
            }
            if(endsmeet){
                n_args.push(args.slice(i+1,j+1).join(' ').slice(1,-1))
                i= j;
            }
            else{
                n_args.push(args[i])
            }
        }
        else{
            n_args.push(args[i])
        }
        ++i;
    }
    return n_args
}


//this function is called when a command registered by this module
//(see end of this file) has been called in a guild.
// 'clearanceLvl' is the clearance level in wich this command has been posted
// 'cmdObj' is an object provided by the bot, constructed as follow:
//   cmdObj={
//      'command',
//      'args',
//      'msg_obj'
//   }
//  Where:
//   'cmdObj.command' is the string that constitutes the command called.
//   'cmdObj.args' is an array containing each remaining words of the command
//   'cmdObj.msg_obj' is the discord message object associated with the command
//     (see https://discord.js.org/#/docs/main/stable/class/Message)
async function cmd_main(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let playerDataManager= playerDataManagers[message.guild.id]
    let args= cmdObj.args;

    var chan_id= utils.settings.get(message.guild, 'channel');

    if(args[0]==="channel" && clearanceLvl>CLEARANCE_LEVEL.NONE){
        if(args[1]==="get"){
            var str= "***!player channel*** command: "
            var chan= undefined
            if (!Boolean(chan_id)){
                str+= "\n\tNo channel set…"
            }
            else if(!Boolean(chan=message.guild.channels.cache.get(chan_id))){
                str+= "\n\tPlayer channel not availabe (deleted?)…"
            }
            else{
                str+= `\n\tPlayer channel is #\"${chan.name}\" (${chan}).`
            }

            message.member.send(str).catch(err=>{hereLog(err);});

            return true
        }
        else if(args[1]==="clear"){
            utils.settings.remove(message.guild, 'channel')

            return true
        }
        else{
            var chan= undefined
            if(!Boolean(message.mentions) || !Boolean(message.mentions.channels) || !Boolean(chan=message.mentions.channels.first())){
                message.member.send("[player command] No mention to any channel found… Format is:\n\t`!player channel #channelmention`");
    
                return false;
            }
    
            utils.settings.set(cmdObj.msg_obj.guild, 'channel', chan.id);
    
            return true;
        }
    }
    
    hereLog("please?")
    if(chan_id===message.channel.id){
        hereLog("ok0")
        if(args[0]==="roster"){
            hereLog("ok1")
            if(args.length<=1){
                hereLog("ok2")
                var r= ( await playerDataManager.getPlayerRoster(message.author.id))

                if(Boolean(r)){
                    message.member.send(`roster: ${r}`)

                    return true
                }
                else{
                    return false
                }
            }

            var roster= []
            var n_args= _processArgsQuoteMarks(args.slice(1));
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
            
            // return (await playerDataManager.setPlayerRoster(message.author.id, roster.join(';')))
            var res= (await playerDataManager.setRosterByNameAndColor(message.author.id, roster))
            if(!Boolean(res)){
                return false;
            }
            else if(res.length===0){
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
    else if(!Boolean(chan_id)){
        message.member.send("[player command] no player channel” is set…")

        return false;
    }
    else{
        var chan= undefined
        if(chan=message.guild.channels.cache.get(chan_id)){
            message.member.send(`[player command] Player channel not valid or not availabe (deleted?)… (id:${chan_id})`)
        }
        else{
            message.member.send(`[player command] \`!player channel\` should be used is dedicated channel (#${chan.name})`)
        }

        return false;
    }

    return false;
}



//this function is called when a 'help' command has been called in a
//guild, regarding one of the commands registered by this module.
function cmd_help(cmdObj, clearanceLvl){}



//this function is called when an event has been recieved by the bot's client.
//See https://discord.js.org/#/docs/main/stable/class/Client for the event list).
function cmd_event(eventName, utils){}



//this function is called when the bot leaves a guild
function cmd_guild_clear(guild){}



//the module then needs to register these function for export
//  set 'module.exports.name' to a the name of a command this module wants to register.
//  it can registers several commands by providing an array of strings.
module.exports.name= ['player'];
//  all the functions previously presented needs to be register is a grouped object, as the following:
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};