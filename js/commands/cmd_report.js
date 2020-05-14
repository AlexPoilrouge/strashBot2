
const fs = require('fs');
const cron= require('node-cron');

const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;

let hereLog= (...args) => {console.log("[cmd_report]", ...args);};


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

async function _reportCmdPunishRole(guild, utils){
    var report_str= `<h4>cmd punish role:</h4>\n`
    
    var obj_prisonRole= utils.settings.get(guild,"prison_role","punish_role");
    
    var msg="";
    var role= undefined;
    if (!Boolean(obj_prisonRole)){
        msg= `prison role doesn't seem to be present in data`
        problems.add(guild.id, msg)
    }
    else if (!Boolean(role=guild.roles.get(obj_prisonRole))){
        msg= `prison role (#${obj_prisonRole}) doesn't seem to be a valid role in guild`
        problems.add(guild.id, msg, ProblemCount.TYPES.ERROR)
    }
    else{
        msg= `prison role is <a href="#${obj_prisonRole}">${role.name}(#${obj_prisonRole})</a> - ✅`
    }

    report_str+= `<b>prison_role:</b> ${msg}<br/>\n`
    

    var obj_silenceRole= utils.settings.get(guild,"silence_role","punish_role");
    
    msg="";
    role= undefined;
    if (!Boolean(obj_silenceRole)){
        msg= `slience role doesn't seem to be present in data`
        problems.add(guild.id, msg, ProblemCount.TYPES.ERROR)
    }
    else if (!Boolean(role=guild.roles.get(obj_silenceRole))){
        msg= `slience role (#${obj_silenceRole}) doesn't seem to be a valid role in guild`
        problems.add(guild.id, msg)
    }
    else{
        msg= `slience role is <a href="#${obj_silenceRole}">${role.name}(#${obj_silenceRole})</a> - ✅`
    }

    report_str+= `<b>slience:</b> ${msg}<br/>\n`
    
    
    var obj_sparedRoles= utils.settings.get(guild,"spared-roles","punish_role");

    msg="";
    if(!Boolean(obj_sparedRoles) || obj_sparedRoles.length<=0){
        msg="no spared roles set"
        problems.add(guild.id, msg)
    }
    else{
        obj_sparedRoles.forEach(r_id =>{
            role= undefined
            if(!Boolean(r_id) || !Boolean(role=guild.roles.get(r_id))){
                var _msg= `[invalid_role](#${r_id})`
                problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                msg+= _msg
            }
            else{
                msg+= `<a href="${r_id}">[${role.name}](#${role.id})</a>`
            }
            msg+='; '
        })
    }

    report_str+= `<b>spared roles:</b> ${msg}<br/>\n`
    
    
    var obj_punishedUsers= utils.settings.get(guild,"punished","punish_role");

    msg= ""
    if(Boolean(obj_punishedUsers)){
        var _err= false;
        var user_ids= Object.keys(obj_punishedUsers);
        user_ids.forEach(u_id =>{
            if(!Boolean(u_id)){
                var _msg= `punished bad user id #${u_id}<br/>\n`
                problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                _err= true;
                msg+= _msg
            }
        });
        
        if(!_err){
            await guild.fetchMembers(user_ids)

            user_ids.forEach( u_id =>{
                var member= undefined
                if(!Boolean(member=guild.members.get(u_id))){
                    var _msg= `unfound member id #${u_id}`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                    msg+= _msg
                }
                else{
                    msg+= `Member <em>${member.user.username} (${(Boolean(member.nickname))?`aka '${member.nickname}'`:''} @${member.id})</em> punished: `
                    var u_obj= obj_punishedUsers[u_id]
                    if(!Boolean(u_obj)){
                        var _msg= `member (@${member.id}) has no sentence data; `
                        problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                        msg+= _msg
                    }
                    else{
                        var u_sentenceObj= u_obj['sentence'];
                        role= undefined
                        if (!Boolean(u_sentenceObj) || !Boolean(role=guild.roles.get(u_sentenceObj))){
                            var _msg= `bad sentence - bad role (#${u_sentenceObj}); `
                            problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                            msg+= _msg
                        }
                        else{
                            msg+= `sentenced with role <a href="#${u_sentenceObj}">${role.name} (#${role.id})</a>; `
                        }

                        var u_rolesObj= u_obj['roles'];
                        if (!Boolean(u_rolesObj) || u_rolesObj.length<=0){
                            var _msg= `no saved role; `
                            problems.add(guild.id, _msg)
                            msg+= _msg
                        }
                        else{
                            msg+= `saved roles: [`
                            u_rolesObj.forEach(r_id => {
                                role= undefined
                                if (!Boolean(r_id) || !Boolean(role=guild.roles.get(r_id))){
                                    var _msg= `bad saved role (#${r_id}); `
                                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                                    msg+= _msg
                                }
                                else{
                                    msg+= `<a href="#${r_id}">${role.name} (#${role.id})</a>; `
                                }
                            });
                            msg+= `]`
                        }
                        msg+= `<br/>\n`
                    }
                }
            });
        }
    }
    report_str+= `<b>punished:</b><br/>\n${msg}<br/>\n`

    return report_str;
}

