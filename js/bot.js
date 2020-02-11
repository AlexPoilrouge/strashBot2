
// Import the discord.js module
const Discord= require('discord.js');

const utils= require('./utils')

const wk= require('./worker')

const config= require('config');



const MSG_CACHE= 500;

class StrashBot extends Discord.Client{
    constructor(token, worker){
        super({messageCacheMaxSize: MSG_CACHE});

        this._msgCache= MSG_CACHE;
        this._msgCount= 0;

        this.token= token;
        this.worker= undefined;
        console.log("token: "+token);
    }


    get validTest(){
        return utils.JSONCheck.validity(config.get('StrashBot'));
    }

    setup(){
        this.on('ready', ()=>{
            this.worker= new wk.Worker(this);

            console.log("Pif paf! StrashBot rrrready to rumblllllllllle!");
            
            console.log("Servers:")
            this.guilds.forEach((guild) => {
                console.log(" - " + guild.name)
            })

            this.worker.ready();
        });
        
        this.on('message', (message)=>{
            if(message.author.id === this.user.id) return; // Prevent bot from responding to its own messages

            this._msgCount= (this._msgCount+1)%(this._msgCache);
            var d= (this._msgCache-this._msgCount);

            if(message.channel.type === 'dm'){
                console.log(`Recieving DM command from ${message.author.id}`);
                this.worker.dMessage(message, d);
            }
            else{
                console.log(`Recieving command from channel ${message.channel.id}`);
                this.worker.processMessage(message, d);
            }
        });
        
        this.on('messageReactionAdd', (reaction, user) => {
            console.log("eh")
            if(user.id!==this.user.id)
                this.worker.event('messageReactionAdd', reaction, user);
        });
        
        this.on('messageReactionRemove', (reaction, user) => {
            if(user.id!==this.user.id)
                this.worker.event('messageReactionRemove', reaction, user);
        });
        
        this.on('messageReactionRemoveAll', (reaction, user) => {
            if(user.id!==this.user.id)
                this.worker.event('messageReactionRemoveAll', reaction, user);
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
        this.on('messageDelete', channel =>{
            this.worker.event('messageDelete', channel);
        })
        this.on('roleDelete', role =>{
            this.worker.event('roleDelete', role);
        })
        this.on('roleUpdate', (oldRole, newRole) =>{
            this.worker.event('roleUpdate', oldRole, newRole);
        })
    }

    async login(){
        if(!this.validTest){
            console.log( utils.JSONCheck.report(config.get('StrashBot')) );
            console.log("bot config isn't valid, won't login to discord");
        }
        else{
            await super.login(this.token)
            .then()
            .catch( err => { console.log("Error when login to discord attempt…"); console.log(err); });
            console.log("aaa");
        }
    }

    get masterID(){
        return config.get('StrashBot.masterID');
    }
};

module.exports.StrashBot= StrashBot;
