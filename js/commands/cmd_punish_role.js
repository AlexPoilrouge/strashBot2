
const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;


let hereLog= (...args) => {console.log("[cmd_punish_role]", ...args);};

var l_guilds= [];

let l_cmd= ["prison","silence","tg","ftg","chut","free","convicts"];


function __get_stored_role(guild, name, utils){
    let r_id=  utils.settings.get(guild, name);
    hereLog(`r_id: ${r_id}`)
    var role= undefined;
    if(!Boolean(r_id) ||
        !(Boolean(guild.roles) && Boolean(role=guild.roles.cache.get(r_id)))
    ){
        return undefined;
    }
    else{
        return role;
    }
}

async function __punish_func(guild, member, p_role, utils){
    var sentenced= utils.settings.get(guild, 'punished');
    var spared= utils.settings.get(guild, 'spared-roles');

    var mains= [];
    var m_charChan= utils.settings.get(guild, 'channelCharacter', "main");
    if(Boolean(m_charChan)){
        Object.values(m_charChan).forEach(charChan_obj=>{
            if(charChan_obj.role){
                mains.push(charChan_obj.role);
            }
        });
    }
    else{
        hereLog("-punishing- No 'main' settings found");
    }

    var old_s= undefined;
    var old_sr= [];
    var s_mbr= undefined;
    if(!Boolean(sentenced)){
        sentenced= {};
    }
    if(!Boolean(s_mbr=sentenced[member.id])){
        sentenced[member.id]= {};
        s_mbr= sentenced[member.id];
    }
    if(Boolean(s_mbr.sentence)){
        old_s=s_mbr.sentence;
    }
    if(Boolean(s_mbr.roles)){
        old_sr= s_mbr.roles;
    }

    var saved_roles= old_sr;
    if(Boolean(member.roles)){
        member.roles.cache.forEach(role =>{
            if( !saved_roles.includes(role.id) && (role.id!==p_role.id)
                    && (!Boolean(spared) || !spared.includes(role.id)) && (!mains.includes(role.id))
            ){
                hereLog(`-- push( ${role.name} )`)
                saved_roles.push(role.id);
            }
        });

        saved_roles= saved_roles.filter(e => {return (e!==p_role.id && e!==old_s)});
        s_mbr['roles']= saved_roles;
    }
    s_mbr['sentence']= p_role.id;

    utils.settings.set(guild, 'punished', sentenced);

    if(Boolean(old_s) && (old_s!==p_role.id)){
        hereLog(`[1] removeRole ${old_s}`)
        await member.roles.remove(old_s).catch(err=>{hereLog(err);});
    }
    hereLog(`addRole ${p_role.name}`)
    await member.roles.add(p_role).catch(err=>{hereLog(err);});
    hereLog(`[2] removesRole ${saved_roles}`)
    if (saved_roles){
        await member.roles.remove(saved_roles).catch(err=>{hereLog(err);});
    }
}

