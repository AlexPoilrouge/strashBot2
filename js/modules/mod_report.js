const { SlashCommandBuilder } = require("discord.js")

const fs= require( 'fs' );
const cron= require('node-cron');

const my_utils= require('../utils.js')


let hereLog= (...args) => {console.log("[moduleReport]", ...args);};


let E_RetCode= my_utils.Enums.CmdRetCode

var l_guilds= []
var report_job= undefined;


const TYPES= {
    WARN: 0,
    ERROR: 1,
    INFO: 2,
}

class ProblemCount{
    add(guildID, comment, type= ProblemCount.TYPES.WARN, i=1){
        if (!Boolean(this[guildID])){
            this[guildID]= {'warnings':0, 'errors':0, 'info':0, 'comment': ''}
        }

        this[guildID][(type===ProblemCount.TYPES.ERROR)?'errors':
                        (type===ProblemCount.TYPES.INFO)?'info' :
                        'warnings'
                    ] += i;
        this[guildID]['comment']+= `[${(type===ProblemCount.TYPES.ERROR)?'E':(type===ProblemCount.TYPES.INFO)?'I':'W'}] ${comment}; `
    }

    clear(guildID){
        this[guildID]= {'warnings':0, 'errors':0, 'info':0, 'comment': ''}
    }

    printGuildProblemsSummary(guildID){
        var sumStr= "<h2>Problem summary:</h2>"

        var sumObj= undefined;
        if (!Boolean(sumObj=this[guildID])){
            sumStr+= "Problem occured, no summary generated!"
        }
        else if((sumObj['warnings']+sumObj['errors'])===0){
            sumStr+= "No errors, or warning were generated 😎"
            if(sumObj['info']>0){
                sumStr+= `</br> ${sumObj['info']} informative message:<br/>\n`
                sumStr+= `Details: <em>${sumObj['comment']}</em><br/>\n`
            }
        }
        else{
            sumStr+= `<b>${sumObj['warnings']} warnings</b> and <b>${sumObj['errors']} errors</b> (and ${sumObj['info']} info message) generated...<br/>\n`
            sumStr+= `Details: <em>${sumObj['comment']}</em><br/>\n`
        }

        return sumStr;
    }

    getCount(guildID, type){
        if(!Boolean(this[guildID])) return undefined;

        return (type===ProblemCount.TYPES.ERROR)?this[guildID]['errors']:
                (type===ProblemCount.TYPES.INFO)?this[guildID]['info' ]:
                    this[guildID]['warnings'];
    }
}

ProblemCount.TYPES= TYPES

var problems= new ProblemCount();

