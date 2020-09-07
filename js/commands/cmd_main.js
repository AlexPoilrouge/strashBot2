const cron= require('node-cron');

const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;



let hereLog= (...args) => {console.log("[cmd_main]", ...args);};

async function __deleteMemberMainRoles(member, charChanObj){
    hereLog(`delete main roles for ${member}`)
    var rms= [];
    member.roles.cache.forEach( (r, id, map) =>{
        var found_cco= undefined;
        if( Boolean(found_cco=Object.values(charChanObj).find(chObj =>{
                return Boolean(chObj.role) && (chObj.role===r.id)
            }))
        ){
            rms.push([r,found_cco]);
        }
    });
    
    for (var r_cco of rms){
        var role= r_cco[0];
        var cco= r_cco[1];
        hereLog(`removeRole ${role.name}(${role.id})`);
        await member.removeRole(role);

        await member.guild.members.fetch();
        var l_members= member.guild.roles.cache.get(role.id).members;
        if(!Boolean(l_members) || l_members.cache.size<=0){
            hereLog(`[1] role delete ${role.name}(${role.id})`);
            role.delete();
            delete cco["role"];
        }
    }
}

async function _postColorVoteMessage(channel, charChanObj, utils){
    hereLog(`post color vote on ${channel.name}(${channel})`)
    var r= undefined, role= undefined;
    if(!Boolean(charChanObj) || !Boolean(r=charChanObj.role) || !Boolean(role=channel.guild.roles.cache.get(r))){
        return false;
    }

    await channel.send(
        `Votez, par réaction, pour la couleur du role "${role.name}" (seul les votes des membres ayant ce rôle sont comptabilisés)…`
    ).then( msg =>{
        msg.react('⚪');
        msg.react('🔴');
        msg.react('🔵');
        msg.react('🟤');
        msg.react('🟣');
        msg.react('🟢');
        msg.react('🟡');
        msg.react('🟠').then(r => {
            msg.pin();
        });

        charChanObj.color_message= msg.id;
        utils.cache_message_management.keepTrackOf(msg);
    })

    return true;
}

async function _process_color_vote(message, emojis_colors, charChanObj){
    var charObj= undefined;
    if(!Boolean(charChanObj) || !Boolean(charObj=charChanObj[message.channel.id])) return false;

    if(!Boolean(charObj.color_message) || (charObj.color_message!==message.id)) return false;

    var r= undefined, role= undefined;
    if(!Boolean(r= charObj.role) || !Boolean(role=message.guild.roles.cache.get(r))) return false;

    var max= -1, res=undefined, count= -1;
    var emojis= Object.keys(emojis_colors);

    for (var emj of emojis){
        if( Boolean(message.reactions) &&
            !Boolean(message.reactions.cache.find(r => {return (r.emoji.name===emj && !r.me);}))
        ){
            await message.react(emj);
        }
    }
    
    for(var reac of message.reactions.cache){
        var mr= reac[1]
        if(emojis.includes(mr.emoji.name)){
            if(mr.count>mr.users.cache.size) await mr.users.fetch();
            count=0;
            mr.users.cache.forEach(u => {
                var member=message.guild.members.cache.get(u.id);
                if(Boolean(member) && Boolean(member.roles.cache.get(r))){
                    ++count;
                }
            })
        }
        if(count>max){
            max= count;
            res= mr.emoji.name;
        }
    }

    if(!Boolean(res)) return false;
    role.setColor(emojis_colors[res]);

    return true;
}

function __stallMember(id, stalledObj){
    var stalled= stalledObj;
    if(!Boolean(stalled)) stalled={};

    if(!Boolean(stalled.date)) stalled.date= Date.now();
    
    if(!Boolean(stalled.members)) stalled.members=[id];
    else if(!Boolean(stalled.members.includes(id))) stalled.members.push(id);

    return stalled;
}

