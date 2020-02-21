
const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;


let hereLog= (...args) => {console.log("[cmd_punish_role]", ...args);};

var l_guilds= [];


function __get_stored_role(name, guild, utils){
    let r_id=  utils.settings.get(guild, name);
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

function __punish_func(guild, member, p_role, utils){
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
    if(Boolean(sentenced.roles)){
        old_sr= s_mbr.roles;
    }

    if(Boolean(member.roles)){
        var saved_roles= old_sr;
        member.roles.forEach(role =>{
            if(!saved_roles.includes(role.id))
                saved_roles.push(role.id);
        });
        if(Boolean(old_s)){
            saved_roles.filter(e => {return e!==old_s && e!==p_role.id;})
        }
        s_mbr['roles']= saved_roles;
    }
    s_mbr['sentence']= p_role.id;

    utils.settings.set(guild, 'punished', sentenced);

    member.removeRoles(saved_roles).catch(err=>{hereLog(err);});
    member.addRole(stored_role).catch(err=>{hereLog(err);});
}

function _cmd_prison(cmdObj, clearanceLvl, utils){
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

function _free(cmdObj, member, utils){
    var punished= utils.settings.get(guild,'punished');
    var con= undefined;
    if(!Boolean(punished) || !Boolean(con=punished[member.id])){
        cmdObj.msg_obj.author.send("Can't find any convict to release…");
        return false;
    }

    var old_roles= con.roles;
    if(Boolean(old_roles)){
        member.addRoles(old_roles).catch(err =>{
            hereLog(err);
        });
    }

    var s_role= con.sentence;
    if(Boolean(s_role)){
        member.removeRole(sentence).catch(err =>{
            hereLog(err);
        });
    }

    delete punished(member.id);
    utils.settings.set(guild,'punished', punished);

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
        Object.keys(punished).forEach(k_m_id =>{
            await guild.fetchMember(k_m_id).then( m =>{
                if(Boolean(p_r_id) && m.roles.get(p_r_id)){
                    m.removeRole(p_r_id).catch(err => hereLog(err));
                }
                if(Boolean(s_r_id) && m.roles.get(s_r_id)){
                    m.removeRole(s_r_id).catch(err => hereLog(err));
                }
                var saved= undefined;
                if(Boolean(saved=punished[k_m_id].roles)){
                    m.addRoles(saved).catch(err => hereLog(err));
                }

                if( (Boolean(p_r_id) && !Boolean(m.roles.get(p_r_id))) ||
                    (Boolean(s_r_id) && !Boolean(m.roles.get(s_r_id)))  )
                {
                    if(Boolean(saved=punished[k_m_id].roles)){
                        m.addRoles(saved).catch(err => hereLog(err));
                    }

                    deleters.push(k_m_id);
                }
            })
            .catch(err => hereLog(err))
        });
        deleters.forEach(d =>{
            delete punished[d];
        })
        utils.settings.set(guild,'punished',punished);
    }
}

async function cmd_main(cmdObj, clearanceLvl, utils){
    let command= cmdObj.command;
    hereLog(`${command} command called (clearance: ${clearanceLvl}) by ${cmdObj.msg_obj.author} on ${cmdObj.msg_obj.channel}`)

    if(clearanceLvl<=CLEARANCE_LEVEL.NONE) return false;

    if(command==="prison"){
        return _cmd_prison(cmdObj, clearanceLvl, utils)
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

    return false;
}

function cmd_help(cmdObj, clearanceLvl){
    hereLog(`help request by ${cmdObj.msg_obj.author} on ${cmdObj.msg_obj.channel}`);
}

function cmd_event(eventName, utils){
    hereLog(`Recieved event '${eventName}'…`);
    if(eventName==="guildMemberUpdate"){
        var oldMember= arguments[2];
        var newMember= arguments[3];

        if (oldMember.roles.size > newMember.roles.size) {
            var suprRoles= oldMember.roles.filter(r => {return !newMember.roles.has(r);});

            var p_r= utils.settings.get(newMember.guild, 'prison_role');
            var s_r= utils.settings.get(newMember.guild, 'silence_role');

            if(suprRoles.some(s_role => {return s_role.id===p_r || s_role.id===s_r})){
                var punished= utils.settings.get(newMember.guild, 'punished');
                var old_roles= undefined, con= undefined;
                if(Boolean(punished) && Boolean(con=punished[member.id]) && Boolean(old_roles=con.roles)){
                    newMember.addRoles(old_roles).catch(err => {hereLog(err);});
                }

                delete punished[member.id];
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

module.exports.name= ["prison","silence","free"];
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};
module.exports.getCacheWarnTreshold= getTreshold;
