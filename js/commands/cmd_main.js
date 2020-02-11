const cron= require('node-cron');

function __deleteMemberMainRoles(member, charChanObj){
    var rms= [];
    member.roles.forEach( (r, id, map) =>{
        var charChanFound= undefined;
        console.log("r "+r.id+","+r.name)
        if( Boolean(charChanFound=Object.values(charChanObj).find(chObj =>{
            console.log(`${chObj.role} === ${r.id}`)
                return Boolean(chObj.role) && (chObj.role===r.id)
            }))
        ){
            console.log("roles "+r.id+","+r.name)
            rms.push(charChanFound);
        }
        rms.forEach(cco => {
            var r= cco.role;
            console.log("found role "+r.id+","+r.name)
            member.removeRole(r);
    
            if(!Boolean(r.members) || r.members.size<=0){
                r.delete();
                delete cco[role];
            }
        });
    });
}

async function _postColorVoteMessage(channel, charChanObj){
    var r= undefined, role= undefined;
    if(!Boolean(charChanObj) || !Boolean(r=charChanObj.role) || !Boolean(role=channel.guild.roles.get(r))){
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
    })

    return true;
}

async function _process_color_vote(message, emojis_colors, charChanObj){
    var charObj= undefined;
    if(!Boolean(charChanObj) || !Boolean(charObj=charChanObj[message.channel.id])) return false;

    var r= undefined, role= undefined;
    if(!Boolean(r= charObj.role) || !Boolean(role=message.guild.roles.get(r))) return false;

    var max= -1, res=undefined, count= -1;
    var emojis= Object.keys(emojis_colors);
    
    for(var reac of message.reactions){
        var mr= reac[1]
        if(emojis.includes(mr.emoji.name)){
            if(mr.count>mr.users.size) await mr.fetchUsers();
            count=0;
            mr.users.forEach(u => {
                var member=message.guild.members.get(u.id);
                if(Boolean(member) && Boolean(member.roles.get(r))){
                    ++count;
                }
            })
        }
        if(count>max){
            max= count;
            res= mr.emoji.name;
        }
    }

    console.log("max "+max+"; res "+res+"; c ."+emojis_colors[res]);

    if(!Boolean(res)) return false;
    role.setColor(emojis_colors[res]);

    return true;
}

function __stallMember(id, stalledObj){
    var stalled= stalledObj;
    if(!Boolean(stalled)) stalled={};

    if(!Boolean(stalled.day+1)) stalled.day= (new Date()).getDay();
    
    if(!Boolean(stalled.members)) stalled.members=[id];
    else if(!Boolean(stalled.members.includes(id))) stalled.members.push(id);

    return stalled;
}

function _cache_maintenance(guilds, settings){
    guilds.forEach(g =>{
        var chanChar= settings.get(g, "channelCharacter");
        if(Boolean(chanChar)){
            Object.keys(chanChar).forEach( chan => {
                var charObj= chanChar[chan];
                if(Boolean(charObj)){
                    var channel= undefined;
                    if(Boolean(charObj.color_message) && Boolean(channel= g.channels.get(chan))){
                        channel.fetchMessage(charObj.color_message);
                    }
                }
            });
        }
    })
}

function _onChannelMissing(charChan, guild, chanID){
    var r= undefined, role=undefined;
    if(Boolean(r=char.role) && Boolean(role=guild.roles.get(r))){
        role.delete();
    }

    delete charChan[chanID];
}



var l_guilds= [];

function cmd_init(utils){
    console.log(`-> sup?`);

    cron.schedule('0 0 * * 1', () => {
        console.log("every monday at 00:00 ?");

        l_guilds.forEach(g => {
            utils.settings.set(guild,'stalledMembers', {});
        });
    })
}

