
// Import the discord.js module
const Discord= require('discord.js');

const utils= require('./utils')

const wk= require('./worker')

const config= require('config');

class StrashBot extends Discord.Client{
    constructor(token, worker){
        super();

        this.worker= new wk.Worker(this);
        this.token= token;

        console.log("token: "+token);
    }

    get validTest(){
        return utils.JSONCheck.validity(config.get('StrashBot'));
    }

    setup(){
        this.on('ready', ()=>{
            console.log("Pif paf! StrashBot rrrready to rumblllllllllle!");
            
            console.log("Servers:")
            this.guilds.forEach((guild) => {
                console.log(" - " + guild.name)
            })

            this.worker.ready();
        });
        
        this.on('message', (message)=>{
            if(message.author.id === this.user.id) return; // Prevent bot from responding to its own messages

            if(message.channel.type === 'dm'){
                console.log(`Recieving DM command from ${message.author.id}`);
                this.worker.dMessage(message);
            }
            else{
                console.log(`Recieving command from channel ${message.channel.id}`);
                this.worker.processMessage(message);
            }
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

        this.on('channelDelete', channel =>{
            this.worker.event('channelDelete', channel);
        })
        this.on('roleDelete', channel =>{
            this.worker.event('roleDelete', role);
        })
    }

    login(){
        if(!this.validTest){
            console.log( utils.JSONCheck.report(config.get('StrashBot')) );
            console.log("bot config isn't valid, won't login to discord");
        }
        else{
            super.login(this.token)
            .then()
            .catch( err => { console.log("Error when login to discord attempt…"); console.log(err); });
        }
    }

    get masterID(){
        return config.get('StrashBot.masterID');
    }
};

module.exports.StrashBot= StrashBot;
