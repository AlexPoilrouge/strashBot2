const { util } = require('config');
const { fstat } = require('fs');




let hereLog= (...args) => {console.log("[cmd_roles]", ...args);};



const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;



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

    var _tmp= undefined;
    var emojiType= undefined;
    hereLog(`[__identifyEmoji] ${str}`)
    try{
        emojiType= ( Boolean(str) )? (
                Boolean(str.match(simpleEmojiRegex))? {type: "SIMPLE", emoji: str, text: str} :
                    ( Boolean(str) && Boolean(_tmp=str.match(customEmojiRegex))? 
                            {   type: "CUSTOM",
                                emoji: utils.getBotClient().emojis.cache.get(_tmp[2]),
                                text: str
                            }
                        : undefined) 
            ) : undefined;
    }
    catch(err){
        hereLog(`[__identifyEmoji] error: ${err.message}`)
        emojiType= undefined;
    }

    return emojiType;
}

function cmd_init(utils){}

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
                hereLog(`[cmd_init_per_guild][${guild}] couldn't fetch message ${msg_id}: ${err.message}`)
                msg= undefined
            }

            var obj= undefined
            if(Boolean(msg) && Boolean(obj=data_msg_react_role[ch_msg_id]) && Boolean(obj.roles)){
                obj= data_msg_react_role[ch_msg_id]

                for(var em_txt in obj.roles){
                    hereLog(`em_txt: ${em_txt}`)

                    var reac= undefined
                    var m= undefined
                    if(Boolean(m=em_txt.match(/^<\:([a-zA-Z\-_0-9]+)\:([0-9]{18})>$/))){
                        reac= m[2]
                    }
                    reac= Boolean(reac)? reac : em_txt

                    msg.react(reac).then().catch(err =>{
                        hereLog(`[cmd_init_per_guild][${guild.name}] couldn't react (reac=${reac}) to message ${msg.id}: ${err.message}`)
                    })
                }
            }
            else{
                delete data_msg_react_role[ch_msg_id]
            }
        }

        utils.settings.set(guild, 'msg_react_role', data_msg_react_role)
    }

    var data_exclusive_roles=  utils.settings.get(guild, 'exclusive_roles')
    if(Boolean(data_exclusive_roles)){
        for(var i in data_exclusive_roles){
            var r_t= data_exclusive_roles[i]

            data_exclusive_roles[i]= r_t.filter(r_id => {return Boolean(guild.roles.cache.get(r_id))})
        }

        utils.settings.set(guild, 'exclusive_roles', data_exclusive_roles)
    }

    var data_role_mention_assign= utils.settings.get(guild, 'role_mention_assign')
    if(Boolean(data_role_mention_assign)){
        data_role_mention_assign= data_role_mention_assign.filter(r_id => {return Boolean(guild.roles.cache.get(r_id))})

        utils.settings.set(guild, 'role_mention_assign', data_role_mention_assign)
    }

    var data_role_post_assign= utils.settings.get(guild, 'role_post_assign')
    if(Boolean(data_role_post_assign)){
        for(var ch_id in data_role_post_assign){
            var chanObj= undefined
            if(!Boolean(ch_id) || !Boolean(guild.channels.cache.get(ch_id)) || !Boolean(chanObj=data_role_post_assign[ch_id])){
                delete data_role_post_assign[ch_id]
            }
            else{
                for(var r_id in chanObj){
                    var unless= undefined, rObj= undefined
                    if(!Boolean(r_id) || !Boolean(guild.roles.cache.get(r_id)) || !Boolean(rObj=chanObj[r_id]) || !Boolean(unless=rObj.unless) || unless.length<=0){
                        delete chanObj[r_id]
                    }
                    else{
                        chanObj[r_id].unless= unless.filter(ur_id => {return Boolean(guild.roles.cache.get(ur_id))})
                    }
                }
            }
        }
    }
    utils.settings.set(guild, 'role_post_assign', data_role_post_assign)
}