function __isSimpleEmoji(char){
    return ( Boolean(
        char.match(
            /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/g
        ) )
    );
}

function __isCustomEmoji(str, bot){
    var res= (/^<\:([a-zA-Z\-_0-9]+)\:([0-9]{18})>$/g).exec(str);

    if( !Boolean(res) || res.length<3 || !Boolean(res[2].match(/([0-9]){18}/g) )
    )
    {
        return false;
    }

    var id= res[2];

    return Boolean( bot.emojis.get(id) );
}

function _reportCmdWelcome(guild, utils){
    var report_str= `<h4>cmd welcome:</h4>\n`
    
    var obj_welcomeChan= utils.settings.get(guild,"welcome_channel","welcome");
    
    var msg="";
    var channel= undefined;
    if (!Boolean(obj_welcomeChan)){
        msg= `welcome channel doesn't seem to be present in data`
        problems.add(guild.id, msg, ProblemCount.TYPES.ERROR)
    }
    else if (!(Boolean(channel=guild.channels.get(obj_welcomeChan)))){
        msg= `welcome channel #${obj_welcomeChan} doesn't seem to exist in ${guild.name}`
        problems.add(guild.id, msg, ProblemCount.TYPES.ERROR)
    }
    else{
        msg= `#${channel.name} (#${obj_welcomeChan})`
    }

    report_str+= `<b>weclome channel:</b> ${msg}<br/>\n`


    var obj_welcomeText= utils.settings.get(guild,"welcome_text","welcome");

    var msg= ""
    if (!Boolean(obj_welcomeText)){
        msg= `<em>welcome text isn't set</em>`
        problems.add(guild.id, msg, ProblemCount.TYPES.WARN)
    }
    else{
        msg= `<em>${obj_welcomeText}</em>`
    }

    report_str+= `<b>welcome text:</b> ${msg}<br/>\n`


    var obj_reacRoles= utils.settings.get(guild,"reaction_roles","welcome");

    var msg= ""
    if (!Boolean(obj_reacRoles) || Object.keys(obj_reacRoles).length<=0 ){
        msg= `reaction-roles data not set for ${guild.name}`;
        problems.add(guild.id, msg, ProblemCount.TYPES.ERROR);
    }
    else{
        Object.keys(obj_reacRoles).forEach( emoji =>{
            if(!__isSimpleEmoji(emoji) && !__isCustomEmoji(emoji, utils.getBotClient())){
                var _msg= `'${emoji}' isn't recognized as a valid or existing emoji`
                problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR);
                msg+= msg
            }
            else{
                var role_id= obj_reacRoles[emoji];
                var role= undefined
                if(!Boolean(role_id) || !Boolean(role=guild.roles.get(role_id))){
                    var _msg= `@${role_id} bad role id for emoji association`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR);
                    msg+= msg
                }
                else{
                    msg+= `< ${emoji} - <a href="#${role_id}">${role.name}(@${role_id})</a> >`
                }
            }
            msg+= '; '
        })
    }

    report_str+= `<b>< reaction - roles > associations:</b> ${msg}<br/>\n`

    return report_str;
}

