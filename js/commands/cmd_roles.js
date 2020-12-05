const { util } = require('config');
const { fstat } = require('fs');




let hereLog= (...args) => {console.log("[cmd_roles]", ...args);};


//CLEARANCE LEVEL:
// A particular member can have 3 different clearance level:
//  - CLEARANCE_LEVEL.NONE = 0 = 0b000 - no clearance level
//  - CLEARANCE_LEVEL.ADMIN_ROLE = 0b010 = 2  - member is recognized admin
//  - CLEARANCE_LEVEL.MASTER_ID = 0b100 = 4  - member is the bot's master
// A fourth level exists, used to contextualized a message:
//  - CLEARANCE_LEVEL.CONTROL_CHANNEL = 1 = 0b001 - posted in context of a 'control channel'
// Ofc, these level are stackable:
//  A clearance level of 7:
//    7 = 1+2+4 = 0b111 = CONTROL_CHANNEL+ADMIN_ROLE+MASTER_ID
//      is obtained when the master, who here is also an admin, posted a message in a
//      control channel
const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;


function __identifyChannel(str, channelMentionCollection){
    var res= (/^<\#([0-9]{18})>$/g).exec(str);

    if( !Boolean(str) || !Boolean(res) || res.length<2 || !Boolean(res[1].match(/([0-9]){18}/g) )
    )
    {
        return false;
    }

    var id= res[1];

    return channelMentionCollection.get(id);
}


function __identifyRoleMention(str, roleMentionCollection){
    var res= (/^<\@\&([0-9]{18})>$/g).exec(str);

    if( !Boolean(str) || !Boolean(res) || res.length<2 || !Boolean(res[1].match(/([0-9]){18}/g) )
    )
    {
        return false;
    }

    var id= res[1];

    return roleMentionCollection.get(id);
}

function __identifyEmoji(str, guild, utils){
    let simpleEmojiRegex= /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/g;
    let customEmojiRegex= /^<\:([a-zA-Z\-_0-9]+)\:([0-9]{18})>$/;

    var _id= undefined;
    var emojiType= undefined;
    try{
        emojiType= ( Boolean(str) )? (
                Boolean(str.match(simpleEmojiRegex))? {type: "SIMPLE", emoji: str, text: str} :
                    ( Boolean(str) && Boolean(_tmp=str.match(customEmojiRegex))? 
                            {   type: "CUSTOM",
                                emoji: utils.getBotClient().emojis.cache.get(_id[2]),
                                text: str
                            }
                        : undefined) 
            ) : undefined;
    }
    catch(err){
        emojiType= undefined;
    }

    return emojiType;
}

//when the module is loaded, during the bot's launch,
//this function is called.
//  utils is an object provided by the bot, constructed as follow:
//    utils= {
//     settings: {
//        set: function (guild, field, value) ,
//        get: function (guild, field),
//        remove: function (guild, field)
//     },
//     getMemberClearanceLevel: function(member),
//     getBotClient: function(),
//     cache_message_management:{
//        keepTrackOf: function (msg),
//        untrack: function (msg),
//        isTracked: function (msg),
//     },
//     getMasterID: function()
//    }
//  Where:
//    'utils.settings.get(guild, field)' is a function you need to call when
//      you whant to access an saved object (json formatable) in this module's
//      persitent data.
//      Example: onlineRole= utils.settings.get(guild, 'online-role');
//    'utils.settings.set(guild, field, value)' is a function you need to call when
//      you want to save data (json formatable object) in this module's persistent
//      data.
//      Example: utils.settings.set(guild, 'number-of-cats', 5);
//    'utils.remove(guild, field)' is a function you need to call when you want to remove
//       a previously saved object of this module's persitent data.
//       Example: utils.remove(guild, 'online-role');
//    'utils.getMemberClearanceLevel(member)' is a function you need to call in order to know
//       the 'clearance level' of a particular guild member. (see below for clearance level)
//    'utils.getBotClient' return the discord bot client.
//    'utils.cache_message_management.keepTrackOf(msg)' is a function to want to call when you
//      want to make sure a message is kept in the cache indefinetely. This is usefull, for
//      example, when you are tracking reaction on a given message indefinetly, keep it from
//      eventually being thrown out of the cache, and not recieving any notifications about this
//      message anymore.
//    'utils.cache_message_management.untrack(msg)' is a function to call when you no longer need
//      for a particular message to being kept in cache.
//    'utils.getMasterID' returns the bot's master's user ID.
function cmd_init(utils){}

//this function is called, during bot's launch (after 'cmd_init'),
//once per guild the bot is part of.
//It is the opprtunity, for example, to verify the data's integrity
//and coherence with the current state of the guild…
async function cmd_init_per_guild(utils, guild){
    var data_msg_react_role= utils.settings.get(guild,'msg_react_role')
    if(Boolean(data_msg_react_role)){
        for(var ch_msg_id in data_msg_react_role){
            let ch_id= ch_msg_id.split('_')[0]
            let msg_id= ch_msg_id.split('_')[1]

            let channel= guild.channels.cache.get(ch_id)
            var msg= undefined;
            try{
                msg= (await channel.messages.fetch(msg_id))
            }
            catch(err){
                msg= undefined
            }

            var obj= undefined
            if(Boolean(msg) && Boolean(obj=data_msg_react_role[ch_msg_id]) && Boolean(obj.roles)){
                obj= data_msg_react_role[ch_msg_id]

                for(var em_txt in obj.roles){
                    try{
                        msg.react(em_txt)
                    }
                    catch(error){
                        hereLog(`[cmd_init_per_guild][${guild.name}] couldn't react "${em_txt}" to message ${msg.id}: ${error.message}`)
                    }
                }
            }
        }
    }
}



//this function is called when a command registered by this module
//(see end of this file) has been called in a guild.
// 'clearanceLvl' is the clearance level in wich this command has been posted
// 'cmdObj' is an object provided by the bot, constructed as follow:
//   cmdObj={
//      'command',
//      'args',
//      'msg_obj'
//   }
//  Where:
//   'cmdObj.command' is the string that constitutes the command called.
//   'cmdObj.args' is an array containing each remaining words of the command
//   'cmdObj.msg_obj' is the discord message object associated with the command
//     (see https://discord.js.org/#/docs/main/stable/class/Message)
async function cmd_main(cmdObj, clearanceLvl, utils){
    let command= cmdObj.command;
    let message= cmdObj.msg_obj;

    var args= cmdObj.args;

    if(clearanceLvl<CLEARANCE_LEVEL.CONTROL_CHANNEL) return false

    let _message_extract= (idx=0) =>{
        let id_arg= args[idx]
        var msg= undefined, match= undefined
        if(Boolean(id_arg.match(/^[0-9]{15,21}$/))){
            msg= (await message.channel.fetch(id_arg))
        }
        else if(Boolean(match=id_arg.match(/([0-9]{15,21})[\/\_\-\\\:\.\s]([0-9]{15,21})$/))){
            var channel= message.guild.channels.cache.get(match[1])
            if(Boolean(channel)){
                msg= (await channel.fetch(match[2]))
            }
        }
        else if(Boolean(match=id_arg.match(/^https?\:\/\/discord\.com\/channels\/([0-9]{15,21})\/([0-9]{15,21})\/([0-9]{15,21})$/))){
            if(message.guild.id===match[1]){
                var channel= message.guild.channels.cache.get(match[2])
                if(Boolean(channel)){
                    msg= (await channel.fetch(match[3]))
                }
            }
        }

        return msg
    }

    //!post-role-message [exlcusive] #channel @role :emote1: [ [@role2 :emote2: … ]] "bla bla"
    if(command==="post-role-message"){
        if(args.length<4){
            message.author.send(`[${message.guild.name}] \`!${command}\` not enought arguments… Expected format:\n\t`
                                `\`!${command}\ [exclusive] #channel @role :server_emote: message…\``
            )

            return false;
        }

        var exclusive= false;
        if(args[0].toLowerCase()==="exclusive"){
            exclusive= true;
            args.shift()
        }

        var ch= undefined;
        if(!Boolean(ch=__identifyChannel(str, message.mentions.channels))){
            message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[0]}" doesn't seem to be a valid channel mention…`)
            return false;
        }
        args.shift()

        var data_msg_react_role= utils.settings.get(guild,'msg_react_role')
        if(!Boolean(data_msg_react_role)){
            data_msg_react_role= {}
        }

        var l_mentionEmote= []
        do{
            var role= undefined;
            var emote= undefined;
            if(!Boolean(role=__identifyRoleMention(args[0], message.mentions.roles))){
                message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[0]}" doesn't seem to be a valid mention…`)
                return false;
            }
            if(!Boolean(emote=__identifyEmoji(args[1],message.guild, utils))){
                message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[1]}" doesn't seem to be a valid emoji`)
                return false;

            }
            if(!Boolean(emote.emoji)){
                message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[1]}" needs to be an emote availabe on the server…`)
                return false;
            }

            l_mentionEmote.push({role,emote})
            
            ++mentionIdx;
            args.shift(); args.shift();
        } while(__isRoleMention(args[0]))

        var text= args.join(' ');

        var new_msg= (await ch.send(text).then(msg => {
            for(var e_m of l_mentionEmote){
                msg.react(e_m.emote.emoji).then()
                .catch(err => {
                    hereLog(`[${command}] couldn't react to message:\n\t${err.message}`);
                })
            }
        }))

        if(!Boolean(new_msg)){
            message.author.send(`[${command}] Internal error: couldn't post message`)
            return false
        }

        let k= `${new_msg.channel.id}_${new_msg.id}`
        data_msg_react_role[k]['exclusive']= exclusive
        data_msg_react_role[k].roles= {}

        for(var e_m of l_mentionEmote){
            data_msg_react_role[k].roles[e_m.emote.text]= em.role.id
        }

        utils.settings.set(guild, 'msg_react_role', data_msg_react_role)

        return true;
    }
    else if(command==="set-role-message"){
        if(args.length<3){
            message.author.send(`[${message.guild.name}] \`!${command}\` not enought arguments… Expected format:\n\t`
                                `\`!${command}\ message_id [exclusive] @role :server_emote:\``
            )

            return false;
        }

        var exclusive= false;
        if(args[1].toLowerCase()==="exclusive"){
            exclusive= true;
            args.splice(1,1)
        }

        var msg= _message_extract()
        if(!Boolean(message)){
            message.author.send(`[${command}] Message not found…`)
            return false
        }
        args.shift()

        var l_mentionEmote= []
        do{
            var role= undefined;
            var emote= undefined;
            if(!Boolean(role=__identifyRoleMention(args[1], message.mentions.roles))){
                message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[0]}" doesn't seem to be a valid mention…`)
                return false;
            }
            if(!Boolean(emote=__identifyEmoji(args[2],message.guild, utils))){
                message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[1]}" doesn't seem to be a valid emoji`)
                return false;

            }
            if(!Boolean(emote.emoji)){
                message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[1]}" needs to be an emote availabe on the server…`)
                return false;
            }

            l_mentionEmote.push({role,emote})
            
            ++mentionIdx;
            args.shift(); args.shift();
        } while(__isRoleMention(args[0]))

        var text= args.join(' ');
        for(var e_m of l_mentionEmote){
            msg.react(e_m.emote.emoji).then()
            .catch(err => {
                hereLog(`[${command}] couldn't react to message:\n\t${err.message}`);
            })
        }

        var data_msg_react_role= utils.settings.get(guild,'msg_react_role')
        if(!Boolean(data_msg_react_role)){
            data_msg_react_role= {}
        }
        let k= `${msg.channel.id}_${msg.id}`
        data_msg_react_role[k]['exclusive']= exclusive
        data_msg_react_role[k].roles= {}
        for(var e_m of l_mentionEmote){
            data_msg_react_role[k].roles[em.emote.text]= e_m.role.id
        }

        utils.settings.set(guild, 'msg_react_role', data_msg_react_role)

        return true

    }
    else if(command==="list-role-messages"){
        var data_msg_react_role= utils.settings.get(guild, 'msg_react_role')
        if(!Boolean(data_msg_react_role)){
            message.author.send(`[${command}] No role attributing message found…`)
            return true
        }

        var str= ""
        for(var k of Object.keys(data_msg_react_role)){
            let obj= data_msg_react_role[k]
            var ch_id= undefined, channel= undefined, msg= undefined
            if(Boolean(obj) && Boolean(ch_id=obj.channel)
                && Boolean(channel=message.guild.channels.cache.get(ch_id)) && Boolean(msg=(await channel.messages.fetch(k))))
            {
                str+= `- <${msg.url}>$${(Boolean(obj.exclusive))?" (exclusive)":""} :\n`

                for(var em in obj.roles){
                    var r_id= obj.roles[em]
                    var role= message.guild.roles.cache.get(r_id)
                    if(Boolean(role)){
                        str+= `\t⋅ ${role.name} <- ${em}\n`
                    }
                }
            }
        }

        message.author.send(str, {split: true})

        return true
    }
    else if(command==="edit-role-message"){
        if(args.length<2){
            message.author.send(`[${command}] Not enough arguments…`)

            return false
        }

        var msg= _message_extract()

        if(!Boolean(msg)){
            message.author.send(`[${command}] couldn't find/identify the message to edit…`)

            return false
        }

        args.shift()
        msg.edit(args.join(' '))

        return true
    }
    else if(command==="about-role-message"){
        if(args.length<1){
            message.author.send(`[${command}] Not enough arguments…`)

            return false
        }

        var msg= _message_extract()

        if(!Boolean(msg)){
            message.author.send(`[${command}] couldn't find/identify the message to edit…`)

            return false
        }

        var data_msg_react_role= utils.settings.get(guild, 'msg_react_role')
        var msg_ids= undefined
        if(!Boolean(data_msg_react_role) || !Boolean(msg_ids=Object.keys(data_msg_react_role))){
            message.author.send(`[${command}] No message attributing roles found…`)

            return true
        }
        else if(!msg_ids.includes(msg.id) || !Boolean(data_msg_react_role[msg.id].roles)){
            message.author.send(`[${command}] Given message (<${msg.url}>) doesn't attribute any roles…`)

            return false
        }

        str= `Message <${msg.url}> sets roles in the following fashion `+
            `${(Boolean(data_msg_react_role[msg.id].exclusive))?"(exclusive)":""}:\n`
        for(var em in data_msg_react_role[msg.id].roles){
            var r_id= data_msg_react_role[msg.id].roles[em]
            var role= message.guild.roles.cache.get(r_id)
            if(Boolean(role)){
                str+= `\t⋅ ${em} -> ${role.name}\n`
            }
        }
        
        message.author.send(str, {split: true})

        return true
    }

    return false
}