async function __cmd_punish(cmdObj, clearanceLvl, punishment, utils){
    let args= cmdObj.args;
    let message= cmdObj.msg_obj;
    let sub_cmd= args[0];
    if(sub_cmd==="role"){
        var role= undefined
        if(Boolean(message.mentions) && Boolean(message.mentions.roles) && Boolean(role=message.mentions.roles.first())){
            utils.settings.set(message.guild, `${punishment}_role`, role.id);

            return true;
        }
        else{
            message.author.send(`No role mention found to set up role for the "${punishment}" punishment command`);
            return false;
        }
    }
    else if(sub_cmd==="norole"){
        utils.settings.remove(message.guild, `${punishment}_role`, role.id);

        return true;
    }
    else if(sub_cmd==="which"){
        var role= undefined;
        if(!Boolean(role=__get_stored_role(message.guild, `${punishment}_role`, utils))
        ){
            message.author.send(`No found role associated to the "${punishment}" punishment yet`);
            return true;
        }
        else{
            var str= `The "${punishment}" punishment associated to role "*${role.name}*"`;

            var s_r= utils.settings.get(message.guild, 'spared-roles');
            if(Boolean(s_r) && s_r.length>0){
                str+=`\n\nThe following roles can't be stripped off when punishment occurs: ${
                    s_r.map(sr=>{
                        var sr_n;
                        if(Boolean(sr_n=message.guild.roles.cache.get(sr))) return sr_n.name;
                        else return `<@${sr}>`;
                    })
                }`;
            }

            message.author.send(str);

            return true;
        }
    }
    else if(sub_cmd==="glue"){
        var s_r= utils.settings.get(message.guild, 'spared-roles');
        var role= undefined;
        if(Boolean(message.mentions) && Boolean(message.mentions.roles) && Boolean(role=message.mentions.roles.first())){
            if(!Boolean(s_r)){
                s_r= [];
            }
            message.mentions.roles.forEach(r=>{
                if(!s_r.includes(r.id)){
                    s_r.push(r.id);
                }
            });

            utils.settings.set(message.guild, 'spared-roles', s_r);

            return true;
        }
        else{
            message.author.send("No role mention found to set up a role to glue…");
            return false;
        }
    }
    else if(sub_cmd==="unglue"){
        var role= undefined;
        if(!Boolean(message.mentions) || !Boolean(message.mentions.roles) || !Boolean(role=message.mentions.roles.first())){
            message.author.send("No role mention found to set up a role to unglue during punishment…");

            return false;
        }
        var s_r= utils.settings.get(message.guild, 'spared-roles');
        if(!Boolean(s_r) || !s_r.includes(role.id)){
            message.author.send("Can't unglue which as not been glued yet… 🤔");

            return false;
        }

        message.mentions.roles.forEach(r=>{
            s_r= s_r.filter(srid => {return srid!==r.id;});
        });
        utils.settings.set(message.guild, 'spared-roles', s_r);
    }
    else{
        var stored_role= __get_stored_role(message.guild, `${punishment}_role`, utils);
        if(!Boolean(stored_role)){
            message.author.send("No found role associated to emprisonment yet…");
            return false;
        }

        var members= undefined;
        if(Boolean(message.mentions) && Boolean(members=message.mentions.members)){
            var b= false;
            members.forEach(member =>{
            // for( var member of members){
                var clr_lvl= utils.getMemberClearanceLevel(member);
                if(member.id===utils.getBotClient().user.id){
                    message.author.send(`Nah bruh, ain't gonna screw myself up, fam.`);
                }
                else if(clr_lvl<=CLEARANCE_LEVEL.NONE){
                    __punish_func(message.guild, member, stored_role, utils); 
                                        
                    b= b || true;
                }
                else if(clr_lvl<=CLEARANCE_LEVEL.ADMIN_ROLE){
                    message.author.send(`I can't punish ${member.nickname} with the '${stored_role.name}' role. `+
                                    "He seems protected by a mysterious power…");
                }
                else if(clr_lvl>=CLEARANCE_LEVEL.MASTER_ID){
                    var str= `The great __${member.nickname}__ is my master. `+
                        "Unfortunately for you, I am not only programmed to never act against my master…\n"+
                        "\n…but also to retaliate!";

                    if(clearanceLvl>=CLEARANCE_LEVEL.MASTER_ID){
                        str+= "\n … Oh hi master! Didn't recognize you there for a sec, lul."
                    }
                    else{
                        __punish_func(message.guild, message.member, stored_role, utils);
                    }
                    message.author.send(str);
                }
            });

            return b;
        }
        else{
            message.author.send("No mention to any filthy criminal detected…");
            return false;
        }
    }
}

async function _cmd_prison(cmdObj, clearanceLvl, utils){
    return await __cmd_punish(cmdObj, clearanceLvl, 'prison', utils);
}

async function _cmd_silence(cmdObj, clearanceLvl, utils){
    return await __cmd_punish(cmdObj, clearanceLvl, 'silence', utils);
}

async function _free(cmdObj, member, utils){
    var punished= utils.settings.get(cmdObj.msg_obj.guild,'punished');
    var con= undefined;
    if(!Boolean(punished) || !Boolean(con=punished[member.id])){
        cmdObj.msg_obj.author.send("Can't find any convict to release…");
        return false;
    }

    var s_role= con.sentence;
    if(Boolean(s_role)){
        hereLog(`removeRole ${s_role}`)
        await member.roles.remove(s_role).catch(err =>{
            hereLog(err);
        });
    }

    var old_roles= con.roles;
    if(Boolean(old_roles)){
        hereLog(`addRoles ${old_roles}`)
        await member.roles.add(old_roles).catch(err =>{
            hereLog(err);
        });
    }

    delete punished[member.id];
    utils.settings.set(cmdObj.msg_obj.guild,'punished', punished);

    return true;
}


function cmd_init(utils){
    hereLog(`cmd init`);
    l_guilds= [];
}

