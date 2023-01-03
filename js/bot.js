
// Import the discord.js module
const Discord= require('discord.js');

const utils= require('./utils')

const wk= require('./worker')

const config= require('config');



const MSG_CACHE= 500;

let hereLog=    (...args) => {console.log("[bot]", ...args);};

class StrashBot extends Discord.Client{
    constructor(token, worker){
        super({
            messageCacheMaxSize: MSG_CACHE,
            partials: [
                Discord.Partials.Message,
                Discord.Partials.Channel,
                Discord.Partials.Reaction
            ],
            intents: [
                Discord.GatewayIntentBits.Guilds,
                Discord.GatewayIntentBits.GuildMessages,
                Discord.GatewayIntentBits.GuildMessageReactions,
                Discord.GatewayIntentBits.DirectMessages,
                Discord.GatewayIntentBits.DirectMessageReactions,
                Discord.GatewayIntentBits.MessageContent,
                Discord.GatewayIntentBits.GuildMembers
            ]
        });

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
            this.guilds.cache.forEach((guild) => {
                hereLog(" - " + guild.name)
            })

            this.worker.ready();
        });
        
        this.on('messageCreate', (message)=>{
            if(message.author.id === this.user.id) return; // Prevent bot from responding to its own messages

            this._msgCount= (this._msgCount+1)%(this._msgCache);
            var d= (this._msgCache-this._msgCount);

            if(message.channel.type === Discord.ChannelType.DM){
                hereLog(`Recieving DM command from ${message.author.id}`);
                this.worker.processDMessage(message, d);
            }
            else{
                this.worker.processMessage(message, d);
            }
        });
        
        this.on('messageReactionAdd', (reaction, user) => {
            if(user.id!==this.user.id && Boolean(this.worker)){
                if(Boolean(reaction)){
                    this.worker.event('messageReactionAdd', reaction, user);
                }
            }
        });
        
        this.on('messageReactionRemove', (reaction, user) => {
            if(user.id!==this.user.id  && Boolean(this.worker)){
                if(Boolean(reaction)){
                    this.worker.event('messageReactionRemove', reaction, user);
                }
            }
        });
        
        this.on('messageReactionRemoveAll', (message) => {
            if(Boolean(this.worker))
                this.worker.event('messageReactionRemoveAll', message);
        });
        
        this.on('guildMemberAdd', (member) => {
            if(Boolean(this.worker))
                this.worker.event('guildMemberAdd', member);
        });
        
        this.on('guildMemberRemove', (member) => {
            if(Boolean(this.worker))
                this.worker.event('guildMemberRemove', member);
        });
        
        this.on('guildMemberUpdate', (oldMember, newMember) => {
            if(Boolean(this.worker))
                this.worker.event('guildMemberUpdate', oldMember, newMember);
        });
        
        this.on('emojiUpdate', (oldEmoji, newEmoji) => {
            if(Boolean(this.worker))
                this.worker.event('emojiUpdate', oldEmoji, newEmoji);
        });
        
        this.on('emojiDelete', (emoji) => {
            if(Boolean(this.worker))
                this.worker.event('emojiDelete', emoji);
        });

        this.on('error', (error)=>{
            hereLog("SmashBot encountered an error…");
            hereLog(error);
        });
        
        this.on('reconnecting', ()=>{
            //hereLog("SmashBot is attempting a reconnection through websocket…");
            //this.worker.destroy();
        });
        
        this.on('resume', (replayed) =>{
            //this.worker.destroy();
            //hereLog("SmashBot's websocket is resuming… "+replayed+" events were played.");
        });
        
        this.on('warn', (info) =>{
            hereLog("SmashBot WARNING!!! : "+info);
        });
        
        this.on('disconnect', (event)=>{
            hereLog("SmashBot's disconnecting…"); 
            if(Boolean(this.worker))
                this.worker.destroy();
            hereLog("SmashBot disconnected.");
            hereLog(event);
            process.exit(0);
        });

        this.on('channelDelete', channel =>{
            if(Boolean(this.worker))
                this.worker.event('channelDelete', channel);
        })
        this.on('messageDelete', channel =>{
            if(Boolean(this.worker))
                this.worker.event('messageDelete', channel);
        })
        this.on('roleDelete', role =>{
            if(Boolean(this.worker))
                this.worker.event('roleDelete', role);
        })
        this.on('roleUpdate', (oldRole, newRole) =>{
            if(Boolean(this.worker))
                this.worker.event('roleUpdate', oldRole, newRole);
        })
        this.on("guildCreate", guild  =>{
            hereLog(`new guild ${guild}!`)
            if(Boolean(this.worker))
                this.worker.newGuild(guild);
        })
        this.on("guildDelete", guild  =>{
            hereLog(`bye ${guild}…`)
            if(Boolean(this.worker))
                this.worker.byeGuild(guild);
        })
        this.on('close', () => {
            if(Boolean(this.worker))
                this.removeAllListeners();
        });
        //source: https://github.com/AnIdiotsGuide/discordjs-bot-guide/blob/master/coding-guides/raw-events.md
        this.on('raw', packet => {
            // We don't want this to run on unrelated packets
            if (!['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE'].includes(packet.t)) return;
            // Grab the channel to check the message from
            const channel = this.channels.cache.get(packet.d.channel_id);
            // There's no need to emit if the message is cached, because the event will fire anyway for that
            // if (channel.messages.cache.has(packet.d.message_id)) return;
            // Since we have confirmed the message is not cached, let's fetch it
            channel.messages.fetch(packet.d.message_id).then(message => {
                // Emojis can have identifiers of name:id format, so we have to account for that case as well
                const emoji = packet.d.emoji.id ? `${packet.d.emoji.name}:${packet.d.emoji.id}` : packet.d.emoji.name;
                // This gives us the reaction we need to emit the event properly, in top of the message object
                const reaction = message.reactions.resolve(emoji);
                // Adds the currently reacting user to the reaction's users collection.
                // Check which type of event it is before emitting
                this.users.fetch(packet.d.user_id).then(u =>{
                    if (reaction) reaction.users.cache.set(packet.d.user_id, this.users.cache.get(packet.d.user_id));

                    if (packet.t === 'MESSAGE_REACTION_ADD') {
                        this.emit('messageReactionAdd', reaction, u);
                    }
                    if (packet.t === 'MESSAGE_REACTION_REMOVE') {
                        this.emit('messageReactionRemove', reaction, u);
                    }
                })
            });
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
