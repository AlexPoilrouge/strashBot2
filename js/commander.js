const glob= require( 'glob' );
const path= require( 'path' );
const fs= require( 'fs' );


class CommandSettings{
    constructor(){
        this._dirPath= "./commands/data"
        fs.mkdirSync(path.resolve(__dirname, this._dirPath), { recursive: true });

        this._cmdSettings= {};
    }

    add(cmdFileName){
        if(!Boolean(cmdFileName)) return;

        var n= path.basename(cmdFileName);
        n= (n.startsWith("cmd_"))? n.slice(4) : n;
        n= (n.endsWith(".js"))? n.slice(0,-3) : n;

        var fn= `${this._dirPath}/${n}.json`;

        var commandFileSettings= this._cmdSettings[cmdFileName];
        if(!Boolean(commandFileSettings)){
            this._cmdSettings[cmdFileName]= {};
            commandFileSettings= this._cmdSettings[cmdFileName];
        }
        commandFileSettings['file']= path.resolve(__dirname, fn);

        if(fs.existsSync(commandFileSettings['file'])){
            var data= fs.readFileSync(commandFileSettings['file']);

            if(Boolean(data)){
                commandFileSettings['object_json']= JSON.parse(data);
            }
            else{
                console.log(`[Command Settings] Error reading data from '${commandFileSettings['file']}'`);
            }
        }
        else{
            commandFileSettings['object_json']= {};

            var data= JSON.stringify({}, null, 2);

            console.log("suspect1")
            fs.writeFile(commandFileSettings['file'], data, err => {
                if(err){
                    console.log(`[CS Saving] Couldn't write in file '${commandFileSettings['file']}'…` );
                    console.log(err);
                }
            });
        }
    }

    _saveData(cmdFile){
        var obj= this._cmdSettings[cmdFile]['object_json'];
        var data= JSON.stringify(obj, null, 2);


        console.log("suspect2")
        fs.writeFile(this._cmdSettings[cmdFile]['file'], data, err => {
            if(err){
                console.log(`[CS Saving] Couldn't write in file '${this._cmdSettings[cmdFileName]['file']}'…` );
                console.log(err);
            }
        });
    }

    getField(cmdFile, guild, fieldName){
        var sett= this._cmdSettings[cmdFile];
        if(!Boolean(sett) || !Boolean(sett['object_json'])) return undefined;
        else{
            var obj= sett['object_json'];
            if(!Boolean(obj[guild.id]) || !Boolean(obj[guild.id][fieldName])) return undefined;
            else return obj[guild.id][fieldName];
        }
    }

    setField(cmdFile, guild, fieldName, value){
        var sett= this._cmdSettings[cmdFile];
        if(!Boolean(sett) || !Boolean(sett['object_json'])) return false;
        else{
            var obj= sett['object_json'];
            if(!Boolean(obj[guild.id])){
                obj[guild.id]= {};
            }
            obj[guild.id][fieldName]= value;
            
            this._saveData(cmdFile);

            return true;
        }
        
    }

