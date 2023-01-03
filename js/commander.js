const glob= require( 'glob' );
const path= require( 'path' );
const fs= require( 'fs' );

const config= require('config');


const my_utils= require('./utils');

const DEFINES= require('./defines');

const CommandSettings= require('./utilCmd/CommandSettings');
const CommandAuth = require('./utilCmd/CommandAuth');


let hereLog= (...args) => {console.log("[Commander]", ...args);};

let debug= false;


let E_RetCode= my_utils.Enums.CmdRetCode

class Commander{
    constructor(worker){
        this._worker= worker;

        this._cmdSettings= new CommandSettings();
        this._cmdAuth= new CommandAuth();

        this.loaded_commands= [];

        debug= ["1","on","true","debug"].includes(config.get('StrashBot.debug').toLowerCase());
        this._cmd_prefix= (debug)?'?':'!';

        this._db_guilds= {}

        this._trackedMessages= [];
        this._trackedMessagesRefreshed= false;


        this._dbDirPath= "../data/db"
        fs.mkdirSync(path.resolve(__dirname, this._dbDirPath), { recursive: true });
        

        this._utils= (cmd_name) => { return {
            settings: {
                set: (guild, field, value, mod_name=undefined) => {
                    var cmd= (Boolean(mod_name))? mod_name : cmd_name;
                    return this._cmdSettings.setField(cmd, guild, field, value);
                },
                get: (guild, field, mod_name=undefined) => {
                    var cmd= (Boolean(mod_name))? mod_name : cmd_name;
                    return this._cmdSettings.getField(cmd, guild, field);
                },
                remove: (guild, field, mod_name=undefined) => {
                    var cmd= (Boolean(mod_name))? mod_name : cmd_name;
                    this._cmdSettings.removeField(cmd, guild, field);
                },
            },
            checkAuth: (message, subCmd, mod_name=undefined) => {
                var cmd= (Boolean(mod_name))? mod_name : cmd_name;
                return this._cmdAuth.checkAuthAgainstMessage(
                    ( ((typeof subCmd)==='string')?
                            `${cmd}::${subCmd}`
                        :   [ cmd ].concat(subCmd) ),
                    message,
                    this._isMaster(message.author)
                )
            },
            getDataBase: (guild) =>{
                return Boolean(guild)?this._db_guilds[guild.id]:undefined;
            },
            getMemberClearanceLevel: this._getMemberClearanceLevel.bind(this),
            getBotClient: () => { return this._worker._bot;},
            cache_message_management:{
                keepTrackOf: (msg) => {if(!this._trackedMessages.find(m => {return m.id===msg.id})) this._trackedMessages.push(msg);},
                untrack: (msg) => {this._trackedMessages= this._trackedMessages.filter(m => {return m.id!==msg.id;});},
                isTracked: (msg) => {return Boolean(this._trackedMessages.find(m => {return m.id===msg.id}));},
                fetch: async (msgID) => {
                    var msg= undefined;
                    if(Boolean(msg=(this._trackedMessages.find(m => {return m.id===msgID})))){
                        return msg.channel.fetch(msgID);
                    }
                    else return undefined;
                }
            },
            getMasterID: () => { return this._worker._bot.masterID; },
            sendModMessage: (m, reciever, ...args) => {
                return this._sendModMessage(m, cmd_name, reciever, ...args)
            }
        }; };

        this._loadCommands();

        this.postProcessTargetCmd= []
        this._loadPPTargCmd()
    }

    destroy(){
        this.loaded_commands.forEach(lCmd =>{
            if(Boolean(lCmd.destroy)){
                lCmd.destroy();
            }
        });
    }

    _loadCommands(){
        let t=this;
        glob.sync('./js/commands/cmd_*.js').map( file =>{
            hereLog(`[Commander] loading '${file}'…`);

            let rcf= require(path.resolve(file))
            var m= null, d= null, h= null, e=null, i= null, c= null, d=null, mm= null;

            var cmd_name= my_utils.commandNameFromFilePath(file);
            
            var utils= this._utils(cmd_name)

            var tmp_l_cmd= undefined;
            t.loaded_commands.push( tmp_l_cmd={
                name: cmd_name,
                command: rcf.name,
                init_per_guild: ((Boolean(rcf.command) && Boolean(i=rcf.command.init_per_guild))? (g =>{i(utils,g)}):null),
                func: ((Boolean(rcf.command) && Boolean(m=rcf.command.main))? (cmdO, clrlv) => {return m(cmdO, clrlv, utils)}:null),
                funcDM: ((Boolean(rcf.command) && Boolean(d=rcf.command.directMsg))? (cmdO, clrlv, gs) => {return m(cmdO, clrlv, utils)}:null),
                help: ((Boolean(rcf.command) && Boolean(h=rcf.command.help))? h:null),
                event: ((Boolean(rcf.command) && Boolean(e=rcf.command.event))? ((name, ...args) => {return e(name, utils, ...args);}):null),
                destroy: ((Boolean(rcf.command) && Boolean(d=rcf.command.destroy))? (() => {return d(utils);}):null),
                clear_guild: ((Boolean(rcf.command) && Boolean(c=rcf.command.clear_guild))? c:null),
                modMessage: ((Boolean(rcf.command) && Boolean(mm=rcf.command.modMsg))? ((m, sender, ...args) => {return mm(m, sender, ...args)}):null),
                _wait_init: true,
            }); 
            t._cmdSettings.add(file);
            t._cmdAuth.add(file)

            if(Boolean(rcf.command)){
                if(Boolean(rcf.command.init)){
                    hereLog(`init for command '${rcf.name}'…`);
                    rcf.command.init(utils);
                }
                if(Boolean(rcf.command.init_per_guild)){
                    tmp_l_cmd._wait_init= true;
                    this._worker.bot.guilds.cache.forEach(async g => {
                        t._cmdSettings.addGuild(cmd_name, g.id)
                        t._cmdAuth.addGuild(cmd_name, g.id)
                        t._addGuildDB(g)
                        await rcf.command.init_per_guild(utils,g);
                    });
                    tmp_l_cmd._wait_init= false;
                }
            }
        });
    }