async function cmd_main(cmdObj, clearanceLvl, utils){
    let command= cmdObj.command;
    let message= cmdObj.msg_obj;

    var args= cmdObj.args;
    hereLog(`clrlvl ${clearanceLvl}`)

    if(args[0]==="help"){
        return cmd_help(cmdObj, clearanceLvl)
    }

    if(clearanceLvl<CLEARANCE_LEVEL.CONTROL_CHANNEL) return false


    let _message_extract= async (idx=0) =>{
        let id_arg= args[idx]
        var msg= undefined, match= undefined
        if(Boolean(id_arg.match(/^[0-9]{15,21}$/))){
            msg= (await (message.channel.messages.fetch(id_arg)))
        }
        else if(Boolean(match=id_arg.match(/([0-9]{15,21})[\/\_\-\\\:\.\s]([0-9]{15,21})$/))){
            var channel= message.guild.channels.cache.get(match[1])
            if(Boolean(channel)){
                msg= (await (channel.messages.fetch(match[2])))
            }
        }
        else if(Boolean(match=id_arg.match(/^https?\:\/\/discord\.com\/channels\/([0-9]{15,21})\/([0-9]{15,21})\/([0-9]{15,21})$/))){
            if(message.guild.id===match[1]){
                var channel= message.guild.channels.cache.get(match[2])
                if(Boolean(channel)){
                    msg= (await (channel.messages.fetch(match[3])))
                }
            }
        }

        return msg
    }

    //!post-role-message [exlcusive] #channel @role :emote1: [ [@role2 :emote2: … ]] "bla bla"
    if(command==="post-role-message"){
        if(args.length<4){
            message.author.send(`[${message.guild.name}] \`!${command}\` not enought arguments… Expected format:\n\t`
                                `\`!${command}\ #channel @role :server_emote: message…\``
            )

            return false;
        }

        var ch= undefined;
        if(!Boolean(ch=__identifyChannel(args[0], message.mentions.channels))){
            message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[0]}" doesn't seem to be a valid channel mention…`)
            return false;
        }
        args.shift()

        var data_msg_react_role= utils.settings.get(message.guild,'msg_react_role')
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
            
            args.shift(); args.shift();
        } while(__isRoleMention(args[0], message.mentions.roles))

        var give_only= false
        if(give_only=(args[0].toLowerCase()==="give_only")) args.shift()

        if(args.length<=0){
            message.author.send(`[${message.guild.name}] \`!${command}\`: can't post an empty message.`)

            return false;
        }

        var text= args.join(' ');

        var new_msg= undefined
        try{
            new_msg= (await (ch.send(text)))
        }
        catch(err){
            hereLog(`[${command}] couldn't send message: ${err.message}`);
            new_msg= undefined
        }

        if(!Boolean(new_msg)){
            message.author.send(`[${command}] Internal error: couldn't post message`)
            return false
        }

        for(var e_m of l_mentionEmote){
            new_msg.react(e_m.emote.emoji).then()
            .catch(err => {
                hereLog(`[${command}] couldn't react to message:\n\t${err.message}`);
            })
        }

        let k= `${new_msg.channel.id}_${new_msg.id}`
        data_msg_react_role[k]= {}
        data_msg_react_role[k].roles= {}
        data_msg_react_role[k].give_only= give_only

        for(var e_m of l_mentionEmote){
            data_msg_react_role[k].roles[e_m.emote.text]= e_m.role.id
        }

        utils.settings.set(message.guild, 'msg_react_role', data_msg_react_role)

        return true;
    }
    else if(command==="set-role-message"){
        if(args.length<3){
            message.author.send(`[${message.guild.name}] \`!${command}\` not enought arguments… Expected format:\n\t`
                                `\`!${command}\ message_id @role :server_emote:\``
            )

            return false;
        }

        var msg= (await (_message_extract()))
        if(!Boolean(message)){
            message.author.send(`[${command}] Message not found…`)
            return false
        }
        args.shift()

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
            
            args.shift(); args.shift();
        } while(__isRoleMention(args[0], message.mentions.roles))

        var give_only= false
        if(give_only=(Boolean(args[0]) && args[0].toLowerCase()==="give_only")) args.shift()

        msg.reactions.removeAll().then().catch(err => {
            hereLog(`[${command}] couldn't remove all reaction from message:\n\t${err.message}`)
        }).finally(() => {
            for(var e_m of l_mentionEmote){
                msg.react(e_m.emote.emoji).then()
                .catch(err => {
                    hereLog(`[${command}] couldn't react to message:\n\t${err.message}`);
                })
            }
        })

        var data_msg_react_role= utils.settings.get(message.guild,'msg_react_role')
        if(!Boolean(data_msg_react_role)){
            data_msg_react_role= {}
        }
        let k= `${msg.channel.id}_${msg.id}`
        data_msg_react_role[k]= {}
        data_msg_react_role[k].roles= {}
        data_msg_react_role[k].give_only= give_only
        for(var e_m of l_mentionEmote){
            data_msg_react_role[k].roles[e_m.emote.text]= e_m.role.id
        }

        utils.settings.set(message.guild, 'msg_react_role', data_msg_react_role)

        return true

    }
    else if(command==="list-role-messages"){
        var data_msg_react_role= utils.settings.get(message.guild, 'msg_react_role')
        if(!Boolean(data_msg_react_role)){
            message.author.send(`[${command}] No role attributing message found…`)
            return true
        }

        var str= `[*${message.guild.name}*][${command}]:\n`
        for(var k of Object.keys(data_msg_react_role)){
            let obj= data_msg_react_role[k]
            var channel= undefined, msg= undefined
            if(Boolean(obj) && Boolean(k.match(/^[0-9]{15,21}\_[0-9]{15,21}$/))
                && Boolean(channel=message.guild.channels.cache.get(k.split('_')[0]))
                && Boolean(msg=(await (channel.messages.fetch(k.split('_')[1])))))
            {
                str+= `─ <${msg.url}>${(Boolean(obj.give_only)?" (give_only)":"")}:\n`

                for(var em in obj.roles){
                    var r_id= obj.roles[em]
                    var role= message.guild.roles.cache.get(r_id)
                    if(Boolean(role)){
                        str+= `\t─ ${em} -> ${role.name}\n`
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

        var msg= (await (_message_extract()))

        if(!Boolean(msg)){
            message.author.send(`[${command}] couldn't find/identify the message to edit…`)

            return false
        }

        if(msg.author.id!==utils.getBotClient().user.id){
            message.author.send(`[${command}] It is only possible to edit a message that has been authored by ${utils.getBotClient().user}.`)

            return false;
        }

        args.shift()
        msg.edit(args.join(' ')).then().catch(err =>{
            hereLog(`[edit-role-message] couldn't edit message (${msg.id}): ${err.message}`)
        })

        return true
    }
    else if(command==="about-role-message"){
        if(args.length<1){
            message.author.send(`[${command}] Not enough arguments…`)

            return false
        }

        var msg= (await (_message_extract()))

        if(!Boolean(msg)){
            message.author.send(`[${command}] couldn't find/identify the message…`)

            return false
        }

        var data_msg_react_role= utils.settings.get(message.guild, 'msg_react_role')
        var ch_msg_ids= undefined, c_id= `${msg.channel.id}_${msg.id}`
        if(!Boolean(data_msg_react_role) || !Boolean(ch_msg_ids=Object.keys(data_msg_react_role))){
            message.author.send(`[${command}] No message attributing roles found…`)

            return true
        }
        else if(!ch_msg_ids.includes(c_id) || !Boolean(data_msg_react_role[c_id].roles)){
            message.author.send(`[${command}] Given message (<${msg.url}>) doesn't attribute any roles…`)

            return false
        }

        str= `Message <${msg.url}> sets roles in the following fashion`+
                `${(Boolean(data_msg_react_role[c_id].give_only))?" (give_only)":""}:\n`
        for(var em in data_msg_react_role[c_id].roles){
            var r_id= data_msg_react_role[c_id].roles[em]
            var role= message.guild.roles.cache.get(r_id)
            if(Boolean(role)){
                str+= `\t⋅ ${em} -> ${role.name}\n`
            }
        }
        
        message.author.send(str, {split: true})

        return true
    }
    else if(command==="exclusive-roles"){
        var data_exclusive_roles= utils.settings.get(message.guild, 'exclusive_roles')
        if(!Boolean(data_exclusive_roles)){
            data_exclusive_roles= []
        }

        if(args.length<=0){
            if(data_exclusive_roles.length<=0){
                message.author.send(`[${command}] No exclusive roles set yet.`)
            }
            else{
                var str= `[${command}] exclusive roles:\n`
                for(var r_t of data_exclusive_roles){
                    if(r_t.length>0){
                        str+=`\t─ `
                        for(r_id of r_t){
                            var role= message.guild.roles.cache.get(r_id)
                            str+= ((!Boolean(role))?"-unknown-; ":`*@${role.name}*; `)
                        }
                        str+='\n'
                    }
                }
                message.author.send(str, {split:true})
            }

            return true;
        }

        if(Boolean(args[0].toLowerCase().match(/^re?mo?v?e?$/))){
            args.shift()
            if (args.length<2){
                message.author.send(`[${command}] Not enough arguments…\n\tformat: !${command} rm @role1_mention @role2_mention [ @role3_mention … ]`)
                return false;
            }

            var given_roles=[]
            while(args.length>0){
                var role= undefined
                if(!Boolean(role=__identifyRoleMention(args[0], message.mentions.roles))){
                    message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[0]}" doesn't seem to be a valid role mention…`)
                    return false;
                }
                given_roles.push(role.id)
    
                args.shift()
            }

            for(var i in data_exclusive_roles){
                var r_t= data_exclusive_roles[i]
                var count= 0
                hereLog(`i=${i}; r_t=${r_t}`)
                for(var r_id of given_roles){
                    if(r_t.includes(r_id)) ++count
                }

                if(count>=2){
                    data_exclusive_roles[i]= r_t.filter(e => {return !given_roles.includes(e)})
                }
            }
            data_exclusive_roles= data_exclusive_roles.fliter(t => {return t.length>1})

            utils.settings.set(message.guild, 'exclusive_roles', data_exclusive_roles)
            
            return true
        }

        if (args.length<2){
            message.author.send(`[${command}] Not enough arguments…\n\tformat: !${command} @role1_mention @role2_mention [ @role3_mention … ]`)
            return false;
        }

        var roles= []
        while(args.length>0){
            var role= undefined
            if(!Boolean(role=__identifyRoleMention(args[0], message.mentions.roles))){
                message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[0]}" doesn't seem to be a valid role mention…`)
                return false;
            }
            roles.push(role.id)

            args.shift()
        }

        if(!data_exclusive_roles.some(r_t=>{return roles.every(_r_t=>r_t.includes(_r_t))})){
            data_exclusive_roles.push([...new Set(roles)])
        }

        utils.settings.set(message.guild, 'exclusive_roles', data_exclusive_roles)

        return true
    }
    else if(command==="mention-assign-role"){
        var data_role_mention_assign= utils.settings.get(message.guild, 'role_mention_assign')
        if(!Boolean(data_role_mention_assign)){
            data_role_mention_assign= []
        }

        if (args.length<=0){
            if(data_role_mention_assign.length<=0){
                message.author.send(`[${command}] No auto-assign mention roles set.`)

                return true
            }

            var str= `[${command}] auto-assign mention roles:\n`
            for(var r_id of data_role_mention_assign){
                var role= message.guild.roles.cache.get(r_id)
                str+= `\t─ ${((!Boolean(r_id))?"-unknown-":`*@${role.name}*`)}\n`
            }

            message.author.send(str, {split:true})

            return true
        }

        if(Boolean(args[0].toLowerCase().match(/^re?mo?v?e?$/))){
            args.shift()
            if (args.length<1){
                message.author.send(`[${command}] removal - no role mentionned…`)
                return false;
            }

            var role= undefined
            if(!Boolean(role=__identifyRoleMention(args[0], message.mentions.roles))){
                message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[0]}" doesn't seem to be a valid role mention…`)
                return false;
            }

            data_role_mention_assign= data_role_mention_assign.filter(e => {return e!==role.id})

            utils.settings.set(message.guild, 'role_mention_assign',data_role_mention_assign)

            return true
        }
        
        var role= undefined
        if(!Boolean(role=__identifyRoleMention(args[0], message.mentions.roles))){
            message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[0]}" doesn't seem to be a valid role mention…`)
            return false;
        }

        data_role_mention_assign.push(role.id)

        utils.settings.set(message.guild, 'role_mention_assign', data_role_mention_assign)

        return true
    }
    else if(command==="post-assign-role"){
        var data_role_post_assign= utils.settings.get(message.guild, 'role_post_assign')
        if(!Boolean(data_role_post_assign)){
            data_role_post_assign= {}
        }

        if (args.length<=0){
            if(Object.keys(data_role_post_assign).length<=0){
                message.author.send(`[${command}] No on-post-assignable message set…`)
        
                return true
            }
            
            var str= `[*${message.guild.name}*] On-post-assignable messages:\n`
            for(var ch_id in data_role_post_assign){
                var channel= undefined, chanObj= undefined
        
                if(Boolean(ch_id) && Boolean(channel=message.guild.channels.cache.get(ch_id))
                    && Boolean(chanObj=data_role_post_assign[ch_id]) && Object.keys(chanObj).length>0)
                {
                    str+= `\t─ on channel *#${channel.name}* assign on post:\n`
        
                    for(var r_id in chanObj){
                        var role= undefined, rObj= undefined
                        if(Boolean(r_id) && Boolean(role=message.guild.roles.cache.get(r_id))){
                            str+= `\t\t─ *@${role.name}*`
                            var min= undefined
                            if(Boolean(rObj=chanObj[r_id]) && Boolean(min=rObj.min) && Boolean(min>0)){
                                str+= `, min= ${min}`
                            }
                            var unless= undefined
                            if(Boolean(rObj) && Boolean(unless=rObj.unless) && unless.length>0){
                                str+= `, unless:\n`
                                for(var u_r_id of unless){
                                    var u_role= undefined
                                    if(Boolean(u_r_id) && Boolean(u_role=message.guild.roles.cache.get(u_r_id))){
                                        str+= `\t\t\t─ *@${u_role.name}*\n`
                                    }
                                }
                            }
                            str+= '\n'
                        }
                    }
                }
            }
            message.author.send(str, {split:true})
                
            return true
        }

        if(args.length<=1){
            message.author.send(`[${command}] not enough arguments…`)
            return false
        }

        if(Boolean(args[0].toLowerCase().match(/^re?mo?v?e?$/))){
            args.shift()
            if (args.length<1){
                message.author.send(`[${command}] removal - no mention…`)
                return false;
            }

            var role= undefined, channel= undefined
            if(Boolean(channel=__identifyChannel(args[0], message.mentions.channels))){
                args.shift()
            }
            if(Boolean(role=__identifyRoleMention(args[0], message.mentions.roles))){
                args.shift()
            }
            if(!Boolean(role) && !Boolean(channel)){
                message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[0]}" doesn't seem to be a valid mention…`)
                return false;
            }

            var chanObj= undefined
            if(Boolean(channel) && Boolean(chanObj=data_role_post_assign[channel.id])){
                if(Boolean(role)){
                    delete data_role_post_assign[channel.id][role.id]
                }
                else{
                    delete data_role_post_assign[channel.id]
                }
            }
            else if(Boolean(role)){
                var del_ch_id=[]
                for(var ch_id of Object.keys(data_role_post_assign)){
                    var chanObj= data_role_post_assign[ch_id]
                    delete data_role_post_assign[ch_id][role.id]
                    if(Object.keys(data_role_post_assign[channel.id]).length<=0){
                        del_ch_id.push(channel.id)
                    }
                    
                }
                for(var ch_id of del_ch_id){
                    delete data_role_post_assign[ch_id]
                }
            }

            utils.settings.set(message.guild, 'role_post_assign', data_role_post_assign)

            return true
        }

        var channel= undefined, role= undefined
        if(!Boolean(channel=__identifyChannel(args[0], message.mentions.channels))){
            message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[0]}" doesn't seem to be a valid channel mention…`)
            return false;
        }
        args.shift()
        if(!Boolean(role=__identifyRoleMention(args[0], message.mentions.roles))){
            message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[0]}" doesn't seem to be a valid role mention…`)
            return false;
        }
        args.shift()

        _b= true
        var min= undefined
        if(args.length>=2 && Boolean(args[0].toLowerCase()==="min-length")){
            args.shift()
            min= Number(args[0])
            if(Number.isNaN(min)){
                message.author.send(`[${command}] \`min-length\` must be followed by a number`)
                return false
            }
            args.shift();
        }
        var unlessRoles= []
        if(args.length>=2 && Boolean(args[0].toLowerCase()==="unless")){
            args.shift()
            while(args.length>0){
                var u_role= undefined
                if(!Boolean(u_role=__identifyRoleMention(args[0], message.mentions.roles))){
                    message.author.send(`[${message.guild.name}] \`!${command}\`: "${args[0]}" doesn't seem to be a valid unless role mention…`)
                    return false;
                }
                unlessRoles.push(u_role.id)
                args.shift()
            }
        }

        data_role_post_assign[channel.id]= {}
        data_role_post_assign[channel.id][role.id]= {unless: unlessRoles}
        if(min>0){
            data_role_post_assign[channel.id][role.id].min= min
        }

        utils.settings.set(message.guild, 'role_post_assign', data_role_post_assign)

        return true
    }

    return false
}