    removeField(cmdFile, guild, fieldName){
        var sett= this._cmdSettings[cmdFile];
        if(Boolean(sett) && Boolean(sett['object_json'])){
            var obj= sett['object_json'];
            if(Boolean(obj[guild.id]) && Boolean(obj[guild.id][fieldName])){
                delete obj[guild.id][fieldName];
            
                this._saveData(cmdFile);
            }
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
            console.log(`[Commander] loading '${file}'…`);

            let rcf= require(path.resolve(file))
            var m= null, h= null;
            
            let utils= {
                settings: {
                    set: (guild, field, value) => {return t._cmdSettings.setField(file, guild, field, value);},
                    get: (guild, field) => {return t._cmdSettings.getField(file, guild, field);},
                    remove: (guild, field) => {t._cmdSettings.setField(file, guild, field);},
                }
            };
            t.loaded_commands.push( {
                name: rcf.name,
                func: ((Boolean(rcf.command) && Boolean(m=rcf.command.main))? m:null),
                help: ((Boolean(rcf.command) && Boolean(h=rcf.command.help))? h:null),
                event: ((Boolean(rcf.command) && Boolean(h=rcf.command.event))? h:null),
                utils: utils,
                threshold: [((Boolean(rcf.command))?rcf.getCacheWarnTreshold:0), false],
            }); 
            t._cmdSettings.add(file);

            if(Boolean(rcf.command)){
                if(Boolean(rcf.command.init)){
                    console.log(`[Commander] init for command '${rcf.name}'…`);
                    rcf.command.init(utils);
                }
                if(Boolean(rcf.command.init_per_guild)){
                    console.log(`-sssssshhhhht ${this._worker.bot.guilds.size}`)
                    this._worker.bot.guilds.forEach(g => {
                        console.log(`-g ${g.id}`)
                        rcf.command.init_per_guild(utils,g);
                    });
                }
            }
        });

    }

    _msgRoomUpdate(left){
        console.log("left: "+left)
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

    processCommand(cmdObj, isDM= false){
        var b=false;
        var cmd= cmdObj.command;
        var l_cmd=null;
        if(cmd==="addadminchannel"){
            b=this.CMD_addAdminChannel('add', cmdObj.args, cmdObj.msg_obj);
        }
        else if(cmd==="removeadminchannel"){
            b=this.CMD_addAdminChannel('rm', cmdObj.args, cmdObj.msg_obj);
        }
        else if(cmd==="listadminchannel" || cmd==="getadminchannel" ){
            b=this.CMD_addAdminChannel('get', cmdObj.args, cmdObj.msg_obj);
        }
        else if(cmd==="help"){
            var askedCmd= undefined;
            if(!Boolean(cmdObj.args) || !Boolean(askedCmd=cmdObj.args[0])) b=false;
            else{
                askedCmd= (askedCmd.startsWith('!'))?
                        askedCmd.slice(1)
                    :   askedCmd;
                if(["addadminchannel","removeadminchannel","listadminchannel","getadminchannel"].includes(askedCmd)){
                    b=this.CMD_addAdminChannel('help', cmdObj.args, cmdObj.msg_obj);
                }
                else if(Boolean(l_cmd=this.loaded_commands.find(e =>{return (e.name===askedCmd);}))){
                    console.log("ah");
                    if(Boolean(l_cmd.help)){
                        b= l_cmd.help(cmdObj, this._isSentThroughGuildAdmin(cmdObj.msg_obj));
                    }
                    else{
                        b= false;
                    }
                }
            }
        }
        else if(Boolean(l_cmd=this.loaded_commands.find(e =>{return (e.name===cmd);}))){
            if(Boolean(l_cmd.func)){
                b= l_cmd.func(cmdObj,this._isSentThroughGuildAdmin(cmdObj.msg_obj), l_cmd.utils);
            }
            else{
                b= undefined;
            }
        }
        else{
            b= undefined;
        }

        //console.log(`${this.loaded_commands[0].name} : ${this.loaded_commands[0].func}`)

        if(b!==undefined) cmdObj.msg_obj.react((b)?'✅':'❌');
    }

    onEvent(eventName){
        this.loaded_commands.forEach(lCmd =>{
            if(lCmd.event){
                lCmd.event(eventName, lCmd.utils, ...Array.from(arguments).slice(1));
            }
        });
    }

    _isMaster(user){
        return user.id===this._worker._bot.masterID;
    }

    _isSentThroughGuildAdmin(message){
        if(this._isMaster(message.author)) return true;

        return ( this.__adminChannelDefined(message.guild)
            && guildAdminChannels.includes(message.channel.id)
        );
    }

    __adminChannelDefined(guild){
        var guildSettings= null;
        return ( Boolean(guildSettings=this._worker._settings.guildsSettings[guild.id])
            && Boolean(guildSettings['adminChannels'] ) );
    }


    CMD_addAdminChannel(cmd, args, message){
        if(!this._isSentThroughGuildAdmin(message)){
            message.channel.send("Only a user with “*admin*” access can manage StrashBot's admin channel…");

            return false;
        }
        else{
            message.channel.send('sup?');
            let guild= message.guild;

            if(Boolean(message.mentions) && Boolean(message.mentions.channels) && (message.mentions.channels.size>0 || cmd==="get")){
                if(!this.__adminChannelDefined(message.guild)){
                    this._worker._settings.guildsSettings[guild.id]['adminChannels']=[];
                }

                var adminCh= this._worker._settings.guildsSettings[guild.id]['adminChannels'];
                if(cmd==="add"){
                    message.mentions.channels.tap( channel => {
                        if(!adminCh.includes(channel.id)) adminCh.push(channel.id);
                    });

                    this._worker._settings.saveGuildsSetup();
                }
                else if(cmd==="rm"){
                    message.mentions.channels.tap( channel => {
                        if(adminCh.includes(channel.id)) this._worker._settings.guildsSettings[guild.id]['adminChannels']= adminCh.filter(e => {return e!=channel.id});
                    });

                    this._worker._settings.saveGuildsSetup();
                }
                else if(cmd==="get"){
                    var str= "";
                    adminCh.forEach(element => {
                        str+=`\t- <#${element}>`;
                    });
                    if(str.length<=0){
                        str= "\tthere are none…"
                    }

                    message.author.send(`Channels I recognize for “*admin*” purposes for ${guild}:\n${str}`);
                }

                return true;
            }
            else{
                message.channel.send("No channel mentions detected");

                return false;
            }
        }
    }
}

module.exports.Commander= Commander;
