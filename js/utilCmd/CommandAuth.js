
const CommandData = require("./CommandData");

const my_utils= require("../utils")



let hereLog= (...args) => {console.log("[CommandAuth]", ...args);};

function __checkAndReduce_AuthObj(obj){
    if(!Boolean(obj)) return undefined
    var b= false
    var r_obj= {}
    for(var f of ['channel', 'user', 'role']){
        var d_obj= undefined
        if(Boolean(d_obj=obj[f]) && Boolean(d_obj.id)){
            r_obj[f]= d_obj.id
            b= true
        }
    }

    return b? r_obj : undefined
}

let F_MissingAuth= my_utils.Flags.MissingAuth

function __testMessageAgainstAutObj_specificField(discordMessage, authObj, field){
    let member= discordMessage.member
    let u_id= member.id
    let ch_id= discordMessage.channelId

    var auth_test= undefined
    var target_test= 0
    if(Boolean(authObj.user)){
        auth_test= (auth_test===undefined)? 0 : auth_test
        auth_test= auth_test | (Boolean(authObj.user===u_id)? F_MissingAuth.USER : F_MissingAuth.NONE)
        target_test= target_test | F_MissingAuth.USER
    }
    if(Boolean(authObj.channel)){
        auth_test= (auth_test===undefined)? 0 : auth_test
        auth_test= auth_test | (Boolean(authObj.channel===ch_id)? F_MissingAuth.CHANNEL : F_MissingAuth.NONE)
        target_test= target_test | F_MissingAuth.CHANNEL
    }
    if(Boolean(authObj.role)){
        auth_test= (auth_test===undefined)? 0 : auth_test
        auth_test= auth_test | (
                (Boolean(member.roles) && Boolean(member.roles.cache.get(authObj.role)))?
                        F_MissingAuth.ROLE
                    :   F_MissingAuth.NONE
            )
        target_test= target_test | F_MissingAuth.ROLE
    }
    hereLog(`=== ] yeah, so now auth_test is ${auth_test} and target_test is ${target_test}`)

    if(auth_test===undefined){
        hereLog('fff1')
        return undefined
    }
    else if(auth_test===target_test){
        hereLog('fff2')
        return F_MissingAuth.NONE
    }
    else{
        hereLog('fff3')
        return (target_test & (~auth_test))
    }
}


class CommandAuth extends CommandData{
    constructor(){
        super("cmd_auth")

        this._autoSave= true
    }

    set autoSave(b){
        this._autoSave= b
    }

    save(cmd_name, guild){
        this._saveData(cmd_name, guild.id)
    }

    addAuth(cmdAndSub, guild, authDiscordObj){
        let authObj= __checkAndReduce_AuthObj(authDiscordObj)

        if((typeof cmdAndSub)==='string'){
            cmdAndSub= cmdAndSub.split('::')
        }

        if(
            (!Boolean(cmdAndSub)) || cmdAndSub.length<=0 ||
            !Boolean(authObj)
        ){
            hereLog(`{addAuth} bad parametrization`)
            return false
        }

        let cmd_name= cmdAndSub.shift()
        this._checkData(cmd_name, guild.id)
        

        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(!Boolean(commandFileSettings=this._cmdSettings[cmd_name]) ||
            !Boolean(guild) || !Boolean(perGuildSettings=commandFileSettings[guild.id]) ||
            !Boolean(obj=perGuildSettings['object_json'])
        ){
            hereLog(`{addAuth} bad or incomplete settings states`)
            return false;
        }

        let field= cmdAndSub.join('::')
        field= (field.length<=0)?'*':field

        if(Boolean(obj[field])) obj[field].push(authObj)
        else obj[field]=  [ authObj ]

        if(this._autoSave) this._saveData(cmd_name, guild.id);

        return true;
    }

    deleteAuthField(cmdAndSub, guild){
        if((typeof cmdAndSub)==='string'){
            cmdAndSub= cmdAndSub.split('::')
        }

        if(!Boolean(cmdAndSub) || cmdAndSub.length<=0) return false;

        let cmd_name= cmdAndSub.shift()
        this._checkData(cmd_name, guild.id)
        
        let field= cmdAndSub.join('::')
        field= (field.length<=0)?'*':field

        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(Boolean(commandFileSettings=this._cmdSettings[cmd_name]) &&
            Boolean(perGuildSettings=commandFileSettings[guild.id]) &&
            Boolean(obj=perGuildSettings['object_json']) &&
            Boolean(obj[field])
        ){
            delete obj[field];
            if(this._autoSave) this._saveData(cmd_name, guild.id);

            return true;
        }

        return false
    }

    removeAuth(cmdAndSub, guild, authDiscordObj= undefined){
        let authObj= __checkAndReduce_AuthObj(authDiscordObj)

        if((typeof cmdAndSub)==='string'){
            cmdAndSub= cmdAndSub.split('::')
        }

        if(
            (!Boolean(cmdAndSub)) || cmdAndSub.length<=0 ||
            !Boolean(authObj)
        )
            return

        let cmd_name= cmdAndSub.shift()
        let field= cmdAndSub.join('::')
        field= (field.length<=0)?'*':field

        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(Boolean(commandFileSettings=this._cmdSettings[cmd_name]) &&
            Boolean(perGuildSettings=commandFileSettings[guild.id]) &&
            Boolean(obj=perGuildSettings['object_json']) &&
            Boolean(obj[field])
        ){
            if(!Boolean(authObj)){
                obj[field]= [];
            }
            else{
                obj[field]= obj[field].filter(authElem => {
                    for(var f of ['user','role','channel']){
                        if(authElem[f]!==authObj[f]){
                            return true
                        }
                    }
                    return false
                })
            }
            if(this._autoSave) this._saveData(cmd_name, guild.id);

            return true
        }

        return false
    }

