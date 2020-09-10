const glob= require( 'glob' );
const path= require( 'path' );
const fs= require( 'fs' );

const config= require('config');

const my_utils= require('./utils');

const DEFINES= require('./defines')

let hereLog= (...args) => {console.log("[Commander]", ...args);};

function __sleep(ms){
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
}


class CommandSettings{
    constructor(){
        this._dirPath= "../data/commands"
        fs.mkdirSync(path.resolve(__dirname, this._dirPath), { recursive: true });

        this._cmdSettings= {};
        
        this._save_lock= false;
    }

    add(cmdFileName){
        if(!Boolean(cmdFileName)) return;

        // var cmd_name= path.basename(cmdFileName);
        // cmd_name= (cmd_name.startsWith("cmd_"))? cmd_name.slice(4) : cmd_name;
        // cmd_name= (cmd_name.endsWith(".js"))? cmd_name.slice(0,-3) : cmd_name;
        var cmd_name= my_utils.commandNameFromFilePath(cmdFileName);

        var commandFileSettings= this._cmdSettings[cmd_name];
        if(!Boolean(commandFileSettings)){
            this._cmdSettings[cmd_name]= {};
            commandFileSettings= this._cmdSettings[cmd_name];
        }
    }

    __loadingJSONObj(fileName){
        if(fs.existsSync(fileName)){
            var data= fs.readFileSync(fileName);

            var r= undefined;
            if(Boolean(data) && Boolean(r=JSON.parse(data))){
                return r;
            }
            else{
                hereLog(`[Settings] Error reading data from '${fileName}'`);
                return undefined;
            }
        }
        else{
            return undefined;
        }
    }

    addGuild(cmd_name, guildID){
        // var cmd_name= my_utils.commandNameFromFilePath(cmdFilePath);

        var commandFileSettings= this._cmdSettings[cmd_name];
        if(!Boolean(commandFileSettings))
            return false;

        var perGuildSettings= undefined;
        if(!Boolean(perGuildSettings=commandFileSettings[guildID])){
            commandFileSettings[guildID]= {};
            perGuildSettings= commandFileSettings[guildID];
        }

        var fn= `${this._dirPath}/${cmd_name}_${guildID}.json`;
        perGuildSettings['file']= path.resolve(__dirname, fn);
        var ld_data= this.__loadingJSONObj(perGuildSettings['file']);
        if(Boolean(ld_data)){
            perGuildSettings['object_json']= ld_data;
        }
        else{
            perGuildSettings['object_json']= {};

            var data= JSON.stringify({}, null, 2);

            fs.writeFile(perGuildSettings['file'], data, err => {
                if(err){
                    hereLog(`[CS Saving](2) Couldn't write in file '${perGuildSettings['file']}'…` );
                    hereLog(err);
                }
            });
        }
    }

    async rmGuild(cmd_name, guildID){
        //var cmd_name= my_utils.commandNameFromFilePath(cmdFilePath);

        var commandFileSettings= this._cmdSettings[cmd_name];
        if(!Boolean(commandFileSettings))
            return;

        var perGuildSettings= undefined;
        if(!Boolean(perGuildSettings=commandFileSettings[guildID])){
            commandFileSettings[guildID]= {};
            perGuildSettings= commandFileSettings[guildID];
        }

        while(this._save_lock){
            await __sleep(1000);
        }
        this._save_lock= true;
        var f= undefined;
        if(Boolean(f=perGuildSettings['file']) && fs.existsSync(f)){
            fs.unlink(f, err =>{
                if(err){
                    hereLog(`[CS Deleting] error with ${f} unlink…`);
                    hereLog(err);
                }
                hereLog(`[CS Deleting] ${f} unlink…`);
            });
        }
        this._save_lock=false;

        delete commandFileSettings[guildID];
    }

