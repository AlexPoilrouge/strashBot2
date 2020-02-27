
const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;


let hereLog= (...args) => {console.log("[cmd_punish_role]", ...args);};

var l_guilds= [];

let l_cmd= ["prison","silence","free","convicts"];


function __get_stored_role(guild, name, utils){
    let r_id=  utils.settings.get(guild, name);
    hereLog(`r_id: ${r_id}`)
    var role= undefined;
    if(!Boolean(r_id) ||
        !(Boolean(guild.roles) && Boolean(role=guild.roles.get(r_id)))
    ){
        return undefined;
    }
    else{
        return role;
    }
}

async function __punish_func(guild, member, p_role, utils){
    var sentenced= utils.settings.get(guild, 'punished');
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

    if(Boolean(member.roles)){
        var saved_roles= old_sr;
        member.roles.forEach(role =>{
            if(!saved_roles.includes(role.id) && (role.id!==p_role.id)){
                hereLog(`-- push( ${role.name} )`)
                saved_roles.push(role.id);
            }
        });
        if(Boolean(old_s)){
            saved_roles.filter(e => {return e!==old_s && e!==p_role.id;})
        }
        s_mbr['roles']= saved_roles;
    }
    s_mbr['sentence']= p_role.id;

    utils.settings.set(guild, 'punished', sentenced);

    if(Boolean(old_s) && (old_s!==p_role.id)){
        await member.removeRole(old_s).catch(err=>{hereLog(err);});
    }
    hereLog(`addRole ${p_role.name}`)
    await member.addRole(p_role).catch(err=>{hereLog(err);});
    hereLog(`removesRole ${saved_roles.map(r=>{return r;})}`)
    await member.removeRoles(saved_roles).catch(err=>{hereLog(err);});
}

