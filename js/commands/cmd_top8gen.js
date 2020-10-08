const fs = require('fs');
const path= require('path');
const { generate } = require('./top8gen/templates/scarletarena/generate');

const my_utils= requite('../utils.js')


const Generate_destination_path= "../../html"



let hereLog= (...args) => {console.log("[cmd_top8gen]", ...args);};



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
function cmd_init(utils){}



//this function is called, during bot's launch (after 'cmd_init'),
//once per guild the bot is part of.
//It is the opprtunity, for example, to verify the data's integrity
//and coherence with the current state of the guild…
async function cmd_init_per_guild(utils, guild){}



function listTemplates(){
    let template_dir= `${__dirname}/top8gen/templates`
    var list= fs.readdirSync(template_dir).filter(function (file) {
        return (
            fs.statSync(template_dir+'/'+file).isDirectory()
            && fs.existsSync(template_dir+`/${file}/generate.js`)
        );
    });

    return list.map(dir => {return path.basename(dir)})
}


function _generateTop8(template, genInfos, channel){
    let generate= undefined;
    try{
        generate= require(`./top8gen/templates/${template}/generate.js`)
    } catch(error){
        hereLog(`Unable to load '${template}' generate.js module…`)
    }

    if(!Boolean(generate)){
        channel.send(`❌ Internal error. (can't access generating method)`)
        return false
    }

    let genResults= generate(genInfos);
    if(!Boolean(genResults)){
        channel.send(`❌ Internal error with generating method…`)
        return false
    }
    else if(!Boolean(genResults.is_success)){
        var msg= `❌ Internal error while generating: method failed`

        for(var attr of ['preparation', 'read', 'generation']){
            if(Boolean(genResults[attr]))
                msg+= `\t- \`${attr}\` issue`
        }
        if(Boolean(genResults.ressource_copy.char_img)){
            msg+= `\t- \`ressource copy - character image\` issue`
        }
        if(Boolean(genResults.ressource_copy.base_img)){
            msg+= `\t- \`ressource copy - character image\` issue`
        }

        channel.send(msg)

        return false
    }
    else if(!Boolean(genResults.out_svg) || fs.existsSync(genResults.out_svg)){
        channel.send(`❌ Final svg generation failed…`)
        return false
    }


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
    let command= cmdObj.command;
    let message= cmdObj.msg_obj;
    let playerDataManager= playerDataManagers[message.guild.id]

    var args= cmdObj.args;

    if(command==="top8"){
        if(args[0].match(/^te?m?pl?a?te?s?$/)){
            var templates= listTemplates();

            if(templates.length===0){
                message.channel.send("No template seems available… 😕")
            }
            else{
                var msg= `${templates.length} templates available:\n`
                for(var t of templates){
                    msg+= `\t- ${t}`
                }
                message.channel.send(msg)
            }

            return true
        }
        else{
            let argOpt= my_utils.commandArgsOptionsExtract(args);

            if(!Boolean(argsOpt.args[0])){
                message.channel.channel(
                    "Nom de template requis en paramètre.\n"+
                    "\t( Pour consulter la liste de templates disponibles, utiliser la commande `!top8 templates` )"
                )

                return false;
            }
            else if(!(listTemplates().includes(argsOpt.args[0]))){
                message.channel.channel(
                    `Nom de template “*${argsOpt.args[0]}*” inconnu…\n`+
                    "\t( Pour consulter la liste de templates disponibles, utiliser la commande `!top8 templates` )"
                )

                return false;
            }

            let getOpt= (opt, defaultVal) =>{
                return (Boolean(argsOpt.options[opt])?argsOpt.options[opt]:"-")
            }

            let getTopRoster= (topNum) => {
                var r= [];
                for(var i=1; i<=4; ++i){
                    r.push(argsOpt.options[`top${topNum}-char${i}`])
                }
                return r.filter(char => {return Boolean(char)})
            }

            var top8Tab= [];
            for(var i=1; i<=8; ++i){
                top8Tab.push(
                    {name: getOpt(`top${i}-name`,'-'), twitter: getOpt(`top${i}-twitter`,'-'),
                    roster: getTopRoster(`${(i===5)?'5a':(i===6)?'5b':(i===7)?'7a':(i===8)?'7b':`${i}`}`)}
                )
            }

            var genInfos={
                destination_dir: Generate_destination_path,
                title: ((Boolean(argOpt.args[1]))?argOpt.args[1]:"title"),

                top8: top8Tab
            }

            return _generateTop8(template, genInfos, message.channel);

        }
    }

    if(args[0]==="help"){
        return cmd_help(cmdObj, utils)
    }

    return false
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
module.exports.name= ['top8'];
//  all the functions previously presented needs to be register is a grouped object, as the following:
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};