    _loadPPTargCmd(){
        let t=this;
        glob.sync('./js/postCmdTarget/pptcmd_*_*.js').map( file =>{
            hereLog(`[Commander] loading '${file}'…`);

            let rcf= require(path.resolve(file))
            var m= null

            var pptcmd_obj={}
            var cmd_name= my_utils.commandNameFromFilePath(file);
            var utils= this._utils(cmd_name)
            var match_res= undefined
            if(match_res=cmd_name.match(/pptcmd_([0-9]+)_([a-zA-Z]+)(.js)?/)){
                pptcmd_obj.guild_id= match_res[1]
                pptcmd_obj.command= match_res[2]
                pptcmd_obj.func= (Boolean(rcf.command) && Boolean(m=rcf.command.main))? (cmdO, clrlv) => {return m(cmdO, clrlv, utils)}:null

                t.postProcessTargetCmd.push( pptcmd_obj )
            }
        })

    }

    _addGuildCmd(guild){
        Object.keys(this._cmdSettings._cmdSettings).forEach( cmd => {
            this._cmdSettings.addGuild(cmd, guild.id);
            this._cmdAuth.addGuild(cmd, guild.id);
        });
        let t= this;
        this.loaded_commands.forEach(async l_cmd => {
            if(Boolean(l_cmd) && Boolean(l_cmd.init_per_guild)){
                l_cmd._wait_init= true;
                await l_cmd.init_per_guild(t._utils(l_cmd.name), guild);
                l_cmd._wait_init= false;
            }
            else{
                hereLog(`No init_per_guild: ${l_cmd.name}`)
            }
        });
    }

    _rmGuildCmd(guild){
        this.loaded_commands.forEach(l_cmd => {
            if(Boolean(l_cmd.clear_guild)){
                l_cmd.clear_guild(guild);
            }
        });
        Object.keys(this._cmdSettings._cmdSettings).forEach( cmd => {
            this._cmdSettings.rmGuild(cmd, guild.id);
            this._cmdAuth.rmGuild(cmd,guild.id)
        });
    }

    _addGuildDB(guild){
        if(Boolean(guild) && !Boolean(this._db_guilds[guild.id])){
            var fn= path.resolve(__dirname, `${this._dbDirPath}/${guild.id}.db`);
            this._db_guilds[guild.id]= new my_utils.DataBaseManager(fn)
        }
    }

    _rmGuildDB(guild){
        if(Boolean(guild) && Boolean(this._db_guilds[guild.id])){
            delete this._db_guilds[guild.id];
        }
    }

    _msgRoomUpdate(roomLeft){
        if(this._trackedMessages.length>=roomLeft){
            if(!this._trackedMessagesRefreshed){
                this._trackedMessages.forEach(msg =>{
                    msg.channel.messages.fetch(msg.id).catch(err=>{hereLog(err);});
                });
                this._trackedMessagesRefreshed= true;
            }
            if(roomLeft<1){
                this._trackedMessagesRefreshed= false;
            }
        }
    }

    _sendModMessage(m, sender, reciever){
        return new Promise((resolve, reject) =>{ 
            if(sender===reciever){
                reject(`Module can't send modMessages to itself ('${sender}')`)
                return
            }

            var str= `In l_commands there are:\n`
            for(var _lc of this.loaded_commands){
                str+= `\t- ${_lc.name}\n`
            }
            hereLog(str)

            var lCmd= this.loaded_commands.find(lc => {return lc.name===reciever})

            if(!Boolean(lCmd)){
                reject(`Couldn't find module '${reciever}'`)
            }
            else{
                var mm= lCmd.modMessage
                if(!Boolean(mm)){
                    reject(`Module '${reciever}' doesn't seem to handle modMessages`)
                    return
                }
                var args= Array.from(arguments).slice(3)
                var res= (await (mm(m, sender, ...args)))
                if(res===undefined || res===null){
                    reject(`Module '${reciever}' responded to modMessage (${m}, ${args}) with ${res}`)
                }
                else{
                    resolve(res)
                }
            }
            return
        })
    }

