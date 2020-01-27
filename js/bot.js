
// Import the discord.js module
const Discord= require('discord.js');

const utils= require('./utils')

const config= require('config');

class StrashBot extends Discord.Client{
    constructor(token, worker){
        super();

        this.worker= worker;
        this.token= token;
    }

    get validTest(){
        return utils.JSONCheck.validity(config.get('StrashBot'));
    }

    setup(){
        this.on('ready', ()=>{
            console.log("Pif paf! StrashBot rrrready to rumblllllllllle!");
            
        });
        
        this.on('message', (message)=>{
            if(message.author.id === this.user.id) return; // Prevent bot from responding to its own messages
        });
        
        this.on('messageReactionAdd', (reaction, user) => {
            this.worker.reactionAdd(reaction, user)
        });
        
        this.on('messageReactionRemove', (reaction, user) => {
            this.worker.reactionRemove(reaction, user);
        });
        
        this.on('guildMemberRemove', (member) => {
            this.worker.memberRemove(member);
        });
        
        this.on('error', (error)=>{
            console.log("SmashBot encountered an error…");
            console.log(error);
        });
        
        this.on('reconnecting', ()=>{
            console.log("SmashBot is attempting a reconnection through websocket…");
            this.worker.destroy();
        });
        
        this.on('resume', (replayed) =>{
            this.worker.destroy();
            console.log("SmashBot's websocket is resuming… "+replayed+" events were played.");
        });
        
        this.on('warn', (info) =>{
            console.log("SmashBot WARNING!!! : "+info);
        });
        
        this.on('disconnect', (event)=>{
            this.worker.destroy();
            console.log("SmashBot disconnected.");
            console.log(event);
        });
    }

    login(){
        if(!this.validTest){
            console.log( utils.JSONCheck.report(config.get('StrashBot')) );
            console.log("bot config isn't valid, won't login to discord");
        }
        else{
            super.login(token)
            .then()
            .catch( err => { console.log("Error when login to discord attempt…"); console.log(err); });
        }
    }
};

module.exports.StrashBot= StrashBot;
