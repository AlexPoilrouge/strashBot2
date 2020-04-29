

const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;

let hereLog= (...args) => {console.log("[cmd_welcome]", ...args);};


function __isSimpleEmoji(char){
    return ( Boolean(
                char.match(
                    /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/g
                )
            )
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

function __isRoleMention(str, roleMentionCollection){
    var res= (/^<\@\&([0-9]{18})>$/g).exec(str);

    if( !Boolean(res) || res.length<2 || !Boolean(res[1].match(/([0-9]){18}/g) )
    )
    {
        return false;
    }

    var id= res[1];

    return Boolean(roleMentionCollection.get(id));
}


function cmd_init(utils){
    hereLog("init…");
}


async function cmd_init_per_guild(utils, guild){
    hereLog(`cmd init for guild ${guild}`);

    var w_chan_id= utils.settings.get(guild, 'welcome_channel');
    if(Boolean(w_chan_id) && !Boolean(guild.channels.get(w_chan_id))){
        utils.settings.remove(guild, 'welcome_channel');
        hereLog(`Non-existing welcome channel ${w_chan_id}…`);
    }

    var w_react_roles= utils.settings.get(guild, 'reaction_roles');
    if(Boolean(w_react_roles)){
        var b= false;
        Object.keys(w_react_roles).forEach(emoji_txt =>{
            if(!__isSimpleEmoji(emoji_txt) && !__isCustomEmoji(emoji_txt, utils.getBotClient())){
                delete w_react_roles[emoji_txt];
                hereLog(`"${emoji_txt} not recognize as an existing emoji…`);
                b= true;
            }
            else{
                var role_id= w_react_roles[emoji_txt];
                if(!Boolean(role_id) || !Boolean(guild.roles.get(role_id))){
                    delete w_react_roles[emoji_txt];
                    hereLog(`In association "${emoji_txt} => ${role_id}": unrecognized role…`);
                    b= true;
                }
            }
        });
        if(b){
            utils.settings.set(guild, 'reaction_roles', w_react_roles);
        }
    }
}


async function cmd_main(cmdObj, clearanceLvl, utils){
    let args= cmdObj.args;

    if(clearanceLvl<=CLEARANCE_LEVEL.NONE){
        return false;
    }

    if(args[0]==="text"){
        if(args[1]==="clear"){
            utils.settings.remove(cmdObj.msg_obj.guild, 'welcome_text');

            return true;
        }

        var text= args.slice(1).join(' ');
        if(Boolean(text)){
            utils.settings.set(cmdObj.msg_obj.guild, 'welcome_text', text);

            return true;
        }

        return false;
    }
    else if(args[0]==="reactions-roles"){
        let message= cmdObj.msg_obj;

        if(args[1]==="clear"){
            utils.settings.remove(message.guild, 'reaction_roles');

            return true;
        }


        var r_obj={};

        var w_react_roles= utils.settings.get(message.guild, 'reaction_roles');

        let arg_l= args.length;
        var i=1;
        str= '';
        if(arg_l>2){
            do{
                if( (__isSimpleEmoji(args[i]) || __isCustomEmoji(args[i], utils.getBotClient()))
                    && Boolean(message.mentions) && Boolean(message.mentions.roles) 
                    && __isRoleMention(args[i+1], message.mentions.roles) )
                {
                    var id_r= (/^<\@\&([0-9]{18})>$/g).exec(args[i+1])[1];
                    r_obj[args[i]]= id_r;
                    str+= `\t${args[i]} => ${(message.mentions.roles.get(id_r)).name}\n`;
                }

                i+=2;
            }
            while((i+1)<arg_l);
        }

        if(str.length<=0){
            message.member.send("[welcome command] Fail to set reaction to roles. Format is:\n\t`!welcome reactions-roles [[:emoji: @rolemention] …]`");
            return false;
        }
        else{
            if(Boolean(w_react_roles)){
                Object.keys(w_react_roles).forEach(emoji_txt =>{
                    if(!Boolean(r_obj[emoji_txt])){
                        r_obj[emoji_txt]= w_react_roles[emoji_txt];
                    }
                });
            }
            utils.settings.set(message.guild, 'reaction_roles', r_obj);

            message.member.send("[welcome command] Able to link the following emotes for reaction to the following roles:\n"+str);
            return true;
        }
    }
    else if(args[0]==="channel"){
        let message= cmdObj.msg_obj;

        if(args[1]==="clear"){
            utils.settings.remove(message.guild, 'welcome_channel');

            return true;
        }
        var channel= undefined
        if(!Boolean(message.mentions) || !Boolean(message.mentions.channels) || !Boolean(channel=message.mentions.channels.first())){
            message.member.send("[welcome command] No mention to any channel found… Format is:\n\t`!welcome channel #channelmention`");

            return false;
        }

        utils.settings.set(cmdObj.msg_obj.guild, 'welcome_channel', channel.id);

        return true;
    }
    else if(args[0]==="what"){
        var message= cmdObj.msg_obj;
        var w_chan_id= utils.settings.get(message.guild, 'welcome_channel');
        var w_reac_roles= utils.settings.get(message.guild, 'reaction_roles');
        var w_text= utils.settings.get(message.guild, 'welcome_text');

        str= "";
        var w_chan= undefined;
        if(!Boolean(w_chan_id)){
            str+="- Welcome channel is not set yet…\n";
        }
        else if(!Boolean(w_chan=message.guild.channels.get(w_chan_id))){
            str+="- Welcome channel is not availabe anymore (deleted?)…\n";
        }
        else{
            str+=`- Welcome channel is set to \"*${w_chan.name} (${w_chan})*\"\n`;
        }

        if(!Boolean(w_reac_roles)){
            str+="- No association of any role to any reaction has been set yet…\n"
        }
        else{
            var b= false, t_str="";
            Object.keys(w_reac_roles).forEach(emoji_txt =>{
                if(!__isCustomEmoji(emoji_txt,utils.getBotClient()) && !__isSimpleEmoji(emoji_txt)){
                    t_str+= "\t[unavailble emoji] => ";
                }
                else{
                    t_str+=`\t${emoji_txt} => `;
                    b= true;
                }

                var role_id= w_reac_roles[emoji_txt];
                var role= undefined;
                if(!Boolean(role_id) || !Boolean(role=message.guild.roles.get(role_id))){
                    t_str+= "[unavailabe role]\n";
                }
                else{
                    t_str+= `\"${role.name} (${role.id})\"\n`;
                    b= true;
                }
            });
            if(b){
                str+= "- The following reactions will be linked to the following roles on the \"welcome channel\":\n";
                str+= t_str;
            }
            else{
                str+= "- No available association has been foud…\n"
            }
        }
        if(!Boolean(w_text) || w_text.length<=0){
            str+= "- No \"welcome message\" has been set yet…";
        }

        if(Boolean(str) && str.length<=0){
            message.member.send("No welcome message, no welcome channel, and no reactions-roles association has been set…")
                .catch(err=>{hereLog(err);});
        }
        else{
            if(Boolean(w_text) && w_text.length>0){
                str+= "- The \"welcome message\" is the following: ";
                message.member.send(str).then( msg =>{
                    message.member.send( "\t« "+w_text+" »").catch(err=>{
                        hereLog(err);
                    });
                }).catch(err => {
                    hereLog(err);
                });
            }
            else{
                message.member.send(str).catch(err=>{hereLog(err);});
            }
        }

        return true;
    }

    return false;
}


function cmd_help(cmdObj, clearanceLvl){
    hereLog(`help request by ${cmdObj.msg_obj.author} on ${cmdObj.msg_obj.channel}`);
    if(clearanceLvl<=CLEARANCE_LEVEL.NONE) return false;

    let message= cmdObj.msg_obj;

    message.author.send(
        `__**welcome** command family___:\n\n`+
        `**Admin Roles and/or Control Channels only:**\n\n`+
        `\t\`!welcome text <The welcome message text…>\`\n\n`+
        `\tDefines the welcome message that I will send via PM to any newcomer on the server.\n\n`+
        `\t\`!welcome text clear\`\n\n`+
        `\tDeletes the setup welcome message…\n\n`+
        `\t\`!welcome reactions-roles < < <emoji> <@rolemention> > … >\`\n\n`+
        `\tSets which reaction is linked to which role attribution for newcomers that posts in the welcome channel.\n\n`+
        `\t\tExemple: \`!welcome reactions-roles \`😎\` @coolGuys\`\n\n`+
        `\t\`!welcome reactions-roles clear\`\n\n`+
        `\tClears all of the existing reactions to roles associations…\n\n`+
        `\t\`!welcome channel <#channelMention>\`\n\n`+
        `\tSets which channel is considered as the 'welcome channel' for newcommers to post to.\n\n`+
        `\t\`!welcome channel clear\`\n\n`+
        `\tThe previously set channel as the 'welcome channel', isn't anymore…\n\n`+
        `\t\`!welcome what\`\n\n`+
        `\tSums the current settings of the welcome process (welcome channel, reaction-roles assocation, etc.)\n\n`
    );

    return true;
}

var _reaction_add_lock= false;

function cmd_event(eventName, utils){
    if(eventName==="guildMemberAdd"){
        var member= arguments[2];
        hereLog(`welcome ${member.nickname}`);

        var msg= utils.settings.get(member.guild, 'welcome_text');
        if(Boolean(msg)){
            member.send(msg);
        }
    }
    else if(eventName==="message"){
        var message= arguments[2];

        let w_chan_id= utils.settings.get(message.guild, 'welcome_channel');
        let w_react_roles= utils.settings.get(message.guild, 'reaction_roles');
        if(Boolean(w_chan_id) && message.channel.id===w_chan_id && Boolean(w_react_roles) &&
            !Boolean(Object.values(w_react_roles).find(r_id => {return Boolean(message.member.roles.get(r_id));}))
        ){
            if(message.content.length<42){
                message.react('🙄').catch(err => {hereLog(err);});
                message.member.send(`[${message.guild.name}] Hey, ton message de présentation dans #${message.channel.name} doit faire au moins 42 caractères, `+
                                `s'il te plait (at least 42 characters for a presentation message, please). 🙏`);
            }
            else{
                var reacts= Object.keys(w_react_roles);
                reacts.forEach(react =>{
                    if(__isCustomEmoji(react, utils.getBotClient())){
                        var id_e= (/^<\:([a-zA-Z\-_0-9]+)\:([0-9]{18})>$/g).exec(react)[2];
                        var react= utils.getBotClient().emojis.get(id_e);
                    }
                    message.react(react).catch(err => {hereLog(err);});
                });
            }
        }
    }
    else if(eventName==="messageReactionAdd"){
        var messageReaction= arguments[2];
        var message= messageReaction.message;
        var user= arguments[3];

        var w_react_roles= utils.settings.get(message.guild, 'reaction_roles');
        if(Boolean(w_react_roles)){
            var roles= Object.values(w_react_roles);
            var give_role_id= undefined, give_role= undefined;
            if( !_reaction_add_lock && (message.author.id===user.id) &&
                !Boolean(message.member.roles.find(r => {return roles.includes(r.id);})) &&
                Boolean(give_role_id=w_react_roles[messageReaction.emoji.toString()]) &&
                Boolean(give_role=message.guild.roles.get(give_role_id))
            ){
                _reaction_add_lock= true;
                message.member.addRole(give_role).catch(err => {hereLog(err);})
                    .finally(_reaction_add_lock=false);
            }
        }
    }
    else if(eventName==="channelDelete"){
        var channel= arguments[2];

        var w_chan_id= utils.settings.get(channel.guild, 'welcome_channel');
        if(Boolean(w_chan_id) && w_chan_id===channel.id){
            utils.settings.remove(channel.guild, "welcome_channel");
            hereLog(`Deleted channel "${channel.name}"`);
        }
    }
    else if(eventName==="roleDelete"){
        var role= arguments[2];
        var w_react_roles= utils.settings.get(role.guild, "reaction_roles");
        var emoji_txt= undefined;
        if(Boolean(w_react_roles) && Boolean(emoji_txt=Object.keys(w_react_roles).find(e=> {return w_react_roles[e]===role.id;}))){
            hereLog(`In association "${emoji_txt} => ${w_react_roles[emoji_txt]}", role got deleted…`);
            delete w_react_roles[emoji_txt];
            utils.settings.set(role.guild, "reaction_roles", w_react_roles);
        }
    }
    else if(eventName==="emojiDelete"){
        var guildEmoji= arguments[2];
        var w_react_roles= utils.settings.get(guildEmoji.guild, "reaction_roles");
        if(Boolean(w_react_roles) && Boolean(w_react_roles[guildEmoji.toString()])){
            hereLog(`In association "${guildEmoji.toString()} => ${w_react_roles[guildEmoji.toString()]}", emoji got deleted…`);
            delete w_react_roles[emoji_txt];
            utils.settings.set(guildEmoji.guild, "reaction_roles", w_react_roles);
        }
    }
    else if(eventName==="emojiUpdate"){
        var oldEmoji= arguments[2];
        var newEmoji= arguments[3];

        var w_react_roles= utils.settings.get(newEmoji.guild, "reaction_roles");
        var r_id= undefined;
        if(Boolean(w_react_roles) && Boolean(oldEmoji.toString()!==newEmoji.toString()) &&
            Boolean(r_id=w_react_roles[oldEmoji.toString()])
        ){
            delete w_react_roles[oldEmoji.toString()];
            w_react_roles[newEmoji.toString()]= r_id;
            hereLog(`New association "${newEmoji.toString()} => ${r_id}", due to emoji update…`);
            utils.settings.set(newEmoji.guild, "reaction_roles", w_react_roles);
        }
    }
}


function cmd_guild_clear(guild){}



module.exports.name= "welcome";
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};