function cmd_help(cmdObj, clearanceLvl){
    cmdObj.msg_obj.author.send(
        "========\n\n"+
        `__**roles** command__:\n\n`+
        ((clearanceLvl<CLEARANCE_LEVEL.CONTROL_CHANNEL)? "Forbidden access": ("**Admins only:**\n\n"+
            `\t\`!post-role-message #channel [<@role :server_emote:> …] [give_only] message_content\`\n\n`+
            `\tBot will post a message in the specified channel that will function as role assigner `+
            `according to the given list of role mention - emoji correspondance.\n`+
            `\t(\`give_only\` is an optional parameter, that, if given, indicates that users can't remove role by removing `+
            `reactions.\n`+
            `\t__Exemple__:\n\t\t\`!post-role-message #target-channel @role1 :smirk: @role2 :smile: `+
            `the rest is the message content. React :smirk: to get @role1 and :smile: to get @role2.\`\n\n`+
            `\t\`!edit-role-message message_id_or_url new_message_content\`\n\n`+
            `\tIf the designated message is a "role assigning" message **post by the bot**, then the message `+
            `content is edited with new given content\n`+
            `\t__Exemple__:\n\t\t\`!edit-role-message 123456789087456321 The rest is the new message content\`\n\n`+
            `\t\`!set-role-message message_id [<@role :server_emote:> …] [give_only]\`\n\n`+
            `\tSet the designated message as a "role assigning" message`+
            `according to the given list of role mention - emoji correspondance.\n`+
            `\t__Exemple__:\n\t\t\`!set-role-message 874563210123456789 @roleA :rofl: @roleB :angry: give_only\`\n\n`+
            `\t\`!list-role-messages\`\n\n`+
            `\tLists all the "role assigning" messages posted so far.`+
            `\t\`!about-role-message message_id_or_url\`\n\n`+
            `\tFor a designated "role assigning" message, prints (DM) informations about it.\n\n`+
            `\t\`!exclusive-roles @role1 @role2 [ @role3 …]\`\n\n`+
            `\tFor given roles, set these roles as "exclusive" to each other. In other words, `+
            `assigning one of these roles to a user will cause the other roles to be removed from him after this command.\n\n`+
            `\t\`!exclusive-roles\`\n\n`+
            `\tPrints out (DM) roles that are "exclusive" to each other.`+
            `\t\`!exclusive-roles rm @role1 @role2 [ @role3 …]\`\n\n`+
            `\tFor given roles, these roles will no longer be "exclusive" to each other.`+
            `\t\`!mention-assign-role @role\`\n\n`+
            `\tSets a given role as "assignable on mention". In other words, after this command, `+
            `whenever this role will be mentionned in user's message, this role will be assigned to said user.`+
            `\t\`!mention-assign-role\`\n\n`+
            `\tPrints out (DM) roles that are "assignable on mention".`+
            `\t\`!mention-assign-role rm @role\`\n\n`+
            `\tRemoves a given role from the list of "assignable on mention" roles.\n\n`+
            `\t\`!post-assign-role #channel-mention @role-mention [ min-length NUMBER ] [ unless @role1 [@role2 …] ]\`\n\n`+
            `\tSets up the fact that when a user will post to a given channel, the mentionned role will be assigned to him. `+
            `That is unless the \`unless\` argument is given followed by other role mentions, in which case a user posting in `+
            `said channel will not be affected said first role if he already belong to one of these other roles.`+
            `Also, if the \`min-length\` argument is given, followed by a number N, the role affectation happens only if `+
            `the posted message is at least N characters long.`
        )), {split:true}
    )

    return true
}


