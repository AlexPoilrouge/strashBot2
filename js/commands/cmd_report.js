
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
    // var role= undefined;
    // if (!Boolean(obj_prisonRole)){
    //     msg= `prison role doesn't seem to be present in data`
    //     problems.add(guild.id, msg)
    // }
    // else if (!Boolean(role=guild.roles.cache.get(obj_prisonRole))){
    //     msg= `prison role (#${obj_prisonRole}) doesn't seem to be a valid role in guild`
    //     problems.add(guild.id, msg, ProblemCount.TYPES.ERROR)
    // }
    // else{
    //     msg= `prison role is <a href="#${obj_prisonRole}">${role.name}(#${obj_prisonRole})</a> - ✅`
    // }

    // report_str+= `<b>prison_role:</b> ${msg}<br/>\n`
    

    // var obj_silenceRole= utils.settings.get(guild,"silence_role","punish_role");
    
    // msg="";
    // role= undefined;
    // if (!Boolean(obj_silenceRole)){
    //     msg= `slience role doesn't seem to be present in data`
    //     problems.add(guild.id, msg, ProblemCount.TYPES.ERROR)
    // }
    // else if (!Boolean(role=guild.roles.cache.get(obj_silenceRole))){
    //     msg= `slience role (#${obj_silenceRole}) doesn't seem to be a valid role in guild`
    //     problems.add(guild.id, msg, ProblemCount.TYPES.ERROR)
    // }
    // else{
    //     msg= `slience role is <a href="#${obj_silenceRole}">${role.name}(#${obj_silenceRole})</a> - ✅`
    // }

    // report_str+= `<b>slience:</b> ${msg}<br/>\n`
    
    
    // var obj_sparedRoles= utils.settings.get(guild,"spared-roles","punish_role");

    // msg="";
    // if(!Boolean(obj_sparedRoles) || obj_sparedRoles.length<=0){
    //     msg="no spared roles set"
    //     problems.add(guild.id, msg)
    // }
    // else{
    //     obj_sparedRoles.forEach(r_id =>{
    //         role= undefined
    //         if(!Boolean(r_id) || !Boolean(role=guild.roles.cache.get(r_id))){
    //             var _msg= `[invalid_role](#${r_id})`
    //             problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    //             msg+= _msg
    //         }
    //         else{
    //             msg+= `<a href="${r_id}">[${role.name}](#${role.id})</a>`
    //         }
    //         msg+='; '
    //     })
    // }

    // report_str+= `<b>spared roles:</b> ${msg}<br/>\n`
    
    
    // var obj_punishedUsers= utils.settings.get(guild,"punished","punish_role");

    // msg= ""
    // if(Boolean(obj_punishedUsers)){
    //     var _err= false;
    //     var user_ids= Object.keys(obj_punishedUsers);
    //     user_ids.forEach(u_id =>{
    //         if(!Boolean(u_id)){
    //             var _msg= `punished bad user id #${u_id}<br/>\n`
    //             problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    //             _err= true;
    //             msg+= _msg
    //         }
    //     });
        
    //     if(!_err){
    //         await guild.members.fetch(user_ids)

    //         user_ids.forEach( u_id =>{
    //             var member= undefined
    //             if(!Boolean(member=guild.members.cache.get(u_id))){
    //                 var _msg= `unfound member id #${u_id}`
    //                 problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    //                 msg+= _msg
    //             }
    //             else{
    //                 msg+= `Member <em>${member.user.username} (${(Boolean(member.nickname))?`aka '${member.nickname}'`:''} @${member.id})</em> punished: `
    //                 var u_obj= obj_punishedUsers[u_id]
    //                 if(!Boolean(u_obj)){
    //                     var _msg= `member (@${member.id}) has no sentence data; `
    //                     problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    //                     msg+= _msg
    //                 }
    //                 else{
    //                     var u_sentenceObj= u_obj['sentence'];
    //                     role= undefined
    //                     if (!Boolean(u_sentenceObj) || !Boolean(role=guild.roles.cache.get(u_sentenceObj))){
    //                         var _msg= `bad sentence - bad role (#${u_sentenceObj}); `
    //                         problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    //                         msg+= _msg
    //                     }
    //                     else{
    //                         msg+= `sentenced with role <a href="#${u_sentenceObj}">${role.name} (#${role.id})</a>; `
    //                     }

    //                     var u_rolesObj= u_obj['roles'];
    //                     if (!Boolean(u_rolesObj) || u_rolesObj.length<=0){
    //                         var _msg= `no saved role; `
    //                         problems.add(guild.id, _msg)
    //                         msg+= _msg
    //                     }
    //                     else{
    //                         msg+= `saved roles: [`
    //                         u_rolesObj.forEach(r_id => {
    //                             role= undefined
    //                             if (!Boolean(r_id) || !Boolean(role=guild.roles.cache.get(r_id))){
    //                                 var _msg= `bad saved role (#${r_id}); `
    //                                 problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    //                                 msg+= _msg
    //                             }
    //                             else{
    //                                 msg+= `<a href="#${r_id}">${role.name} (#${role.id})</a>; `
    //                             }
    //                         });
    //                         msg+= `]`
    //                     }
    //                     msg+= `<br/>\n`
    //                 }
    //             }
    //         });
    //     }
    // }
    // report_str+= `<b>punished:</b><br/>\n${msg}<br/>\n`


    msg= "the punishment commands (!prison, !silence, !free, etc.) have been discontinued...";
    problems.add(guild.id, msg);

    report_str+= `<b> Warning:</b>\n${msg}<br/>\n`;

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

    return Boolean( bot.emojis.cache.get(id) );
}

