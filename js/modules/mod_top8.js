const fetch = require('node-fetch');
const { SlashCommandBuilder, ChannelType } = require("discord.js")
const fs = require('fs');
const path= require('path');
const child_process= require("child_process");

const my_utils= require('../utils.js')
const smashGG= require('./top8gen/smashggReader.js');
const { hrtime } = require('process');


const TOP8NUMS= ['1','2','3','4','5a','5b','7a','7b']

const Top8Gen_data_dir= `${__dirname}/top8gen`
const Generate_destination_path= `${__dirname}/../../html`


let hereLog= (...args) => {console.log("[top8Module]", ...args);};

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

        var tmp= ( await (this._db.__getQuery(`SELECT * FROM players WHERE name LIKE '${playerName.toLowerCase()}'`)))
        // hereLog(`[DBInfo.getPlayerInfos] -> req res is ${JSON.stringify(tmp)}`)
        if(Boolean(tmp)){
            res.name= (Boolean(tmp.name))?tmp.name:playerName
            res.team= (Boolean(tmp.team))?tmp.team:""
            res.roster= [tmp.roster_1,tmp.roster_2,tmp.roster_3,tmp.roster_4]
        }

        this._closeRequest_db()
        return res
    }
}

let playerDBs= {}

let templates= []


let E_RetCode= my_utils.Enums.CmdRetCode

async function __readJSONConfig(url){
    if(!Boolean(url)) return {status: "error", message: "bad url config file"}

    try{
        let res= await fetch(url, {method: 'Get'})

        return {status: "OK", data: (await res.json())}
    } catch(err){
        hereLog(`[_readJSONConfig] error trying to read file from url '${url}' - ${err}`)
        return {status: "error", message: `${err}`}
    }
}

async function _fetchSmashGGInfos(url){
    let smggr= new smashGG.SmashGG_Top8Reader(smashGG.GetSmashGGToken(), url)

    var r= undefined;
    try{
        r= (await smggr.getInfos())
    } catch(err){
        hereLog(`[FetchSmashGGInfos] failed to fetch infos from \`${url}\`:\n\t${err.message}`)
        r= undefined;
    }

    if(!Boolean(r)){
        return undefined;
    }
    else{
        var i=0;
        var r_obj= {
            numEntrants: r.numEntrants,
            venueAdress: r.venueAdress,
            date: (Boolean(r.date.toLocaleDateString))?r.date.toLocaleDateString('fr-FR'):d.date,
            top8: {}
        }

        for(var n of r.top8){
            if(Boolean(n) && n.placement>=1 && n.placement<=7){
                var m= {}
                m['name']= n.name
                m['team']= n.team
                m['twitter']= (Boolean(n.twitter) && (n.twitter!=='-') && !n.twitter.startsWith('@'))?
                                    ('@'+n.twitter)
                                :   n.twitter
                if([5,7].includes(n.placement)){
                    r_obj.top8[`${n.placement}${(i===0)?'a':'b'}`]= m
                    i= (i+1)%2
                }
                else{
                    r_obj.top8[`${n.placement}`]= m
                }
            }
        }

        return r_obj;
    }
}

function __processTwitter(str, fallbackvalue= undefined){
    if((!Boolean(str)) || str===fallbackvalue) return fallbackvalue;
    var r= (str.includes('/'))?
                ( (str.endsWith('/'))? str.split('/').slice(-2,-1)
                    :   str.split('/').slice(-1) )
            :   str;
    return (r.startsWith('@'))? str : ('@' + str)
}