    bulkRemove(cmd_name, guild, userIDs=[], roleIDs=[], channelIDs=[]){
        this._checkData(cmd_name, guild.id)
        
        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(Boolean(commandFileSettings=this._cmdSettings[cmd_name]) &&
            Boolean(perGuildSettings=commandFileSettings[guild.id]) &&
            Boolean(obj=perGuildSettings['object_json'])
        ){
            for(var f in obj){
                obj[f]= obj[f].filter(authElem => !(
                    (Boolean(authElem.user) && userIDs.includes(authElem.user)) ||
                    (Boolean(authElem.role) && roleIDs.includes(authElem.role)) ||
                    (Boolean(authElem.channel) && channelIDs.includes(authElem.channel))
                ))
            }
            if(this._autoSave) this._saveData(cmd_name, guild.id);

            return true
        }

        return false
    }

    getAuth(cmd_name, guild, userID=undefined, roleID=undefined, channelID=undefined){
        this._checkData(cmd_name, guild.id)
        
        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(!Boolean(commandFileSettings=this._cmdSettings[cmd_name]) ||
            !Boolean(guild) || !Boolean(perGuildSettings=commandFileSettings[guild.id]) ||
            !Boolean(obj=perGuildSettings['object_json'])
        ){
            return undefined;
        }

        if((!Boolean(userID))&&(!Boolean(roleID))&&(!Boolean(channelID))){
            return obj
        }

        var r= {}
        for(var f in obj){
            authObjs= obj[f]
            if(Boolean(authObjs)){
                var t= authObjs.filter(authElem => (
                    (Boolean(userID) && authElem.user===user.id) ||
                    (Boolean(roleID) && authElem.role===role.id) ||
                    (Boolean(channelID) && authElem.channel===channel.id)
                ))
                
                if(Boolean(t)){
                    r[f]= t
                }
            }
        }

        return r
    }

    getFieldAuth(cmdAndSub, guild){
        let cmd_name= cmdAndSub.shift()

        if((typeof cmdAndSub)!=='string'){
            cmdAndSub= cmdAndSub.join('::')
        }

        this._checkData(cmd_name, guild.id)

        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(!Boolean(commandFileSettings=this._cmdSettings[cmd_name]) ||
            !Boolean(guild) || !Boolean(perGuildSettings=commandFileSettings[guild.id]) ||
            !Boolean(obj=perGuildSettings['object_json'])
        ){
            return undefined;
        }

        return obj[cmdAndSub]
    }

    checkAuthAgainstMessage(cmdAndSub, discordMessage, _master=false){
        hereLog(`--- checkAuthAgainstMessage (${JSON.stringify(cmdAndSub)}})`)
        if((typeof cmdAndSub)==='string'){
            cmdAndSub= cmdAndSub.split('::')
        }

        let guild_id= discordMessage.guildId
        if(cmdAndSub.length<=0 || !Boolean(guild_id)) return false

        let cmd_name= cmdAndSub.shift()

        let master_stamp= (_master)?F_MissingAuth.MASTER_PRIVILEDGES:0
        this._checkData(cmd_name, guild_id)

        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(!Boolean(commandFileSettings=this._cmdSettings[cmd_name]) ||
            !Boolean(perGuildSettings=commandFileSettings[guild_id]) ||
            !Boolean(obj=perGuildSettings['object_json'])
        ){
            hereLog("--- --- bye 1")
            return (master_stamp |  F_MissingAuth.NO_DATA);
        }

        while(cmdAndSub.length>0){
            let field= cmdAndSub.join('::')
            hereLog(`--- testing '${field}'`)
            var authObjs= undefined
            if(Boolean(authObjs=obj[field])){
                var auth_test= undefined
                for(var authObj of authObjs){
                    hereLog(`--- > testing obj '${JSON.stringify(authObj)}'`)
                    auth_test= __testMessageAgainstAutObj_specificField(discordMessage, authObj, field)
                    if(auth_test===F_MissingAuth.NONE){
                        hereLog("--- --- bye 3")
                        return F_MissingAuth.NONE
                    }
                }

                //means there were tests made and all failed since we're here
                if(auth_test!==undefined){
                    hereLog("--- --- bye 4")
                    return (master_stamp | auth_test)
                }
            }

            cmdAndSub.pop()
        }
        if(Boolean(authObjs=obj['*'])){
            for(var authObj of authObjs){
                if((auth_test=__testMessageAgainstAutObj_specificField(discordMessage, authObj, '*'))===F_MissingAuth.NONE)
                    return F_MissingAuth.NONE
            }
            if(auth_test!==undefined){
                hereLog("--- --- bye 5")
                return (master_stamp | auth_test)
            }
        }

        hereLog("--- --- bye 2")
        return (master_stamp | F_MissingAuth.NO_DATA)
    }
}

module.exports= CommandAuth