async function cmd_init_per_guild(utils, guild){
    l_guilds.push(guild);
    hereLog(`cmd init for guild ${guild}`);
    var p_r_id= utils.settings.get(guild, 'prison_role');
    var s_r_id= utils.settings.get(guild, 'silence_role');
    var punished= utils.settings.get(guild, 'punished');
    if(Boolean(p_r_id) && !Boolean(guild.roles.cache.get(p_r_id))){
        utils.settings.remove(guild, 'prison_role');
    }
    if(Boolean(s_r_id) && !Boolean(guild.roles.cache.get(s_r_id))){
        utils.settings.remove(guild, 'silence_role');
    }
    if(Boolean(punished)){
        var punished_keys= Object.keys(punished);
        for(var k_m_id of punished_keys){
            var pun_m= punished[k_m_id];
            await guild.members.fetch(k_m_id).then( m =>{
                var m_sent= Boolean(pun_m)? pun_m.sentence : undefined;

                var r= undefined;
                if(!Boolean(m_sent) || !Boolean(r=m.roles.cache.get(m_sent))){
                    if(Boolean(pun_m.roles)){
                        hereLog(`tmp add roles ${pun_m.roles}`)
                        m.roles.add(pun_m.roles).catch(err => {hereLog(err);});
                    }

                    delete punished[k_m_id];
                }
                else{
                    __punish_func(guild,m,r,utils);
                }
            })
            .catch(err => hereLog(err))
        };

        await guild.members.fetch().then(g_m=>{
            g_m.forEach(m=>{
                var pun_m= undefined;
                if((Boolean(r=m.roles.cache.get(p_r_id)) || Boolean(r=m.roles.cache.get(s_r_id))) &&
                    !(Boolean(pun_m=punished[m.id]) && Boolean(pun_m.sentence))
                ){
                    __punish_func(guild,m,r,utils);
                }
            });
        })
        utils.settings.set(guild,'punished',punished);
    }
    var spared= utils.settings.get(guild, 'spared-roles');
    if(Boolean(spared) && spared.length>0){
        var f_s= spared, b=false;
        spared.forEach(s_r=>{
            if(!Boolean(guild.roles.cache.get(s_r))){
                f_s= f_s.filter(r =>{return r!==s_r});
                b= true;
            }
        });
        if(b){
            utils.settings.set(guild, 'spared-roles', f_s);
        }
    }
}

async function cmd_main(cmdObj, clearanceLvl, utils){
    let command= cmdObj.command;
    let message= cmdObj.msg_obj;
    hereLog(`${command} command called (clearance: ${clearanceLvl}) by ${cmdObj.msg_obj.author} on ${cmdObj.msg_obj.channel}`)

    if(clearanceLvl<=CLEARANCE_LEVEL.NONE) return false;

    if(command==="prison"){
        return await _cmd_prison(cmdObj, clearanceLvl, utils);
    }
    else if(["silence","tg","ftg","chut"].includes(command)){
        return await _cmd_silence(cmdObj, clearanceLvl, utils);
    }
    else if(command==="free"){
        var members= undefined;
        if(!Boolean(message.mentions) || !Boolean(members=message.mentions.members)){
            cmdObj.msg_obj.author.send("No mention to any filthy criminal detected…");
            return false;
        };
        
        var b= false;
        members.forEach(member =>{
            b= b || _free(cmdObj, member, utils);
        })

        return b;
    }
    else if(command==="convicts"){
        var punished= utils.settings.get(message.guild, 'punished');
        var convicts= undefined
        if(!Boolean(punished) || !Boolean(convicts=Object.keys(punished)) || convicts.length<=0){
            message.author.send("No convicts found (maybe they broke out??? 😱 )");
            return true;
        }

        str= "Convicts list:\n\n";
        convicts.forEach(con => {
            var con_obj= punished[con];
            str+= `\t[ ${(Boolean(con) && Boolean(con_obj.sentence))?message.guild.roles.cache.get(con_obj.sentence).name:'???'} ] <@${con}>`;
            str+= (Boolean(con) && Boolean(con_obj.roles))?"( stripped from "+con_obj.roles.map(r=>{
                            var r_obj= undefined;
                            return (Boolean(r_obj=message.guild.roles.cache.get(r)))?
                                        r_obj.name :
                                        "[ deleted role ]";
                        }
                    )+" )":'';
        });
        message.author.send(str);

        return true;
    }
    else if(command==="help"){
        return cmd_help(cmdObj, clearanceLvl);
    }

    return false;
}