    async reloadData(){
        while(this._save_lock){
            await __sleep(1000);
        }
        this._save_lock= true;

        Object.keys(this._cmdSettings).forEach( cmd_name => {
            var cmd_sett_obj= this._cmdSettings[cmd_name];

            var fn= cmd_sett_obj['file'];
            var data= undefined;
            if(Boolean(fn) && Boolean(data=this.__loadingJSONObj(fn))){
                cmd_sett_obj['object_json']= data;
            }
            else{
                hereLog(`[Error] cound't reload data from ${fn}`);
            }
        })
        
        this._save_lock= false;
    }

    async _saveData(cmd_name, guildID){
        //var cmd_name= my_utils.commandNameFromFilePath(cmdFilePath);

        var ttt=Date.now();
        while(this._save_lock){
            await __sleep(1000);
        }
        this._save_lock= true;
        
        var obj= this._cmdSettings[cmd_name]['object_json'];
        var data= JSON.stringify(obj, null, 2);

        var commandFileSettings= this._cmdSettings[cmd_name];
        var perGuildSettings= undefined;
        if(!Boolean(perGuildSettings=commandFileSettings[guildID])){
            this.addGuild(cmd_name, guildID);
            if(!Boolean(perGuildSettings=commandFileSettings[guildID])){
                return false;
            }
        }

        var obj= perGuildSettings['object_json'];
        var data= JSON.stringify(obj, null, 2);


        await fs.writeFile(perGuildSettings['file'], data, err => {
            if(err){
                hereLog(`[CS Saving](1) Couldn't write in file '${perGuildSettings['file']}'…` );
                hereLog(err);
            }
        });

        this._save_lock= false;
    }

    getField(cmd_name, guild, fieldName){
        // var cmd_name= my_utils.commandNameFromFilePath(cmdFilePath);

        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(!Boolean(commandFileSettings=this._cmdSettings[cmd_name]) ||
            !Boolean(perGuildSettings=commandFileSettings[guild.id]) ||
            !Boolean(obj=perGuildSettings['object_json'])
        ){
            return undefined;
        }
        else{
            var fields=fieldName.split('.');
            var t= obj;
            for (var f of fields){
                if(!Boolean(t=obj[f])){
                    break;
                }
            }
            if(!Boolean(t)) return undefined;
            return t;
        }
    }

    setField(cmd_name, guild, fieldName, value){
        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(!Boolean(commandFileSettings=this._cmdSettings[cmd_name]) ||
            !Boolean(perGuildSettings=commandFileSettings[guild.id]) ||
            !Boolean(obj=perGuildSettings['object_json'])
        ){
            return false;
        }
        else{
            var fields=fieldName.split('.');
            var t= obj;
            var tt= undefined;
            for (var f of fields){
                tt=t;
                if(!Boolean(t=obj[f])){
                    obj[f]= undefined;
                    t=obj[f];
                }
            }

            var l=0;
            if(!Boolean(l=fields.length)) obj= value;
            else{
                tt[fields[l-1]]= value;
            }
            this._saveData(cmd_name, guild.id);

            return true;
        }

        
    }

    removeField(cmd_name, guild, fieldName){
        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(Boolean(commandFileSettings=this._cmdSettings[cmd_name]) &&
            Boolean(perGuildSettings=commandFileSettings[guild.id]) &&
            Boolean(obj=perGuildSettings['object_json'])
        ){
            delete obj[fieldName];
            this._saveData(cmd_name, guild.id);
        }
    }
}