//this function is called when a 'help' command has been called in a
//guild, regarding one of the commands registered by this module.
function cmd_help(cmdObj, clearanceLvl){}



//this function is called when an event has been recieved by the bot's client.
//See https://discord.js.org/#/docs/main/stable/class/Client for the event list).
async function cmd_event(eventName, utils){
    let _roleMemberManage= (role, user, message, t_emote_roles, op='a', exclusive=false) =>{
        message.guild.members.fetch(user).then(member => {
            if(op==='r'){
                member.roles.remove(role)
            }
            else{
                if(exclusive){
                    var r= undefined
                    for(var r_id of t_emote_roles){
                        if(Boolean(r=member.roles.cache.get(r_id))){
                            member.roles.remove(r)
                        }
                    }
                }

                member.roles.add(role)
            }
        })
    }

    if(eventName==="messageReactionAdd"){
        var reaction= arguments[2]
        var user= arguments[3];

        //see https://discordjs.guide/popular-topics/partials.html
        //and https://discordjs.guide/popular-topics/reactions.html#listening-for-reactions-on-old-messages
        if(reaction.partial){
            try {
                await reaction.fetch();
            } catch (error) {
                hereLog('[cmd_event][messageReactionAdd] Something went wrong when fetching the message: ', error);
                return;
            }
        }

        var message= reaction.message
        var data_msg_react_role= utils.settings.get(guild, 'msg_react_role')
        let ch_msg_id= `${message.channel.id}_${message.id}`
        var r_em= undefined, r_id= undefined, role= undefined
        if(Boolean(data_msg_react_role) && Boolean(r_em=data_msg_react_role[ch_msg_id])
            && Boolean(r_id=r_em.roles[emoji.text] && Boolean(role=message.guild.roles.cache.get(r_id)))
        ){
            var exclusive= Boolean(r_em.exclusive)
            _roleMemberManage(role,user,message,r_em.roles,'a',exclusive)
        }

        return
    }
    else if(eventName==="messageReactionRemove"){
        var reaction= arguments[2]
        var user= arguments[3];

        //see https://discordjs.guide/popular-topics/partials.html
        //and https://discordjs.guide/popular-topics/reactions.html#listening-for-reactions-on-old-messages
        if(reaction.partial){
            try {
                await reaction.fetch();
            } catch (error) {
                hereLog('[cmd_event][messageReactionAdd] Something went wrong when fetching the message: ', error);
                return;
            }
        }

        var message= reaction.message
        var data_msg_react_role= utils.settings.get(guild, 'msg_react_role')
        let ch_msg_id= `${message.channel.id}_${message.id}`
        var r_em= undefined, r_id= undefined, role= undefined
        if(Boolean(data_msg_react_role) && Boolean(r_em=data_msg_react_role[ch_msg_id])
            && Boolean(r_id=r_em.roles[emoji.text] && Boolean(role=message.guild.roles.cache.get(r_id)))
        ){
            _roleMemberManage(role,user,message,r_em.roles,'r')
        }

        return
    }
    else if(eventName==="message"){
        let message= arguments[2]

        if(Boolean(message)){
            var answerChannels= undefined
            var ch= undefined
            if(Boolean(answerChannels=utils.setting.get(message.guild, "answerChannels")) &&
                Boolean(ch=answerChannels.find(id => {return (id===message.channel.id)}))
            ){
                if(Math.floor(Math.random()*256)===128){
                    let filepath= `${__dirname}/data/talk.txt`
                    if(fs.existsSync(filepath)){
                        var lines= []
                        var _b= ( await (new Promise((resolve,reject)=>{
                            var rl = readline.createInterface({
                                input: fs.createReadStream(filepath)
                            });

                            rl.on('line', (line)=>{
                                lines.push(line)
                            })
                            rl.on('close', ()=>{resolve(true)})
                            rl.on('SIGINT',()=>{resolve(false)})
                            rl.on('SIGCONT',()=>{resolve(false)})
                            rl.on('SIGSTP',()=>{resolve(false)})
                        })) )

                        var l= 0
                        if(_b && (l=lines.length)>0){
                            var l_rng= lines[Math.floor(Math.random*l)];
                            if(Boolean(l_rng)) message.send(l_rng,{split:true})
                        }
                    }
                }
            }
        }
    }
}



//this function is called when the bot leaves a guild
function cmd_guild_clear(guild){}



//the module then needs to register these function for export
//  set 'module.exports.name' to a the name of a command this module wants to register.
//  it can registers several commands by providing an array of strings.
module.exports.name= ["post-role-message","edit-role-message"];
//  all the functions previously presented needs to be register is a grouped object, as the following:
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};