function _reportCmdWelcome(guild, utils){
    var report_str= `<h4>cmd welcome:</h4>\n`
    
    var obj_welcomeChan= utils.settings.get(guild,"welcome_channel","welcome");
    
    var msg="";
    var channel= undefined;
    if (!Boolean(obj_welcomeChan)){
        msg= `welcome channel doesn't seem to be present in data`
        problems.add(guild.id, msg, ProblemCount.TYPES.WARN)
    }
    else if (!(Boolean(channel=guild.channels.cache.get(obj_welcomeChan)))){
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
        problems.add(guild.id, msg, ProblemCount.TYPES.WARN);
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
                if(!Boolean(role_id) || !Boolean(role=guild.roles.cache.get(role_id))){
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
    // var channels= undefined
    // if(!Boolean(obj_MainChans) || !(channels=Object.keys(obj_MainChans)).length>0){
    //     msg= "No data available regarding channel characters"
    //     problems.add(guild.id, msg, ProblemCount.TYPES.ERROR)
    // }
    // else{
    //     channels.forEach(chan_id => {
    //         var channel= undefined;
    //         if (!Boolean(chan_id) || !Boolean(channel=guild.channels.cache.get(chan_id))){
    //             var _msg= `Invalid channel #${chan_id}`
    //             problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    //             msg+= _msg+"<br/>"
    //         }
    //         else{
    //             var obj_character= obj_MainChans[chan_id]['character']
    //             if(!Boolean(obj_character) || obj_character.length<=0){
    //                 var _msg= `No character associated to listed channel #${channel.name}(#${chan_id})`
    //                 problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    //                 msg+= _msg+'; '
    //             }
    //             else{
    //                 msg+= `channel associated to character <em>${obj_character}</em>; `
    //             }

    //             var obj_mainRole= obj_MainChans[chan_id]['role'];
    //             var role= undefined
    //             if(!Boolean(obj_mainRole)){
    //                 var _msg= `no role yet associated to channel #${channel.name}(#${chan_id})`
    //                 problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
    //                 msg+= _msg+'; '
    //             }
    //             else if(!Boolean(role=guild.roles.cache.get(obj_mainRole))){
    //                 var _msg= `Invalid main role (@${obj_mainRole}) associated to channel #${channel.name}(#${chan_id})`
    //                 problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    //                 msg+= _msg+'; '
    //             }
    //             else{
    //                 msg+= `linked to role <a href="#${obj_mainRole}">${role.name}</a>(@${obj_mainRole}); `
    //             }

    //             var obj_colorMessage= obj_MainChans[chan_id]['color_message'];
    //             var message= undefined
    //             if(!Boolean(obj_colorMessage)){
    //                 var _msg= `no role color message generated for channel #${channel.name}(#${chan_id})`
    //                 problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
    //                 msg+= _msg+'; '
    //             }
    //             else if(!Boolean(message=channel.messages.cache.get(obj_colorMessage))){
    //                 var _msg= `color message (\\${obj_colorMessage}) invalid or not found on channel #${channel.name}(#${chan_id})`
    //                 problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    //                 msg+= _msg+'; '
    //             }
    //             else{
    //                 msg+= `color_message \\${obj_colorMessage} generated and found; `
    //             }
    //         }
    //         msg+="<br/>\n"
    //     });

    //     report_str+= `<b>Channel mains:</b><br/>\n${msg}<br/>\n`
    // }

    
    // var obj_stalledMembers= utils.settings.get(guild,"stalledMembers","main");
    // var msg="";
    // if(!Boolean(obj_stalledMembers) || Object.keys(obj_stalledMembers).length<=0){
    //     msg= "No stalled member data"
    //     problems.add(guild.id, msg, ProblemCount.TYPES.INFO)
    // }
    // else{
    //     var obj_date= obj_stalledMembers['date']
    //     if(!Boolean(obj_date) || !Boolean(String(obj_date).match(/[0-9]{13}/g))){
    //         var _msg= "Missing of invalid stalled date"
    //         problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    //         msg+= _msg+'; '
    //     }
    //     else{
    //         msg+= `last set date: <em>${Date(obj_date)}</em>; `
    //     }

    //     var obj_members= obj_stalledMembers['members'];
    //     if(!Boolean(obj_members) || obj_members.length<=0){
    //         var _msg= "No members actually stalled"
    //         problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
    //         msg+= _msg+'; '
    //     }
    //     else{
    //         msg+= "[ "
    //         obj_members.forEach( member_id => {
    //             var member= undefined;
    //             if(!Boolean(member_id) || !Boolean(member=guild.members.cache.get(member_id))){
    //                 var _msg= `Invalid or gone stalled user @${member_id}`
    //                 problems.add(guild.id, _msg);
    //                 msg= _msg+'; '
    //             }
    //             else{
    //                 msg+= `${member.user.username}(aka ${member.nickname} @${member_id})`
    //             }
    //             msg+=';'
    //         });
    //         msg+= " ]"
    //     }

    //     report_str+= `<b>stalled members:</b> ${msg}<br/>\n`
    // }
    
    msg= "the '!main' command has been discontinued...";
    problems.add(guild.id, msg);

    report_str+= `<b> Warning:</b>\n${msg}<br/>\n`;

    return report_str
}

function _reportCmdKart(guild, utils){
    var report_str= `<h4>cmd kart:</h4>\n`
    
    var obj_kartChan= utils.settings.get(guild,"kart_channel","kart");

    var msg=""
    var kartChan= undefined;
    if(!Boolean(obj_kartChan)){
        var _msg= `No kart channel set… (${obj_kartChan})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
        msg+= _msg
    }
    else if (!Boolean(kartChan=guild.channels.cache.get(obj_kartChan))){
        var _msg= `Set kart channel is invalid… (${kartChan} - #${obj_kartChan})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
        msg+= _msg
    }
    else{
        msg+= `Kart channel is set to ${kartChan.name} (#${obj_kartChan})`
    }

    report_str+= `<b> Kart channel:</b>\n${msg}<br/>\n`



    var obj_kartRole= utils.settings.get(guild,"kart_role","kart");

    msg= ""
    var kartRole= undefined
    if(!Boolean(obj_kartRole)){
        var _msg= `No kart main role set… (${obj_kartRole})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
        msg+= _msg
    }
    else if (!Boolean(kartRole=guild.roles.cache.get(obj_kartRole))){
        var _msg= `Set kart main role is invalid… (${kartRole} - #${obj_kartChan})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
        msg+= _msg
    }
    else{
        msg+= `Kart main role is set to ${kartRole.name} (@${obj_kartRole})`
    }

    report_str+= `<b> Kart main role:</b>\n${msg}<br/>\n`



    var obj_kartAdminRole= utils.settings.get(guild,"kart_admin_role","kart");

    msg= ""
    var kartAdminRole= undefined
    if(!Boolean(obj_kartAdminRole)){
        var _msg= `No kart admin role set… (${obj_kartAdminRole})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
        msg+= _msg
    }
    else if (!Boolean(kartAdminRole=guild.roles.cache.get(obj_kartAdminRole))){
        var _msg= `Set kart admin role is invalid… (${kartAdminRole} - #${obj_kartChan})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
        msg+= _msg
    }
    else{
        msg+= `Kart admin role is set to ${kartAdminRole.name} (@${obj_kartAdminRole})`
    }

    report_str+= `<b> Kart admin role:</b>\n${msg}<br/>\n`



    var obj_owner= utils.settings.get(guild,"serv_owner","kart");

    msg=""
    var servOwner= undefined;
    if(!Boolean(obj_owner)){
        var _msg= `No serv owner (${obj_owner})…;`
        problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
        msg+= _msg
    }
    else if (!Boolean(servOwner=guild.members.cache.get(obj_owner))){
        var _msg= `Serv owner is invalid… (${servOwner} - @${obj_owner})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
        msg+= _msg
    }
    else{
        var _msg= `SRB2Kart server owner is ${servOwner.user.username} (@${obj_owner})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
        msg+= _msg

        if(!Boolean(obj_kartChan) || !Boolean(kartChan)){
            _msg= `Owner set (${servOwner.user.username} - @${obj_owner}) but no valid kart channel?! (#${obj_kartChan})`
            problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
            msg+= "<br/>"+_msg
        }
    }

    report_str+= `<b> Kart server owner:</b>\n${msg}<br/>\n`

    return report_str;
}

async function __runReportPlayerDataBase(guild, utils, post_chan=undefined){
    var r_str= `<b> Player DataBase:</b><br/>\n`;

    r_str+=`<table><thead>\n<tr>\n<th>user_id</th><th>roster_1</th><th>roster_2</th><th>roster_3</th><th>roster_4</th>`+
        `<th>roster_msg_id</th><th>name</th><th>team</th><th>Problems</th>\n</tr>\n</thead>\n<tbody>\n`;

    var p_db= utils.getDataBase(guild);

    var msg=""
    if(Boolean(p_db)){
        p_db._open_db();

        await p_db.__allQuery(
            "SELECT user_id, roster_1, roster_2, roster_3, roster_4, roster_msg_id, name, team FROM players",
            ( ( async (row) => {
                if(Boolean(row)){
                    var pb_info=""
                    var local_pb=""
                    if(!Boolean(row.user_id)){
                        local_pb= "user_id is null or undefined"
                        problems.add(guild.id, local_pb, ProblemCount.TYPES.ERROR)
                    }
                    else if(!Boolean( await (guild.members.fetch(row.user_id)) )){
                        local_pb= `user_id is unidentified amoung the guild`
                        problems.add(guild.id, local_pb, ProblemCount.TYPES.ERROR)
                    }
                    pb_info+= `${local_pb}; `;

                    r_str+= `<tr><td>${row.user_id}</td>`

                    var r1_ok= false;
                    for(var i=1; i<=4; ++i){
                        local_pb=""
                        if(!Boolean(row[`roster_${i}`])){
                            local_pb+= `roster_${i} is null or undefined`
                            problems.add(guild.id, local_pb, ProblemCount.TYPES.ERROR)
                        }
                        else if(!Boolean(row[`roster_${i}`].match(/^[0-9]+([a-z])?(\.[0-9]+)?$/))){
                            local_pb+= `roster_${i} is badly formed`
                            problems.add(guild.id, local_pb, ProblemCount.TYPES.ERROR)
                        }
                        else if(Boolean(row[`roster_${i}`].match(/^0+(\.0+)?$/))){
                            local_pb+= `roster_${i} isn't defined`
                            problems.add(guild.id, local_pb, ProblemCount.TYPES.INFO)
                        }
                        else if(i===1){
                            r1_ok= true;
                        }
                        pb_info+= `${local_pb}; `;
    
                        r_str+= `<td>${row[`roster_${i}`]}</td>`
                    }

                    local_pb=""
                    if(Boolean(row.roster_msg_id)){
                        if(row.roster_msg_id==='-'){
                            if(r1_ok){
                                local_pb+= `roster_msg_id not defined although player has roster`
                                problems.add(guild.id, local_pb, ProblemCount.TYPES.WARN)
                            }
                            else{
                                local_pb+= `roster_msg_id not set`
                                problems.add(guild.id, local_pb, ProblemCount.TYPES.INFO)
                            }
                        }
                        else{
                            if(Boolean(post_chan) && !Boolean( await (post_chan.fetch(row.roster_msg_id)) )){
                                local_pb+= `roster_msg_id doesn't point on existing message`
                                problems.add(guild.id, local_pb, ProblemCount.TYPES.WARN)
                            }
                            else if(!Boolean(post_chan)){
                                local_pb+= `roster_msg_id exists, but post channel doesn't seem to`
                                problems.add(guild.id, local_pb, ProblemCount.TYPES.WARN)
                            }
                        }
                    }
                    else{
                        local_pb+= `roster_msg_id undefined`
                        problems.add(guild.id, local_pb, ProblemCount.TYPES.ERROR)
                    }
                    pb_info+= `${local_pb}; `

                    r_str+= `<td>${row.roster_msg_id}</td>`


                    for(var attr of ['name','team']){
                        local_pb= "";
                        if(!Boolean(row[attr]) && row[attr]!==""){
                            local_pb+= `${attr} isn't well defined`
                            problems.add(guild.id, local_pb, ProblemCount.TYPES.WARN)
                        }   
                        pb_info+= `${local_pb}; `

                        r_str+= `<td>${row[attr]}</td>`
                    }

                    r_str+= `<td>${pb_info}</td></tr>`
                }

                msg+= pb_info
            }) )
        );

        p_db._closeRequest_db();
    }
    r_str+=`</tbody></table><br/>\n<b>Final report:</b><br/>\n<span>${msg}</span>`

    return r_str;
}

async function _reportCmdPlayer(guild, utils){
    var report_str= `<h4>cmd player - roster:</h4>\n`
    
    var cmd_chan_id= utils.settings.get(guild,"post_channel","player");

    var msg=""
    var cmd_chan= undefined;
    if(!Boolean(cmd_chan_id)){
        var _msg= `No command channel set… (${cmd_chan_id})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
        msg+= _msg
    }
    else if (!Boolean(cmd_chan=guild.channels.cache.get(cmd_chan_id))){
        var _msg= `Set command channel is invalid… (${cmd_chan} - #${cmd_chan_id})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
        msg+= _msg
    }
    else{
        msg+= `Command channel is set to ${cmd_chan.name} (#${cmd_chan_id})`
    }

    report_str+= `<b> Command channel:</b>\n${msg}<br/>\n`
    


    var post_chan_id= utils.settings.get(guild,"command_channel","player");

    var msg=""
    var post_chan= undefined;
    if(!Boolean(post_chan_id)){
        var _msg= `No post channel set… (${post_chan_id})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
        msg+= _msg
    }
    else if (!Boolean(post_chan=guild.channels.cache.get(post_chan_id))){
        var _msg= `Set post channel is invalid… (${post_chan} - #${post_chan_id})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
        msg+= _msg
    }
    else{
        msg+= `Post channel is set to ${post_chan.name} (#${post_chan_id})`
    }

    report_str+= `<b> Post channel:</b>\n${msg}<br/>\n`

    report_str+= ( await (__runReportPlayerDataBase(guild, utils, post_chan)) );

    return report_str;
}

async function _reportCmdRoles(guild, utils){
    var report_str= `<h4>cmd roles:</h4>\n`

    report_str+=`<h5>Reaction messages:</h5>`

    var data_msg_react_role= utils.settings.get(guild,'msg_react_role','roles')

    var msg=""
    if(!Boolean(data_msg_react_role) || Object.keys(data_msg_react_role).length<0){
        var _msg= `No react-message set… (${data_msg_react_role})`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
        msg+= _msg
    }
    else{
        msg+= `<ul>\n`
        for(var ch_msg_id in data_msg_react_role){
            var match= undefined, obj= undefined
            if(!Boolean(match=ch_msg_id.match(/([0-9]{15,21})[\/\_\-\\\:\.\s]([0-9]{15,21})$/))){
                var _msg= `Invalid channel_message ID (${ch_msg_id})`
                problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
                msg+= _msg
            }
            else{
                msg+= `<li>`
                var ch_id= match[1], msg_id= match[2]
                var channel= undefined, m= undefined
                if(!Boolean(channel=guild.channels.cache.get(ch_id))){
                    var _msg= `Invalid channel id (not found): ${ch_id}`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                    msg+= _msg
                }
                else if(!Boolean(m=(await (channel.messages.fetch(msg_id))))){
                    var _msg= `Invalid message id (not found): ${msg_id} (channel: ${ch_id})`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                    msg+= _msg
                }
                else if(!Boolean(obj=data_msg_react_role[ch_msg_id])){
                    var _msg= `Invalid data for message ${msg_id} on channel ${ch_id}`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                    msg+= _msg
                }
                else{
                    msg+= `[message ${msg_id} on channel <em>${channel.name}</em>]: `
                    if(!Boolean(obj.roles)){
                        var _msg= `Invalid role data for react message ${msg_id} on channel ${ch_id}`
                        problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                        msg+= _msg
                    }
                    else if(obj.roles<=0){
                        var _msg= `No role data for react message ${msg_id} on channel ${ch_id}`
                        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
                        msg+= _msg
                    }
                    else{
                        if(Boolean(obj.give_only)){
                            msg+= `<b>give_only</b>`
                        }
                        msg+= `<ul>`
                        for(var em_txt in obj.roles){
                            msg+= `<li>`
                            let simpleEmojiRegex= /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/g;
                            if(!Boolean(em_txt.match(simpleEmojiRegex)) &&
                                !Boolean([...guild.emojis.cache.values()].find( e => {return e.toString()===em_txt})))
                            {
                                var _msg= `Invalid role giving emoji ${em_txt} for react message ${msg_id} on channel ${ch_id}`
                                problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                                msg+= _msg
                            }
                            else{
                                var r_id= obj.roles[em_txt]
                                var role= undefined
                                if(!Boolean(role=guild.roles.cache.get(r_id))){
                                    var _msg= `Invalid role ${r_id} for react message ${msg_id} on channel ${ch_id}`
                                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                                    msg+= _msg
                                }
                                else{
                                    msg+= `${em_txt} -> <em>@${role.name}</em>`
                                }
                            }
                            msg+= `</li>`
                        }
                        msg+= `</ul>`
                    }
                }
                msg+=`</li>\n`
            }
            msg+=`</ul>`
        }
    }
    report_str+= `${msg}<br/>\n`


    report_str+= `<h5>exclusive roles:</h5>`
    var data_exclusive_roles=  utils.settings.get(guild, 'exclusive_roles', 'roles')
    msg=""
    if(!Boolean(data_exclusive_roles) || data_exclusive_roles.length<=0){
        var _msg= "No exclusive roles set"
        problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
        msg+= _msg
    }
    else{
        msg+=`<ul>\n`
        for(var r_t of data_exclusive_roles){
            msg+=`<li>`
            if(!Boolean(r_t) || r_t.length<=0){
                var _msg= "Empty exclusive role data"
                problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
                msg+= _msg
            }
            else{
                for(var r_id of r_t){
                    var role= undefined
                    if(!Boolean(r_id) || !Boolean(role=guild.roles.cache.get(r_id))){
                        var _msg= `Invalid role (${r_id})`
                        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
                        msg+= _msg
                    }
                    else{
                        msg+= `<em>@${role.name}</em>`
                    }
                    msg+=`; `
                }
            }
            msg+=`</li>\n`
        }
        msg+=`</ul>\n`
    }
    report_str+= `${msg}<br/>\n`


    report_str+= `<h5>Assign on mention:</h5>`
    var data_role_mention_assign= utils.settings.get(guild, 'role_mention_assign', 'roles')
    msg= ""
    if(!Boolean(data_role_mention_assign) || data_role_mention_assign.length<=0){
        var _msg= "No assignable-on-mention role is set"
        problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
        msg+= _msg
    }
    else{
        for(var r_id of data_role_mention_assign){
            var role= undefined
            if(!Boolean(r_id) || !Boolean(role=guild.roles.cache.get(r_id))){
                var _msg= `Invalid role (${r_id}`
                problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                msg+= _msg
            }
            else{
                msg+= `<em>@${role.name}</em>; `
            }
        }
    }
    report_str+= `${msg}<br/>\n`


    report_str+= `<h5>Assign on post:</h5>`
    var data_role_post_assign= utils.settings.get(guild, 'role_post_assign','roles')
    msg= ""
    if(!Boolean(data_role_post_assign) || Object.keys(data_role_post_assign).length<=0){
        var _msg= `No assignable-on-post role is set`
        problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
        msg+= _msg
    }
    else{
        msg+= `<ul>\n`
        for(var ch_id in data_role_post_assign){
            msg+= `<li>\n`
            var channel= undefined
            if(!Boolean(ch_id) || !Boolean(channel=guild.channels.cache.get(ch_id))){
                var _msg= `Invalid channel (${ch_id})`
                problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                msg+= _msg
            }
            else{
                msg+= `<b>On channel ${channel.name}</b>:`
                var chanObj= data_role_post_assign[ch_id]
                if(!Boolean(chanObj)){
                    var _msg= `Invalid assignable-on-post data`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                    msg+= _msg
                }
                else{
                    msg+=`<ul>`
                    for(var r_id in chanObj){
                        var role= undefined
                        if(!Boolean(r_id) || !Boolean(role=guild.roles.cache.get(r_id))){
                            var _msg= `Invalid assignable-on-post role (${r_id})`
                            problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                            msg+= _msg
                        }
                        else{
                            msg+= `get role <em>@${role.name}</em>`
                            var rObj= undefined, min= undefined
                            if(Boolean(rObj=chanObj[r_id]) && (min=rObj.min)>0){
                                msg+=`, min= ${min}`
                            }
                            var unless= undefined
                            if(Boolean(rObj) && Boolean(unless=rObj.unless) && unless.length>=0){
                                msg+= `, unless has roles: `
                                for(var ur_id of unless){
                                    var u_role= undefined
                                    if(!Boolean(ur_id) || !Boolean(u_role=guild.roles.cache.get(ur_id))){
                                        var _msg= `Invalid unless-role (${r_id})`
                                        problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
                                        msg+= _msg
                                    }
                                    else{
                                        msg+= `<em>@${u_role.name}</em>; `
                                    }
                                }
                            }
                        }
                    }
                    msg+=`</ul>`
                }
            }
            msg+= `</li>\n`
        }
        msg+= `</ul>\n`
    }
    report_str+= `${msg}<br/>\n`

    return report_str
}

async function _reportCmdCalendars(guild, utils){
    let G_MAIL_REGEX= /^[a-z0-9](\.?[a-z0-9]){5,}@((g(oogle)?mail)|((group\.calendar\.)?google))\.com$/

    var data_calendars= utils.settings.get(guild, 'calendars', 'calendar')
    var data_update_check= utils.settings.get(guild, 'update_check', 'calendar')

    var report_str= `<h4>cmd calendar:</h4>\n`

    report_str+=`<h5>Linked calendars:</h5>`

    var msg=""
    if(!Boolean(data_calendars)){
        var _msg= `No calendar data found…`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
        msg+= _msg
    }
    else{
        msg+= '<ul>'
        for(var calendar_id in data_calendars){
            msg+= '<li>'
            if(!Boolean(calendar_id.match(G_MAIL_REGEX))){
                var _msg= `"${calendar_id}" doesn't seem to be a valid calendar id…`
                problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)

                msg+= _msg
            }
            else{
                msg+= `${calendar_id}`

                var chan_obj= data_calendars[calendar_id]
                if((!Boolean(chan_obj)) || Object.keys(chan_obj).length<=0){
                    var _msg= `"${calendar_id}" has no linked channel data…`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)

                    msg+= `: ${_msg}`
                }
                else{
                    msg+= `:\n<ul>`

                    for (var chan_id in chan_obj){
                        problems.add(guild.id, `"${calendar_id}" linked to channel #${chan_id}`, ProblemCount.TYPES.INFO)

                        var channel= undefined
                        if(!Boolean(channel=guild.channels.cache.get(chan_id))){
                            var _msg= `"${calendar_id}" tried to link to channel ${channel}, which doesn't seem to exist…`
                            problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)

                            msg+=  `<li>${_msg}</li>`
                        }
                        else{
                            var msg_list= chan_obj[chan_id]

                            if((!Boolean(msg_list)) || msg_list.length<=0){
                                var duc_cid= undefined
                                if((!Boolean(data_update_check)) || (!Boolean(duc_cid=data_update_check[calendar_id])) ||
                                    (Boolean(duc_cid.unnecessary))
                                ){
                                    var _msg= `no message referenced in channel ${channel}, yet "${calendar_id}" is not referenced for update (no events?).`
                                    problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)

                                    msg+=  `<li>${_msg}</li>`
                                }
                                else{
                                    var _msg= `no message referenced in channel ${channel}, although "${calendar_id}" is referenced for update (maybe it will be updated?).`
                                    problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)

                                    msg+=  `<li>${_msg}</li>`
                                }
                            }
                            else{
                                var b_ok= true
                                for (var msg_id of msg_list){
                                    var f_msg= undefined
                                    try{
                                        f_msg= (Boolean(msg_id) && Boolean(f_msg=(await (channel.messages.fetch(msg_id)))))? f_msg : undefined 
                                    } catch(err){
                                        f_msg= undefined
                                    }
                                    if(!Boolean(f_msg)){
                                        if((!Boolean(data_update_check)) || (!Boolean(duc_cid=data_update_check[calendar_id])) ||
                                            (Boolean(duc_cid.unnecessary))
                                        ){
                                            var _msg= `unable to fetch message ${msg_id} in channel ${channel} for "${calendar_id}" which isn't flagged for update`
                                            problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)

                                            msg+= `<li>${_msg}</li> (${JSON.stringify(msg_list)})`
                                        }
                                        else{
                                            var _msg= `unable to fetch message ${msg_id} in channel ${channel} for "${calendar_id}" although it's flagged for update`
                                            problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
    
                                            msg+= `<li>${_msg}</li> (${JSON.stringify(msg_list)})`
                                        }

                                        b_ok= false
                                    }
                                }
                                if(b_ok){
                                    var _msg= `in channel ${channel}, "${calendar_id}" is displayed though: ${JSON.stringify(msg_list)}`
                                    problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)

                                    msg+= `<li>${_msg}</li>`
                                }
                            }
                        }
                    }

                    msg+= `</ul>\n`
                }
            }
            msg+= '</li>\n'
        }
        msg+= '</ul>'
    }

    report_str+= `${msg}</br>`
    msg= ""

    report_str+=`<h5>update checks:</h5>`

    if(!Boolean(data_update_check)){
        var _msg= `No update check data found…`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
        msg+= _msg
    }
    else if(Object.keys(data_update_check).length<=0){
        var _msg= `No update check data set…`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
        msg+= _msg
    }
    else{
        msg+= `<ul>`
        
        for(var cal_id in data_update_check){
            msg+= `<li>`

            if(!Boolean(cal_id.match(G_MAIL_REGEX))){
                var _msg= `"${cal_id}" doesn't seem to be a valid calendar id…`
                problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)

                msg+= _msg
            }
            else{
                var cal_update_obj= data_update_check[cal_id]
                if(!Boolean(cal_update_obj)){
                    var _msg= `No update check data set for "${cal_id}"`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)

                    msg+= _msg
                } 
                else if(Object.keys(cal_update_obj).length<=0){
                    var _msg= `Empty update check data set for "${cal_id}"`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)

                    msg+= _msg
                }
                else{
                    msg+= `For "${cal_id}":\n<ul>`

                    var _lst_d= undefined
                    if(!Boolean(cal_update_obj.lastTime)){
                        var _msg= `"${cal_id}" hasn't been updated yet (no 'lastTime' data)…`
                        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
    
                        msg+= `<li>${_msg}</li>\n`
                    }
                    else if(isNaN((_lst_d=new Date(cal_update_obj.lastTime)).getTime())){
                        var _msg= `"${cal_id}" has invalid time has last update…`
                        problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    
                        msg+= `<li>${_msg}</li>\n`
                    }
                    else{
                        var _msg= `"${cal_id}" has been updated last on "${_lst_d}"`
                        problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
    
                        msg+= `<li>${_msg}</li>\n`
                    }

                    if(cal_update_obj.unnecessary===undefined){
                        var _msg= `"${cal_id}" no update necessity check boolean…`
                        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
    
                        msg+= `<li>${_msg}</li>\n`
                    }
                    else{
                        var _msg= `"${cal_id}" is ${(cal_update_obj.unnecessary)?"":"NOT "} set for an update on next scheduled check…`
                        problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
    
                        msg+= `<li>${_msg}</li>\n`
                    }

                    if(!Boolean(cal_update_obj.nextDiscardTime)){
                        var _msg= `"${cal_id}" doesn't seem to have an expiring event in the future (no 'nextDiscardTime' data)…`
                        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)
    
                        msg+= `<li>${_msg}</li>\n`
                    }
                    else if(isNaN((_lst_d=new Date(cal_update_obj.nextDiscardTime)).getTime())){
                        var _msg= `"${cal_id}" has invalid time for next expiring event (bad 'nextDiscardTime' data)…`
                        problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)
    
                        msg+= `<li>${_msg}</li>\n`
                    }
                    else{
                        var _msg= `"${cal_id}" seems to have an expiring event on "${_lst_d}"`
                        problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)
    
                        msg+= `<li>${_msg}</li>\n`
                    }

                    msg+= `</ul>\n`
                }
            }

            msg+= `</li>\n`
        }

        msg+= `</ul>`
    }

    report_str+= `${msg}</br>`
    msg= ""


    var data_tags= utils.settings.get(guild, 'tags', 'calendar')

    report_str+=`<h5>Calendar tags:</h5>`

    if(!Boolean(data_tags)){
        var _msg= `No calendar tags data…`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)

        msg+= _msg
    }
    if(Object.keys(data_tags).length<=0){
        var _msg= `Empty calendar tags data…`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)

        msg+= _msg
    }
    else{
        msg+= `<ul>`
        
        for(var tag in data_tags){
            var emote= data_tags[tag]
            if(!Boolean(emote)){
                var _msg= `Tag "${tag}" is register but not associated to a valid emoji ('${emote}')`
                problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)

                msg+= `<li>${_msg}</li>\n`
            }
            else{
                let simpleEmojiRegex= /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/g;
                if(!Boolean(emote.match(simpleEmojiRegex)) &&
                    !Boolean([...guild.emojis.cache.values()].find( e => {return e.toString()===emote})))
                {
                    var _msg= `Tag "${tag}" is register but associated to an invalid emoji ('${emote}')`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)

                    msg+= `<li>${_msg}</li>\n`
                }
                else{
                    var _msg= `Tag "${tag}" -> '${emote}'`
                    problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)

                    msg+= `<li>${_msg}</li>\n`
                }
            }
        }

        msg+= `</ul>\n`
    }

    report_str+= `${msg}</br>`
    msg= ""


    var data_category= utils.settings.get(guild, 'categories', 'calendar')
    
    report_str+=`<h5>Category checks:</h5>`

    if(!Boolean(data_category)){
        var _msg= `No calendar category data…`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)

        msg+= _msg
    }
    if(data_category.length<=0){
        var _msg= `Empty calendar category data…`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)

        msg+= _msg
    }
    else{
        msg+= `Categories: `
        for (var cat of data_category){
            problems.add(guild.id, `category '${cat}' found`, ProblemCount.TYPES.INFO)

            msg+= ` '${cat}';`
        }
    }

    report_str+= `${msg}</br>`
    msg= ""


    var ctrl_role= utils.settings.get(guild, 'role', 'calendar')
    
    report_str+=`<h5>Control role:</h5>`

    if(!Boolean(ctrl_role)){
        var _msg= `no control role is set…`
        problems.add(guild.id, _msg, ProblemCount.TYPES.WARN)

        msg+= _msg        
    }
    else{
        var role= guild.roles.cache.get(ctrl_role)
        if(!Boolean(role)){
            var _msg= `Set control role is badly written or non existing`
            problems.add(guild.id, _msg, ProblemCount.TYPES.ERROR)

            msg+= _msg
        }
        else{
            var _msg= `Control role: ${role.name} (id: ${role.id})`
            problems.add(guild.id, _msg, ProblemCount.TYPES.INFO)

            msg+= _msg
        }
    }

    report_str+= `${msg}</br>`
    

    return report_str
}