function _unstallMember(id, stalledObj){
    if(!Boolean(stalledObj.members)) return {};

    var stalled= stalledObj.members.filter(uid => {
        return uid !== id;
    });

    if(!Boolean(stalled)) return {};
    
    stalledObj.members= stalled;

    return stalledObj;
}

function _onChannelMissing(charChan, guild, chanID){
    hereLog(`on channel missing… ${chanID}`)
    var cco= undefined, r= undefined, role=undefined;
    if(Boolean(cco=charChan[chanID]) && Boolean(r=cco.role) && Boolean(role=guild.roles.cache.get(r))){
        hereLog(`[2] role delete ${role.name}(${role.id})`);
        role.delete();
    }

    delete charChan[chanID];
}



var l_guilds= [];

var unstall_job= undefined;

function cmd_init(utils){
    hereLog(`cmd init`);

    if(!Boolean(unstall_job)){
        unstall_job= cron.schedule('0 0 * * 1', () => {
            hereLog("monday at 00:00 ? unstall members");

            l_guilds.forEach(g => {
                utils.settings.remove(g, 'stalledMembers');
            });
        })
    }

    l_guilds= [];
}

function cmd_init_per_guild(utils, guild){
    l_guilds.push(guild);
    hereLog(`cmd init for guild ${guild}`);

    var charChan= utils.settings.get(guild, 'channelCharacter');
    if(Boolean(charChan)){
        Object.keys(charChan).forEach( chan => {
            var cco= undefined;
            var channel= undefined;
            if(Boolean(chan) && Boolean(cco=charChan[chan])){
                if(!Boolean(channel=guild.channels.cache.get(chan))){
                    _onChannelMissing(charChan, guild, chan);
                }
                else{
                    if(Boolean(cco.color_message)){
                        channel.messages.fetch(cco.color_message).then(msg =>{
                            _process_color_vote(msg, emojis_color, charChan);
                        })
                        .catch(err => {
                            delete (cco['color_message']);
                            utils.settings.set(guild, 'channelCharacter', charChan);
                        });
                    }
                    if(Boolean(cco.role)
                    ){
                        var r= undefined;
                        if (!Boolean(r=guild.roles.cache.get(cco.role))){
                            delete cco['role'];
                        }
                        else{
                            guild.members.fetch().then( gld =>{
                                if(r.members.cache.size<=0){
                                    delete cco['role'];
                                    utils.settings.set(guild, 'channelCharacter', charChan);
                                    hereLog(`[3] role delete ${r.name}(${r.id})`);
                                    r.delete();
                                }
                            });
                        }
                    }
                    utils.settings.set(guild, 'channelCharacter', charChan);
                }
            }
        });
    }

    var stalled= utils.settings.get(guild, "stalledMembers");
    if(Boolean(stalled)){
        var r= {};
        var time= stalled.date;
        if(Boolean(time)){
            var d= new Date(time);
            var now= new Date();
            if( ((now-d)<604800000) && (d.getDay()<=now.getDay()) ){
                r=stalled;
            }
        }

        utils.settings.set(guild, "stalledMembers", r);
    }
}

