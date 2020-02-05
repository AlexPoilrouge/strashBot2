const Settings= require('./settings').Settings;
const Commander= require('./commander').Commander;

const utils= require('./utils')


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

        console.log("ready");
    }

    processMessage(message){
        console.log("message: "+message.content);

        let cmd= utils.commandDecompose(message);
        if(cmd){
            this._commander.processCommand(cmd);
        }
    }

    event(){
        this._commander.onEvent(...arguments);
    }

    processDMessage(message){
        console.log("dMessage");
    }

    reactionAdd(reaction, user){
        console.log("reaction added");
    }

    reactionRemove(reaction, user){
        console.log("reaction removed");
    }

    memberRemove(member){
        console.log("member removed;")
    }
};

module.exports.Worker= Worker;
