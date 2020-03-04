
// Import the discord.js module
const Discord= require('discord.js');

const utils= require('./utils')

const wk= require('./worker')

const config= require('config');



const MSG_CACHE= 500;

let hereLog= (...args) => {console.log("[bot]", ...args);};

class StrashBot extends Discord.Client{
    constructor(token, worker){
        super({messageCacheMaxSize: MSG_CACHE});

        this._msgCache= MSG_CACHE;
        this._msgCount= 0;

        this.token= token;
        this.worker= undefined;
        hereLog("token: "+token);
    }


    get validTest(){
        return utils.JSONCheck.validity(config.get('StrashBot'));
    }

    setup(){
        this.on('ready', ()=>{
            this.worker= new wk.Worker(this);

            hereLog("Pif paf! StrashBot rrrready to rumblllllllllle!");
            
            hereLog("Guilds:")
            this.guilds.forEach((guild) => {
                hereLog(" - " + guild.name)
            })

            this.worker.ready();
        });
        
        this.on('message', (message)=>{
            if(message.author.id === this.user.id) return; // Prevent bot from responding to its own messages

            this._msgCount= (this._msgCount+1)%(this._msgCache);
            var d= (this._msgCache-this._msgCount);

            if(message.channel.type === 'dm'){
                hereLog(`Recieving DM command from ${message.author.id}`);
                this.worker.processDMessage(message, d);
            }
            else{
                this.worker.processMessage(message, d);
            }
        });
        
        this.on('messageReactionAdd', (reaction, user) => {
            if(user.id!==this.user.id)
                this.worker.event('messageReactionAdd', reaction, user);
        });
        
        this.on('messageReactionRemove', (reaction, user) => {
            if(user.id!==this.user.id)
                this.worker.event('messageReactionRemove', reaction, user);
        });
        
        this.on('messageReactionRemoveAll', (message) => {
            this.worker.event('messageReactionRemoveAll', message);
        });
        
        this.on('guildMemberRemove', (member) => {
            this.worker.memberRemove(member);
        });
        
        this.on('guildMemberUpdate', (oldMember, newMember) => {
            this.worker.event('guildMemberUpdate', oldMember, newMember);
        });
        
        this.on('error', (error)=>{
            hereLog("SmashBot encountered an error…");
            hereLog(error);
        });
        
        this.on('reconnecting', ()=>{
            hereLog("SmashBot is attempting a reconnection through websocket…");
            this.worker.destroy();
        });
        
        this.on('resume', (replayed) =>{
            this.worker.destroy();
            hereLog("SmashBot's websocket is resuming… "+replayed+" events were played.");
        });
        
        this.on('warn', (info) =>{
            hereLog("SmashBot WARNING!!! : "+info);
        });
        
        this.on('disconnect', (event)=>{
            this.worker.destroy();
            hereLog("SmashBot disconnected.");
            hereLog(event);
            process.exit(0);
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
        this.on("guildCreate", guild  =>{
            hereLog(`new guild ${guild}!`)
            this.worker.newGuild(guild);
        })
        this.on("guildDelete", guild  =>{
            hereLog(`bye ${guild}…`)
            this.worker.byeGuild(guild);
        })
        this.on('close', () => {
            this.removeAllListeners();
        });
    }

    async login(){
        if(!this.validTest){
            hereLog( utils.JSONCheck.report(config.get('StrashBot')) );
            hereLog("bot config isn't valid, won't login to discord");
        }
        else{
            await super.login(this.token)
            .then()
            .catch( err => { hereLog("Error when login to discord attempt…"); hereLog(err); });
        }
    }

    get masterID(){
        return config.get('StrashBot.masterID');
    }
};

module.exports.StrashBot= StrashBot;