class Commander{
    constructor(worker){
        this._worker= worker;

        this._cmdSettings= new CommandSettings();

        this.loaded_commands= [];

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
            getMasterID: () => { return this._worker._bot.masterID; }
        }; };

        this._loadCommands();

        this._trackedMessages= [];
        this._trackedMessagesRefreshed= false;
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
            var m= null, h= null, e=null, i= null, c= null, d=null;

            var cmd_name= my_utils.commandNameFromFilePath(file);
            
            var utils= this._utils(cmd_name)

            var tmp_l_cmd= undefined;
            t.loaded_commands.push( tmp_l_cmd={
                name: rcf.name,
                init_per_guild: ((Boolean(rcf.command) && Boolean(i=rcf.command.init_per_guild))? (g =>{i(utils,g)}):null),
                func: ((Boolean(rcf.command) && Boolean(m=rcf.command.main))? (cmdO, clrlv) => {return m(cmdO, clrlv, utils)}:null),
                help: ((Boolean(rcf.command) && Boolean(h=rcf.command.help))? h:null),
                event: ((Boolean(rcf.command) && Boolean(e=rcf.command.event))? ((name, ...args) => {return e(name, utils, ...args);}):null),
                destroy: ((Boolean(rcf.command) && Boolean(d=rcf.command.destroy))? (() => {return d(utils);}):null),
                clear_guild: ((Boolean(rcf.command) && Boolean(c=rcf.clear_guild))? c:null),
                _wait_init: true,
            }); 
            t._cmdSettings.add(file);

            if(Boolean(rcf.command)){
                if(Boolean(rcf.command.init)){
                    hereLog(`init for command '${rcf.name}'…`);
                    rcf.command.init(utils);
                }
                if(Boolean(rcf.command.init_per_guild)){
                    tmp_l_cmd._wait_init= true;
                    this._worker.bot.guilds.cache.forEach(async g => {
                        t._cmdSettings.addGuild(cmd_name, g.id)
                        await rcf.command.init_per_guild(utils,g);
                    });
                    tmp_l_cmd._wait_init= false;
                }
            }
        });
    }

    _addGuildCmd(guild){
        Object.keys(this._cmdSettings._cmdSettings).forEach( cmd => {
            this._cmdSettings.addGuild(cmd, guild.id);
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
            l_cmd.clear_guild(guild);
        });
        Object.keys(this._cmdSettings._cmdSettings).forEach( cmd => {
            this._cmdSettings.rmGuild(cmd, guild.id);
        });
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

    async processCommand(cmdObj, isDM= false){
        var b=undefined;
        var cmd= cmdObj.command;
        var l_cmd=null;

        if(isDM){
            hereLog(`Private '${cmd}' command from '${cmdObj.msg_obj.author.username} (${cmdObj.msg_obj.author})'\n${cmdObj.msg_obj}`);
            if(cmd==="tell" && this._isMaster(cmdObj.msg_obj.author)){
                if(Boolean(cmdObj.args) && cmdObj.args.length>0){
                    this._worker._bot.user.setActivity(cmdObj.args.join(' '));
                    b= true;
                }
                else{
                    b= false;
                }
            }
            else if(cmd==="bye" && this._isMaster(cmdObj.msg_obj.author)){
                if(Boolean(cmdObj.args)){
                    this._worker._bot.destroy();
                    b=true;
                }
                else{
                    b=false;
                }
            }
            else if(cmd==="about"){
                var str= `Hi! 👋 I am strashbot! Version ${config.get('StrashBot.version')}-${config.get('StrashBot.build')}`;
                var src= undefined;
                if(Boolean(src=config.get('StrashBot.source'))){
                    str+=`\n\tYou can get to know me better and explore my insides at ${src}. 😊`
                }

                cmdObj.msg_obj.author.send(str);

                b=true;
            }
            else if(cmd==="reload-data" && this._isMaster(cmdObj.msg_obj.author)){
                this._cmdSettings.reloadData();

                b= true;
            }
            else if(cmd==="post-message" && this._isMaster(cmdObj.msg_obj.author)){
                var g_id= cmdObj.args[0];
                var ch_id= cmdObj.args[1];

                var guild= undefined, channel= undefined;
                if(cmdObj.args.length<2){
                    cmdObj.msg_obj.author.send("Format: `!post-message <guild_id> <channel_id> <message text…>`");
                    b= false;
                }
                else if(!Boolean(g_id.match(/[0-9]{18}/g)) || !Boolean(guild=this._worker._bot.guilds.cache.get(g_id))){
                    cmdObj.msg_obj.author.send("Cannot found specified guild…");
                    b= false;
                }
                else if(!Boolean(ch_id.match(/[0-9]{18}/g)) || !Boolean(channel=guild.channels.cache.get(ch_id))){
                    cmdObj.msg_obj.author.send("Cannot found specified channel…");
                    b= false;
                }
                else{
                    channel.send(cmdObj.args.slice(2).join(' ')).catch(err => {hereLog(err);})
                    b= true;
                }
            }
            else if(cmd==="edit-message" && this._isMaster(cmdObj.msg_obj.author)){
                var g_id= cmdObj.args[0];
                var ch_id= cmdObj.args[1];
                var msg_id= cmdObj.args[2];

                var guild= undefined, channel= undefined, message= undefined;
                if(cmdObj.args.length<3){
                    cmdObj.msg_obj.author.send("Format: `!edit-message <guild_id> <channel_id> <message_id> <message text…>`");
                    b= false;
                }
                else if(!Boolean(g_id.match(/[0-9]{18}/g)) || !Boolean(guild=this._worker._bot.guilds.cache.get(g_id))){
                    cmdObj.msg_obj.author.send("Cannot found specified guild…");
                    b= false;
                }
                else if(!Boolean(ch_id.match(/[0-9]{18}/g)) || !Boolean(channel=guild.channels.cache.get(ch_id))){
                    cmdObj.msg_obj.author.send("Cannot found specified channel…");
                    b= false;
                }
                else if(!Boolean(msg_id.match(/[0-9]{18}/g)) || !Boolean(message=(await channel.messages.fetch(msg_id)))){
                    cmdObj.msg_obj.author.send("Cannot found specified message…");
                    b= false;
                }
                else{
                    message.edit(cmdObj.args.slice(3).join(' ')).catch(err => {hereLog(err);})
                    b=true;
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
                    if(Array.isArray(c.name)){
                        str+= '\t\`'+c.name.map( e =>{ return '!'+e+' '})+' \`\n';
                    }
                    else{
                        str+= `\t\`!${c.name}\`\n`;
                    }
                }
                str+= `\n__*DM Commands*:__\n\n`+
                    `\t\`!about\` \tBasic infos about myself.`;

                cmdObj.msg_obj.author.send(str);

                b= true;
            }
            else{
                askedCmd= (askedCmd.startsWith('!'))?
                        askedCmd.slice(1)
                    :   askedCmd;
                if( (b=__clearanceManagementCmd(askedCmd, "ctrlchannel", this.CMD_manageCtrlChannel.bind(this), 'help')) || 
                    (b=__clearanceManagementCmd(askedCmd, "adminrole", this.CMD_manageAdminRole.bind(this), 'help')) )
                {;}
                else if(Boolean(l_cmd=this.loaded_commands.find(e =>{return (Array.isArray(e.name) && e.name.includes(askedCmd)) || (e.name===askedCmd);}))){
                    if(Boolean(l_cmd.help)){
                        b= l_cmd.help(cmdObj, this._getClearanceLevel(cmdObj.msg_obj));
                    }
                    else{
                        b= false;
                    }
                }
            }
        }
        else if(Boolean(l_cmd=this.loaded_commands.find(e =>{return ( (Array.isArray(e.name) && e.name.includes(cmd)) || (e.name===cmd));}))){
            if(Boolean(l_cmd.func)){
                while(l_cmd._wait_init){
                    __sleep(500);
                }
                b= await l_cmd.func(cmdObj, this._getClearanceLevel(cmdObj.msg_obj));
            }
            else{
                b= undefined;
            }
        }

        if(b!==undefined) cmdObj.msg_obj.react((b)?'✅':'❌');
    }

    onEvent(eventName){
        this.loaded_commands.forEach(lCmd =>{
            if(lCmd.event){
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

    _isCtrlChannel(channel){
        var guildSettings= undefined, channels= undefined;
        return (Boolean(guildSettings=this._worker._settings.guildsSettings[channel.guild.id]) &&
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
        return (this._getMemberClearanceLevel(message.member) |
                ((this._isCtrlChannel(message.channel))? DEFINES.CLEARANCE_LEVEL.CONTROL_CHANNEL : 0));
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
}

module.exports.Commander= Commander;