function merge_config_with_options(config, inlines){
    config= config ?? {}
    inlines= inlines ?? {}
    res= {}

    let getOpt= (optName, defaultVal) =>{
        return ((Boolean(inlines[optName]))?inlines[optName]:defaultVal)
    }
    
    let getInlineTopRoster= (topStr) => {
        var r= [undefined,undefined,undefined,undefined];
        for(var i=1; i<=4; ++i){
            var roster_opt= getOpt(`${topStr}-char${i}`,undefined)
            if(Boolean(roster_opt)){
                r[i-1]= __rosterCharNameProcess(roster_opt.toLowerCase())
            }
        }
        return r
    }

    let setForTop= (topNum) => {
        let topStr= `top${topNum}`
        res[topStr]= {
            name: Boolean(config[topStr] && config[topStr].name) ?
                        config[topStr].name
                    :   (inlines[`${topStr}-name`]) ?? "",
            team: Boolean(config[topStr] && config[topStr].team) ?
                        config[topStr].team
                    :   (inlines[`${topStr}-team`]) ?? "",
            twitter: __processTwitter( 
                        Boolean(config[topStr] && config[topStr].twitter) ?
                            config[topStr].twitter
                        :   (inlines[`${topStr}-twitter`])
                    ),
            roster: Boolean(config[topStr] && config[topStr].roster) ?
                        config[topStr].roster.map(ch => __rosterCharNameProcess(ch))
                    :   getInlineTopRoster(topStr)
        }
    }

    for(i of TOP8NUMS){
        setForTop(i)
    }

    let checkInInlines= (optName) => {
        var _o= undefined
        if(Boolean(_o=getOpt(optName, undefined)))
            res[optName]= _o
    }

    for(o of ['entrants', 'venue', 'data']){
        checkInInlines(o)
    }

    return res
}

