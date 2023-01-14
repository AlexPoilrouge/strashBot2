const { Collection } = require('discord.js');
const fs= require('fs')
const glob= require( 'glob' );
const path= require('path')
const config= require('config')

const my_utils= require('./utils');
const DEFINES= require('./defines');

const CommandSettings= require('./utilCmd/CommandSettings');
const { command } = require('./commands/cmd_template');

let hereLog= (...args) => {console.log("[ModulesHandler]", ...args);};

let debug= false;

const MOUDES_DIRNAME="modules"

let E_RetCode= my_utils.Enums.CmdRetCode


class ModulesHandler{
    constructor(worker){
        this._worker= worker;

        this._cmdSettings= new CommandSettings();

        this.loaded_modules= []
        this.interactions= new Collection()

        debug= ["1","on","true","debug"].includes(config.get('StrashBot.debug').toLowerCase());
        this._old_cmd_prefix= (debug)?'?':'!';

        this._db_guilds= {}
        this._dbDirPath= "../data/db"
        fs.mkdirSync(path.resolve(__dirname, this._dbDirPath), { recursive: true });
        

        this._utils= (mod_name) => { return {
            settings: {
                set: (guild, field, value, module_name=undefined) => {
                    var mod= module_name ?? mod_name;
                    return this._cmdSettings.setField(mod, guild, field, value);
                },
                get: (guild, field, module_name=undefined) => {
                    var mod= module_name ?? mod_name;
                    return this._cmdSettings.getField(mod, guild, field);
                },
                remove: (guild, field, module_name=undefined) => {
                    var mod= module_name ?? mod_name;
                    this._cmdSettings.removeField(mod, guild, field);
                },
            },
            getDataBase: (guild) =>{
                return Boolean(guild)?this._db_guilds[guild.id]:undefined;
            },
            getMemberClearanceLevel: this._getMemberClearanceLevel.bind(this),
            getBotClient: () => { return this._worker._bot;},
            getMasterID: () => { return this._worker._bot.masterID; },
            sendModMessage: (m, reciever, ...args) => {
                return this._sendModMessage(m, mod_name, reciever, ...args)
            }
        } };

        this._loadModules();

        this.postProcessTargetCmd= []
        this._loadPPTargCmd()
    }

    async destroy(){
        for(let lMod of this._loadModules){
            if(Boolean(lMod.destroy)){
                let utils= this._utils(lMod.__moduleName)

                await lMod.destroy(utils);
            }
        }
    }

    _loadModules(){
        let dir_path= path.resolve(__dirname, MOUDES_DIRNAME)
        hereLog(`Modules dirpath is ${dir_path}`)
        fs.mkdirSync(dir_path, { recursive: true });

        let modulesFiles = fs.readdirSync(dir_path).filter(file => file.startsWith('mod_') && file.endsWith('.js'));
        for (let file of modulesFiles) {
            if(file.length<8) continue;

            let module = require(`${dir_path}/${file}`);
            module['__moduleName']= file.substring(4,file.length-3)
        
            if(Boolean(module) && ((!Boolean(module.devOnly)) || Boolean(debug))){
                this._cmdSettings.add(file)

                this.loaded_modules.push(module)

                let utils= this._utils(module.__moduleName)

                if(Boolean(module.init)){
                    try{
                        module.init(utils)
                    } catch(err){
                        hereLog(`Error while running module '${module.__moduleName}'s init func…\n${err}`)
                    }
                }
                if(Boolean(module.initPerGuild)){
                    let _t=this;
                    this._worker.bot.guilds.cache.each(g => {
                        _t._cmdSettings.addGuild(module.__moduleName, g.id)
                        _t._addGuildDB(g)
                        module.initPerGuild(g, utils)
                    });
                }
            }
        }

        var _l= this.loaded_modules.length
        hereLog(`Registered ${_l} modules…`)
        if(_l>0){
            this._referenceInteractions()
        }
    }

    _referenceInteractions(){
        for(var mod of this.loaded_modules){
            let slash_builders= mod.slash_builders;

            if(Array.isArray(slash_builders)){
                for(var sb of slash_builders){
                    this.interactions.set(
                        sb.data.name,
                        {
                            execute: sb.execute,
                            autoComplete: sb.autoComplete,
                            mod: mod.__moduleName
                        }
                    )
                }
            }
            else{
                this.interactions.set(slash_builders.data.name, {execute: slash_builders.execute, mod: mod.__moduleName});
            }
        }
    }