async function cmd_main(cmdObj, clearanceLvl, utils){
    hereLog(`main command called (clearance: ${clearanceLvl}) by ${cmdObj.msg_obj.author} on ${cmdObj.msg_obj.channel}`);

    let args= cmdObj.args;
    let message= cmdObj.msg_obj
    if(args[0]==="add" && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        hereLog("'add' subcommand");
        var charName=""
        if( args.length<3 || !Boolean((charName=args.slice(2).join(' ')).match(/[A-Za-z0-9\ \-\.]+/))
            || !Boolean(args[1].match(/<#[0-9]+>/))
        ){
            message.author.send("Format:\n\t`!main add [#channel] [character-name]`")
            return false;
        }

        var chanChar= utils.settings.get(message.guild, 'channelCharacter');
        if(!Boolean(chanChar)){
            utils.settings.set(message.guild, 'channelCharacter', {});
            chanChar= utils.settings.get(message.guild, 'channelCharacter');
        }

        if(!Boolean(message.mentions) || !Boolean(message.mentions.channels) || message.mentions.channels.size<=0){
            message.author.send("No channel mention detected…");
            return false;
        }

        var chan= message.mentions.channels.first();

        if(Boolean(chanChar[chan.id]) && Boolean(chanChar[chan.id].character)){
            message.author.send(`Channel ${chan} is already dedicated to ${chanChar[chan.id].character}`);
            return false;
        }

        chanChar[chan.id]= {character: charName, role: undefined};
        utils.settings.set(message.guild, 'channelCharacter', chanChar);

        return true;
    }
    else if(args[0]==="clear" && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        hereLog("'clear' subcommand")
        if( args.length<2 || !Boolean(args[1].match(/<#[0-9]+>/))){
            message.author.send("Format:\n\t`!main clear [#channel]`")
            return false;
        }

        if(!Boolean(message.mentions) || !Boolean(message.mentions.channels) || message.mentions.channels.size<=0){
            message.author.send("No channel mention detected…");
            return false;
        }

        var chan= message.mentions.channels.first();

        var chanChar= utils.settings.get(message.guild, 'channelCharacter');
        if(!Boolean(chanChar)){
            chanChar= {};
            utils.settings.set(message.guild, 'channelCharacter', {});
        }

        var char= undefined;
        if(!Boolean(chanChar[chan.id]) || !Boolean(char=chanChar[chan.id].character)){
            message.author.send(`Channel ${chan}: nothing to do`);
            return true;
        }

        var str=`Channel ${chan} unassociated from ${char}…`;
        var role= undefined;
        if(Boolean(chanChar[chan.id].role) && Boolean(role=chan.guild.roles.cache.get(chanChar[chan.id].role))){
            str+=`\nDeleting '${role.name}' role…`;
        }
        var col_msg= undefined;
        if(Boolean(col_msg=chanChar[chan.id].color_message)){
            chan.messages.fetch(col_msg).then(msg => {
                msg.delete();
                utils.cache_message_management.untrack(msg);
            })
            .catch(err => hereLog(err));
        }
        delete chanChar[chan.id];

        utils.settings.set(message.guild, 'channelCharacter', chanChar);

        message.author.send(str);
        if(Boolean(role)){
            hereLog(`[4] role delete ${role.name}(${role.id})`);
            role.delete();
        }

        return true;
    }
    else if(args[0]==="unstall" && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        hereLog("'unstall' subcommand")
        return utils.settings.set(message.guild,'stalledMembers', {});
    }
    else if(args[0]==="here"){
        hereLog("'here' subcommand")
        var chanChar= utils.settings.get(message.guild, 'channelCharacter');
        var charObj= undefined;

        if(!Boolean(chanChar) || !Boolean(charObj=chanChar[message.channel.id]) || !Boolean(charObj.character)){
            message.author.send(`The ${message.channel} channel is not associated to any character…`)
            return false;
        }

        var r= undefined;
        message.author.send(`The ${message.channel} channel is for ${chanChar[message.channel.id].character} players.\n`+
            ((Boolean(charObj.role) && Boolean(r=message.guild.roles.cache.get(charObj.role)))? `\tAssociated role is: ${r}` : '')
        );

        return true;
    }
    else if(args[0]==="list"){
        var chanChar= utils.settings.get(message.guild, 'channelCharacter');
        if(!Boolean(chanChar)){
            message.author.send(`I didn't find any channel in "${message.guild}" associated with any character…`);
            return false
        }
        
        var str= `In guild "${message.guild}": `, b=false;
        Object.keys(chanChar).forEach(ch_k=>{
            var n_char= undefined, chan= undefined;
            var tmp_str= "";
            if(Boolean(n_char=chanChar[ch_k].character) && Boolean(chan=message.guild.channels.cache.get(ch_k))){
                tmp_str=`⋅ Channel "${chan.name}" is associated with character "${n_char}"\n`;
                if((tmp_str.length + str.length)>1998){
                    message.author.send(str);
                    str= tmp_str;
                }
                else{
                    str+=tmp_str;
                }
                b= true;
            }
        });
        if(!b){
            str= `I didn't find any channel in "${message.guild}" associated with any character…`;
        }
        message.author.send(str);

        return b;
    }
    else if(args[0]==="none"){
        hereLog("'none' subcommand")
        var chanChar= utils.settings.get(message.guild, 'channelCharacter');
        if(!Boolean(chanChar)) return true;

        var stalled= utils.settings.get(message.guild, 'stalledMembers');
        if(Boolean(stalled) && Boolean(stalled.members) && Boolean(stalled.members.includes(message.author.id))){
            message.author.send("Tu ne peux pas changer de *main* à nouveau cette semaine…");
            return false;
        }

        await __deleteMemberMainRoles(message.member, chanChar);

        utils.settings.set(message.guild, 'stalledMembers', __stallMember(message.author.id, stalled));
        utils.settings.set(message.guild, 'channelCharacter', chanChar);

        return true;
    }
    else if(args[0]==="color"){
        hereLog("'color' subcommand")
        var charChan= utils.settings.get(message.guild, 'channelCharacter');
        var chanCharObj= undefined;

        if(!Boolean(charChan) || !Boolean(chanCharObj=charChan[message.channel.id]) || !Boolean(chanCharObj.character)){
            message.author.send(`Channel ${message.channel.id} doesn't seem to be linked to a character…`)

            return false;
        }

        if(!Boolean(chanCharObj.role)){
            message.author.send(`Error: no registered "${chanCharObj.character}" main ?`);

            return false;
        }

        var role= undefined;
        if(!Boolean(role=message.member.roles.cache.get(chanCharObj.role))){
            message.author.send(`You are not registered as a "${chanCharObj.character}" main…`);

            return false;
        }
        if(Boolean(chanCharObj.color_message)){
            message.channel.messages.fetch(chanCharObj.color_message).then(msg =>{
                message.channel.send(`Color vote for "${role}" role is here: <${msg.url}>`);
            })
            .catch(err => {
                delete chanCharObj['color_message'];
                utils.settings.set(message.guild, 'channelCharacter', charChan);
                _postColorVoteMessage(message.channel, chanCharObj, utils);
            });

            return true;
        }
        else{
            await _postColorVoteMessage(message.channel, chanCharObj, utils)
            utils.settings.set(message.guild, 'channelCharacter', charChan);
        }
    }
    else{
        hereLog("'vanilla' subcommand")
        var chanChar= utils.settings.get(message.guild, 'channelCharacter');
        var stalled= utils.settings.get(message.guild, 'stalledMembers');
        var chanCharObj= undefined;

        if(!Boolean(chanChar) || !Boolean(chanCharObj=chanChar[message.channel.id])|| !Boolean(chanCharObj.character)) return false;
        if(Boolean(stalled) && Boolean(stalled.members) && Boolean(stalled.members.includes(message.author.id))){
            message.author.send("Tu ne peux pas changer de *main* à nouveau cette semaine…");
            return false;
        }

        await __deleteMemberMainRoles(message.member, chanChar);

        let roleName= `${chanCharObj.character} main`;
        var r= chanCharObj.role;
        var role= undefined;
        if(Boolean(r) && (role=message.guild.roles.cache.get(r))){
            message.member.addRole(role);
                    
            utils.settings.set(message.guild, 'stalledMembers', __stallMember(message.author.id,stalled));
            utils.settings.set(message.guild, 'channelCharacter', chanChar);

            return true;
        }
        else{
            message.guild.createRole({
                name: roleName,
                mentionable: true,
                permissions: [],
            })
            .then(
                role => {
                    message.member.addRole(role);
                    
                    utils.settings.set(message.guild, 'stalledMembers', __stallMember(message.author.id,stalled));
                    chanCharObj.role= role.id;
                    utils.settings.set(message.guild, 'channelCharacter', chanChar);
                }
            )

            return true;
        }
        
        
    }

    return true;
}

function cmd_help(cmdObj, clearanceLvl){
    hereLog(`help request by ${cmdObj.msg_obj.author} on ${cmdObj.msg_obj.channel}`)
    let message= cmdObj.msg_obj;

    message.author.send(
        `__**main** command___:\n\n`+
        `\t\`!main\`\n\n`+
        `\tType this command into the character dedicated channel (e.g.: #mario ) to set the character as your "main".\n`+
        `\t⚠️ *You can only perform this action* ***once a week*** *!*\n\n`+
        `\t\`!main none\`\n\n`+
        `\tYou are without a "main"\n`+
        `\t⚠️ *This counts as changing your "main".*\n\n`+
        `\t\`!main here\`\n\n`+
        `\tCheck if the channel you type this into is associated to a character role assignation.\n\n`+
        `\t\`!main color\`\n\n`+
        `\tCast a  vote for the role color (only members acknowledged as 'mains' of the character associated to the channel can vote)`+
        `\t\`!main list\`\n\n`+
        `\tList available characters with their associated channels.`+
        ((clearanceLvl>CLEARANCE_LEVEL.NONE)?
            `\n\n**Admin Roles and/or Control Channels only:**\n`+
            `\t\`!main add [#channel] [character-name]\`\n\n`+
            `\tAdd a character to the collection.\n`+
            `\t⚠️ *The channel must already exist!*\n\n`+
            `\t\`!main unstall\`\n\n`+
            `\tRemove the “ one week limit ” for the currently stalled members\n\n`+
            `\t\`!main clear [#channel]\`\n\n`+
            `\tMentionned channel is no longer associated to a character\n`+
            `\t⚠️ *This will destroy the associated role, if no other channel associated to it, but not the channel*\n\n`+
            `\tYou can, of course, change a member's character by manually changing his role`
        : ''
        )
    );

    return true;
}

const emojis_color= {'⚪':"WHITE",
    '🔴':"RED",
    '🔵':"BLUE",
    '🟤':"DARK_ORANGE",
    '🟣':"PURPLE",
    '🟢':"GREEN",
    '🟡':"GOLD", 
    '🟠':"ORANGE",
    '⚫':"#31373D",
};

function cmd_event(eventName, utils){
    if(eventName==="messageReactionAdd" || eventName==="messageReactionRemove")
    {
        var reaction= arguments[2];
        
        var n= reaction.emoji.name;

        if(!Object.keys(emojis_color).includes(n)) return false;

        var charChan= utils.settings.get(reaction.message.guild, 'channelCharacter');

        return _process_color_vote(reaction.message, emojis_color, charChan);
    }
    else if(eventName==="messageReactionRemoveAll")
    {
        var message= arguments[2];

        var charChan= utils.settings.get(message.guild, 'channelCharacter');

        var charChanObj= undefined;
        if(!Boolean(charChar) || !Boolean(charChanObj=charChan[message.channel.id]) ||
            !Boolean(charChanObj.color_message) || charChanObj.color_message!==message.id
        ){
            return false;
        }

        utils.cache_message_management.untrack(message);
        delete charChan[message.channel.id][color_message];


        utils.settings.set(channel.guild, 'channelCharacter', chanChar);

        return true;
    }
    else if(eventName==="channelDelete"){
        var channel= arguments[2];

        var chanChar= utils.settings.get(channel.guild, 'channelCharacter');
        var char= undefined;
        if(!Boolean(chanChar) || !Boolean(char=chanChar[channel.id])) return false;

        _onChannelMissing(chanChar, channel.guild, channel.id);

        utils.settings.set(channel.guild, 'channelCharacter', chanChar);

        return true;
    }
    else if(eventName==="messageDelete"){
        var message= arguments[2];

        var chanChar= utils.settings.get(message.guild, 'channelCharacter');
        var char= undefined;
        if(!Boolean(chanChar) || !Boolean(char=chanChar[message.channel.id])) return false;

        if(Boolean(char.color_message) && char.color_message===message.id){
            delete char['color_message'];
            utils.cache_message_management.untrack(message);

            utils.settings.set(message.guild, 'channelCharacter', chanChar);
        }

        return true;
    }
    else if(eventName==="roleUpdate"){
        var oldRole= arguments[2];
        var newRole= arguments[3];

        var chanChar= utils.settings.get(newRole.guild, 'channelCharacter');
        if(!Boolean(chanChar)) return false;

        var ch= undefined, channel=undefined;
        if(Boolean(ch=Object.keys(chanChar).find(chan => {
                return ( Boolean(chanChar[chan].role) &&
                    (chanChar[chan].role.id===newRole.id)) ;
            }))
            && Boolean(channel=newRole.guild.channels.cache.get(ch))
        ){
            channel.send(`Associated role (${oldRole.name}→${newRole.name}) has been updated by a higher power.`);

            return true;
        }
        else{
            return false;
        }
    }
    else if(eventName==="roleDelete"){
        var role= arguments[2];

        var chanChar= utils.settings.get(role.guild, 'channelCharacter');
        if(!Boolean(chanChar)) return false;

        var ch= undefined, channel=undefined;
        if(Boolean(ch=Object.keys(chanChar).find(chan => {
                return chanChar[chan].role===role.id;
            }))
            && Boolean(channel=role.guild.channels.cache.get(ch))
        ){
            channel.send(`Associated role (${role.name}) has been deleted by a higher power.`);

            if(Boolean(chanChar[channel.id].role)) delete chanChar[channel.id]['role'];

            var c= undefined;
            if(Boolean(c=chanChar[channel.id].color_message)) {
                channel.messages.fetch(c).then( msg => {
                    msg.delete();
                    utils.cache_message_management.untrack(msg);
                });
                delete chanChar[channel.id]['color_message'];
            }

            utils.settings.set(channel.guild, 'channelCharacter', chanChar);

            if(Boolean(role.members)){
                var stalledObj= utils.settings.get(channel.guild, 'stalledMembers');
                for (var m of role.members.cache){
                    stalledObj= _unstallMember(m.id, stalledObj);
                }
                utils.settings.set(channel.guild, 'stalledMembers', stalledObj);
            }

            return true;
        }
        else{
            return false;
        }
    }
    else if(eventName==="guildMemberUpdate"){
        var oldMember= arguments[2];
        var newMember= arguments[3];

        hereLog("guildMemberUpdate!")
        if (oldMember.roles.cache.size > newMember.roles.cache.size) {
            var suprRoles= oldMember.roles.cache.filter(r => {return !newMember.roles.cache.has(r.id);});
            hereLog(`suprRoles: ${suprRoles.map(r => {return `${r.name} (${r.id})`})}`);
            
            var charChan= utils.settings.get(newMember.guild, 'channelCharacter');
            if(!Boolean(charChan)) return false;
            
            var b= false;
            Object.values(charChan).forEach( cco => {
                var cco_r= undefined, f_role= undefined;
                if(Boolean(cco_r=cco.role) && Boolean(f_role=suprRoles.get(cco_r))){
                    hereLog(`[5] role delete ${f_role.name}(${f_role.id})`);
                    f_role.delete();
                    delete cco['role'];
                    b= true;
                }
            });
            if(b) utils.settings.set(newMember.guild, 'channelCharacter', charChan);

            return b;
        }
        return false;
    }
    else{
        return false;
    }
}

function cmd_guild_clear(guild){
    l_guilds.filter(e => {
        if(e.id!==guild.id) return true;

        return false;
    });
}

function cmd_destroy(utils){
    hereLog("destroy…");
    if(Boolean(unstall_job)){
        delete unstall_job;
        unstall_job= undefined;
    }
}

module.exports.name= "main";
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear, destroy: cmd_destroy};
