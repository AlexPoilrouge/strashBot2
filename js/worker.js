const Settings= require('./settings').Settings;
const Commander= require('./commander').Commander;
const ModulesHandler= require('./modulesHandler').ModulesHandler;
const Discord= require('discord.js');

const utils= require('./utils')

let hereLog= (...args) => {console.log("[Worker]", ...args);};

class Worker{
    constructor(bot){
        this._bot= bot;

        this._settings= new Settings(this._bot);
        // this._commander= new Commander(this);
        this._moduleHandler= new ModulesHandler(this);
    }

    async destroy(){
        if(Boolean(this._moduleHandler)){
            await this._moduleHandler.destroy();
        }
    }

    get bot(){
        return this._bot;
    }

    ready(){
        this._settings.checkGuildsSetup();

        hereLog("ready");
    }

    processMessage(message){
        let cmd= utils.commandDecompose(message, this._moduleHandler._old_cmd_prefix);
        if(cmd){
            this._moduleHandler.processOldCommands(cmd);
        }
        else{
            this._moduleHandler.onEvent('messageCreate', message);
        }
    }

    async interacting(interaction){
        let processed= await this._moduleHandler.onSlashCommandInteraction(interaction)
        processed= await this._moduleHandler.onAutoCompleteInteraction(interaction)

        if(!processed){
            this.event(Discord.Events.InteractionCreate, interaction)
        }
    }

    event(){
        this._moduleHandler.onEvent(...arguments);
    }

    newGuild(guild){
        this._moduleHandler._addGuildCmd(guild);
        this._moduleHandler._addGuildDB(guild);
    }

    byeGuild(guild){
        this._moduleHandler._rmGuildCmd(guild);
        this._moduleHandler._rmGuildDB(guild);
    }

    processDMessage(message){
        let cmd= utils.commandDecompose(message, this._moduleHandler._old_cmd_prefix);
        if(cmd){
            this._moduleHandler.processOldCommands(cmd, true);
        }
        else{
            this.event('messageCreate', message);
        }
    }

    reactionAdd(reaction, user){
    }

    reactionRemove(reaction, user){
    }

    memberRemove(member){
    }
};

module.exports.Worker= Worker;