function _reportCmdMain(guild, utils){
    var report_str= `<h4>cmd main:</h4>\n`
    
    var obj_MainChans= utils.settings.get(guild,"channelCharacter","main");
    
    var msg="";
    var channels= undefined
    if(!Boolean(obj_MainChans) || !(channels=Object.keys(obj_MainChans)).length>0){
        msg= "No data available regarding channel characters"
        problems.add(guild.id, msg, ProblemCount.TYPES.ERROR)
    }
    else{
        channels.forEach(chan_id => {
            var channel= undefined;
            if (!Boolean(chan_id) || !Boolean(channel=guild.channels.get(chan_id))){
                var _msg= `Invalid channel #${chan_id}`
                problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                msg+= _msg+"<br/>"
            }
            else{
                var obj_character= obj_MainChans[chan_id]['character']
                if(!Boolean(obj_character) || obj_character.length<=0){
                    var _msg= `No character associated to listed channel #${channel.name}(#${chan_id})`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                    msg+= _msg+'; '
                }
                else{
                    msg+= `channel associated to character <em>${obj_character}</em>; `
                }

                var obj_mainRole= obj_MainChans[chan_id]['role'];
                var role= undefined
                if(!Boolean(obj_mainRole)){
                    var _msg= `no role yet associated to channel #${channel.name}(#${chan_id})`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
                    msg+= _msg+'; '
                }
                else if(!Boolean(role=guild.roles.get(obj_mainRole))){
                    var _msg= `Invalid main role (@${obj_mainRole}) associated to channel #${channel.name}(#${chan_id})`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                    msg+= _msg+'; '
                }
                else{
                    msg+= `linked to role <a href="#${obj_mainRole}">${role.name}</a>(@${obj_mainRole}); `
                }

                var obj_colorMessage= obj_MainChans[chan_id]['color_message'];
                var message= undefined
                if(!Boolean(obj_colorMessage)){
                    var _msg= `no role color message generated for channel #${channel.name}(#${chan_id})`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
                    msg+= _msg+'; '
                }
                else if(!Boolean(message=channel.messages.get(obj_colorMessage))){
                    var _msg= `color message (\\${obj_colorMessage}) invalid or not found on channel #${channel.name}(#${chan_id})`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                    msg+= _msg+'; '
                }
                else{
                    msg+= `color_message \\${obj_colorMessage} generated and found; `
                }
            }
            msg+="<br/>\n"
        });

        report_str+= `<b>Channel mains:</b><br/>\n${msg}<br/>\n`
    }

    
    var obj_stalledMembers= utils.settings.get(guild,"stalledMembers","main");
    var msg="";
    if(!Boolean(obj_stalledMembers) || Object.keys(obj_stalledMembers).length<=0){
        msg= "No stalled member data"
        problems.add(guild.id, msg, ProblemCount.TYPES.INFO)
    }
    else{
        var obj_date= obj_stalledMembers['date']
        if(!Boolean(obj_date) || !Boolean(String(obj_date).match(/[0-9]{13}/g))){
            var _msg= "Missing of invalid stalled date"
            problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
            msg+= _msg+'; '
        }
        else{
            msg+= `last set date: <em>${Date(obj_date)}</em>; `
        }

        var obj_members= obj_stalledMembers['members'];
        if(!Boolean(obj_members) || obj_members.length<=0){
            var _msg= "No members actually stalled"
            problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
            msg+= _msg+'; '
        }
        else{
            msg+= "[ "
            obj_members.forEach( member_id => {
                var member= undefined;
                if(!Boolean(member_id) || !Boolean(member=guild.members.get(member_id))){
                    var _msg= `Invalid or gone stalled user @${member_id}`
                    problems.add(guild.id, _msg);
                    msg= _msg+'; '
                }
                else{
                    msg+= `${member.user.username}(aka ${member.nickname} @${member_id})`
                }
                msg+=';'
            });
            msg+= " ]"
        }

        report_str+= `<b>stalled members:</b> ${msg}<br/>\n`
    }

    return report_str
}