    async processCommand(cmdObj, isDM= false){
        var b=undefined;
        try{
            var cmd= cmdObj.command;
            var l_cmd=null;

            if(isDM){
                hereLog(`Private '${cmd}' command from '${cmdObj.msg_obj.author.username} (${cmdObj.msg_obj.author})'\n${cmdObj.msg_obj}`);
                if(cmd==="tell" && this._isMaster(cmdObj.msg_obj.author)){
                    if(Boolean(cmdObj.args) && cmdObj.args.length>0){
                        this._worker._bot.user.setActivity(cmdObj.args.join(' '));
                        b= E_RetCode.MASTER_PRIVILEDGES;
                    }
                    else{
                        b= E_RetCode.ERROR_INPUT;
                    }
                }
                else if(cmd==="bye" && this._isMaster(cmdObj.msg_obj.author)){
                    if(Boolean(cmdObj.args)){
                        this._worker._bot.destroy();
                        b=E_RetCode.MASTER_PRIVILEDGES;
                    }
                    else{
                        b=E_RetCode.ERROR_INPUT;
                    }
                }
                else if(cmd==="about"){
                    var str= `Hi! 👋 I am strashbot! Version ${config.get('StrashBot.version')}-${config.get('StrashBot.build')}`;
                    var src= undefined;
                    if(Boolean(src=config.get('StrashBot.source'))){
                        str+=`\n\tYou can get to know me better and explore my insides at ${src}. 😊`
                    }

                    cmdObj.msg_obj.reply(str);

                    b=E_RetCode.SUCCESS;
                }
                else if(cmd==="reload-data" && this._isMaster(cmdObj.msg_obj.author)){
                    this._cmdSettings.reloadData();
                    this._cmdAuth.reloadData()

                    b= E_RetCode.MASTER_PRIVILEDGES;
                }
                else if(cmd==="post-message" /*&& this._isMaster(cmdObj.msg_obj.author)*/){
                    var g_id= cmdObj.args[0];
                    var ch_id= cmdObj.args[1];

                    var guild= undefined, channel= undefined;
                    if(cmdObj.args.length<3){
                        cmdObj.msg_obj.reply("Format: `!post-message <guild_id> <channel_id> <message text…>`");
                        b= E_RetCode.ERROR_INPUT;
                    }
                    else if(!Boolean(g_id.match(/[0-9]{18}/g)) || !Boolean(guild=this._worker._bot.guilds.cache.get(g_id))){
                        cmdObj.msg_obj.reply("Cannot found specified guild…");
                        b= E_RetCode.ERROR_INPUT;
                    }
                    else if(!Boolean(ch_id.match(/[0-9]{18}/g)) || !Boolean(channel=guild.channels.cache.get(ch_id))){
                        cmdObj.msg_obj.reply("Cannot found specified channel…");
                        b= E_RetCode.ERROR_INPUT;
                    }
                    else if(!this._isMaster(cmdObj.msg_obj.author) && !this._hasAdminRoleInGuild(cmdObj.msg_obj.author,guild)){
                        cmdObj.msg_obj.reply(`[${cmdObj.command}] Forbidden: you don't seem to be admin in guild *${guild.name}*…`);
                        b= E_RetCode.ERROR_REFUSAL;
                    }
                    else{
                        var str= cmdObj.args.slice(2).join(' ')
                        var emojis= str.match(/(:\S+:)/g)
                        if(Boolean(emojis) && Array.isArray(emojis)){
                            emojis= [...new Set(emojis)]
                            var g_emojis= [...guild.emojis.cache.values()]
                            for(var emote of emojis){
                                var emoji= undefined
                                if(Boolean(emote) && Boolean(emote.length>2) &&
                                    Boolean(emoji=g_emojis.find(e => {return (e.name===emote.substring(1,emote.length-1))}))
                                ){
                                    str= str.replace(emote, emoji.toString())
                                }
                            }
                        }

                        channel.send(str).then(msg =>{
                            hereLog(`[${cmdObj.command}] ${msg.author.tag} made a message post: ${msg.url}`)
                        }).catch(err => {hereLog(err);})
                        b= E_RetCode.SUCCESS;
                    }
                }
                else if(cmd==="edit-message" /*&& this._isMaster(cmdObj.msg_obj.author)*/){
                    var g_id= cmdObj.args[0];
                    var ch_id= cmdObj.args[1];
                    var msg_id= cmdObj.args[2];

                    if(cmdObj.args.length<2){
                        cmdObj.msg_obj.reply("Format:\n\t`!edit-message <guild_id> <channel_id> <message_id> <message text…>`\n"+
                            "or\n\t`!edit-message <message_url> <message_text>`");
                        b= E_RetCode.ERROR_INPUT;
                    }
                    else{
                        var rgx_msg_url= /^https?\:\/\/discord\.com\/channels\/([0-9]{15,21})\/([0-9]{15,21})\/([0-9]{15,21})$/
                        var match= undefined
                        if(Boolean(match=cmdObj.args[0].match(rgx_msg_url))){
                            g_id= match[1]
                            ch_id= match[2]
                            msg_id= match[3]
                            cmdObj.args.shift()
                        }
                        else{
                            if(cmdObj.args.length<4){
                                cmdObj.msg_obj.reply("Format:\n\t`!edit-message <guild_id> <channel_id> <message_id> <message text…>`");
                                b= E_RetCode.ERROR_INPUT;
                            }
                            else{
                                g_id=cmdObj.args[0]
                                ch_id= cmdObj.args[1]
                                msg_id= cmdObj.args[2]

                                if(!Boolean(g_id.match(/[0-9]{18}/g))){
                                    cmdObj.msg_obj.reply(`[${cmdObj.command}] Invalid guild id (${g_id})…`);
                                    b= E_RetCode.ERROR_INPUT;
                                }
                                else if(!Boolean(ch_id.match(/[0-9]{18}/g))){
                                    cmdObj.msg_obj.reply(`[${cmdObj.command}] Invalid channel id (${ch_id})…`);
                                    b= E_RetCode.ERROR_INPUT;
                                }
                                else if(!Boolean(msg_id.match(/[0-9]{18}/g))){
                                    cmdObj.msg_obj.reply(`[${cmdObj.command}] Invalid message id (${msg_id})…`);;
                                    b= E_RetCode.ERROR_INPUT;
                                }
                                for(var i=0; i<3; ++i) cmdObj.args.shift()
                            }
                        }

                        if(b!==E_RetCode.ERROR_INPUT){
                            var guild= undefined, channel= undefined, message= undefined
                            if(!Boolean(guild=this._worker._bot.guilds.cache.get(g_id))){
                                cmdObj.msg_obj.reply(`[${cmdObj.command}] Couldn't find guild (${g_id})…`);
                                b= E_RetCode.ERROR_INPUT;
                            }
                            else if(!Boolean(channel=guild.channels.cache.get(ch_id))){
                                cmdObj.msg_obj.reply(`[${cmdObj.command}] Couldn't find channel (${ch_id})…`);
                                b= E_RetCode.ERROR_INPUT;
                            }
                            else if(!Boolean(message=(await channel.messages.fetch(msg_id)))){
                                cmdObj.msg_obj.reply(`[${cmdObj.command}] Couldn't find message (${msg_id})…`);
                                b= E_RetCode.ERROR_INPUT;
                            }
                            else if(!this._isMaster(cmdObj.msg_obj.author) && !this._hasAdminRoleInGuild(cmdObj.msg_obj.author,guild)){
                                cmdObj.msg_obj.reply(`[${cmdObj.command}] Forbidden: you don't seem to be admin in guild *${guild.name}*…`);
                                b= E_RetCode.ERROR_REFUSAL;
                            }
                            else{
                                var str= cmdObj.args.join(' ')
                                var emojis= str.match(/(:\S+:)/g)
                                if(Boolean(emojis) && Array.isArray(emojis)){
                                    emojis= [...new Set(emojis)]
                                    var g_emojis= [...guild.emojis.cache.values()]
                                    for(var emote of emojis){
                                        var emoji= undefined
                                        if(Boolean(emote) && Boolean(emote.length>2) &&
                                            Boolean(emoji=g_emojis.find(e => {return (e.name===emote.substring(1,emote.length-1))}))
                                        ){
                                            str= str.replace(emote, emoji.toString())
                                        }
                                    }
                                }
                                message.edit(str).then(msg =>{
                                    hereLog(`[${cmdObj.command}] ${msg.author.tag} made a message edit on ${msg.url}`)
                                }).catch(err => {hereLog(err);})
                                b=E_RetCode.SUCCESS;
                            }
                        }
                    }
                }
                else if(cmd==="auth" && this._isMaster(cmdObj.msg_obj.author)){
                    b= await this.CMD_auth_management_viaDM(cmdObj)
                }
                else if(Boolean(l_cmd=this.loaded_commands.find(e =>{return ( (Array.isArray(e.command) && e.command.includes(cmd)) || (e.command===cmd));}))){
                    if(Boolean(l_cmd.funcDM)){
                        while(l_cmd._wait_init){
                            __sleep(500);
                        }
                        var l_guilds= []
                        this._worker.bot.guilds.cache.each( await (async (g) => {
                            if(Boolean(g) && Boolean(await (g.members.fetch(cmdObj.msg_obj.author.id)))){
                                l_guilds.push(g)
                            }
                        }) )
                        b= await l_cmd.funcDM(cmdObj, this._getClearanceLevel(cmdObj.msg_obj), l_guilds);
                    }
                    else{
                        return undefined;
                    }
                }
            }

            var __clearanceManagementCmd= (cmd, sfx, mng_func, s_cmd=undefined) => {
                if(!cmd.endsWith(sfx)) return false;

                var match= null, pfx= "";
                if( (match=cmd.match("(.+)"+sfx)) && match.length>1 &&
                    (pfx=match[1]) && ['add','remove', 'rm', 'list','get', 'help'].includes(pfx) )
                {
                    hereLog(`'${cmd}' command by ${cmdObj.msg_obj.author} on ${cmdObj.msg_obj.channel}`);
                    var sub_cmd= (Boolean(s_cmd))? s_cmd : (pfx==='remove')? 'rm' : (pfx==='list')? 'get' : pfx;
                    return mng_func(sub_cmd, cmdObj.args, cmdObj.msg_obj);
                }
                return false;
            }

            if(b===undefined){
                var t_b= undefined;
                if( (t_b=__clearanceManagementCmd(cmd, "ctrlchannel", this.CMD_manageCtrlChannel.bind(this))) || 
                    (t_b=__clearanceManagementCmd(cmd, "adminrole", this.CMD_manageAdminRole.bind(this))) )
                { b= t_b;}
                else if(cmd==="help"){
                    var askedCmd= undefined;
                    if(!Boolean(cmdObj.args) || !Boolean(askedCmd=cmdObj.args[0])){
                        var str= `__**help** command__:\n\n`+
                            `\t\`!help command\``+
                            `\tProvides help on a given command (given appropriate clearance level).\n\n`+
                            `__*Commands*:__\n\n`+
                            `\t\`![add|remove|get]ctrlChannel\`\n`+
                            `\t\`![add|remove|get]adminRole\`\n`;
                        for (var c of this.loaded_commands){
                            if(Array.isArray(c.command)){
                                str+= '\t\`'+c.command.map( e =>{ return '!'+e+' '})+' \`\n';
                            }
                            else{
                                str+= `\t\`!${c.command}\`\n`;
                            }
                        }
                        str+= `\n__*DM Commands*:__\n\n`+
                            `\t\`!about\` \tBasic infos about myself.`;

                        if(isDM)
                            cmdObj.msg_obj.reply(str)
                        else
                            cmdObj.msg_obj.author.send(str);

                        b= E_RetCode.SUCCESS;
                    }
                    else{
                        askedCmd= (askedCmd.startsWith(this._cmd_prefix))?
                                askedCmd.slice(1)
                            :   askedCmd;
                        if( (b=__clearanceManagementCmd(askedCmd, "ctrlchannel", this.CMD_manageCtrlChannel.bind(this), 'help')) || 
                            (b=__clearanceManagementCmd(askedCmd, "adminrole", this.CMD_manageAdminRole.bind(this), 'help')) )
                        {;}
                        else if(Boolean(l_cmd=this.loaded_commands.find(e =>{return (Array.isArray(e.command) && e.command.includes(askedCmd)) || (e.command===askedCmd);}))){
                            if(Boolean(l_cmd.help)){
                                b= l_cmd.help(cmdObj, this._getClearanceLevel(cmdObj.msg_obj));
                            }
                            else{
                                b= false;
                            }
                        }
                    }
                }
                else if(cmd==="auth" && b===undefined &&
                    (this._isMaster(cmdObj.msg_obj.author) || this._hasAdminRole(cmdObj.msg_obj.member))
                ){
                    b= this.CMD_auth_management_inGuild(cmdObj)
                }
                else if(Boolean(l_cmd=this.loaded_commands.find(e =>{return ( (Array.isArray(e.command) && e.command.includes(cmd)) || (e.command===cmd));}))){
                    if(Boolean(l_cmd.func)){
                        while(l_cmd._wait_init){
                            __sleep(500);
                        }
                        b= await l_cmd.func(cmdObj, this._getClearanceLevel(cmdObj.msg_obj));
                    }
                    else{
                        b= undefined;
                    }

                    var pp_cmd= undefined
                    if(b!==undefined && 
                        Boolean(pp_cmd=this.postProcessTargetCmd.find(e => { return(
                            e.guild_id===cmdObj.msg_obj.guild.id && e.command===cmdObj.command
                        ) })) &&
                        Boolean(pp_cmd.func)
                    )
                    {
                        pp_cmd.func(cmdObj, this._getClearanceLevel(cmdObj.msg_obj))
                    }
                }
            }
        } catch(err){
            hereLog(`[COMMAND EXCEPTION CATCHED!!!] ${err}`)
            b= E_RetCode.ERROR_CRITICAL
        }

        // if(b!==undefined) cmdObj.msg_obj.react((b)?'✅':'❌');
        let reaction= my_utils.emoji_retCode(b)
        if(Boolean(reaction)) cmdObj.msg_obj.react(reaction)
    }

