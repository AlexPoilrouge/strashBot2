const fs = require('fs');
const path= require('path');

const child_process= require("child_process");

const my_utils= require('../utils.js')


const Top8Gen_data_dir= `${__dirname}/top8gen`
const Generate_destination_path= `${__dirname}/../../html`



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




var fightersOBJ= undefined

function __loadFightersObj(){
    var fn= path.resolve(__dirname,"./player/fighters.json")
    if(fs.existsSync(fn)){
        try{
            var data= fs.readFileSync(fn);
        } catch(err){
            hereLog(`[load_fighters] Couldn't read '${fn}'`)
        }

        var r= undefined;
        if(Boolean(data) && Boolean(r=JSON.parse(data))){
            fightersOBJ= r;
        }
        else{
            hereLog(`[load_fighters] Error reading data from '${fn}'`);
        }
    }
    else{
        hereLog(`[load_fighters]'${fn}' file not found`);
    }
}

class PlayerDB{
    constructor(dbManager){
        this._db=utils.getDataBase(dbManager)

        this._open_db()

        this._db.__runQuery('CREATE TABLE IF NOT EXISTS players (user_id INTEGER PRIMARY KEY,'+
                                'roster_1 TEXT DEFAULT "0", roster_2 TEXT DEFAULT "0", roster_3 TEXT DEFAULT "0", roster_4 TEXT DEFAULT "0", '+
                                'roster_msg_id TEXT DEFAULT "-", '+
                                'name TEXT DEFAULT "", team TEXT DEFAULT "")', [])
                            ;

        this._closeRequest_db()
    }

    _open_db(){
        if(Boolean(this._db))
            this._db._open_db();
    }

    _closeRequest_db(){
        if(Boolean(this._db))
            this._db._closeRequest_db();
    }

    async getPlayerInfos(playerName){
        this._open_db()

        var res= {name: playerName, team: "", roster: []};

        tmp= ( await (this._db.__getQuery("SELECT * FROM players WHERE name MATCH \'?\'", [playerName.toLowerCase()])))
        if(Boolean(tmp)){
            res.name= (Boolean(tmp.roster))?tmp.name:playerName
            res.team= (Boolean(tmp.team))?tmp.team:""
            res.roster= [tmp.roster_1,tmp.roster_2,tmp.roster_3,tmp.roster_4]
            for(var i=1; i<=4; ++i){
                var attr= `roster_${i}`
                if(Boolean(tmp[attr])){
                    res.roster.push(tmp[attr])
                }
            }
        }

        this._closeRequest_db()
        return res
    }
}

let playerDBs= {}

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
    try{
        if(!fs.existsSync(Top8Gen_data_dir+'/templates') ||
            !fs.statSync(Top8Gen_data_dir+'/templates').isDirectory()
        ){
            fs.mkdirSync(Top8Gen_data_dir+'/templates',{recursive: true})
        }
    }catch(error){
        hereLog(`[cmd_init] couldn't find or create necessary data folders '${Top8Gen_data_dir}/templates':\n\t${error}`)
    }

    __loadFightersObj()
}



//this function is called, during bot's launch (after 'cmd_init'),
//once per guild the bot is part of.
//It is the opprtunity, for example, to verify the data's integrity
//and coherence with the current state of the guild…
async function cmd_init_per_guild(utils, guild){
    if(!(Boolean(utils.settings.get(guild, "vector_to_raster_exe")))){
        utils.settings.set(guild, "vector_to_raster_exe", "inkscape")
    }
    if(!(Boolean(utils.settings.get(guild, "zip_exe")))){
        utils.settings.set(guild, "zip_exe", "zip")
    }
    if(!(Boolean(utils.settings.get(guild, "http_zip_dl_dir_addr")))){
        utils.settings.set(guild, "http_zip_dl_dir_addr", "https://127.0.0.1/html")
    }
    if(!Boolean(playerDBs[guild.id])){
        playerDBs[guild.id]= new PlayerDB(utils.getDataBase(guild))
    }
}



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
    let generateModule= undefined;
    let generateSVG= undefined;
    try{
        generateModule= require(`${__dirname}/top8gen/templates/${template}/generate.js`)
        generateSVG= generateModule.generateSVG
    } catch(error){
        hereLog(`Unable to load '${template}' generate.js module…\n\t${error}`)
    }

    let unload= () => {
        try{
            var name= require.resolve(`${__dirname}/top8gen/templates/${template}/generate.js`)
            delete require.cache[name]
        } catch(error){
            hereLog(`Unable to unload '${template}' generate.js module…\n\t${error}`)
        }
    }

    if(!Boolean(generateSVG)){
        channel.send(`❌ Internal error. (can't access generating method)`)
        unload()
        return false
    }

    let rasterizeFunc= (svg, outpng) => {
        var b= true;
        var cmd= `${genInfos.svg_bin} ${svg} --export-png=${outpng}`
        try{
            hereLog(`[rasterize func] calling command '${cmd}'`)
            child_process.execSync(cmd, {timeout: 24000});
        } catch(error){
            hereLog(`[rast_func] error invoking rasterizing command \`${cmd}\`!\n\t${error}`)
            b= false;
        }
        return b;
    }

    let genResults= undefined
    try{
        genResults= generateSVG(genInfos, rasterizeFunc);
    } catch(error){
        hereLog(`Error within the 'generate' method…\n\t${error}`)
        genResults= undefined
    }
    if(!Boolean(genResults)){
        channel.send(`❌ Internal error with generating method…`)
        unload()
        return false
    }
    else if(!Boolean(genResults.is_success)){
        var msg= `❌ Internal error while generating: method failed`

        for(var attr of ['preparation', 'read', 'generation']){
            if(Boolean(genResults[attr]))
                msg+= `\t- \`${attr}\` issue\n`
        }
        if(Boolean(genResults.ressource_copy.char_img)){
            msg+= `\t- \`ressource copy - character image\` issue\n`
        }
        if(Boolean(genResults.ressource_copy.base_img)){
            msg+= `\t- \`ressource copy - character image\` issue\n`
        }

        channel.send(msg)

        unload()
        return false
    }
    else if(!Boolean(genResults.out_svg) || !fs.existsSync(genResults.out_svg)){
        channel.send(`❌ Final svg generation failed…`)
        unload()
        return false
    }
    else{
        let zip_func= (files, destination) => {
            var b= true;
            var l_f= (Array.isArray(files))? files : [ files ];
            for(var f of l_f){
                try{
                    var cmd= `${genInfos.zip_bin} -ur ${destination} ${f}`
                    child_process.execSync(cmd, {timeout: 8000});
                } catch(error){
                    hereLog(`[rast_func] error invoking ziping command \`${cmd}\`!\n\t${error}`)
                    b= false;
                }
            }
            return b;
        }

        var post_generate= generateModule.post_generate
        var z_b= false;
        if(!(z_b=(Boolean(post_generate)) ||
            !post_generate(genInfos.destination_dir,zip_func))
        ){
            hereLog(`[rast_func] unable to generate final archive!`)
        }

        channel.send(
            ((b_z)?`Source at: <${utils.settings.get(guild, "http_zip_dl_dir_addr")}/top8.zip>`:''),
            { files : [ `${genInfos.destination_dir}/top8.png` ] }
        )

        unload()
        return true
    }


}



