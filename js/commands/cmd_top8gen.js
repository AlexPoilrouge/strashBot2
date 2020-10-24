const fs = require('fs');
const path= require('path');

const child_process= require("child_process");

const my_utils= require('../utils.js')

const smashGG= require('./top8gen/smashggReader.js') 


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
        this._db=dbManager

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

        var tmp= ( await (this._db.__getQuery(`SELECT * FROM players WHERE name LIKE '%${playerName.toLowerCase()}%'`)))
        if(Boolean(tmp)){
            res.name= (Boolean(tmp.name))?tmp.name:playerName
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


async function _generateTop8(template, genInfos, channel){
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
    var newfiles_to_delete= []
    try{
        genResults= ( await (generateSVG(genInfos, rasterizeFunc, (msg) => {
                if(Boolean(msg)){
                    channel.send(msg)
                }
            } 
        )) );
    } catch(error){
        hereLog(`Error within the 'generate' method…\n\t${error}`)
        genResults= undefined
    }
    if(!Boolean(genResults)){
        channel.send(`❌ Internal error with generating method…`)
        unload()
        return false
    }
    else{
        if(Boolean(genResults.newfiles)){
            newfiles_to_delete= genResults.newfiles;
        }
        
        var b_svg= true;
        if(!Boolean(genResults.is_success)){
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
            b_svg= false
        }
        else if(!Boolean(genResults.out_svg) || !fs.existsSync(genResults.out_svg)){
            channel.send(`❌ Final svg generation failed…`)
            unload()
            b_svg= false
        }
        
        let zip_func= (files, destination) => {
            hereLog(`[zip_func] entering zipping func (files=${files}, dest=${destination})`);
            var b= true;
            var abs_dest= path.resolve(destination)
            var l_f= (Array.isArray(files))? files : [ files ];
            for(var f of l_f){
                var abs_f= path.resolve(f)
                var rel_z_f= path.relative(path.dirname(abs_dest), abs_f)
                try{
                    var cmd= `cd ${path.dirname(abs_dest)}; ${genInfos.zip_bin} -ur ${destination} ${rel_z_f}`
                    child_process.execSync(cmd, {timeout: 16000});
                } catch(error){
                    hereLog(`[rast_func] error invoking ziping command \`${cmd}\`!\n\t${error}`)
                    b= false;
                }
            }
            return b;
        }

        let post_generate= generateModule.post_generate
        var z_b= false;
        if( !(z_b=( Boolean(post_generate) && post_generate(genInfos.destination_dir,zip_func, newfiles_to_delete) )) ){
            hereLog(`[rast_func] unable to generate final archive!`)
        }


        if(b_svg){
            channel.send(
                ((z_b)?`Source at: <${genInfos.http_addr}/top8.zip>`:''),
                { files : [ `${genInfos.destination_dir}/top8.png` ] }
            )
        }

        unload()
        return b_svg
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

        if(Boolean(fightersOBJ)){
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

async function _fetchSmashGGInfos(url){
    let smggr= new smashGG.SmashGG_Top8Reader(smashGG.GetSmashGGToken(), url)

    var r= undefined;
    try{
        r= (await smggr.getTop8())
    } catch(err){
        hereLog(`[FetchSmashGGInfos] failed to fetch infos from \`${url}\`:\n\t${err.message}`)
        r= undefined;
    }

    if(!Boolean(r)){
        return undefined;
    }
    else{
        var i=0;
        var r_obj= {}

        for(var n of r){
            if(Boolean(n) && n.placement>=1 && n.placement<=7){
                var m= {}
                m['name']= n.name
                m['team']= n.team
                m['twitter']= (Boolean(n.twitter) && !n.twitter.startsWith('@'))?('@'+n.twitter):n.twitter
                if([5,7].includes(n.placement)){
                    r_obj[`${n.placement}${(i===0)?'a':'b'}`]= m
                    i= (i+1)%2
                }
                else{
                    r_obj[`${n.placement}`]= m
                }
            }
        }

        hereLog(`[FetchSmashGGInfos] returning r_obj:\n\t${JSON.stringify(r_obj)}`)

        return r_obj;
    }
}

async function _evaluateArgsOptions(args, options, guild, user){
    var rep= {errors:{}, warnings:{}, infos:{}}

    var test_infos={
        '1': {roster:[]}, '2': {roster:[]}, '3': {roster:[]}, '4': {roster:[]}, 
        '5a': {roster:[]}, '5b': {roster:[]}, '7a': {roster:[]}, '7b': {roster:[]}
    }

    let optionValue= (name) =>{
        var opt= undefined;
        return (Boolean(opt=options.find(o => {return o.name===name})))?
                    opt.value
                :   undefined;
    }

    var sgg_infos= undefined;
    if(Boolean(args[1])){
        sgg_infos= (await _fetchSmashGGInfos(args[1]))

        if(!Boolean(sgg_infos)){
            rep.errors[`smashgg`]= `Couldn't read infos from SmashGG '${args[1]}'`
        }
        else{
            rep.infos[`smashgg`]= `Read infos from SmashGG '${args[1]}'`
        }
    }
    else{
        rep.warnings[`smashgg`]= `No SmashGG provided`
    }

    var p_db= playerDBs[guild.id];
    for(var p of Object.keys(test_infos)){
        var option_name=`top${p}-name`;
        var option_value= undefined;
        var player_infos= undefined;

        if(!Boolean(option_name) || !Boolean(option_value=optionValue(option_name))){
            if(Boolean(sgg_infos) && Boolean(sgg_infos[p]) && Boolean(sgg_infos[p].name)){
                if(Boolean(p_db)){
                    player_infos= (await p_db.getPlayerInfos(sgg_infos[p].name))
                    rep.infos[option_name]= `Player ${p} name is: "${player_infos.name}"`
                    test_infos[p]['name']= player_infos.name;
                }
                else{
                    rep.infos[`smashgg${p}-name`]= `Player ${p} name is: "${sgg_infos[p].name}"`
                    test_infos[p]['name']= player_infos.name;
                }
            }
            else{
                rep.errors[option_name]= `No name for player ${p}; Use option \`?${option_name}="name"\` to add it manually`
            }
        }
        else{
            if(Boolean(p_db)){
                player_infos= (await p_db.getPlayerInfos(option_value))
                rep.infos[option_name]= `Player ${p} name is: "${player_infos.name}"`
                test_infos[p]['name']= player_infos.name;
            }
            else{
                rep.infos[option_name]= `Player ${p} name is: "${option_value}"`
                test_infos[p]['name']= option_value;
            }
        }
        
        var f_pname= (Boolean(test_infos[p]['name']))?`"${test_infos[p]['name']}"`:"";

        option_name= `top${p}-twitter`;
        if(!Boolean(option_name) || !Boolean(option_value=optionValue(option_name))){
            if(Boolean(sgg_infos) && Boolean(sgg_infos[p]) && Boolean(sgg_infos[p].twitter)){
                rep.infos[`smashgg${p}-twitter`]= `Player ${p} ${f_pname} twitter set to ${sgg_infos[p].twitter}`
                test_infos[p]['twitter']= sgg_infos[p].twitter;
            }
            else{
                rep.warnings[option_name]= `No twitter set for player ${p} ${f_pname}; Use option \`?${option_name}="@twitter"\` to add it manually`
            }
        }
        else{
            rep.infos[option_name]= `Player ${p} ${f_pname} twitter set to ${option_value}`
            test_infos[p]['twitter']= option_value;
        }

        option_name= `top${p}-team`
        if(Boolean(option_value=optionValue(option_name))) player_infos.team= option_value;
        if(!Boolean(player_infos) || !Boolean(player_infos.team)){
            if(Boolean(sgg_infos) && Boolean(sgg_infos[p]) && Boolean(sgg_infos[p].team)){
                rep.infos[`smashgg${p}-team`]= `Player ${p} ${f_pname} team set to ${sgg_infos[p].team}`
                test_infos[p]['team']= sgg_infos[p].team               
            }
            else{
                rep.warnings[option_name]= `No team found for player ${p} ${f_pname} in DataBase; Use option \`?${tmp}="team"\` to add it manually`
            }
        }
        else{
            rep.infos[option_name]= `Player ${p} ${f_pname} team set to ${player_infos.team}`
            test_infos[p]['team']= player_infos.team
        }

        var tmp= `top${p}-roster`
        if(Boolean(player_infos) && Boolean(player_infos.roster)){
            player_infos.roster.filter(c => {return Boolean(c) && !Boolean(c.match(/^0+([\s\.][0-9]{1,2})?$/));})
        }
        if(!Boolean(player_infos) || !Boolean(player_infos.roster) || player_infos.roster.length<=0){
            rep.warnings[tmp]= `No character roster found for  player ${p} ${f_pname} in DataBase; `+
                            `Use options \`?top${p}-charX="character"\` (with X between 1 and 4) to add them manually`
        }
        else{
            rep.infos[tmp]= `Player ${p} ${f_pname} character roster found in database`
            test_infos[p]['roster']= player_infos.roster
        }

        for(var i=1; i<=4; ++i){
            option_name= `top${p}-char${i}`
            option_value= optionValue(option_name)

            if(Boolean(option_value)){
                if(Boolean(player_infos) && Boolean(player_infos.roster) && Boolean(player_infos.roster[i-1])){
                    rep.infos[option_name]= `Player ${p} ${f_pname} character ${i} for roster overwritten by option \`${option_name}\``
                    test_infos[p].roster[i-1]= option_value
                }
                else{
                    rep.infos[option_name]= `Player ${p} ${f_pname} character ${i} set by option \`${option_name}\``
                    test_infos[p].roster[i-1]= option_value
                }
            }
        }
        if(Boolean(test_infos[p]) && Boolean(test_infos[p].roster)){
            test_infos[p].roster.filter(c => {return Boolean(c) && !Boolean(c.match(/^0+([\s\.][0-9]{1,2})?$/));})
        }

    }

    if(args.length<=0 || !listTemplates().includes(args[0])){
        rep.errors['template']= `invalid template "${args[0]}"; Check tempates list with command \`!top8 templates\``
    }
    else{
        test_infos['template']= args[0]
        rep.infos['template']= test_infos['template']
    }

    if(!Boolean(options) || !Boolean(optionValue('title'))){
        rep.errors['title']= `Top8 title not set; Use option \`?title="title"\` to set it`
    }
    else{
        test_infos['title']= optionValue('title')
        rep.infos['title']= test_infos['title']
    }

    var msg= `[${guild.name}] --- options test:\n`

    var err_k= undefined;
    if(Boolean(rep) && Boolean(rep.errors) && (err_k=Object.keys(rep.errors)).length>0){
        msg+= `*${err_k.length} Errors* found:\n`
        for(var err of err_k){
            msg+= `❌ \t__${err}__: ${rep.errors[err_k]}\n`
        }
        msg+=`\n`
    }

    var warn_k= undefined;
    if(Boolean(rep) && Boolean(rep.warnings) && (warn_k=Object.keys(rep.warnings)).length>0){
        msg+= `*${warn_k.length} Warnings* generated:\n`
        for(var warn of warn_k){
            msg+= `⚠️ \t__${warn}__: ${rep.warnings[warn]}\n`
        }
        msg+=`\n`
    }

    var info_k= undefined;
    if(Boolean(rep) && Boolean(rep.infos) && (info_k=Object.keys(rep.infos)).length>0){
        msg+= `*${info_k.length} infos* displayed:\n`
        for(var info of info_k){
            msg+= `🔷 \t__${info}__: ${rep.infos[info]}\n`
        }
    }

    if(!(Boolean(rep))){
        msg+= `❌ Internal error: options test failed! ❌`
        return false;
    }

    user.send(msg, {split:true});

    var msg2= `[${guild.name}] --- options test -- __Summary__:\n`

    msg2+= `\t__Title__: ${(Boolean(test_infos['title']))?test_infos['title']:'❌'}\n`
    msg2+= `\t__Template__: ${(Boolean(test_infos['template']))?test_infos['template']:'❌'}\n`
    for(var p of ['1','2','3','4','5a','5b','7a','7b']){
        msg2+= `\t*Player ${p}:*\n`
        msg2+= `\t\t__Name__: ${(Boolean(test_infos[p]['name']))?`*${test_infos[p]['name']}*`:'❌'}`
        msg2+= `\t\t__Team__: ${(Boolean(test_infos[p]['team']))?`*${test_infos[p]['team']}*`:'-'}`
        msg2+= `\t\t__Twitter__: ${(Boolean(test_infos[p]['twitter']))?`*${test_infos[p]['twitter']}*`:'-'}\n`
        msg2+= `\t\t__Roster__:\n`
        if(Boolean(test_infos[p]['roster']) && test_infos[p]['roster'].length>0){
            for(var i=1; i<=4; ++i){
                var ch_input= undefined
                if(Boolean(ch_input=test_infos[p].roster[i-1])){
                    var character= undefined;
                    var ch_match= undefined;
                    if(!Boolean(fightersOBJ)){
                        __loadFightersObj()
                    }
                    var ch_key= undefined
                    var ch_keys= Object.keys(fightersOBJ)
                    if(Boolean(ch_match=ch_input.match(/^([1-9]?[0-9][ae]?)([\s\.]([0-9]{1,2}))?$/))){
                        if(Boolean(ch_key=ch_keys.find(k => {return fightersOBJ[k].number===ch_match[1]}))){
                            character= {name: ch_key}
                            if(Boolean(ch_match[3])){
                                character['skin']= ch_match[3];
                            }
                        }
                    }
                    else if(Boolean(ch_match=ch_input.match(/^((.+)[\s\.]([0-9]{1,2}))|(.+)$/))){
                        var n_match= (Boolean(ch_match[2]))?ch_match[2]:ch_match[4]
                        if(Boolean(ch_key=ch_keys.find(k => {return Boolean(n_match.match(RegExp(fightersOBJ[k].regex)))}))){
                            character= {name: ch_key}
                            if(Boolean(ch_match[3])){
                                character['skin']= ch_match[3];
                            }
                        }
                    }

                    if(!Boolean(character) || !Boolean(character.name)){
                        if(ch_input!=="0"){
                            msg2+= `\t\t\t❌ Failed to identify character "*${ch_input}*"\n`
                        }
                    }
                    else{
                        msg2+= `\t\t\tIdentified character: *${character.name}${(Boolean(character.skin))?`* (skin ${character.skin})`:"*"}\n`
                    }
                }
            }
        }
        else{
            msg2+= '\t\t\t❌\n'
        }
    }

    user.send(msg2, {split:true});

    return true;
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

    if(args[0]==="help"){
        return cmd_help(cmdObj, clearanceLvl)
    }

    if(command==="top8"){
        if(Boolean(args[0]) && args[0].match(/^te?m?pl?a?te?s?$/)){
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
        else if(Boolean(args[0]) && args[0].match(/^groups?$/)){
            if(clearanceLvl<CLEARANCE_LEVEL.CONTROL_CHANNEL){
                return false;
            }

            if(Boolean(args[1]) && args[1].match(/^(del(ete)?)|(re?mo?ve?)$/)){
                utils.settings.remove(message.guild, "top8role")

                message.author.send(`[${message.guild.name}] Role for command \`!top8gen\` removed.`)

                return true
            }

            var role= undefined;
            if(Boolean(message.mentions) && Boolean(message.mentions.roles) && Boolean(role=message.mentions.roles.first())){
                utils.settings.set(message.guild, "top8role", role.id)

                return true;
            }
            else{
                var role_id= utils.settings.get(message.guild, "top8role")
                if(Boolean(role_id) && Boolean(role=message.guild.roles.cache.get(role_id))){
                    message.author.send(`[${message.guild.name}] Role for \`!top8\` command is set to "${role.name}"`);
                    return true
                }
                else{
                    message.author.send(`[${message.guild.name}] No role is set for \`!top8\` command`);
                    return true
                }
            }
        }
        else if(Boolean(args[0]) && args[0].match(/^test(ing)?$/)){
            var role_id= utils.settings.get(message.guild, "top8role")
            if(clearanceLvl<CLEARANCE_LEVEL.CONTROL_CHANNEL &&
                    !(Boolean(role_id) && Boolean(message.member.roles.get(role_id)))
            ){
                return false;
            }

            let argsOpt= my_utils.commandArgsOptionsExtract(args);

            return (await _evaluateArgsOptions(argsOpt.args.slice(1), argsOpt.options, message.guild, message.author));
        }
        else{
            var role_id= utils.settings.get(message.guild, "top8role")
            if(clearanceLvl<CLEARANCE_LEVEL.CONTROL_CHANNEL &&
                    !(Boolean(role_id) && Boolean(message.member.roles.get(role_id)))
            ){
                return false;
            }

            let argsOpt= my_utils.commandArgsOptionsExtract(args);

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

            var smashGGInfos= {}
            if(Boolean(argsOpt.args[1])){
                if(!Boolean(smashGGInfos=(await _fetchSmashGGInfos(argsOpt.args[1])))){
                    message.channel.send(`⚠️ Couldn't read infos from smashGG tourney \`${argsOpt.args[1]}\``)
                    smashGGInfos={}
                }
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
                    var roster_opt= getOpt(`top${topNum}-char${i}`,undefined)
                    if(Boolean(roster_opt)){
                        r[i-1]= __rosterCharNameProcess(roster_opt)
                    }
                }
                return r
            }

            let processTwitter= (str) => {
                if(!Boolean(str)) return undefined;
                var r= (str.includes('/'))?
                            ( (str.endsWith('/'))? str.split('/').slice(-2,-1)
                                :   str.split('/').slice(-1) )
                        :   str;
                return (r.startsWith('@'))? str : ('@' + str)
            }

            var top8Tab= [];
            for(var i=1; i<=8; ++i){
                var n= (i===5)?'5a':(i===6)?'5b':(i===7)?'7a':(i===8)?'7b':`${i}`
                var p_name= (Boolean(getOpt(`top${n}-name`,undefined)))?
                                getOpt(`top${n}-name`,undefined)
                            :   (Boolean(smashGGInfos[`${n}`]) && Boolean(smashGGInfos[`${n}`].name))?
                                    smashGGInfos[`${n}`].name
                                :   '-';
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
                }).filter((c) => {return (Boolean(c) && c!=="0")})

                var _tmp= undefined;
                top8Tab.push(
                    {
                        name: p_name,
                        team:   ( (Boolean(_tmp=getOpt(`top${n}-team`,undefined)))?
                                    _tmp
                                :   (Boolean(smashGGInfos[`${n}`]) && Boolean(_tmp=smashGGInfos[`${n}`].team)) ?
                                        _tmp
                                    :   undefined ),
                        twitter:  ( (Boolean(_tmp=processTwitter(getOpt(`top${n}-twitter`,undefined))))?
                                    _tmp
                                :   (Boolean(smashGGInfos[`${n}`]) && Boolean(_tmp=smashGGInfos[`${n}`].twitter))?
                                        _tmp
                                    :   '-' ),
                        roster: p_roster
                    }
                )
            }

            var genInfos={
                destination_dir: Generate_destination_path,
                title: getOpt('title','title'),

                top8: top8Tab,

                svg_bin: utils.settings.get(message.guild, "vector_to_raster_exe"),
                zip_bin: utils.settings.get(message.guild, "zip_exe"),

                http_addr: utils.settings.get(message.guild, "http_zip_dl_dir_addr"),
            }

            hereLog(`genInfos be like: ${JSON.stringify(genInfos)}`)

            return _generateTop8(template, genInfos, message.channel);

        }
    }

    return false
}



//this function is called when a 'help' command has been called in a
//guild, regarding one of the commands registered by this module.
function cmd_help(cmdObj, clearanceLvl){
    var prt_cmd= "top8"

    cmdObj.msg_obj.author.send(
        "========\n\n"+
        `__**top8** command__:\n\n`+
        ((clearanceLvl<CLEARANCE_LEVEL.ADMIN)? "": ("**Admins only:**\n\n"+
            `\t\`!${prt_cmd} group #role-mention\`\n\n`+
            `\tsets which role (additionally to Admins) can have its members use the \`!top8\` command\n\n`+
            `\t\`!${prt_cmd} group\`\n\n`+
            `\ttells which is the designated group\n\n`+
            `\t\`!${prt_cmd} group remove\`\n\n`+
            `\tremove the previously set role\n\n`
        )) +
        `---\n\t\`!${prt_cmd} template\`\n\n`+
        `\tlists all top8 templates available\n\n`+
        `---\n**Following commands only availabe to members of designated group** (see \`!${prt_cmd} group\`):\n\n`+
        `\t\`!${prt_cmd} <template> [smashggUrl] [options…]\`\n\n`+
        `\tgenerates top8 from a given template (get available templates list with \`!${prt_cmd} template\`)\n`+
        `\tIf a smashgg Url is provided, then top8 data will be fetch from this smash.gg tournament.\n\n`+
        `\t⚠️ This assumes that the tournament is completed, and that the provided smash.gg Url points to a '*Singles' event.\n`+
        `\t\t__Example:__ \`!${prt_cmd}\` template <https://smash.gg/tournament/scarlet-arena-4/event/singles> ?title="4th edition"`+
        `\t\`!${prt_cmd} test <template> [smashggUrl] [options…]\`\n\n`+
        `\tThe goal of the commands is to test out parameters and options to ensure their validity before making an actual`+
        `call to the \`!top8\` command.\n` +
        `-\nAvailable **options** are:\n`+
        `\t\`?title=""\`\n\t\`?top1-name="" ?top1-twitter="" ?top1-team="" ?top1-char1="" ?top1-char2="" ?top1-char3="" ?top1-char4=""\`\n`+
        `\t\`?top2-name="" ?top2-twitter="" ?top2-team=""  ?top2-char1="" ?top2-char2="" ?top2-char3="" ?top2-char4=""\`\n`+
        `\t\`?top3-name="" ?top3-twitter="" ?top3-team=""  ?top3-char1="" ?top3-char2="" ?top3-char3="" ?top3-char4=""\`\n`+
        `\t\`?top4-name="" ?top4-twitter="" ?top4-team=""  ?top4-char1="" ?top4-char2="" ?top4-char3="" ?top4-char4=""\`\n`+
        `\t\`?top5a-name="" ?top5a-twitter="" ?top5a-team=""  ?top5a-char1="" ?top5a-char2="" ?top5a-char3="" ?top5a-char4=""\`\n`+
        `\t\`?top5b-name="" ?top5b-twitter="" ?top5b-team=""  ?top5b-char1="" ?top5b-char2="" ?top5b-char3="" ?top5b-char4=""\`\n`+
        `\t\`?top7a-name="" ?top7a-twitter="" ?top7a-team=""  ?top7a-char1="" ?top7a-char2="" ?top7a-char3="" ?top7a-char4=""\`\n`+
        `\t\`?top7b-name="" ?top7b-twitter="" ?top7b-team=""  ?top7b-char1="" ?top7b-char2="" ?top7b-char3="" ?top7b-char4=""\`\n\n`+
        `\tWith:\n`+
        `\t\`?title\` setting the name of the top8 graph\n`+
        `\t\`?topX-name\` setting the name the X-th player\n`+
        `\t\`?topX-twitter\` setting the twitter ref of the X-th player\n`+
        `\t\`?topX-team\` setting the team/structure shortened name of the X-th player\n`+
        `\t\`?topX-charY\` setting the Y-th character in the X-th player roster; can be character name of number followed by skin number (from 0 to 8)\n`+
        `\t⚠️ X is the player number among the following list: [1, 2, 3, 4, 5a, 5b, 7a, 7b]; Y is number from 1 to 4; all option values must be encase in quotation marks \`"\`\n`+
        `\t__Example:__\n`+
        `\t\t\`!${prt_cmd} scarletarena ?title="2nd edition" ?top1-name="Fire" ?top1-twitter="@firezard" ?top1-char1="incineroar" ?top1-char2="charizard"`+
        `?top2-name="Hegdgeon" ?top2-twitter="@hedgeon" ?top2-char1="sonic" ?top2-char2="falco"\`\n`+
        `\t⚠️ In case of overlapping/conflicting data, the data provided by the *options* is prioritized over the data provided by the *DataBase*, which itself is`+
        `prioritized over the data provided by the *smash.gg tournament*.`,
        {split: true}
    )

    return true;
}



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