async function _cmd_prison(cmdObj, clearanceLvl, utils){
    let args= cmdObj.args;
    let message= cmdObj.msg_obj;
    let sub_cmd= args[0];
    if(sub_cmd==="role"){
        var role= undefined
        if(Boolean(message.mentions) && Boolean(message.mentions.roles) && Boolean(role=message.mentions.roles.first())){
            utils.settings.set(message.guild, 'prison_role', role.id);

            return true;
        }
        else{
            message.author.send("No role mention found to set up role for the emprisonment command");
            return false;
        }
    }
    else if(sub_cmd==="norole"){
        utils.settings.remove(message.guild, 'prison_role', role.id);

        return true;
    }
    else if(sub_cmd==="which"){
        var role= undefined;
        if(!Boolean(role=__get_stored_role(message.guild, 'prison_role', utils))
        ){
            message.author.send("No found role associated to emprisonment yet");
            return true;
        }
        else{
            message.author.send(`Prison punishment associated to role "*${role.name}*"`);
            return true;
        }
    }
    else{
        var stored_role= __get_stored_role(message.guild, 'prison_role', utils);
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
                if(clr_lvl<=CLEARANCE_LEVEL.NONE){
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
        await member.removeRole(s_role).catch(err =>{
            hereLog(err);
        });
    }

    var old_roles= con.roles;
    if(Boolean(old_roles)){
        hereLog(`addRoles ${old_roles}`)
        await member.addRoles(old_roles).catch(err =>{
            hereLog(err);
        });
    }

    delete punished[member.id];
    utils.settings.set(cmdObj.msg_obj.guild,'punished', punished);

    return true;
}


function cmd_init(utils){
    hereLog(`cmd init`);
}

async function cmd_init_per_guild(utils, guild){
    l_guilds.push(guild);
    hereLog(`cmd init for guild ${guild}`);
    var p_r_id= utils.settings.get(guild, 'prison_role');
    var s_r_id= utils.settings.get(guild, 'silence_role');
    var punished= utils.settings.get(guild, 'punished');
    if(Boolean(punished)){
        var deleters= [];
        var punished_keys= Object.keys(punished);
        for(var k_m_id of punished_keys){
            var pun_m= punished[k_m_id];
            await guild.fetchMember(k_m_id).then( m =>{
                var m_sent= Boolean(pun_m)? pun_m.sentence : undefined;

                var r= undefined;
                if(!Boolean(m_sent) || !Boolean(r=m.roles.get(m_sent))){
                    if(Boolean(pun_m.roles)){
                        m.addRoles(pun_m.roles).catch(err => {hereLog(err);});
                    }

                    delete punished[k_m_id];
                }
                else{
                    hereLog(`punish_func(guild,${m},${r},utils)`);
                    __punish_func(guild,m,r,utils);
                }
            })
            .catch(err => hereLog(err))
        };

        await guild.fetchMembers().then(g=>{
            g.members.forEach(m=>{
                var pun_m= undefined;
                if((Boolean(r=m.roles.get(p_r_id)) || Boolean(r=m.roles.get(s_r_id))) &&
                    !(Boolean(pun_m=punished[m.id]) && Boolean(pun_m.sentence))
                ){
                    __punish_func(guild,m,r,utils);
                }
            });
        })
        utils.settings.set(guild,'punished',punished);
    }
}

async function cmd_main(cmdObj, clearanceLvl, utils){
    let command= cmdObj.command;
    let message= cmdObj.msg_obj;
    hereLog(`${command} command called (clearance: ${clearanceLvl}) by ${cmdObj.msg_obj.author} on ${cmdObj.msg_obj.channel}`)

    if(clearanceLvl<=CLEARANCE_LEVEL.NONE) return false;

    if(command==="prison"){
        return await _cmd_prison(cmdObj, clearanceLvl, utils)
    }
    else if(command=="free"){
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
            str+= `\t[ ${(Boolean(con) && Boolean(con_obj.sentence))?message.guild.roles.get(con_obj.sentence).name:'???'} ] <@${con}>`;
            str+= (Boolean(con) && Boolean(con_obj.roles))?"( stripped from "+con_obj.roles.map(r=>{return message.guild.roles.get(r).name;})+" )":'';
        });
        message.author.send(str);

        return true;
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
        `\t\`!prison <@usermention>\`\n\n`+
        `\tGives the "prison" punishment to the mentioned user, stripping him of all of his roles, leaving him only`+
        `with the 'prison' associated role…\n\n`+
        `\t\`!convicts\`\n\n`+
        `\tList all of the conviceted users…\n\n`+
        `\t\`!free <@usermention>\`\n\n`+
        `\tRelease the mentionned user of his/her punishment.\n(Manually removing his/her "punishment role" should also work…)\n`
    );

    return true;
}

function cmd_event(eventName, utils){
    hereLog(`Recieved event '${eventName}'…`);
    if(eventName==="guildMemberUpdate"){
        var oldMember= arguments[2];
        var newMember= arguments[3];
        hereLog(`old ${oldMember.roles.map(r=>{return r.name;})}`)
        hereLog(`new ${newMember.roles.map(r=>{return r.name;})}`)

        if (oldMember.roles.size > newMember.roles.size) {
            var suprRoles= oldMember.roles.filter(r => {return !newMember.roles.has(r.id);});

            var punished= utils.settings.get(newMember.guild, 'punished');
            var p_sent= (Boolean(punished) && Boolean(p_sent=punished[newMember.id]))? p_sent.sentence: undefined;

            if(Boolean(p_sent) && suprRoles.some(s_role => {return s_role.id===p_sent;})){
                var punished= utils.settings.get(newMember.guild, 'punished');
                var old_roles= undefined, con= undefined;
                if(Boolean(punished) && Boolean(con=punished[newMember.id]) && Boolean(old_roles=con.roles)){
                    newMember.addRoles(old_roles).catch(err => {hereLog(err);});
                }

                delete punished[newMember.id];
                utils.settings.set(newMember.guild, 'punished',punished);
            }
        }
    }
}

function cmd_guild_clear(guild){
    l_guilds.filter(e => {
        if(e.id!==guild.id) return true;

        return false;
    });
}

function getTreshold(){
    return 0;
}

module.exports.name= l_cmd;
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};
module.exports.getCacheWarnTreshold= getTreshold;