function __rosterCharNameProcess(str){
    var num_match= str.match(/^([0-9]*[1-9][ae]?)(\.[0-9]+)?$/)
    if(Boolean(num_match) && Boolean(num_match[1])){
        return `${num_match[1]}${(Boolean(num_match[2]))?`${num_match[2]}`:''}`
    }
    else{
        var skin_test= str.match(/[\s\.]*([0-9]+)\s*$/)
        var input= (Boolean(skin_test))?str.replace(/[\s\.]*([0-9]+)\s*$/,''): str;

        if(!Boolean(fightersOBJ)){
            __loadFightersObj()
        }

        if(!Boolean(fightersOBJ)){
            let keys= Object.keys(fightersOBJ);
            for (var key of keys){
                var fighter= fightersOBJ[key]
                var regex= (Boolean(fighter) && Boolean(fighter.regex))?(new RegExp(fighter.regex)):undefined
                if(Boolean(regex) && (Boolean(input.toLowerCase().match(regex)) || Boolean(input===fighter.number))){
                    return `${fighter.number}${(Boolean(skin_test) && Boolean(skin_test[1]))?`.${skin_test[1]}`:''}`
                }
            }

            return str;
        }
        else{
            return str;
        }
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

    var args= cmdObj.args;

    hereLog("...")
    if(command==="top8"){
        hereLog("a")
        if(args[0].match(/^te?m?pl?a?te?s?$/)){
            hereLog("b")
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
            let argsOpt= my_utils.commandArgsOptionsExtract(args);

            hereLog(`argsOpt be like: ${JSON.stringify(argsOpt)}`)

            let template= argsOpt.args[0]
            if(!Boolean(template)){
                message.channel.send(
                    "Nom de template requis en paramètre.\n"+
                    "\t( Pour consulter la liste de templates disponibles, utiliser la commande `!top8 templates` )"
                )

                return false;
            }
            else if(!(listTemplates().includes(template))){
                message.channel.send(
                    `Nom de template “*${template}*” inconnu…\n`+
                    "\t( Pour consulter la liste de templates disponibles, utiliser la commande `!top8 templates` )"
                )

                return false;
            }

            let getOpt= (optName, defaultVal) =>{
                var option= undefined;
                var ret= (Boolean(option=(argsOpt.options.find(o => {return o.name===optName}))))?
                            ((Boolean(option.value))?option.value:defaultVal)
                        :   defaultVal ;
                return ret
            }

            let getTopRoster= (topNum) => {
                var r= [undefined,undefined,undefined,undefined];
                for(var i=1; i<=4; ++i){
                    r[i](__rosterCharNameProcess(getOpt(`top${topNum}-char${i}`,undefined)))
                }
                return r.filter(char => {return Boolean(char)})
            }

            var top8Tab= [];
            for(var i=1; i<=8; ++i){
                var n= (i===5)?'5a':(i===6)?'5b':(i===7)?'7a':(i===8)?'7b':`${i}`
                var p_name= getOpt(`top${n}-name`,'-')
                var p_info= undefined;
                var p_db= undefined;
                if(Boolean(p_db=playerDBs[message.guild.id])){
                    p_info= await p_db.getPlayerInfos(p_name)
                    p_name= p_info.name
                }
                var p_roster= getTopRoster(`${n}`)
                p_roster= p_roster.map((c,idx) => {
                    if(Boolean(c)) return c;
                    else if(p_info.roster[idx]) return p_info.roster[idx]
                    else return undefined;
                }).filter((c) => {return Boolean(c)})

                top8Tab.push(
                    {
                        name: p_name,
                        twitter: getOpt(`top${n}-twitter`,'-'),
                        roster: p_roster
                    }
                )
            }

            var genInfos={
                destination_dir: Generate_destination_path,
                title: getOpt('title','title'),

                top8: top8Tab,

                svg_bin: utils.settings.get(message.guild, "vector_to_raster_exe"),
                zip_bin: utils.settings.get(message.guild, "zip_exe")
            }
            hereLog(`genInfos be like:\n${JSON.stringify(genInfos)}`)

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