function _reportCmdKart(guild, utils){
    var report_str= `<h4>cmd kart - roster:</h4>\n`

    var post_status_channel_id= utils.settings.get(guild,"post_status_channel", "kart");

    var msg=""
    var post_chan= undefined;
    if(!Boolean(post_status_channel_id)){
        var _msg= `No post status channel set… (${post_status_channel_id})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
        msg+= _msg
    }
    else if (!Boolean(post_chan=guild.channels.cache.get(post_status_channel_id))){
        var _msg= `Set post status channel is invalid… (${post_chan} - #${post_status_channel_id})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
        msg+= _msg
    }
    else{
        msg+= `Post kart status channel is set to <em>${post_chan.name}</em> (#${post_status_channel_id})`
    }

    report_str+= `<b> Post kart status channel:</b>\n${msg}<br/>\n`

    return report_str;
}

async function _reportCmdCraft(guild, utils){
    var report_str= `<h4>cmd craft :</h4>\n`

    var msg= ""
    var roles_privileges= await utils.settings.safe.get(guild, "roles_privileges", "craft")
    if (Boolean(roles_privileges)) {
        msg+= "<ul>"
        for(var status in roles_privileges){
            let role_id= roles_privileges[status];
            var role= undefined;
            if (Boolean(role= guild.roles.resolveId(role_id))){
                msg+= `<li><em>${role}</em>: ${role}</li>`
            }
        }
        msg+= "<ul>"
    }
    report_str+= `<b> Roles privileges:</b>\n${msg}<br/>`
    
    return report_str;
}

function _reportPPTCmd(guild, utils){
    let bot= utils.getBotClient()

    var w= undefined
    var guild_PPTObjs= undefined
    if(Boolean((w=bot.worker) && (w=w._moduleHandler) && (w=w.postProcessTargetCmd))){
        guild_PPTObjs= w.filter(pptc => {
            return pptc.guild_id===guild.id
        })
    }

    var r_str= `<h4>${guild}'s PPTCmds</h4>\n`
    if(Boolean(guild_PPTObjs) && guild_PPTObjs.length>0){
        r_str+= `<ul>\n`

        for(let pptc of guild_PPTObjs){
            r_str+= `\t<li>For module '${pptc.module}'\n`
            let _inters= Boolean(pptc.pptcmd)? pptc.pptcmd.interactionNames : undefined
            if(Boolean(_inters) && _inters.length>0){
                r_str+= `\t\t<ul>For interactions:\n`
                for(let name of _inters){
                    r_str+= `\t\t\t<li>${name}</li>\n`
                }
                r_str+= `\t\t</ul>\n`
            }
            let _oldCmds= Boolean(pptc.pptcmd)? pptc.pptcmd.oldCmds : undefined
            if(Boolean(_oldCmds) && _oldCmds.length>0){
                r_str+= `\t<ul>For old style !commands:\n`
                for(let name of _oldCmds){
                    r_str+= `\t\t\t<li>${name}</li>\n`
                }
                r_str+= `\t\t</ul>\n`
            }
            r_str+= `\t</li>\n`
        }

        r_str+= `</ul>\n`
    }
    else{
        r_str+= `<p>No pptcmd found…</p>`
    }

    return r_str
}

async function _runReportGuild(guild, utils, interaction= undefined){
    
    let clean= () =>{
        if(fs.existsSync(html_path)) fs.unlinkSync(html_path);
    };

    let moduleExists= (modName) => {
        return fs.existsSync(`${__dirname}/mod_${modName}.js`)
    }

    problems.clear(guild.id)

    var report_str=`<h2>${guild.name}</h2> (#${guild.id})\n\n`;

    report_str+= `<h4>Roles:</h4>\n<table><thead>\n<tr>\n<th>role name</th><th>id</th>\n</tr>\n</thead>\n<tbody>\n`;
    guild.roles.cache.forEach(role => {
        report_str+= `<tr><td>${role.name}</td><td id="${role.id}">${role.id}</td></tr>\n`;
    });
    report_str+= `</tbody>\n</table>\n\n`;
    
    report_str+= _reportPPTCmd(guild, utils) + `<br/>\n`
    if(moduleExists('kart')){
        report_str+= _reportCmdKart(guild, utils);
        
        report_str+= `<br/>\n`
    }
    if(moduleExists('player')){
        report_str+= await _reportCmdPlayer(guild, utils);
        
        report_str+= `<br/>\n`
    }
    if(moduleExists('craft')){
        report_str+= await _reportCmdCraft(guild, utils);

        report_str+= `<br/>\n`
    }
    report_str+= problems.printGuildProblemsSummary(guild.id)

    var html_str=`<!DOCTYPE html>\n<html lang="en">\n<head>\n<title>Strashbot report - ${guild.name}</title>\n`;
    html_str+=`<style type="text/css">:root{--border-radius:5px;--box-shadow:2px 2px 10px;--color:#118bee;--color-accent:#118bee0b;--color-bg:#fff;--color-bg-secondary:#e9e9e9;--color-secondary:#920de9;--color-secondary-accent:#920de90b;--color-shadow:#f4f4f4;--color-text:#000;--color-text-secondary:#999;--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;--hover-brightness:1.2;--justify-important:center;--justify-normal:left;--line-height:150%;--width-card:285px;--width-card-medium:460px;--width-card-wide:800px;--width-content:1080px}article aside{background:var(--color-secondary-accent);border-left:4px solid var(--color-secondary);padding:.01rem .8rem}body{background:var(--color-bg);color:var(--color-text);font-family:var(--font);line-height:var(--line-height);margin:0;overflow-x:hidden;padding:1rem 0}footer,header,main{margin:0 auto;max-width:var(--width-content);padding:2rem 1rem}hr{background-color:var(--color-bg-secondary);border:none;height:1px;margin:4rem 0}section{display:flex;flex-wrap:wrap;justify-content:var(--justify-important)}section aside{border:1px solid var(--color-bg-secondary);border-radius:var(--border-radius);box-shadow:var(--box-shadow) var(--color-shadow);margin:1rem;padding:1.25rem;width:var(--width-card)}section aside:hover{box-shadow:var(--box-shadow) var(--color-bg-secondary)}section aside img{max-width:100%}article header,div header,main header{padding-top:0}header{text-align:var(--justify-important)}header a b,header a em,header a i,header a strong{margin-left:.5rem;margin-right:.5rem}header nav img{margin:1rem 0}section header{padding-top:0;width:100%}nav{align-items:center;display:flex;font-weight:700;justify-content:space-between;margin-bottom:7rem}nav ul{list-style:none;padding:0}nav ul li{display:inline-block;margin:0 .5rem;position:relative;text-align:left}nav ul li:hover ul{display:block}nav ul li ul{background:var(--color-bg);border:1px solid var(--color-bg-secondary);border-radius:var(--border-radius);box-shadow:var(--box-shadow) var(--color-shadow);display:none;height:auto;padding:.5rem 1rem;position:absolute;right:0;top:1.7rem;width:auto}nav ul li ul li,nav ul li ul li a{display:block}code,samp{background-color:var(--color-accent);border-radius:var(--border-radius);color:var(--color-text);display:inline-block;margin:0 .1rem;padding:0 .5rem;text-align:var(--justify-normal)}details{margin:1.3rem 0}details summary{font-weight:700;cursor:pointer}h1,h2,h3,h4,h5,h6{line-height:var(--line-height)}mark{padding:.1rem}ol li,ul li{padding:.2rem 0}p{margin:.75rem 0;padding:0}pre{margin:1rem 0;max-width:var(--width-card-wide);white-space:pre-line}pre code,pre samp{padding:1rem 2rem}small{color:var(--color-text-secondary)}sup{background-color:var(--color-secondary);border-radius:var(--border-radius);color:var(--color-bg);font-size:xx-small;font-weight:700;margin:.2rem;padding:.2rem .3rem;position:relative;top:-2px}a{color:var(--color-secondary);display:inline-block;font-weight:700;text-decoration:none}a:hover{filter:brightness(var(--hover-brightness));text-decoration:underline}a b,a em,a i,a strong,button{border-radius:var(--border-radius);display:inline-block;font-size:medium;font-weight:700;line-height:var(--line-height);margin:.5rem 0;padding:1rem 2rem}button{font-family:var(--font)}button:hover{cursor:pointer;filter:brightness(var(--hover-brightness))}a b,a strong,button{background-color:var(--color);border:2px solid var(--color);color:var(--color-bg)}a em,a i{border:2px solid var(--color);border-radius:var(--border-radius);color:var(--color);display:inline-block;padding:1rem 2rem}figure{margin:0;padding:0}figure img{max-width:100%}figure figcaption{color:var(--color-text-secondary)}button:disabled,input:disabled{background:var(--color-bg-secondary);border-color:var(--color-bg-secondary);color:var(--color-text-secondary);cursor:not-allowed}button[disabled]:hover{filter:none}form{border:1px solid var(--color-bg-secondary);border-radius:var(--border-radius);box-shadow:var(--box-shadow) var(--color-shadow);display:block;max-width:var(--width-card-wide);min-width:var(--width-card);padding:1.5rem;text-align:var(--justify-normal)}form header{margin:1.5rem 0;padding:1.5rem 0}input,label,select,textarea{display:block;font-size:inherit;max-width:var(--width-card-wide)}input[type="checkbox"],input[type="radio"]{display:inline-block}input[type="checkbox"]+label,input[type="radio"]+label{display:inline-block;font-weight:400;position:relative;top:1px}input,select,textarea{border:1px solid var(--color-bg-secondary);border-radius:var(--border-radius);margin-bottom:1rem;padding:.4rem .8rem}input[readonly],textarea[readonly]{background-color:var(--color-bg-secondary)}label{font-weight:700;margin-bottom:.2rem}table{border:1px solid var(--color-bg-secondary);border-radius:var(--border-radius);border-spacing:0;overflow-x:scroll;overflow-y:hidden;padding:0}table td,table th,table tr{padding:.4rem .8rem;text-align:var(--justify-important)}table thead{background-color:var(--color);border-collapse:collapse;border-radius:var(--border-radius);color:var(--color-bg);margin:0;padding:0}table thead th:first-child{border-top-left-radius:var(--border-radius)}table thead th:last-child{border-top-right-radius:var(--border-radius)}table thead th:first-child,table tr td:first-child{text-align:var(--justify-normal)}table tr:nth-child(even){background-color:var(--color-bg-secondary)}blockquote{display:block;font-size:x-large;line-height:var(--line-height);margin:1rem auto;max-width:var(--width-card-medium);padding:1.5rem 1rem;text-align:var(--justify-important)}blockquote footer{color:var(--color-text-secondary);display:block;font-size:small;line-height:var(--line-height);padding:1.5rem 0}`;
    html_str+=`</style></head>\n<body>\n${report_str}\n</body>\n</html>\n`
    var errors= problems.getCount(guild.id, ProblemCount.TYPES.ERROR);
    var infos= problems.getCount(guild.id, ProblemCount.TYPES.INFO);
    var warnings= problems.getCount(guild.id, ProblemCount.TYPES.WARN);
    let payload= {
        content:    `${(Boolean(interaction)?'Lastest d':'D')}ata coherence report for ${guild.name}\n` +
                    `${warnings} warnings and ${errors} errors (${infos} info messages)`
    }
    if((Boolean(interaction)) || errors>0){
        let d= new Date()
        let yy= d.getFullYear()
        let mm= `0${d.getMonth()+1}`.slice(-2)
        let dd= `0${d.getDate()}`.slice(-2)
        let HH= d.getHours()
        let MM= d.getMinutes()
        let SS= d.getSeconds()
        payload.files= [{
                    attachment: Buffer.from(html_str),
                    name: `report-${yy}${mm}${dd}_${HH}${MM}${SS}.html`
                }]
    }
    if(Boolean(interaction)){
        await interaction.editReply(payload)
    }
    else{
        try{
            let master= await guild.members.fetch(utils.getMasterID())
            await master.send(payload)
        }
        catch(err){
            hereLog(`[run report] Couldn't send 'report' to master - ${err}`)
        }
    }
}

async function O_S_CMD__dailyReportToggle(daily, interaction, utils){
    utils.settings.set(interaction.guild, 'run-report', daily);

    await interaction.editReply(
        `${my_utils.emoji_retCode(E_RetCode.SUCCESS)} `+
        `Daily report: ${daily?'on':'off'}`
    )
}

async function S_CMD__report(interaction, utils){
    await interaction.deferReply({ephemeral: true})

    let subcommand= interaction.options.getSubcommand()

    if(subcommand==='make'){
        await _runReportGuild(interaction.guild, utils, interaction)
    }
    else if(subcommand==='daily'){
        let dailyOpt= Boolean(interaction.options.getBoolean('set'))

        if(utils.getMasterID()===interaction.user.id){
            await O_S_CMD__dailyReportToggle(dailyOpt, interaction, utils)
        }
        else{
            interaction.editReply(
                `${my_utils.emoji_retCode(E_RetCode.ERROR_REFUSAL)} `+
                `Sorry, command only available to Master privileges…`
            )
        }
    }
}


let reportSlash1= {
    data: new SlashCommandBuilder()
            .setName('report')
            .setDescription('Run datastate diagnostics')
            .setDefaultMemberPermissions(0)
            .addSubcommand(subcommand =>
                subcommand
                .setName('make')
                .setDescription('Generate a new report')
            ).addSubcommand(subcommand =>
                subcommand
                .setName('daily')
                .setDescription('Generate a new report')
                .addBooleanOption( option => 
                    option
                    .setName('set')
                    .setDescription('[Master only] toggles daily auto report.')
                )
            )
            .setDMPermission(false),
    async execute(interaction, utils){
        try{
            await S_CMD__report(interaction, utils)
        }
        catch(err){
            hereLog(`[report] Error! -\n\t${err} - ${err.message}`)
            let msg= `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Sorry, an internal error occured…`
            if (interaction.deferred)
                await interaction.editReply(msg)
            else
                await interaction.reply(msg)
        }  
    }
}


function ogc_report(strashBotOldCmd, clearanceLvl, utils){

    return E_RetCode.ERROR_REFUSAL
}

function init(utils){
    if(!Boolean(report_job)){
        report_job= cron.schedule('0 0 * * *', () => {
            l_guilds.forEach(guild => {
                if(Boolean(guild)){
                    var reportOn= utils.settings.get(guild, 'run-report');
                    if (Boolean(reportOn)){
                        hereLog(`Daily report for guild ${guild}`)
                        _runReportGuild(guild, utils);
                    }
                }
            });
        });
    }
    l_guilds= [];
}

function init_perGuild(guild, utils){
    if(!l_guilds.includes(guild)){
        l_guilds.push(guild)
    }
}

async function destroy(utils){
    if(Boolean(report_job)){
        delete report_job;
        report_job= undefined;
    }
}

module.exports= {
    slash_builders: [
        reportSlash1
    ],
    oldGuildCommands: [
        {name: 'report', execute: ogc_report},
    ],
    help_msg: "",
    init: init,
    initPerGuild: init_perGuild,
    destroy: destroy
}