function cmd_help(cmdObj, clearanceLvl){
    hereLog(`help request by ${cmdObj.msg_obj.author} on ${cmdObj.msg_obj.channel}`);
    if(clearanceLvl<=CLEARANCE_LEVEL.NONE) return false;

    let message= cmdObj.msg_obj;

    message.author.send(
        `__**punishment** command family___:\n\n`+
        `**Admin Roles and/or Control Channels only:**\n\n`+
        `\t\`!prison role <@role>\`\n\n`+
        `\tSets the mentioned role associated with the 'prison' command.\n\n`+
        `\t\`!prison which\`\n\n`+
        `\tShows which role is associated with the 'prison' command (along with the 'glued roles').\n\n`+
        `\t\`!prison glue <@role>\`\n\n`+
        `\tSets the mentioned role as a 'glued role', a role that can't be stripped during punishment…\n\n`+
        `\t\`!prison unglue <@role>\`\n\n`+
        `\tRemove the mentioned role, from the 'glued roles'…\n\n`+
        `\t\`!prison <@usermention>\`\n\n`+
        `\tGives the "prison" punishment to the mentioned user, stripping him of all of his roles, leaving him only`+
        `with the 'prison' associated role…\n\n`+
        `\t\`!silence\`\n\n`+
        `\tThe 'silence' command is used is the exact same fashion as the 'prison' command (with same subcommand and options)\n`+
        `\tInstead of managing the role associated with the 'prison' punishment, it is used to manage the one associated with the 'silence' punishment.\n\n`+
        `\t\`!convicts\`\n\n`+
        `\tList all of the convicted users…\n\n`+
        `\t\`!free <@usermention>\`\n\n`+
        `\tRelease the mentionned user of his/her punishment.\n(Manually removing his/her "punishment role" should also work…)\n`
    );

    return true;
}

function cmd_event(eventName, utils){
    if(eventName==="guildMemberUpdate"){
        var oldMember= arguments[2];
        var newMember= arguments[3];


        var punished= utils.settings.get(newMember.guild, 'punished');

        if (oldMember.roles.cache.size > newMember.roles.cache.size) {
            var suprRoles= oldMember.roles.cache.filter(r => {return !newMember.roles.cache.has(r.id);});

            var p_sent= (Boolean(punished) && Boolean(p_sent=punished[newMember.id]))? p_sent.sentence: undefined;
            if(Boolean(p_sent) && suprRoles.some(s_role => {return s_role.id===p_sent;})){
                var punished= utils.settings.get(newMember.guild, 'punished');
                var old_roles= undefined, con= undefined;
                if(Boolean(punished) && Boolean(con=punished[newMember.id]) && Boolean(old_roles=con.roles)){
                    hereLog(`tmp add roles ${old_roles}`)
                    newMember.roles.add(old_roles).catch(err => {hereLog(err);});
                }

                delete punished[newMember.id];
                utils.settings.set(newMember.guild, 'punished',punished);
            }
        }
        else if(oldMember.roles.size < newMember.roles.size){
            var addedRoles= newMember.roles.cache.filter(r => {return !oldMember.roles.cache.has(r.id);});

            var pris_r= utils.settings.get(newMember.guild, 'prison_role');
            var sil_r= utils.settings.get(newMember.guild, 'silence_role');
            var punish_r= undefined
            if( (Boolean(pris_r) || Boolean(sil_r)) &&
                (punish_r=addedRoles.find(s_role => {return (s_role.id===pris_r || s_role.id===sil_r);}))
            ){
                if(utils.getMemberClearanceLevel(newMember)<CLEARANCE_LEVEL.ADMIN_ROLE){
                    __punish_func(newMember.guild, newMember, punish_r, utils);
                }
            }
        }
    }
    else if(eventName==="roleDelete"){
        var role= arguments[2];

        var s_r= utils.settings.get(role.guild, 'spared-roles');
        if(Boolean(s_r) && s_r.length>0){
            s_r.filter(sr =>{return sr!==role.id;});

            utils.settings.set(role.guild, 'spared-roles', s_r);
        }

        var pris_r= utils.settings.get(role.guild, 'prison_role');
        var sil_r= utils.settings.get(role.guild, 'silence_role');
        if(role.id===pris_r){
            utils.settings.remove(role.guild, 'prison_role');
        }
        else if(role.id===sil_r){
            utils.settings.remove(role.guild, 'silence_role');
        }
    }
}

function cmd_guild_clear(guild){
    l_guilds.filter(e => {
        if(e.id!==guild.id) return true;

        return false;
    });
}

module.exports.name= l_cmd;
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};