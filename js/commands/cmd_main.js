

function __deleteMemberMainRoles(member, charChanObj){
    var rms= []
    member.roles.forEach( (r, id, map) =>{var chName= r.name;
        if(chName.endsWith(' main')){
            chName= rName.slice(0, -5);

            if(Boolean(charChanObj) && Object.values(charChan).includes(chName)){
                rms.push(r);
            }
        }
    });

    rms.forEach(r => {
        member.removeRole(r);

        if(!Boolean(r.members) || r.members.size<0){
            r.delete();
        }
    });
}

function __roleRelevanceCheckRegardingAssociation(roleName, guild, charChanObj){
    var role= undefined;
    if( !Object.values(charChanObj).includes(char)
    && Boolean(role= guild.roles.find(r => {return r.name===roleName;}))
    ){
        role.delete();

        return false;
    }

    return true;
}



function cmd_init(utils){
    console.log(`-> sup?`);
}

function cmd_main(cmdObj, isAdmin, utils){
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

        if(Boolean(chanChar[chan.id])){
            message.author.send(`Channel ${chan} is already dedicated to ${chanChar[chan.id]}`);
            return false;
        }

        chanChar[chan.id]= args[1];
        utils.settings.set(message.guild, 'channelCharacter', chanChar);

        return true;
    }
    else if(args[0]==="clear" && isAdmin){
        if( args.length<3 || !Boolean(args[1].match(/<#[0-9]+>/))){
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
            utils.settings.set(message.guild, 'channelCharacter', {});
            chanChar= utils.settings.get(message.guild, 'channelCharacter');
        }

        var char= undefined;
        if(!Boolean(char=chanChar[chan.id])){
            message.author.send(`Channel ${chan}: nothing to do`);
            return true;
        }

        delete chanChar[chan.id];
        var str=`Channel ${chan} unassociated from ${char}…`;
        if(!__roleRelevanceCheckRegardingAssociation(`${char} main`, channel.guild, charChan)){
            str+=`\nDeleting '${char} main' role…`;
        }

        utils.settings.set(message.guild, 'channelCharacter', chanChar);

        author.send(str);

        return true;
    }
    else if(args[0]==="unstall" && isAdmin){
        return utils.settings.set(message.guild,'stalledMembers', []);
    }
    else if(args[0]==="here"){
        var chanChar= utils.settings.get(message.guild, 'channelCharacter');

        if(!Boolean(chanChar) || !Boolean(chanChar[message.channel.id])){
            message.author.send(`The ${message.channel} channel is not associated to any character…`)
            return false;
        }

        message.author.send(`The ${message.channel} channel is for ${chanChar[message.channel.id]} players`);

        return true;
    }
    else if(args[0]==="list"){
        return false;
    }
    else if(args[0]==="none"){
        var stalled= utils.settings.get(message.guild, 'stalledMembers');
        if(Boolean(stalled) && Boolean(stalled.includes(message.author.id))){
            message.author.send("Tu ne peux pas changer de *main* à nouveau cette semaine…");
            return false;
        }

        this.__deleteMemberMainRoles(message.member, chanChar);

        if(!Boolean(stalled)){
            utils.settings.set(message.guild, 'stalledMembers', []);
        }
        else{
            stalled.push(message.author.id)
            utils.settings.set(message.guild, 'stalledMembers', stalled);
        }

        return true;
    }
    else{
        var chanChar= utils.settings.get(message.guild, 'channelCharacter');
        var stalled= utils.settings.get(message.guild, 'stalledMembers');

        if(!Boolean(chanChar) || !Boolean(chanChar[message.channel.id])) return false;
        if(Boolean(stalled) && Boolean(stalled.includes(message.author.id))){
            message.author.send("Tu ne peux pas changer de *main* à nouveau cette semaine…");
            return false;
        }

        this.__deleteMemberMainRoles(message.member, chanChar);

        let roleName= `${chanChar[message.channel.id]} main`;
        var role= undefined;
        if(Boolean(role= message.guild.roles.find(r => {return r.name === roleName}))){
            message.member.addRole(role);

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
                    
                    if(!Boolean(stalled)){
                        utils.settings.set(message.guild, 'stalledMembers', []);
                    }
                    else{
                        stalled.push(message.author.id)
                        utils.settings.set(message.guild, 'stalledMembers', stalled);
                    }
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
        // `\t\`!main list\`\n\n`+
        // `\tList available characters with their associated channels.`+
        ((isAdmin)?
            `\n\n**Admin only:**\n`+
            `\t\`!main add [character-name] [#channel]\`\n\n`+
            `\tAdd a character to the collection.\n`+
            `\t⚠️ *The channel must already exist!*\n\n`+
            `\t\`!main unstall\`\n\n`+
            `\tRemove the “ one week limit ” for the currently stalled members\n`+
            `\t\`!main clear [#channel]\`\n\n`+
            `\tMentionned channel is no longer associated to a character\n`+
            `\t⚠️ *This will destroy the associated role, if no other channel associated to it, but not the channel*\n\n`+
            `\tYou can, of course, change a member's character by manually changing his role`
        : ''
        )
    );

    return true;
}

function cmd_event(eventName, utils){
    if(eventName==="channelDelete"){
        var channel= arguments[2];

        var chanChar= utils.settings.get(channel.guild, 'channelCharacter');
        var char= undefined;
        if(!Boolean(chanChar) || !Boolean(char=chanChar[channel.id])) return false;

        delete(chanChar[channel.id]);

        __roleRelevanceCheckRegardingAssociation(`${char} main`, channel.guild, chanChar);

        utils.settings.set(channel.guild, 'channelCharacter', chanChar);

        return true;
    }
    else if(eventName==="roleDelete"){
        var role= arguments[2];

        if(!Boolean(role.name.match(/^[A-Za-z0-9\ \-\.]+ main$/))) return false;

        var chanChar= utils.settings.get(channel.guild, 'channelCharacter');
        if(!Boolean(chanChar)) return false;

        var chl= [];
        Object.keys(chanChar).forEach(key =>{
            if(chanChar[key]===role.name.slice(0,-5)){
                chl.push(key);    
            }
        });

        chl.forEach(chid => {
            delete chanChar[chid];
        })

        utils.settings.get(channel.guild, 'channelCharacter', chanChar);

        return true;
    }
    else{
        return false;
    }
}

module.exports.name= "main";
module.exports.command= {init: cmd_init, main: cmd_main, help: cmd_help, event: cmd_event};
