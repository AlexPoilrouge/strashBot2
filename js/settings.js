const fs = require('fs');
const path= require('path');

let hereLog= (...args) => {console.log("[Settings]", ...args);};


class Settings{
    constructor(bot){
        this._bot= bot;

        this.guildConfigs= {
            'file': path.resolve(__dirname, "../data/guildConfigs.json"),
            'settings': {},
        };
    }

    saveGuildsSetup(){
        var data= JSON.stringify(this.guildConfigs.settings, null, 2);

        fs.writeFile(this.guildConfigs.file, data, err => {
            if(err){
                hereLog(`[FC Saving] Couldn't write in file '${this.guildConfigs.file}'…`, err);
            }
        });
    }

    checkGuildsSetup(){
        var data= fs.readFileSync(this.guildConfigs.file);
        try{
            if(Boolean(data)){
                this.guildConfigs.settings= JSON.parse(data);
            }
            else{
                hereLog(`Error reading data from '${this.guildConfigs.file}'`);
            }
            

            if(!Boolean(this.guildConfigs.settings)) this.guildConfigs.settings= {};

            this._bot.guilds.cache.forEach((guild) => {
                if(!(Boolean(this.guildConfigs.settings[guild.id]))){
                    this.guildConfigs.settings[guild.id]= {};
                }
            });

            this.saveGuildsSetup();
        }
        catch(error){
            hereLog(`Error reading and/or initializing data from '${this.guildConfigs.settings}' - ${error}`);
        }
    }

    get guildsSettings(){
        return this.guildConfigs.settings;
    }
};

module.exports.Settings= Settings;