function cmd_init_per_guild(utils, guild){
    l_guilds.push(guild);
    console.log(`cmd_init_per_guild(${guild.id})`);

    charChan= utils.settings.get(guild, 'channelCharacter');
    if(Boolean(charChan)){
        console.log("wiiii")
        Object.keys(charChan).forEach( chan => {
            console.log(`chan ${chan}`)
            var cco= undefined;
            var channel= undefined;
            if(Boolean(chan) && Boolean(cco=charChan[chan])){
                if(Boolean(cco.color_message)){
                    if(Boolean(channel=guild.channels.get(chan))){
                        console.log(`channel.fetchMessage(${cco.color_message})`);
                        channel.fetchMessage(cco.color_message).then(msg =>{
                            _process_color_vote(msg, emojis_color, charChan);
                        })
                        .catch(err => {
                            console.log("nooooooo "+err)
                            delete (cco['color_message']);
                            utils.settings.set(guild, 'channelCharacter', charChan);
                        });
                    }
                    else{
                        _onChannelMissing(charChan, guild, chan);
                    }
                }
                if(Boolean(cco.role) && !Boolean(guild.roles.get(cco.role))){
                    delete cco['role'];
                }
                console.log("huh?")
                utils.settings.set(guild, 'channelCharacter', charChan);
            }
        });
    }
}