function __rosterCharNameProcess(str){
    var num_match= str.toLowerCase().match(/^([0-9]*[1-9][ae]?)(\.[0-9]+)?$/)
    if(Boolean(num_match) && Boolean(num_match[1])){
        return `${num_match[1]}${(Boolean(num_match[2]))?`${num_match[2]}`:''}`
    }
    else{
        var skin_test= str.match(/[\s\.]*([0-9]+)\s*$/)
        var input= (Boolean(skin_test))?str.replace(/[\s\.]*([0-9]+)\s*$/,''): str;

        if(!Boolean(fightersObj)){
            __loadFightersObj()
        }

        if(Boolean(fightersObj)){
            let keys= Object.keys(fightersObj);
            for (var key of keys){
                let l_input= input.toLowerCase()
                var fighter= fightersObj[key]
                var regex= (Boolean(fighter) && Boolean(fighter.regex))?(new RegExp(fighter.regex)):undefined
                if( l_input===key ||
                    ( Boolean(regex) && (
                            Boolean(input.toLowerCase().match(regex))
                            || l_input===fighter.number.toLowerCase()
                            || l_input===fighter.name.toLowerCase()
                        )
                    )
                ){
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

async function _resolveTop8Data(startgg_url, pre_config, interaction){
    let guildID= interaction.guild.id

    var config= JSON.parse(JSON.stringify(pre_config))

    let smashGGInfos= {}
    if(Boolean(startgg_url)){
        if(!Boolean(smashGGInfos=(await _fetchSmashGGInfos(startgg_url)))){
            return {status: 'error_startgg', message: `Couldn't read infos from smashGG tourney \`${startgg_url}\``}
        }
    }
    
    // hereLog(`recieved info from startgg are ${JSON.stringify(smashGGInfos)}`)

    let startGGInfoCheck= (topNum, optName, fallbackvalue= undefined) => {
        let topStr=`top${topNum}`
        var ret= fallbackvalue
        if(!Boolean(config[topStr] && config[topStr][optName])){
            ret=
                ((Boolean(smashGGInfos)) && Boolean(smashGGInfos.top8) &&
                    Boolean(smashGGInfos.top8[`${topNum}`])
                    && Boolean(smashGGInfos.top8[`${topNum}`][optName])
                )?
                    smashGGInfos.top8[`${topNum}`][optName]
                :   fallbackvalue
        }
        else{
            ret= config[topStr][optName]
        }

        config[topStr][optName]= ret
        return ret
    }

    for(let topNum of TOP8NUMS){
        let topStr=`top${topNum}`

        let p_name= startGGInfoCheck(topNum, 'name', '-')
        startGGInfoCheck(topNum, 'team')
        startGGInfoCheck(topNum, 'twitter', '-')
        
        var _t= undefined
        if(Boolean(_t=config[`top${topNum}`].twitter) && _t!=='-'){
            config[topStr].twitter= __processTwitter(_t, '-')
        }

        var p_db= undefined
        var p_info= undefined
        if(Boolean(p_db=playerDBs[guildID])){
            p_info= await p_db.getPlayerInfos(p_name)
            p_name= p_info.name
        }
        var c_roster= config[topStr].roster
        var p_roster= [undefined,undefined,undefined,undefined].map((c,idx) => {
            if(Boolean(c_roster && c_roster[idx])){
                return c_roster[idx]
            }
            else if(Boolean(p_info.roster[idx])){
                return p_info.roster[idx]
            }
            else return "0"
        })

        config[topStr].roster= p_roster
        config[topStr].name= p_name
    }

    let _checkInfosConfigOrSGG= (optStr, sggAttrName, parseFunc=undefined) =>{
        var _tmp= undefined;
        var ret= undefined
        ret= ( (Boolean(_tmp=config[optStr]))?
                    ( (Boolean(parseFunc))?parseFunc(_tmp):_tmp )
                :   Boolean(_tmp=smashGGInfos[sggAttrName])?
                        ( (Boolean(parseFunc))?parseFunc(_tmp):_tmp )
                    :   undefined )

        config[optStr]= ret
        return ret
    }

    _checkInfosConfigOrSGG('entrants', 'numEntrants')
    _checkInfosConfigOrSGG('venue', 'venueAdress')
    _checkInfosConfigOrSGG('date','date', (dStr => {
                            return dStr.toLocaleString().replace(' à ', ' ')
                        }
                    )
                )

    return {status: "OK", data: config}
}

async function extractTop8Datas(interaction, utils){
    let startgg_opt= interaction.options.getString('startgg_url')
    let title_opt= interaction.options.getString('title')
    let attachmentConfig_opt= interaction.options.getAttachment('config')
    let inline_opt= interaction.options.getString('inline_options')

    var url_rgx= /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/;
    startgg_opt= Boolean(startgg_opt && startgg_opt.match(url_rgx)) ? startgg_opt : undefined

    let config_url= (Boolean(attachmentConfig_opt))? attachmentConfig_opt.url : undefined
    let config_obj= await __readJSONConfig(config_url)
    let config= undefined
    if(config_obj.status==='OK'){
        config= config_obj.data
    }

    // hereLog(`Config be like: ${JSON.stringify(config)}`)

    let extracted_inlinesOptArgs= undefined
    let inlines= {}
    if(Boolean(inline_opt)){
        extracted_inlinesOptArgs= my_utils.commandArgsOptionsExtract(inline_opt.split(/\s/))
        inlines= (Boolean(inline_opt))?
                extracted_inlinesOptArgs.options
            :   {}
    }

    // hereLog(`Inlines be like: ${JSON.stringify(inlines)}`)
    let pre_config= merge_config_with_options(config, inlines)
    pre_config.title= title_opt ?? inlines.title
    pre_config.option= extracted_inlinesOptArgs
    if(config_obj.status!=='OK'){
        pre_config.json_config_problems= config_obj.message
    }

    // hereLog(`so now pre_config is ${JSON.stringify(pre_config)}`)

    return await _resolveTop8Data(startgg_opt, pre_config, interaction)
}

async function sendTestResults(data, interaction, utils){
    let test_requiredData= (topNum, fieldname, testFunc=undefined) => {
        let topStr= `top${topNum}`
        if(!Boolean(testFunc))
            return Boolean(data[topStr] && data[topStr][fieldname])
        else
            return Boolean(data[topStr]) && testFunc(data[topStr][fieldname])
    }

    test= true
    for(let topNum of TOP8NUMS){
        test= test && 
            test_requiredData(topNum, 'name') &&
            test_requiredData(topNum, 'roster', v =>
                Array.isArray(v) && v.length>0
            )
    }

    var msg= "Test results as JSON joint file (`extracted_top8_data.json`).\n\n"
    if(!test){
        msg+= `Some critical data for the graph seems to be missing…\n`+
            `You can manually complete this file, and pass it back to me for another `+
            `check:\n\t-\`/top8 test startgg_url:http://start.gg/blabla config:file.json\`\n\n`+
            `(Also I advise passing the content of the edited file through a json validator, `+
            `like *jsonlint.com* beforehand).`
    }
    else{
        msg+= `No data seems to be missing... Although you might want to double check from the `+
            `joint JSON file. If all clear you can now use the \`/top8 draw\` with the same `+
            `options.`
    }

    return await interaction.editReply({
        content: msg,
        files: [{
            attachment: Buffer.from(JSON.stringify(data, null, 4)),
            name: `extracted_top8_data.json`
        }]
    })
}

let fightersObj= undefined;

function __loadFightersObj(){
    var fn= path.resolve(__dirname,"./player/fighters.json")

    fightersObj= my_utils.fighterStuff.getFighters()
    if(!Boolean(fightersObj)){
        fightersObj= my_utils.fighterStuff.loadFighters(fn)
    }

    return fightersObj
}

function inData_roster_fromNum_to_names(data){
    let rgx= /^([0-9]+\S?)(\.([0-7]))?$/

    if(!Boolean(fightersObj)){
        __loadFightersObj()
    }

    for(let topNum of TOP8NUMS){
        let topStr= `top${topNum}`
        var _obj= undefined
        var _roster_obj= undefined
        if(!Boolean((_obj=data[topStr]) && (_roster_obj=_obj.roster)
            && Array.isArray(_roster_obj))
        )
            continue;

        data[topStr].roster= _roster_obj.filter(char => {
                return Boolean(char && char.match(rgx)) && char!=='0'
            }).map(char => {
                var m= char.toLowerCase().match(rgx)

                let fighter= Object.values(fightersObj).find(
                        f => f.number===m[1]
                    )

                return `${Boolean(fighter)?fighter.name:'unknown'}${Boolean(m[3])?` ${m[3]}`:''}`
            })
    }

    return data
}

async function S_S_CMD_top8_test(interaction, utils){
    let data= await extractTop8Datas(interaction, utils)

    if(data.status==='error_startgg'){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            data.message
        )
    }
    else if(data.status==='OK'){
        await sendTestResults(
            inData_roster_fromNum_to_names(data.data)
            , interaction, utils
        )
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `internal error fetching top8 data…`
        )
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

    templates= list.map(dir => {return path.basename(dir)})
    return templates
}

async function S_S_CMD_top8_templates(interaction, utils){
    let templates= listTemplates();

    if(templates.length===0){
        interaction.editReply("No template seems available… 😕")
    }
    else{
        var msg= `${templates.length} templates available:\n`
        for(var t of templates){
            msg+= `\t- ${t}`
        }
        interaction.editReply(msg)
    }
}

function __loadTemplate(templateName){
    if(!Boolean(templateName)) return undefined;
    var module= undefined;
    try{
        module= require(`${__dirname}/top8gen/templates/${templateName}/generate.js`)
    } catch(error){
        hereLog(`Unable to load '${templateName}' generate.js module…\n\t${error}`)
        module= undefined;
    }
    return module;
}

function __unloadTemplate(templateName){
    if(Boolean(templateName)){
        try{
            var name= require.resolve(`${__dirname}/top8gen/templates/${templateName}/generate.js`)
            delete require.cache[name]
        } catch(error){
            hereLog(`Unable to unload '${templateName}' generate.js module…\n\t${error}`)
        }
    }
    hereLog(`${templateName} unloaded…`)
}

async function generateGraph(data, templateName, interaction, utils){
    await interaction.editReply(`Preparing graph generation…`)

    let genInfos= {
        destination_dir: Generate_destination_path,
        title: data.title ?? "-",

        entrants: data.entrants,
        venue: data.venue,
        date: data.date,

        top8: (
            TOP8NUMS.map(topNum =>( data[`top${topNum}`] ?? {} ))
        ),

        svg_bin: utils.settings.get(interaction.guild, "vector_to_raster_exe"),
        zip_bin: utils.settings.get(interaction.guild, "zip_exe"),

        http_addr: utils.settings.get(interaction.guild, "http_zip_dl_dir_addr"),

        options: data.options
    }

    // hereLog(`===> genInfos!!! ${JSON.stringify(genInfos)}`)

    let generateModule= undefined;
    let generateSVG= undefined;
    if(Boolean(generateModule=__loadTemplate(templateName))){
        generateSVG= generateModule.generateSVG
    }

    if(!Boolean(generateSVG)){
        __unloadTemplate(templateName)
        return { 
            status: E_RetCode.ERROR_INTERNAL,
            message: `Internal error. (can't access generating method)`
        }
    }

    let rasterizeFunc= (svg, outpng) => {
        var b= true;
        var cmd= `${genInfos.svg_bin} ${svg} --export-png=${outpng}`
        try{
            // hereLog(`[rasterize func] calling command '${cmd}'`)
            child_process.execSync(cmd, {timeout: 256000});
        } catch(error){
            hereLog(`[rast_func] error invoking rasterizing command \`${cmd}\`!\n\t${error}`)
            b= false;
        }
        return b;
    }

    let genResults= undefined
    var newfiles_to_delete= []
    try{
        genResults= ( await (generateSVG(genInfos, rasterizeFunc, async (msg) => {
                if(Boolean(msg)){
                    await interaction.editReply(msg.substr(0,512))
                }
            } 
        )) );
    } catch(error){
        hereLog(`Error within the 'generate' method…\n\t${error}`)
        genResults= undefined
    }
    if(!Boolean(genResults)){
        __unloadTemplate(templateName)

        return { 
            status: E_RetCode.ERROR_INTERNAL,
            message: `Internal error with generating method…`
        }
    }
    else{
        if(Boolean(genResults.newfiles)){
            newfiles_to_delete= genResults.newfiles;
        }
        
        var b_svg= true;
        var msg= ""
        if(!Boolean(genResults.is_success)){
            msg+= `Internal error while generating: method failed`

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
            __unloadTemplate(templateName)
            b_svg= false
        }
        else if(!Boolean(genResults.out_svg) || !fs.existsSync(genResults.out_svg)){
            msg+= `Final svg generation failed…`
            __unloadTemplate(templateName)
            b_svg= false
        }

        let zip_func= (files, destination) => {
            // hereLog(`[zip_func] entering zipping func (files=${files}, dest=${destination})`);
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

        __unloadTemplate(templateName)

        if(b_svg){
            await interaction.editReply(
                `Top8 Graph generation success!`
            )

            return {
                status: E_RetCode.SUCCESS,
                file: `${genInfos.destination_dir}/top8.png`
            }
        }
        else {
            return {
                status: E_RetCode.ERROR_INTERNAL,
                message: msg
            }
        }
    }
}

async function S_S_CMD_top8_draw(interaction, utils){
    let templateOpt= interaction.options.getString('template') ?? ""
    let channelOpt= interaction.options.getChannel('post_channel')

    let t=listTemplates()
    if(!t.includes(templateOpt)){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `No such template '${templateOpt}`
        )

        return
    }
    if(!Boolean(channelOpt)){
        channelOpt= interaction.channel
    }

    let data= await extractTop8Datas(interaction, utils)
    if(data.status==='error_startgg'){
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            data.message
        )
    }
    else if(data.status==='OK'){
        var graph_results= {}
        try{
            graph_results= await generateGraph(data.data, templateOpt, interaction, utils)
        }
        catch(e){
            hereLog(`[Draw] generateGraph failed! ${e}`)
            graph_results= {
                status: E_RetCode.ERROR_INTERNAL,
                message: `Internal error during graph generation…`
            }
        }

        if(graph_results.status===E_RetCode.SUCCESS){
            // hereLog(`SUCCESS!`)
            let payload= {
                content: `Generated top8 image: `,
                files: [{
                    attachment: graph_results.file,
                    name: `top8_${templateOpt}_${graph_results.file.split('.').at(-1)}`    
                }]
            }
            if(!Boolean(channelOpt)){
                // hereLog(`sending editReply: ${JSON.stringify(payload)}`)
                await interaction.editReply(payload)
            }
            else{
                // hereLog(`sending message to ${channelOpt}: ${JSON.stringify(payload)}`)
                await channelOpt.send(payload)
            }
        }
        else{
            await interaction.editReply(
                `${my_utils.emoji_retCode(graph_results.status)} `+
                graph_results.message
            )
        }
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INTERNAL)} `+
            `internal error fetching top8 data…`
        )
    }
}

var _lockTimeStamp_= undefined
const _15min= 15*60000

function isWorkLocked(){
    return (!Boolean(_lockTimeStamp_) || (Date.now()-_lockTimeStamp_)>=_15min)
}

function setWorklock(){
    if(!isWorkLocked()){
        _lockTimeStamp_= Date.now()
        return true
    }
    return false
}

function unsetWorkLock(){
    _lockTimeStamp_= undefined
}

async function S_CMD__top8(interaction, utils){
    await interaction.deferReply({ephemeral: true})

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='test'){
        await S_S_CMD_top8_test(interaction, utils)
    }
    else if(subcommand==='templates'){
        await S_S_CMD_top8_templates(interaction, utils, true)
    }
    else if(subcommand==='draw'){
        if(setWorklock()){
            setWorklock()
            await interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                `Already working on a graph generation, please come back later…`
            )

            return
        }

        try{
            await S_S_CMD_top8_draw(interaction, utils)
        } catch(err){
            unsetWorkLock()
            hereLog(`((( unlock catch )))`)
            throw err
        }
        unsetWorkLock()
    }
    else{
        await interaction.editReply(
            `${my_utils.emoji_retCode(E_RetCode.ERROR_INPUT)} `+
            `Missing subcommand amongst: `+
            `\`test\`, \`templates\` or \`draw\``
        )
    }
}