    _addGuildCmd(guild){
        Object.keys(this._cmdSettings._cmdSettings).forEach( cmd => {
            this._cmdSettings.addGuild(cmd, guild.id);
        });
        let t= this;
        this.loaded_modules.forEach(async l_mod => {
            if(Boolean(l_mod) && Boolean(l_mod.initPerGuild)){
                await l_mod.initPerGuild(guild, t._utils(l_mod.__moduleName));
            }
            else{
                hereLog(`No initPerGuild: ${l_mod.__moduleName}`)
            }
        });
    }

    _rmGuildCmd(guild){
        let t= this;
        this.loaded_modules.forEach(l_mod => {
            if(Boolean(l_mod.clearGuild)){
                l_mod.clearGuild(guild, t._utils(l_mod.__moduleName));
            }
        });
        Object.keys(this._cmdSettings._cmdSettings).forEach( cmd => {
            this._cmdSettings.rmGuild(cmd, guild.id);
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

    onEvent(event){
        this.loaded_modules.forEach(lMod =>{
            if(lMod.events){
                let modEventFunc= lMod.events[event]
                if(Boolean(modEventFunc)){
                    try{
                        modEventFunc(...Array.from(arguments).slice(1), this._utils(lMod.__moduleName));
                    } catch(err){
                        hereLog(`Error handling event '${event}' for module '${lMod.__moduleName}'\n${err}`)
                    }
                }
            }
        });
    }

    async onSlashCommandInteraction(interaction){
        if (!interaction.isChatInputCommand()) return false;

        const interactionCmdObj = this.interactions.get(interaction.commandName);

        if (!interactionCmdObj) return false;

        const mod= interactionCmdObj.mod
        const cmdExecFunc= interactionCmdObj.execute

        if(!Boolean(mod && cmdExecFunc)) return false;

        let utils= this._utils(mod)

        try{
            hereLog(
                `On ${interaction.guild}, User ${interaction.user.tag} (${interaction.user}), `+
                `on Channel ${interaction.channel}, `+
                `called for interaction:\n\t${interaction.toString()}`
            )
            await cmdExecFunc(interaction, utils)
        } catch(err){
            hereLog(`Error handling interaction '${interaction.commandName}'…\n${err}`)
            let payload= {
                content: `${my_utils.emoji_retCode(E_RetCode.ERROR_CRITICAL)} Internal error occured, sorry…`,
                ephemeral: true
            }
            if(interaction.deferred)
                interaction.editReply(payload)
            else
                interaction.reply(payload)
        }

        try{
            var pp_cmd= this.postProcessTargetCmd.find(e => { return (
                e.guild_id===interaction.guild.id &&
                Boolean(e.pptcmd && e.pptcmd.interactionNames && e.pptcmd.interactionProcess) &&
                e.pptcmd.interactionNames.includes(interaction.commandName)
            )})
            if(Boolean(pp_cmd)){
                hereLog(
                    `For module ${mod} on ${interaction.guild}, handling ppcmd for `+
                    `${interaction.commandName}… `
                )
                pp_cmd.pptcmd.interactionProcess(interaction, utils)
            }
        }
        catch(err){
            hereLog(
                `Error for module ${mod} on ${interaction.guild} while handling ppcmd for `+
                `${interaction.commandName}… - ${err}`
            )
        }

        return true
    }

    async onAutoCompleteInteraction(interaction){
        if (!interaction.isAutocomplete()) return false

        const interactionCmdObj = this.interactions.get(interaction.commandName);

		if (!interactionCmdObj) {
			hereLog(`No command matching ${interaction.commandName} was found.`);
			return;
		}

        const autoCompleteFunc= interactionCmdObj.autoComplete;

        if(Boolean(autoCompleteFunc)){
            try {
                await autoCompleteFunc(interaction);
            } catch (error) {
                hereLog(error);
            }
        }
    }

    async processOldCommands(oldCmdObj, isDM=false){        
        let modsWithFunc= this.loaded_modules.map(m => {
                var func= undefined
                if(Boolean(m.oldGuildCommands))
                    if(Array.isArray(m.oldGuildCommands)){
                        var cmd= m.oldGuildCommands.find(oc => (oc.name===oldCmdObj.command && Boolean(oc.dm)===isDM))
                        return Boolean(cmd)? { modName: m.__moduleName, func: cmd.execute } : undefined
                    }
                    else
                        return (m.oldGuildCommands.name===oldCmdObj.command && Boolean(oc.dm)===isDM)?
                                    { modName: m.__moduleName, func: m.oldGuildCommands.execute}
                                :   undefined
                else return undefined
            }).filter( fn => Boolean(fn) )

        if(!Boolean(modsWithFunc) || modsWithFunc.length<=0) return
        
        let clearance= this._getClearanceLevel(oldCmdObj.msg_obj)

        var retCode= undefined
        for(let modFn of modsWithFunc){
            var r_c= undefined
            let utils= this._utils(modFn.modName)
            try{
                let message= oldCmdObj.msg_obj
                hereLog(
                    `On ${message.guild}, User ${message.author.tag} (${message.author}), `+
                    `on Channel ${message.channel}, with message ${message.id}, `+
                    `tried old command:\n\t'!${oldCmdObj.command}' with args ${JSON.stringify(oldCmdObj.args)}`
                )
                r_c= await modFn.func(oldCmdObj, clearance, utils)
            } catch(err){
                hereLog(`Error running old cmd '${oldCmdObj.command}' on module '${modFn.modName}'…\n${err}`)
                r_c= E_RetCode.ERROR_CRITICAL
            }

            try{
                var pp_cmd= undefined
                if(r_c!==undefined &&
                    Boolean(pp_cmd=this.postProcessTargetCmd.find(e => {return (
                        e.guild_id===oldCmdObj.msg_obj.guild.id &&
                        Boolean(e.pptcmd && e.pptcmd.oldCmds && e.pptcmd.processOldCmd) &&
                        e.pptcmd.oldCmds.includes(oldCmdObj.command)
                    )}))
                ){
                    hereLog(
                        `Running pptcmd for module '${modFn.modName}' for guild ${oldCmdObj.msg_obj.guild}…`
                    )
                    pp_cmd.pptcmd.processOldCmd(oldCmdObj, clearance, utils)
                }
            }
            catch(err){
                hereLog(
                    `For module '${modFn.modName}' error trying to run pptcm for guild ${oldCmdObj.msg_obj.guild}`+
                    ` - ${err}`
                )
            }

            retCode=    (retCode!==E_RetCode.ERROR_CRITICAL)?
                            (r_c!==E_RetCode.SUCCESS)?
                                r_c
                            :   (retCode!==E_RetCode.SUCCESS)?
                                    (retCode===undefined)?
                                        r_c
                                    :   retCode
                                :   E_RetCode.SUCCESS
                        :   E_RetCode.ERROR_CRITICAL
        }

        let reaction= my_utils.emoji_retCode(retCode)
        if(Boolean(reaction)) oldCmdObj.msg_obj.react(reaction)
    }

    _sendModMessage(m, sender, reciever){
        return new Promise((resolve, reject) =>{ 
            if(sender===reciever){
                reject(`Module can't send modMessages to itself ('${sender}')`)
                return
            }

            // var str= `In l_commands there are:\n`
            // for(var _lm of this.loaded_modules){
            //     str+= `\t- ${_lm.__moduleName}\n`
            // }
            // hereLog(str)

            var lMod= this.loaded_modules.find(lc => {return lc.__moduleName===reciever})

            if(!Boolean(lMod)){
                reject(`Couldn't find module '${reciever}'`)
            }
            else{
                var mm= lMod.modMessage
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
            return (this._getMemberClearanceLevel(message.member));
        }
    }

    _loadPPTargCmd(){
        glob.sync('./js/postCmdTarget/pptcmd_*_*.js').map( file =>{
            hereLog(`[PPTCmd] loading '${file}'…`);

            let rcf= require(path.resolve(file))
            var m= null

            var pptcmd_obj={}
            var cmd_name= my_utils.commandNameFromFilePath(file);
            var utils= this._utils(cmd_name)
            var match_res= undefined
            if(match_res=cmd_name.match(/pptcmd_([0-9]+)_([a-zA-Z]+)(.js)?/)){
                pptcmd_obj.guild_id= match_res[1]
                pptcmd_obj.module= match_res[2]

                pptcmd_obj.pptcmd= rcf

                this.postProcessTargetCmd.push( pptcmd_obj )

                hereLog(`{loadPPTargetCmd} added:`+
                    `${pptcmd_obj.guild_id}, ${pptcmd_obj.module}, ${JSON.stringify(pptcmd_obj.pptcmd)}`
                )
            }
        })
    }

}

module.exports= {ModulesHandler}