async function _runReportGuild(guild, utils, sendToUser= undefined){
    var report_fileName= `report_${guild.name.replace(' ','_')}_${Date.now()}.html`;
    var html_path= `data/${report_fileName}`;

    var user= sendToUser;
    if(!Boolean(user)){
        user= await guild.members.fetch(utils.getMasterID())

        if(!Boolean(user)) return false
    }

    let clean= () =>{
        if(fs.existsSync(html_path)) fs.unlinkSync(html_path);
    };

    let moduleExists= (modName) => {
        return fs.existsSync(`${__dirname}/cmd_${modName}.js`)
    }

    problems.clear(guild.id)

    var report_str=`<h2>${guild.name}</h2> (#${guild.id})\n\n`;

    report_str+= `<h4>Roles:</h4>\n<table><thead>\n<tr>\n<th>role name</th><th>id</th>\n</tr>\n</thead>\n<tbody>\n`;
    guild.roles.cache.forEach(role => {
        report_str+= `<tr><td>${role.name}</td><td id="${role.id}">${role.id}</td></tr>\n`;
    });
    report_str+= `</tbody>\n</table>\n\n`;

    if(moduleExists('punish_role')){
        report_str+= await _reportCmdPunishRole(guild, utils);
    
        report_str+= `<br/>\n`
    }

    if(moduleExists('welcome')){
        report_str+= _reportCmdWelcome(guild, utils);
        
        report_str+= `<br/>\n`
    }

    if(moduleExists('main')){
        report_str+= _reportCmdMain(guild, utils);
        
        report_str+= `<br/>\n`
    }

    if(moduleExists('kart')){
        report_str+= _reportCmdKart(guild, utils);
        
        report_str+= `<br/>\n`
    }

    if(moduleExists('player')){
        report_str+= await _reportCmdPlayer(guild, utils);
        
        report_str+= `<br/>\n`
    }

    if(moduleExists('roles')){
        report_str+= await _reportCmdRoles(guild, utils);
        
        report_str+= `<br/>\n`
    }

    if(moduleExists('calendar')){
        report_str+= await _reportCmdCalendars(guild, utils);
        
        report_str+= `<br/>\n`
    }

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
var cron_job= undefined;

var report_job= undefined;

function cmd_init(utils){
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


async function cmd_init_per_guild(utils, guild){
    if(!l_guilds.includes(guild)){
        l_guilds.push(guild)
    }
}

async function cmd_main(cmdObj, clearanceLvl, utils){
    let args= cmdObj.args;
    let message= cmdObj.msg_obj;
    if(args[0]==="help"){
        return cmd_help(cmdObj, clearanceLvl);
    }

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

function cmd_destroy(utils){
    hereLog("destroy…");
    if(Boolean(report_job)){
        delete report_job;
        report_job= undefined;
    }
}


module.exports.name= "report";
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear, destroy: cmd_destroy};