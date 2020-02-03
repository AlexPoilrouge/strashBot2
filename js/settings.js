const fs = require('fs');
const path= require('path');

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
                console.log(`[FC Saving] Couldn't write in file '${this.fcJSONFile}'…` );
                console.log(err);
            }
        });
    }

    checkGuildsSetup(){
        var data= fs.readFileSync(this.guildConfigs.file);
        if(Boolean(data)){
            this.guildConfigs.settings= JSON.parse(data);
        }
        else{
            console.log(`[Settings] Error reading data from '${this.guildConfigs.file}'`);
        }

        this.bot.guilds.forEach((guild) => {
            if(!(Boolean(this.guildConfigs.settings[guild.id]))){
                this.guildConfigs.settings[guild.id]= {};
            }
        });

        this.saveGuildsSetup();
    }
};