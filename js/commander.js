const glob= require( 'glob' );
const path= require( 'path' );
const fs= require( 'fs' );

const config= require('config');



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

        var cmd_name= path.basename(cmdFileName);
        cmd_name= (cmd_name.startsWith("cmd_"))? cmd_name.slice(4) : cmd_name;
        cmd_name= (cmd_name.endsWith(".js"))? cmd_name.slice(0,-3) : cmd_name;

        var commandFileSettings= this._cmdSettings[cmdFileName];
        if(!Boolean(commandFileSettings)){
            this._cmdSettings[cmdFileName]= {};
            commandFileSettings= this._cmdSettings[cmdFileName];
        }
        commandFileSettings['name']= cmd_name;
    }

    addGuild(cmdName, guildID){
        var commandFileSettings= this._cmdSettings[cmdName];
        if(!Boolean(commandFileSettings))
            return false;

        var perGuildSettings= undefined;
        if(!Boolean(perGuildSettings=commandFileSettings[guildID])){
            commandFileSettings[guildID]= {};
            perGuildSettings= commandFileSettings[guildID];
        }

        var fn= `${this._dirPath}/${commandFileSettings['name']}_${guildID}.json`;
        perGuildSettings['file']= path.resolve(__dirname, fn);
        if(fs.existsSync(perGuildSettings['file'])){
            var data= fs.readFileSync(perGuildSettings['file']);

            if(Boolean(data)){
                perGuildSettings['object_json']= JSON.parse(data);
            }
            else{
                hereLog(`[Settings] Error reading data from '${perGuildSettings['file']}'`);
            }
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

    async rmGuild(cmdName, guildID){
        var commandFileSettings= this._cmdSettings[cmdName];
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

    async _saveData(cmdFile, guildID){
        var ttt=Date.now();
        while(this._save_lock){
            await __sleep(1000);
        }
        this._save_lock= true;
        
        var obj= this._cmdSettings[cmdFile]['object_json'];
        var data= JSON.stringify(obj, null, 2);

        var commandFileSettings= this._cmdSettings[cmdFile];
        var perGuildSettings= undefined;
        if(!Boolean(perGuildSettings=commandFileSettings[guildID])){
            this.addGuild(cmdFile, guildID);
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

    getField(cmdFile, guild, fieldName){
        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(!Boolean(commandFileSettings=this._cmdSettings[cmdFile]) ||
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

    setField(cmdFile, guild, fieldName, value){
        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(!Boolean(commandFileSettings=this._cmdSettings[cmdFile]) ||
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
            this._saveData(cmdFile, guild.id);

            return true;
        }

        
    }

    removeField(cmdFile, guild, fieldName){
        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(Boolean(commandFileSettings=this._cmdSettings[cmdFile]) &&
            Boolean(perGuildSettings=commandFileSettings[guild.id]) &&
            Boolean(obj=perGuildSettings['object_json'])
        ){
            delete obj[fieldName];
            this._saveData(cmdFile, guild.id);
        }
    }
}

class Commander{
    constructor(worker){
        this._worker= worker;

        this._cmdSettings= new CommandSettings();

        this.loaded_commands= [];

        this._loadCommands();
    }

    _loadCommands(){
        let t=this;
        glob.sync('./js/commands/cmd_*.js').map( file =>{
            hereLog(`[Commander] loading '${file}'…`);

            let rcf= require(path.resolve(file))
            var m= null, h= null, e=null, i= null, c= null;

            var utils= {
                settings: {
                    set: (guild, field, value) => {return this._cmdSettings.setField(file, guild, field, value);},
                    get: (guild, field) => {return this._cmdSettings.getField(file, guild, field);},
                    remove: (guild, field) => {this._cmdSettings.removeField(file, guild, field);},
                },
                getMemberClearanceLevel: this._getMemberClearanceLevel.bind(this),
                bot_uid: this._worker._bot.user.id,
            };
            
            var tmp_l_cmd= undefined;
            t.loaded_commands.push( tmp_l_cmd={
                name: rcf.name,
                init_per_guild: ((Boolean(rcf.command) && Boolean(i=rcf.init_per_guild))? (g =>{i(utils,g)}):null),
                func: ((Boolean(rcf.command) && Boolean(m=rcf.command.main))? (cmdO, clrlv) => {return m(cmdO, clrlv, utils)}:null),
                help: ((Boolean(rcf.command) && Boolean(h=rcf.command.help))? h:null),
                event: ((Boolean(rcf.command) && Boolean(e=rcf.command.event))? ((name, ...args) => {return e(name, utils, ...args);}):null),
                clear_guild: ((Boolean(rcf.command) && Boolean(c=rcf.clear_guild))? c:null),
                threshold: [((Boolean(rcf.command))?rcf.getCacheWarnTreshold:0), false],
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
                    this._worker.bot.guilds.forEach(async g => {
                        t._cmdSettings.addGuild(file, g.id)
                        await rcf.command.init_per_guild(utils,g);
                    });
                    tmp_l_cmd._wait_init= false;
                }
            }
        });
    }

    _addGuildCmd(guild){
        Object.keys(this._cmdSettings._cmdSettings).forEach( k_file => {
            this._cmdSettings.addGuild(k_file, guild.id);
        });
        this.loaded_commands.forEach(async l_cmd => {
            l_cmd._wait_init= true;
            await l_cmd.init_per_guild(guild);
            l_cmd._wait_init= false;
        });
    }

    _rmGuildCmd(guild){
        this.loaded_commands.forEach(l_cmd => {
            l_cmd.clear_guild(guild);
        });
        Object.keys(this._cmdSettings._cmdSettings).forEach( k_file => {
            this._cmdSettings.rmGuild(k_file, guild.id);
        });
    }

    _msgRoomUpdate(left){
        this.loaded_commands.forEach(l_cmd =>{
            if(Boolean(l_cmd.threshold) && l_cmd.threshold[0]()>=left){
                if(!l_cmd.threshold[1]){
                    l_cmd.event("messageCacheThreshold", left);
                    l_cmd.threshold[1]= true;
                }
                if(left<1){
                    l_cmd.threshold[1]= false;
                }
            }
        })
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
                cmdObj.msg_obj.author.send(`Hi! I am strashbot! Version ${config.get('StrashBot.version')}-${config.get('StrashBot.build')}`);

                b=true;
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
                    `\t\`!help command\`\n\n`+
                    `\tProvides help on a given command (given appropriate clearance level).\n\n`+
                    `__*Commands*:__\n\n`+
                    `\t\`![add|remove|get]ctrlChannel\`\n`+
                    `\t\`![add|remove|get]adminRole\`\n`;
                for (var c of this.loaded_commands){
                    if(Array.isArray(c.name)){
                        str+= '\t\`'+c.name.map( e =>{ return '!'+e+' '})+'\`\n';
                    }
                    else{
                        str+= `\t\`!${c.name}\`\n`;
                    }
                }
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
                        return (Boolean(member.roles.get(r_id)));
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
                message.mentions[mentionType].tap( type => {
                    if(!obj.includes(type.id)) obj.push(type.id);
                });

                this._worker._settings.saveGuildsSetup();
            }
            else if(cmd==="rm"){
                message.mentions[mentionType].tap( type => {
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
                                    (Boolean(guild.roles) && Boolean(guild.roles.get(element)))?
                                        guild.roles.get(element).name
                                        : `<@${element}>`
                                    : "unknown"
                        }`
                });
                if(str.length<=0){
                    str= "\tthere are none…"
                }

                message.author.send(`Admin roles for ${guild}:\n${str}`);
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
                `\tIf the mentionned channel previously was previously considered has a 'control' channel, it will no longer be the case.\n\n`+
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