async function cmd_event(eventName, utils){
    let _roleMemberManage= (role, user, message, op='a') =>{
        message.guild.members.fetch(user).then(member => {
            if(op==='r'){
                member.roles.remove(role)
            }
            else{
                member.roles.add(role)
            }
        })
    }
    
    if(eventName==="messageReactionAdd"){
        hereLog("reactionadd")
        var reaction= arguments[2]
        var user= arguments[3];

        //see https://discordjs.guide/popular-topics/partials.html
        //and https://discordjs.guide/popular-topics/reactions.html#listening-for-reactions-on-old-messages
        if(reaction.partial){
            try {
                await (reaction.fetch());
            } catch (error) {
                hereLog(`[cmd_event][messageReactionAdd] Something went wrong when fetching the message: ${error.message}`);
                return;
            }
        }

        var message= reaction.message
        var data_msg_react_role= utils.settings.get(message.guild, 'msg_react_role')
        let ch_msg_id= `${message.channel.id}_${message.id}`
        hereLog(`[reactionAdd] ${ch_msg_id}; ${reaction.emoji.toString()}`)
        var r_em= undefined, r_id= undefined, role= undefined
        if(Boolean(data_msg_react_role) && Boolean(r_em=data_msg_react_role[ch_msg_id])
            && Boolean(r_id=r_em.roles[reaction.emoji.toString()]) && Boolean(role=message.guild.roles.cache.get(r_id))
        ){
            _roleMemberManage(role,user,message,'a')
        }
        hereLog(`[reactionAdd] ${r_em}; ${r_id}; ${role}`)
        hereLog(`[reactionAdd] ${JSON.stringify(r_em)}`)

        return
    }
    else if(eventName==="messageReactionRemove"){
        var reaction= arguments[2]
        var user= arguments[3];

        //see https://discordjs.guide/popular-topics/partials.html
        //and https://discordjs.guide/popular-topics/reactions.html#listening-for-reactions-on-old-messages
        if(reaction.partial){
            try {
                await (reaction.fetch());
            } catch (error) {
                hereLog(`[cmd_event][messageReactionAdd] Something went wrong when fetching the message: ${error.message}`);
                return;
            }
        }

        var message= reaction.message
        var data_msg_react_role= utils.settings.get(message.guild, 'msg_react_role')
        let ch_msg_id= `${message.channel.id}_${message.id}`
        var r_em= undefined, r_id= undefined, role= undefined
        if(Boolean(data_msg_react_role) && Boolean(r_em=data_msg_react_role[ch_msg_id]) && !Boolean(r_em.give_only)
            && Boolean(r_id=r_em.roles[reaction.emoji.toString()]) && Boolean(role=message.guild.roles.cache.get(r_id))
        ){
            _roleMemberManage(role,user,message,'r')
        }

        return
    }
    else if(eventName==="messageDelete"){
        var message= arguments[2];
        var data_msg_react_role= utils.settings.get(message.guild, 'msg_react_role')
        if(!(Boolean(data_msg_react_role) && Object.keys(data_msg_react_role).some(k=>{return k.endsWith(`_${message.id}`)})))
            return;

        if(message.partial){
            try{
                await (message.fetch());
            } catch (error) {
                hereLog(`[cmd_event][messageDelete] Something went wrong when fetching the message: ${error.message}`);
                return;
            }
        }

        var k= `${message.channel.id}_${message.id}`
        if(Boolean(data_msg_react_role[k])){
            delete data_msg_react_role[k]
        }

        utils.settings.set(message.guild, 'msg_react_role', data_msg_react_role)

        return
    }
    else if(eventName==="roleDelete"){
        var role= arguments[2];

        var data_role_mention_assign= utils.settings.get(role.guild, 'role_mention_assign')
        if(!Boolean(data_role_mention_assign)) return
        data_role_mention_assign= data_role_mention_assign.filter(r_id =>{ return (r_id!==role.id)})
        utils.settings.set(role.guild, 'role_mention_assign', data_role_mention_assign)

        var data_exclusive_roles= utils.settings.get(role.guild, 'exclusive_roles')
        if(!Boolean(data_exclusive_roles)) return
        data_exclusive_roles= data_exclusive_roles.map(r_t =>{
            return r_t.filter(r_id =>{return (r_id!==role.id)})
        }).filter(r_t =>{return (r_t.length>1)} )
        utils.settings.set(role.guild, 'exclusive_roles', data_exclusive_roles)

        var data_role_post_assign= utils.settings.get(role.guild, 'role_post_assign')
        if(!Boolean(data_role_post_assign)) return
        var del_ch_id= []
        for(var ch_id of Object.keys(data_role_post_assign)){
            var chanObj= data_role_post_assign[ch_id]
            delete data_role_post_assign[ch_id][role.id]
            if(Object.keys(chanObj).length<=0){
                del_ch_id.push(ch_id)
            }
        }
        for(var ch_id of del_ch_id){
            delete data_role_post_assign[ch_id]
        }
        utils.settings.set(role.guild, 'role_post_assign', data_role_post_assign)

        var data_msg_react_role= utils.settings.get(role.guild, 'msg_react_role')
        if(!Boolean(data_msg_react_role)) return
        for(var ch_msg_id in data_msg_react_role){
            if(!Boolean(ch_msg_id.match(/^[0-9]{15,21}\_[0-9]{15,21}$/))) continue
            
            var ch= role.guild.channels.cache.get(ch_msg_id.split('_')[0])
            if(!Boolean(ch)) continue

            let obj= data_msg_react_role[ch_msg_id]
            ch.messages.fetch(ch_msg_id.split('_')[1]).then(msg => {
                for(var em_txt in obj.roles){
                    var r_id= obj.roles[em_txt]
                    
                    if(r_id===role.id){
                        msg.reactions.cache.forEach(reaction =>{
                            let emtxt= em_txt
                            reaction.fetch().then(r =>{
                                if(r.emoji.toString()===emtxt){
                                    r.remove().then().catch(err =>{
                                        hereLog(`[removedRoles ev] error trying to remove reaction ${r} on message ${msg}:\n\t${err.message}`)
                                    })
                                }
                            }).catch(err => {
                                hereLog(`[removedRoles ev] error fetching reaction for role ${r_id} on message ${msg}:\n\t${err.message}`)
                            })
                        })
                    }
                }
            }).catch(err => {
                hereLog(`[removedRoles ev] couldn't find message ${ch_msg_id.split('_')[1]}:\n\t${err.message}`)
            })
        }
    }
    else if(eventName==="guildMemberUpdate"){
        var oldMember= arguments[2];
        var newMember= arguments[3];


        if(newMember.id===utils.getBotClient().user.id) return

        var addedRoles= [...newMember.roles.cache.filter(r => {return !oldMember.roles.cache.has(r.id);}).keys()];
        var keptRoles= [...newMember.roles.cache.filter(r => {return oldMember.roles.cache.has(r.id);}).keys()];
        var removedRoles= [...oldMember.roles.cache.filter(r => {return !newMember.roles.cache.has(r.id);}).keys()];
            
        hereLog(`[member update]addedROles ${addedRoles}`)
        hereLog(`[member update]keptRoles ${keptRoles}`)
        hereLog(`[member update]removedRoles ${removedRoles}`)

        if(addedRoles.length>0){
            var data_exclusive_roles= utils.settings.get(newMember.guild, 'exclusive_roles')
            if(!Boolean(data_exclusive_roles)) return

            var roles_to_remove=[]
            for(var a_r of addedRoles){
                for(var t_r of data_exclusive_roles){
                    if(t_r.includes(a_r)){
                        roles_to_remove= roles_to_remove.concat(
                            t_r.filter(r_id=>{return ((r_id!==a_r) && (keptRoles.includes(r_id)))})
                        )
                    }
                }
            }

            if(roles_to_remove.length>0){
                newMember.roles.remove(roles_to_remove)
            }
        }
        if(removedRoles.length>0){
            var data_msg_react_role= utils.settings.get(newMember.guild, 'msg_react_role')
            if(!Boolean(data_msg_react_role)) return

            for(var ch_msg_id in data_msg_react_role){
                if(!Boolean(ch_msg_id.match(/^[0-9]{15,21}\_[0-9]{15,21}$/))) continue
                
                var ch= newMember.guild.channels.cache.get(ch_msg_id.split('_')[0])
                if(!Boolean(ch)) continue

                let obj= data_msg_react_role[ch_msg_id]
                ch.messages.fetch(ch_msg_id.split('_')[1]).then(msg => {
                    for(var em_txt in obj.roles){
                        var r_id= obj.roles[em_txt]
                        
                        if(removedRoles.includes(r_id)){
                            msg.reactions.cache.forEach(reaction =>{
                                let emtxt= em_txt
                                reaction.fetch().then(r =>{
                                    if(r.emoji.toString()===emtxt){
                                        r.users.remove(newMember.id)
                                    }
                                }).catch(err => {
                                    hereLog(`[removedRoles ev] error fetching reaction for role ${r_id} on message ${msg.id}: ${err.message}`)
                                })
                            })
                        }
                    }
                }).catch(err => {
                    hereLog(`[removedRoles ev] couldn't find message ${ch_msg_id.split('_')[1]}: ${err.message}`)
                })
            }
        }
    }
    else if(eventName==="message"){
        let message= arguments[2]

        if(message.author.id===utils.getBotClient().user.id) return
            
        if(Boolean(message)){
            var data_role_mention_assign= utils.settings.get(message.guild, 'role_mention_assign')
            if( Boolean(message.mentions) && Boolean(message.mentions.roles) && Boolean(data_role_mention_assign)
                && data_role_mention_assign.some(r_id=>{return message.mentions.roles.has(r_id)})
            ){
                var roles_to_add=[]
                message.mentions.roles.forEach((v,k)=>{
                    if(data_role_mention_assign.includes(k)){
                        roles_to_add.push(k)
                    }
                })


                if(roles_to_add.length>0){
                    message.member.roles.add(roles_to_add)
                }
            }

            var data_role_post_assign= utils.settings.get(message.guild, 'role_post_assign')
            var chanObj= undefined
            if(Boolean(data_role_post_assign) && Boolean(chanObj=data_role_post_assign[message.channel.id])){
                var roles_to_add=[]
                for(var r_id of Object.keys(chanObj)){
                    var rObj= chanObj[r_id]
                    var unless= (Boolean(rObj))?rObj.unless:undefined;
                    var min= (Boolean(rObj))?rObj.min:undefined;
                    var r= undefined
                    if(!( Boolean(unless) && unless.find(u_r_id =>{return Boolean(message.member.roles.cache.get(u_r_id))}) )
                        && Boolean(r=message.guild.roles.cache.get(r_id)))
                    {
                        if(!(min>0 && message.content.length<min)){
                            roles_to_add.push(r)
                            message.react('😌').then().catch(err=>{
                                hereLog(`[message ev][role-post-assign] couldn't react 😌 to message ${message}:\n\t${err.message}`)
                            })
                        }
                        else{
                            message.react('🙄').then().catch(err=>{
                                hereLog(`[message ev][role-post-assign] couldn't react 🙄 to message ${message}:\n\t${err.message}`)
                            })
                        }
                    }

                    if(roles_to_add.length>0){
                        message.member.roles.add(roles_to_add)
                    }
                }
            }


            var answerChannels= undefined
            var ch= undefined
            if(Boolean(answerChannels=utils.settings.get(message.guild, "answerChannels")) &&
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



function cmd_guild_clear(guild){}



module.exports.name= ["post-role-message","edit-role-message","list-role-messages","about-role-message",
                        "set-role-message","exclusive-roles","mention-assign-role","post-assign-role"];
                        
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};