async function _runReportGuild(guild, utils, sendToUser= undefined){
    var report_fileName= `report_${guild.name.replace(' ','_')}_${Date.now()}.html`;
    var html_path= `data/${report_fileName}`;

    var user= sendToUser;
    if(!Boolean(user)){
        user= await guild.fetchMember(utils.getMasterID())

        if(!Boolean(user)) return false
    }

    var clean= () =>{
        if(fs.existsSync(html_path)) fs.unlinkSync(html_path);
    };

    problems.clear(guild.id)

    var report_str=`<h2>${guild.name}</h2> (#${guild.id})\n\n`;

    report_str+= `<h4>Roles:</h4>\n<table><thead>\n<tr>\n<th>role name</th><th>id</th>\n</tr>\n</thead>\n<tbody>\n`;
    guild.roles.forEach(role => {
        report_str+= `<tr><td>${role.name}</td><td id="${role.id}">${role.id}</td></tr>\n`;
    });
    report_str+= `</tbody>\n</table>\n\n`;

    report_str+= await _reportCmdPunishRole(guild, utils);
    
    report_str+= `<br/>\n`

    report_str+= _reportCmdWelcome(guild, utils);
    
    report_str+= `<br/>\n`

    report_str+= _reportCmdMain(guild, utils);
    
    report_str+= `<br/>\n`

    report_str+= problems.printGuildProblemsSummary(guild.id)

    html_str=`<!DOCTYPE html>\n<html lang="en">\n<head>\n<title>Strashbot report - ${guild.name}</title>\n`;
    html_str+=`<style type="text/css">:root{--border-radius:5px;--box-shadow:2px 2px 10px;--color:#118bee;--color-accent:#118bee0b;--color-bg:#fff;--color-bg-secondary:#e9e9e9;--color-secondary:#920de9;--color-secondary-accent:#920de90b;--color-shadow:#f4f4f4;--color-text:#000;--color-text-secondary:#999;--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;--hover-brightness:1.2;--justify-important:center;--justify-normal:left;--line-height:150%;--width-card:285px;--width-card-medium:460px;--width-card-wide:800px;--width-content:1080px}article aside{background:var(--color-secondary-accent);border-left:4px solid var(--color-secondary);padding:.01rem .8rem}body{background:var(--color-bg);color:var(--color-text);font-family:var(--font);line-height:var(--line-height);margin:0;overflow-x:hidden;padding:1rem 0}footer,header,main{margin:0 auto;max-width:var(--width-content);padding:2rem 1rem}hr{background-color:var(--color-bg-secondary);border:none;height:1px;margin:4rem 0}section{display:flex;flex-wrap:wrap;justify-content:var(--justify-important)}section aside{border:1px solid var(--color-bg-secondary);border-radius:var(--border-radius);box-shadow:var(--box-shadow) var(--color-shadow);margin:1rem;padding:1.25rem;width:var(--width-card)}section aside:hover{box-shadow:var(--box-shadow) var(--color-bg-secondary)}section aside img{max-width:100%}article header,div header,main header{padding-top:0}header{text-align:var(--justify-important)}header a b,header a em,header a i,header a strong{margin-left:.5rem;margin-right:.5rem}header nav img{margin:1rem 0}section header{padding-top:0;width:100%}nav{align-items:center;display:flex;font-weight:700;justify-content:space-between;margin-bottom:7rem}nav ul{list-style:none;padding:0}nav ul li{display:inline-block;margin:0 .5rem;position:relative;text-align:left}nav ul li:hover ul{display:block}nav ul li ul{background:var(--color-bg);border:1px solid var(--color-bg-secondary);border-radius:var(--border-radius);box-shadow:var(--box-shadow) var(--color-shadow);display:none;height:auto;padding:.5rem 1rem;position:absolute;right:0;top:1.7rem;width:auto}nav ul li ul li,nav ul li ul li a{display:block}code,samp{background-color:var(--color-accent);border-radius:var(--border-radius);color:var(--color-text);display:inline-block;margin:0 .1rem;padding:0 .5rem;text-align:var(--justify-normal)}details{margin:1.3rem 0}details summary{font-weight:700;cursor:pointer}h1,h2,h3,h4,h5,h6{line-height:var(--line-height)}mark{padding:.1rem}ol li,ul li{padding:.2rem 0}p{margin:.75rem 0;padding:0}pre{margin:1rem 0;max-width:var(--width-card-wide);white-space:pre-line}pre code,pre samp{padding:1rem 2rem}small{color:var(--color-text-secondary)}sup{background-color:var(--color-secondary);border-radius:var(--border-radius);color:var(--color-bg);font-size:xx-small;font-weight:700;margin:.2rem;padding:.2rem .3rem;position:relative;top:-2px}a{color:var(--color-secondary);display:inline-block;font-weight:700;text-decoration:none}a:hover{filter:brightness(var(--hover-brightness));text-decoration:underline}a b,a em,a i,a strong,button{border-radius:var(--border-radius);display:inline-block;font-size:medium;font-weight:700;line-height:var(--line-height);margin:.5rem 0;padding:1rem 2rem}button{font-family:var(--font)}button:hover{cursor:pointer;filter:brightness(var(--hover-brightness))}a b,a strong,button{background-color:var(--color);border:2px solid var(--color);color:var(--color-bg)}a em,a i{border:2px solid var(--color);border-radius:var(--border-radius);color:var(--color);display:inline-block;padding:1rem 2rem}figure{margin:0;padding:0}figure img{max-width:100%}figure figcaption{color:var(--color-text-secondary)}button:disabled,input:disabled{background:var(--color-bg-secondary);border-color:var(--color-bg-secondary);color:var(--color-text-secondary);cursor:not-allowed}button[disabled]:hover{filter:none}form{border:1px solid var(--color-bg-secondary);border-radius:var(--border-radius);box-shadow:var(--box-shadow) var(--color-shadow);display:block;max-width:var(--width-card-wide);min-width:var(--width-card);padding:1.5rem;text-align:var(--justify-normal)}form header{margin:1.5rem 0;padding:1.5rem 0}input,label,select,textarea{display:block;font-size:inherit;max-width:var(--width-card-wide)}input[type="checkbox"],input[type="radio"]{display:inline-block}input[type="checkbox"]+label,input[type="radio"]+label{display:inline-block;font-weight:400;position:relative;top:1px}input,select,textarea{border:1px solid var(--color-bg-secondary);border-radius:var(--border-radius);margin-bottom:1rem;padding:.4rem .8rem}input[readonly],textarea[readonly]{background-color:var(--color-bg-secondary)}label{font-weight:700;margin-bottom:.2rem}table{border:1px solid var(--color-bg-secondary);border-radius:var(--border-radius);border-spacing:0;overflow-x:scroll;overflow-y:hidden;padding:0}table td,table th,table tr{padding:.4rem .8rem;text-align:var(--justify-important)}table thead{background-color:var(--color);border-collapse:collapse;border-radius:var(--border-radius);color:var(--color-bg);margin:0;padding:0}table thead th:first-child{border-top-left-radius:var(--border-radius)}table thead th:last-child{border-top-right-radius:var(--border-radius)}table thead th:first-child,table tr td:first-child{text-align:var(--justify-normal)}table tr:nth-child(even){background-color:var(--color-bg-secondary)}blockquote{display:block;font-size:x-large;line-height:var(--line-height);margin:1rem auto;max-width:var(--width-card-medium);padding:1.5rem 1rem;text-align:var(--justify-important)}blockquote footer{color:var(--color-text-secondary);display:block;font-size:small;line-height:var(--line-height);padding:1.5rem 0}`;
    html_str+=`</style></head>\n<body>\n${report_str}\n</body>\n</html>`

    fs.writeFile(`data/${report_fileName}`, html_str, err => {
        if(err){
            hereLog("[html] "+err);
            clean();
        }
        else{
            var errors= problems.getCount(guild.id, ProblemCount.TYPES.ERROR);
            var infos= problems.getCount(guild.id, ProblemCount.TYPES.INFO);
            var warnings= problems.getCount(guild.id, ProblemCount.TYPES.WARN);

            if(errors>0 || Boolean(sendToUser)){
                user.send(
                    `Data coherence report for ${guild.name}\n` +
                    `${warnings} warnings and ${errors} errors (${infos} info messages)`,
                    {
                        files: [{
                            attachment: `${html_path}`,
                            name: `${report_fileName}`
                        }]
                    }
                ).finally(v => {
                    clean();
                });
            }
            else{
                user.send(
                    `Latest data coherence report for ${guild.name} resutled with:\n` +
                    `${warnings} warnings and ${errors} errors (${infos} info messages)`,
                ).finally(v => {
                    clean();
                });
            }
        }
    });

    return true;
}