async function AC___top8(interaction){
    var choices= []
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name==='template'){
        choices= templates
    }

    choices = choices.filter(choice => choice.startsWith(focusedOption.value));

    await interaction.respond(
        choices.map(choice => ({ name: choice, value: choice })),
    );
}


let slashTop8= {
    data: new SlashCommandBuilder()
            .setName('top8')
            .setDescription('Graph generator')
            .setDefaultMemberPermissions(0)
            .addSubcommand(subcommand =>
                subcommand
                .setName("test")
                .setDescription("test a graph config")
                .addStringOption(option => 
                    option
                    .setName('startgg_url')
                    .setDescription("the start.gg url of the tourney")
                    .setRequired(true)
                ).addStringOption(option => 
                    option
                    .setName('title')
                    .setDescription("tourney edition's title")
                    .setMinLength(1)
                    .setMaxLength(256)
                ).addAttachmentOption(option => 
                    option
                    .setName('config')
                    .setDescription("the JSON tourney configuration overwrite file")
                ).addStringOption(option => 
                    option
                    .setName('inline_options')
                    .setDescription("ol'style options i.e.: ?top7a-char1=\"Mario 1\" etc.")
                )
            )
            .addSubcommand(subcommand =>
                subcommand
                .setName("templates")
                .setDescription("check available templates")
            )
            .addSubcommand(subcommand =>
                subcommand
                .setName("draw")
                .setDescription("generate the graph")
                .addStringOption(option => 
                    option
                    .setName('startgg_url')
                    .setDescription("the start.gg url of the tourney")
                    .setRequired(true)
                ).addStringOption(option => 
                    option
                    .setName('title')
                    .setDescription("tourney edition's title")
                    .setMinLength(1)
                    .setMaxLength(128)
                    .setRequired(true)
                ).addStringOption(option => 
                    option
                    .setName('template')
                    .setDescription("template to use, see: /top8 templates")
                    .setAutocomplete(true)
                    .setRequired(true)
                ).addAttachmentOption(option => 
                    option
                    .setName('config')
                    .setDescription("the JSON tourney configuration overwrite file")

                ).addChannelOption(option => 
                    option
                    .setName('post_channel')
                    .setDescription("Channel where to post the graph once rendered")
                    .addChannelTypes(ChannelType.GuildText)
                ).addStringOption(option => 
                    option
                    .setName('inline_options')
                    .setDescription("old fashioned i.e.: ?top7a-char1=\"Mario 1\" etc.")
                )
            ),
    async execute(interaction, utils){
        try{
            await S_CMD__top8(interaction, utils)
        }
        catch(err){
            hereLog(`[top8] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }   
    },
    async autoComplete(interaction){
        try{
            await AC___top8(interaction)
        }
        catch(err){
            hereLog(`[top8_autoComplete] Error! -\n\t${err}`)
        }
    }
}

function ogc_top8(strashBotOldCmd, clearanceLvl, utils){
    let command= strashBotOldCmd.command;
    let message= strashBotOldCmd.msg_obj;

    message.channel.send(`Yeah… *!commands* are deprecated. ¯\\_(ツ)\_/¯\n\n`+
        `Maybe you can't try a slash command like \`/top8\`, idk…`
    )

    return E_RetCode.REFUSAL
}

function init(utils){
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

    //needed for autocompletion
    listTemplates()
}

function init_perGuild(guild, utils){
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

module.exports= {
    slash_builders: [
        slashTop8
    ],
    oldGuildCommands: [
        {name: 'top8', execute: ogc_top8}
    ],
    init: init,
    initPerGuild: init_perGuild,
    devOnly: true
}