    onEvent(eventName){
        this.loaded_commands.forEach(lCmd =>{
            if(lCmd.event){
                // hereLog(`(${lCmd.name}).eventName(${eventName}, ${[...Array.from(arguments).slice(1)]})`)
                lCmd.event(eventName, ...Array.from(arguments).slice(1));
            }
        });
    }

    _isMaster(user){
        return user.id===this._worker._bot.masterID;
    }

    _hasAdminRole(member){
        var guildSettings= undefined, roles= undefined;
        return (Boolean(member.roles) &&  Boolean(guildSettings=this._worker._settings.guildsSettings[member.guild.id]) &&
                (Boolean(roles=guildSettings['adminRoles'])) &&
                    roles.find(r_id=>{
                        return (Boolean(member.roles.cache.get(r_id)));
                    })
                );
    }

    _hasAdminRoleInGuild(user, guild){
        var member= guild.members.resolve(user.id)
        return (Boolean(member) && this._hasAdminRole(member))
    }

    _getGuildWhereUserHasAdminRole(user){
        return ( [...(this.worker.bot.guilds.cache.values())].filter(g => {return this._hasAdminRoleInGuild(user,g)}) )
    }

    _isCtrlChannel(channel){
        var guildSettings= undefined, channels= undefined;
        return (Boolean(channel.guild) &&
                Boolean(guildSettings=this._worker._settings.guildsSettings[channel.guild.id]) &&
                (Boolean(channels=guildSettings['ctrlChannels'])) &&
                    channels.includes(channel.id)
                );
    }