var l_guilds= []

function cmd_init(utils){
    cron.schedule('0 0 * * *', () => {
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


async function cmd_init_per_guild(utils, guild){
    l_guilds.push(guild)
}

async function cmd_main(cmdObj, clearanceLvl, utils){
    let args= cmdObj.args;
    let message= cmdObj.msg_obj;
    if(clearanceLvl>CLEARANCE_LEVEL.NONE){
        if (args.length<=0)
            return await _runReportGuild(message.guild, utils, message.author);
        else if( args[0]==='off' ) {
            utils.settings.set(message.guild, 'run-report',false);
            return true;
        }
        else if( args[0]==='on' ) {
            utils.settings.set(message.guild, 'run-report',true);
            return true;
        }
        else{
            return false;
        }
    }
    else{
        message.author.send(`You do not have minimal clearance for the use of command \`!${cmdObj.command}\``)
        return false;
    }
}

function cmd_help(cmdObj, clearanceLvl){
    let message= cmdObj.msg_obj;
    if(clearanceLvl<=CLEARANCE_LEVEL.NONE) return false;

    message.author.send( (`__**report** command___:\n\n`+
        `\t\`!report\`\n\n`+
        `\tThis command generates a report of the saved data states used by the bots other commands.\n`+
        `\tThis allows for a verification of the viability of the current memory state of the bot.`+
        ((clearanceLvl>=CLEARANCE_LEVEL.MASTER_ID)? (
            `\n\n**Bot __master__ only:**\n`+
            `\t\`!report on|off\`\n\n`+
            `\tEnables or disables the daily verification (at 00:00) of the memory state for the current guild.\n`
        ) : ''))
    )

    return true;
}

function cmd_event(eventName, utils){}


function cmd_guild_clear(guild){}


module.exports.name= "report";
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};