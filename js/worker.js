const Settings= require('./settings').Settings;
const Commander= require('./commander').Commander;

const utils= require('./utils')

let hereLog= (...args) => {console.log("[Worker]", ...args);};

class Worker{
    constructor(bot){
        this._bot= bot;

        this._settings= new Settings(this._bot);
        this._commander= new Commander(this);
    }

    destroy(){}

    get bot(){
        return this._bot;
    }

    ready(){
        this._settings.checkGuildsSetup();

        hereLog("ready");
    }

    processMessage(message, cacheRoom){
        this._commander._msgRoomUpdate(cacheRoom);
        let cmd= utils.commandDecompose(message);
        if(cmd){
            this._commander.processCommand(cmd);
        }
    }

    event(){
        this._commander.onEvent(...arguments);
    }

    newGuild(guild){
        this._commander._addGuildCmd(guild);
    }

    byeGuild(guild){
        this._commander._rmGuildCmd(guild);
    }

    processDMessage(message, cacheRoom){
        this._commander._msgRoomUpdate(cacheRoom);
        let cmd= utils.commandDecompose(message);
        if(cmd){
            this._commander.processCommand(cmd, true);
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