    _getMemberClearanceLevel(member){
        return DEFINES.CLEARANCE_LEVEL.NONE |
                ((this._isMaster(member.user))? DEFINES.CLEARANCE_LEVEL.MASTER_ID : 0) |
                ((this._hasAdminRole(member))? DEFINES.CLEARANCE_LEVEL.ADMIN_ROLE : 0);
    }

    _getClearanceLevel(message){
        if(!Boolean(message.guild)){
            return ((this._isMaster(message.author))? DEFINES.CLEARANCE_LEVEL.MASTER_ID : DEFINES.CLEARANCE_LEVEL.NONE)
        }
        else{
            return (this._getMemberClearanceLevel(message.member) |
                    ((this._isCtrlChannel(message.channel))? DEFINES.CLEARANCE_LEVEL.CONTROL_CHANNEL : 0));
        }
    }

    _meta_CMD_management(cmd, message, mentionType, guildSettingsField){
        var clvl= 0;
        if( (clvl=this._getClearanceLevel(message)) < DEFINES.CLEARANCE_LEVEL.ADMIN_ROLE ){
            message.author.send(`Only a user with “*admin*” access can manage StrashBot's ${guildSettingsField}…`);

            return false;
        }

        let guild= message.guild;

        if((Boolean(message.mentions) && Boolean(message.mentions[mentionType]) && (message.mentions[mentionType].size>0)) ||
            ["get","help"].includes(cmd)
        ){
            var guildSettings= null;
            if(!Boolean(guildSettings=this._worker._settings.guildsSettings[guild.id])){
                return false
            }
            if(!Boolean(guildSettings[guildSettingsField])){
                this._worker._settings.guildsSettings[guild.id][guildSettingsField]=[];
            }

            var obj= this._worker._settings.guildsSettings[guild.id][guildSettingsField];
            if(cmd==="add"){
                message.mentions[mentionType].each( type => {
                    if(!obj.includes(type.id)) obj.push(type.id);
                });

                this._worker._settings.saveGuildsSetup();
            }
            else if(cmd==="rm"){
                message.mentions[mentionType].each( type => {
                    if(obj.includes(type.id)) this._worker._settings.guildsSettings[guild.id][guildSettingsField]= obj.filter(e => {return e!=type.id});
                });

                this._worker._settings.saveGuildsSetup();
            }
            else if(cmd==="get"){
                var str= "";
                obj.forEach(element => {
                    str+=`\t- ${(guildSettingsField==='ctrlChannels')?
                                `<#${element}>`
                                : (guildSettingsField==='adminRoles')?
                                    (Boolean(guild.roles) && Boolean(guild.roles.cache.get(element)))?
                                        guild.roles.cache.get(element).name
                                        : `<@${element}>`
                                    : "unknown"
                        }`
                });
                if(str.length<=0){
                    str= "\tthere are none…"
                }

                message.author.send(`${(guildSettingsField==='ctrlChannels')?"Contoll channels":"Admin roles"} for ${guild}:\n${str}`);
            }
            else if(cmd==="help"){
                message.author.send("No help available…");
            }

            return true;
        }
        else{
            message.author.send(`No ${mentionType} mention detected`);

            return false;
        }
    }

    CMD_manageCtrlChannel(cmd, args, message){
        if(cmd==="help"){
            message.author.send(`__**adminrole** command family___:\n\n`+
                `*Admin Roles only:**\n\n`+
                `\t\`!addadminrole @role\`\n\n`+
                `\tThe members of the mentionned role will be granted 'admin' acknowledgment privileges by myself.\n\n`+
                `\t\`!rmadminrole @role\`\n\n`+
                `\tIf members of mentionned role previously had 'admin' privileges, it will no longer be the case.\n\n`+
                `\t\`!getadminrole\`\n\n`+
                `\tLists all of the roles that have 'admin' privileges.`
            );
            return true;
        }
        else
            return this._meta_CMD_management(cmd, message, 'channels', 'ctrlChannels');
    }

    CMD_manageAdminRole(cmd, args, message){
        if(cmd==="help"){
            message.author.send(`__**ctrlchannel** command family___:\n\n`+
                `*Admin Roles only:**\n\n`+
                `\t\`!addctrlchannel #channel\`\n\n`+
                `\tThe mentionned channel will be recognized has a 'control' channel.\n\n`+
                `\t\`!rmctrlchannel #channel\`\n\n`+
                `\tIf the mentionned channel was previously considered has a 'control' channel, it will no longer be the case.\n\n`+
                `\t\`!getctrlchannel\`\n\n`+
                `\tLists all of the control channels.`
            );
            return true;
        }
        else
            return this._meta_CMD_management(cmd, message, 'roles', 'adminRoles');
    }

    CMD_auth_management_inGuild(cmdObj){
        let message= cmdObj.msg_obj
        let guild= message.guild
        var args= cmdObj.args

        let sub1= args.shift()

        let ___extractParamForAddandRm= () =>{
            var authObj= undefined
            var cmdAndSub= []

            let SUBLIMIT= 32
            var i=0
            while(args.length>0 && i<SUBLIMIT){
                let arg= args.shift()

                if(!Boolean(my_utils.processMention(arg))){
                    cmdAndSub.push(arg)
                    ++i
                }
                else{
                    break;
                }
            }

            if(Boolean(m=message.mentions)){
                authObj= Boolean(authObj)? authObj : {}

                if(Boolean(m.members) && m.members.size){
                    authObj['user']= m.members.first()
                }
                if(Boolean(m.channels) && m.channels.size){
                    authObj['channel']= m.channels.first()
                }
                if(Boolean(m.roles) && m.roles.size){
                    authObj['role']= m.roles.first()
                }
            }

            return {cmdAndSub, authObj}
        }
        if(['add','+'].includes(sub1)){
            let extract= ___extractParamForAddandRm()

            if(extract.cmdAndSub.length<=0){
                message.author.send(`[*${guild.name}*]{auth} adding auth for command needs to actually specify cmd`)
                return E_RetCode.ERROR_INPUT;
            }
            if(!Boolean(extract.authObj)){
                message.author.send(`[*${guild.name}*]{auth} missing mentions to handle auth`)
                return E_RetCode.ERROR_INPUT
            }

            let r= this._cmdAuth.addAuth(extract.cmdAndSub, guild, extract.authObj)

            if(!r){
                message.author.send(`[*${guild.name}*]{auth} internal error adding auth`)
                return E_RetCode.ERROR_INTERNAL 
            }
            return E_RetCode.SUCCESS
        }
        else if(['rm','-','del','remove','delete'].includes(sub1)){
            let extract= ___extractParamForAddandRm()

            var r= undefined
            if(extract.cmdAndSub.length<=0){
                message.author.send(`[*${guild.name}*]{auth} need to specify main cmd`)
                return E_RetCode.ERROR_INPUT 
            }
            else if(extract.cmdAndSub.length===1){
                var userIDs= []
                var roleIDs= []
                var channelIDs= []

                let cmd_name= extract.cmdAndSub[0]

                var m= undefined
                if(Boolean(m=message.mentions)){
                    if(Boolean(m.members)){
                        m.members.forEach(member=>{
                            userIDs.push(member.id)
                        })
                    }
                    if(Boolean(m.channels)){
                        m.channels.forEach(channel=>{
                            channelIDs.push(channel.id)
                        })
                    }
                    if(Boolean(m.roles)){
                        m.roles.forEach(role=>{
                            roleIDs.push(role.id)
                        })
                    }
                }

                r=  this._cmdAuth.bulkRemove(cmd_name, guild, userIDs, roleIDs, channelIDs)
            }
            else{
                r= this._cmdAuth.removeAuth(extract.cmdAndSub, guild, extract.authObj)
            }

            if(!r){
                message.author.send(`[*${guild.name}*]{auth} internal error removing auth`)
                return E_RetCode.ERROR_INTERNAL 
            }
            return E_RetCode.SUCCESS
        }
        else if(['get','test','look','check'].includes(sub1)){
            let extract= ___extractParamForAddandRm()

            var r= undefined
            if(extract.cmdAndSub.length<=0){
                message.author.send(`[*${guild.name}*]{auth} need to specify main cmd`)
                return E_RetCode.ERROR_INPUT 
            }
            else if(extract.cmdAndSub.length===1){
                let userID= undefined
                let roleID= undefined
                let channelID= undefined

                var m= undefined
                if(Boolean(m=message.mentions)){
                    if(Boolean(m.members) && m.members.size){
                        userID= m.members.first().id
                    }
                    if(Boolean(m.channels) && m.channels.size){
                        channelID= m.channels.first().id
                    }
                    if(Boolean(m.roles) && m.roles.size){
                        roleID= m.roles.first().id
                    }
                }

                r= this._cmdAuth.getAuth(extract.cmdAndSub[0], guild, userID, roleID, channelID)
            }
            else{
                r= this._cmdAuth.getFieldAuth(extract.cmdAndSub, guild)
            }
            
            if(!r){
                message.author.send(`[*${guild.name}*]{auth} internal error removing auth`)
                return E_RetCode.ERROR_INTERNAL 
            }
            else{
                message.author.send({
                    content: `[*${guild.name}*]{auth} requested auth`,
                    files: [ {
                        attachment: Buffer.from(JSON.stringify(r)),
                        name: `${extract.cmdAndSub[0]}_auth.json`
                    } ]
                })

                return E_RetCode.SUCCESS
            }
        }
        else if(['clean','purge'].includes(sub1)){
            let extract= ___extractParamForAddandRm()

            if((!Boolean(extract && extract.cmdAndSub)) || extract.cmdAndSub.length<=0){
                message.author.send(`[*${guild.name}*]{auth} need to specify main cmd`)
                return E_RetCode.ERROR_INPUT
            }
            else{
                return (this._cmdAuth.deleteAuthField(extract.cmdAndSub, guild))?
                            E_RetCode.SUCCESS
                        :   E_RetCode.ERROR_INTERNAL
            }
        }

        return E_RetCode.ERROR_INPUT;
    }

    async CMD_auth_management_viaDM(cmdObj){
        let is_id= txt => Boolean(txt && txt.match(/^\d+$/))

        let message= cmdObj.msg_obj
        var args= cmdObj.args
        let arg_guild= args.shift()
        let guild= undefined
        try{
            if((!is_id(arg_guild)) ||
                (!Boolean(guild= (await this._worker.bot.guilds.fetch(arg_guild))))
            ){
                message.reply("[DM]{auth} first, need an guild id to work with...")
                return E_RetCode.ERROR_INPUT
            }
        }catch(err){
            message.reply(`[DM]{auth} couldn't identify guild…`)
            hereLog(`{cmd_auth_dm} error identifying guild: ${err}`)
            return E_RetCode.ERROR_INPUT        
        }

        let extract_discordObj= async (idTypeObj) => {
            if(!Boolean(idTypeObj)) return undefined
            var r= undefined
            if(
                (idTypeObj.type==='user' && Boolean(r= (await guild.members.fetch(idTypeObj.id))) )||
                (idTypeObj.type==='role' && Boolean(r= (await guild.roles.fetch(idTypeObj.id))) )||
                (idTypeObj.type==='channel' && Boolean(r= (await guild.channels.fetch(idTypeObj.id))))
            ){
                return {type: idTypeObj.type, value: r}
            }
            return undefined
        }

        let auth_sub1= args.shift()
        if(!Boolean(auth_sub1)){
            message.reply("[DM]{auth} need an instruction? ('add','rm','get')...")
            return E_RetCode.ERROR_INPUT
        }

        var cmdAndSub= []
        let SUBLIMIT= 32
        var i=0
        while(args.length>0 && i<SUBLIMIT){
            let arg= args[0]

            if(!Boolean(my_utils.processMention(arg))){
                cmdAndSub.push(arg)
                args.shift()
                ++i
            }
            else break;
        }
        if(!Boolean(cmdAndSub)){
            message.reply("[DM]{auth} need set of command and sub_cmds to work with...")
            return E_RetCode.ERROR_INPUT
        }

        let extract_mentions= async () => {
            var collected= {users: [], channels: [], roles: []}
            while(args.length>0){
                let arg= args.shift()
                var discordObj= await extract_discordObj(my_utils.processMention(arg))
                let field=""
                if(Boolean(discordObj && discordObj.value) &&
                    !collected[field=`${discordObj.type}s`].includes(discordObj.value)
                ){
                    collected[field].push(discordObj.value)
                }
            }
            if( collected.users.length<=0
                && collected.channels.length<=0
                && collected.roles.length<=0
            )
                return undefined
            return collected
        }

        let authObj_formMentionsObj = (mobj) => {
            if(!Boolean(mobj)) return undefined
            var authObj= undefined
            if(Boolean(mobj)){
                if(Boolean(mobj.users.length>0)){
                    authObj= (Boolean(authObj)?authObj:{})
                    authObj.user= mobj.users[0]
                }
                if(Boolean(mobj.channels.length>0)){
                    authObj= (Boolean(authObj)?authObj:{})
                    authObj.channel= mobj.channels[0]
                }
                if(Boolean(mobj.roles.length>0)){
                    authObj= (Boolean(authObj)?authObj:{})
                    authObj.role= mobj.roles[0]
                }
            }

            return authObj
        }

        if(['add','+'].includes(auth_sub1)){
            let mentions= await extract_mentions()
            var authObj=  authObj_formMentionsObj(mentions)

            if(!Boolean(authObj)){
                message.reply(`[DM]{auth} add auth requires users (<@\\d+>), roles (<@&\\d+>), or channels (<#\\d+>)…`)
                return E_RetCode.ERROR_INPUT
            }
            let r= this._cmdAuth.addAuth(cmdAndSub, guild, authObj)

            if(!r){
                message.reply(`[DM]{auth} internal error adding auth`)
                return E_RetCode.ERROR_INTERNAL 
            }
            return E_RetCode.MASTER_PRIVILEDGES
        }
        else if(['rm','-','del','remove','delete'].includes(auth_sub1)){
            var r= undefined
            let mentions= await extract_mentions()
            if(Boolean(mentions)){
                if(cmdAndSub.length===1){
                    let cmd_name= cmdAndSub[0]

                    r= this._cmdAuth.bulkRemove(cmd_name, guild,
                            mentions.users.map(u=> u.id),
                            mentions.roles.map(r=>r.id),
                            mentions.channels.map(ch=>ch.id)
                        )
                }
                else{
                    var authObj= authObj_formMentionsObj(mentions)

                    r= this._cmdAuth.removeAuth(cmdAndSub, guild, authObj)
                }
            }

            if(!r){
                message.reply(`[DM]{auth} internal error removing auth`)
                return E_RetCode.ERROR_INTERNAL 
            }
            return E_RetCode.MASTER_PRIVILEDGES
        }
        else if(['get','test','look','check'].includes(auth_sub1)){
            var r= undefined
            let mentions= await extract_mentions()
            
            if((!Boolean(cmdAndSub)) || cmdAndSub.length<=0){
                message.reply(`[*${guild.name}*]{auth} need to specify main cmd`)
                return E_RetCode.ERROR_INPUT
            }
            else if(cmdAndSub.length===1){
                var userID= undefined
                var roleID= undefined
                var channelID= undefined

                if(Boolean(mentions)){
                    var authObj= authObj_formMentionsObj(mentions)
                    
                    userID= authObj.user?authObj.user.id:undefined
                    roleID= authObj.role?authObj.role.id:undefined
                    channelID= authObj.channel?authObj.channel.id:undefined
                }

                r= this._cmdAuth.getAuth(cmdAndSub[0], guild, userID, roleID, channelID)
            }
            else{
                r= this._cmdAuth.getFieldAuth(cmdAndSub, guild)
            }
            
            
            if(!r){
                message.reply(`[DM]{auth} internal error get auth`)
                return E_RetCode.ERROR_INTERNAL 
            }
            else{
                message.reply({
                    content: `[DM]{auth} requested auth`,
                    files: [ {
                        attachment: Buffer.from(JSON.stringify(r)),
                        name: `${cmdAndSub[0]}_auth.json`
                    } ]
                })

                return E_RetCode.MASTER_PRIVILEDGES
            }
        }
        else if(['clean','purge'].includes(auth_sub1)){
            if((!Boolean(cmdAndSub)) || cmdAndSub.length<=0){
                message.reply(`[*${guild.name}*]{auth} need to specify main cmd`)
                return E_RetCode.ERROR_INPUT
            }
            else{
                return this._cmdAuth.deleteAuthField(cmdAndSub, guild)?
                            E_RetCode.MASTER_PRIVILEDGES
                        :   E_RetCode.ERROR_INTERNAL
            }
        }

        return E_RetCode.ERROR_INPUT;
    }
}

module.exports.Commander= Commander;