async function cmd_main(cmdObj, isAdmin, utils){
    console.log(`ah the 'main' command; ${(isAdmin)?"My lord": "you not admin though…"}`);

    let args= cmdObj.args;
    let message= cmdObj.msg_obj
    if(args[0]==="add" && isAdmin){
        if( args.length<3 || !Boolean(args[1].match(/[A-Za-z0-9\ \-\.]+/))
            || !Boolean(args[2].match(/<#[0-9]+>/))
        ){
            message.author.send("Format:\n\t`!main add [character-name] [#channel]`")
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

        chanChar[chan.id]= {character: args[1], role: undefined};
        utils.settings.set(message.guild, 'channelCharacter', chanChar);

        return true;
    }
    else if(args[0]==="clear" && isAdmin){
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
        if(Boolean(chanChar[chan.id].role) && Boolean(role=chan.guild.roles.get(chanChar[chan.id].role))){
            str+=`\nDeleting '${role.name}' role…`;
            role.delete();
        }
        if(Boolean(chanChar[chan.id].color_message)){
            chan.fetchMessage().then(msg => {
                msg.delete();
            });
        }
        delete chanChar[chan.id];

        utils.settings.set(message.guild, 'channelCharacter', chanChar);

        message.author.send(str);

        return true;
    }
    else if(args[0]==="unstall" && isAdmin){
        return utils.settings.set(message.guild,'stalledMembers', {});
    }
    else if(args[0]==="here"){
        var chanChar= utils.settings.get(message.guild, 'channelCharacter');
        var charObj= undefined;

        if(!Boolean(chanChar) || !Boolean(charObj=chanChar[message.channel.id]) || !Boolean(charObj.character)){
            message.author.send(`The ${message.channel} channel is not associated to any character…`)
            return false;
        }

        var r= undefined;
        message.author.send(`The ${message.channel} channel is for ${chanChar[message.channel.id].character} players.\n`+
            ((Boolean(charObj.role) && Boolean(r=message.guild.roles.get(charObj.role)))? `\tAssociated role is: ${r}` : '')
        );

        return true;
    }
    else if(args[0]==="list"){
        return false;
    }
    else if(args[0]==="none"){
        var chanChar= utils.settings.get(message.guild, 'channelCharacter');
        if(!Boolean(chanChar)) return true;

        var stalled= utils.settings.get(message.guild, 'stalledMembers');
        if(Boolean(stalled) && Boolean(stalled.members) && Boolean(stalled.members.includes(message.author.id))){
            message.author.send("Tu ne peux pas changer de *main* à nouveau cette semaine…");
            return false;
        }

        __deleteMemberMainRoles(message.member, chanChar);

        utils.settings.set(message.guild, 'stalledMembers', __stallMember(message.author.id, stalled));
        utils.settings.get(message.guild, 'channelCharacter', chanChar);

        return true;
    }
    else if(args[0]==="color"){
        console.log("huh");
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
        if(!Boolean(role=message.member.roles.get(chanCharObj.role))){
            message.author.send(`You are not registered as a "${chanCharObj.character}" main…`);

            return false;
        }
        console.log("what? "+chanCharObj.color_message)
        if(Boolean(chanCharObj.color_message)){
            console.log("phew…")
            message.channel.fetchMessage(chanCharObj.color_message).then(msg =>{
                message.channel.send(`Color vote for "${role}" role is here: <${msg.url}>`);
            })
            .catch(err => {
                delete chanCharObj['color_message'];
                utils.settings.set(message.guild, 'channelCharacter', charChan);
                _postColorVoteMessage(message.channel, chanCharObj);
            });

            return true;
        }
        else{
            await _postColorVoteMessage(message.channel, chanCharObj)
            utils.settings.set(message.guild, 'channelCharacter', charChan);
        }
    }
    else{
        console.log("hey")
        var chanChar= utils.settings.get(message.guild, 'channelCharacter');
        var stalled= utils.settings.get(message.guild, 'stalledMembers');
        var chanCharObj= undefined;

        if(!Boolean(chanChar) || !Boolean(chanCharObj=chanChar[message.channel.id])|| !Boolean(chanCharObj.character)) return false;
        console.log("ho")
        if(Boolean(stalled) && Boolean(stalled.members) && Boolean(stalled.members.includes(message.author.id))){
            message.author.send("Tu ne peux pas changer de *main* à nouveau cette semaine…");
            return false;
        }

        console.log(`stalled: ${stalled}`);

        __deleteMemberMainRoles(message.member, chanChar);

        let roleName= `${chanCharObj.character} main`;
        var r= chanCharObj.role;
        var role= undefined;
        if(Boolean(r) && (role=message.member.roles.get(r.id))){
            message.member.addRole(role);
                    
            utils.settings.set(message.guild, 'stalledMembers', __stallMember(message.author.id,stalled));
            utils.settings.set(message.guild, 'channelCharacter', chanChar);

            return true;
        }
        else{
            message.guild.createRole({
                name: roleName,
                mentionable: true,
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

function cmd_help(cmdObj, isAdmin){
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
        // `\t\`!main list\`\n\n`+
        // `\tList available characters with their associated channels.`+
        ((isAdmin)?
            `\n\n**Admin only:**\n`+
            `\t\`!main add [character-name] [#channel]\`\n\n`+
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
};

function cmd_event(eventName, utils){
    if(eventName==="messageReactionAdd" || eventName==="messageReactionRemove")
    {
        var reaction= arguments[2];
        console.log("ah")
        
        var n= reaction.emoji.name;

        if(!Object.keys(emojis_color).includes(n)) return false;

        var charChan= utils.settings.get(reaction.message.guild, 'channelCharacter');

        return _process_color_vote(reaction.message, emojis_color, charChan);
    }
    else if(eventName==="messageReactionRemoveAll")
    {
        var message= arguments[2];

        var charChan= utils.settings.get(message.guild, 'channelCharacter');

        if(!Boolean(charChar) || !Boolean(charChan[message.channel.id])) return false;

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

        console.log("allo?")
        if(Boolean(char.color_message) && char.color_message===message.id){
            console.log("hum????")
            delete char['color_message'];

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
                return chanChar[chan].role.id===newRole.id;
            }))
            && Boolean(channel=newRole.guild.channels.get(ch))
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
            && Boolean(channel=role.guild.channels.get(ch))
        ){
            channel.send(`Associated role (${role.name}) has been deleted by a higher power.`);

            if(Boolean(chanChar[channel.id].role)) delete chanChar[channel.id]['role'];

            var c= undefined;
            if(Boolean(c=chanChar[channel.id].color_message)) {
                channel.fetchMessage(c).then( msg => {
                    msg.delete();
                });
                delete chanChar[channel.id]['color_message'];
            }

            utils.settings.set(channel.guild, 'channelCharacter', chanChar);

            return true;
        }
        else{
            return false;
        }
    }
    else if(eventName==="messageCacheThreshold"){
        var cacheSpaceRemaining= arguments[2];
        _cache_maintenance(l_guilds, utils.settings);
        console.log("remaining: "+cacheSpaceRemaining);
    }
    else{
        return false;
    }
}

function getTreshold(){
    return 5;
}

module.exports.name= "main";
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event};
module.exports.getCacheWarnTreshold= getTreshold;
