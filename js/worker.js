
class Worker{
    constructor(bot){
        this._bot= bot;
    }

    destroy(){}

    get bot(){
        return this._bot;
    }

    ready(){
        console.log("ready");
    }

    processMessage(message){
        console.log("message");
    }

    dMessage(message){
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
