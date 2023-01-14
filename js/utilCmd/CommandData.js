const fs= require('fs');
const path= require( 'path' );

const my_utils= require('../utils');



let hereLog= (...args) => {console.log("[CommandData]", ...args);};

function __sleep(ms){
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
}


class CommandData{
    constructor(dirname){
        this._dirPath= path.resolve(__dirname, `../../data/${dirname}`)
        fs.mkdirSync(this._dirPath, { recursive: true });

        this._cmdSettings= {}
        
        this._save_lock= false;
    }

    add(cmdFileName){
        if(!Boolean(cmdFileName)) return;

        // var cmd_name= path.basename(cmdFileName);
        // cmd_name= (cmd_name.startsWith("cmd_"))? cmd_name.slice(4) : cmd_name;
        // cmd_name= (cmd_name.endsWith(".js"))? cmd_name.slice(0,-3) : cmd_name;
        // var cmd_name= my_utils.commandNameFromFilePath(cmdFileName);
        let cmd_name= cmdFileName.substring(4,cmdFileName.length-3)

        var commandFileSettings= this._cmdSettings[cmd_name];
        if(!Boolean(commandFileSettings)){
            this._cmdSettings[cmd_name]= {};
            commandFileSettings= this._cmdSettings[cmd_name];
        }
    }

    __loadingJSONObj(fileName){
        if(fs.existsSync(fileName)){
            var data= fs.readFileSync(fileName);

            var r= undefined;
            try{
                if(Boolean(data) && Boolean(r=JSON.parse(data))){
                    return r;
                }
                else{
                    hereLog(`[Settings] Error reading data from '${fileName}'`);
                    return undefined;
                }
            }
            catch(error){
                hereLog(`[Settings] Error loading JSON data from '${fileName}':\n\t${error}`)
                return undefined;
            }
        }
        else{
            return undefined;
        }
    }

    addGuild(cmd_name, guildID){
        // var cmd_name= my_utils.commandNameFromFilePath(cmdFilePath);

        var commandFileSettings= this._cmdSettings[cmd_name];
        if(!Boolean(commandFileSettings))
            return false;

        var perGuildSettings= undefined;
        if(!Boolean(perGuildSettings=commandFileSettings[guildID])){
            commandFileSettings[guildID]= {};
            perGuildSettings= commandFileSettings[guildID];
        }

        var fn= `${this._dirPath}/${cmd_name}_${guildID}.json`;
        perGuildSettings['file']= path.resolve(__dirname, fn);
        var ld_data= (fs.existsSync(perGuildSettings['file']))?
                        this.__loadingJSONObj(perGuildSettings['file'])
                    :   undefined;
        if(Boolean(ld_data)){
            perGuildSettings['object_json']= ld_data;
        }
        else{
            perGuildSettings['object_json']= {};

            var data= JSON.stringify({}, null, 2);

            fs.writeFileSync(perGuildSettings['file'], data, err => {
                if(err){
                    hereLog(`[CS Saving](2) Couldn't write in file '${perGuildSettings['file']}'…` , err);
                }
                perGuildSettings['seenLast']= new Date()
            });
        }
    }

    async rmGuild(cmd_name, guildID){
        //var cmd_name= my_utils.commandNameFromFilePath(cmdFilePath);

        var commandFileSettings= this._cmdSettings[cmd_name];
        if(!Boolean(commandFileSettings))
            return;

        var perGuildSettings= undefined;
        if(!Boolean(perGuildSettings=commandFileSettings[guildID])){
            commandFileSettings[guildID]= {};
            perGuildSettings= commandFileSettings[guildID];
        }

        while(this._save_lock){
            await __sleep(1000);
        }
        this._save_lock= true;
        var f= undefined;
        if(Boolean(f=perGuildSettings['file']) && fs.existsSync(f)){
            fs.unlink(f, err =>{
                if(err){
                    hereLog(`[CS Deleting] error with ${f} unlink…`, err);
                }
                hereLog(`[CS Deleting] ${f} unlink…`);
            });
        }
        this._save_lock=false;

        delete commandFileSettings[guildID];
    }

    async reloadData(){
        while(this._save_lock){
            await __sleep(1000);
        }
        this._save_lock= true;

        Object.keys(this._cmdSettings).forEach( cmd_name => {
            var cmd_sett_obj= this._cmdSettings[cmd_name];

            var fn= cmd_sett_obj['file'];
            var data= undefined;
            if(Boolean(fn) && Boolean(data=this.__loadingJSONObj(fn))){
                cmd_sett_obj['object_json']= data;
            }
            else{
                hereLog(`[Error] cound't reload data from ${fn}`);
            }
        })
        
        this._save_lock= false;
    }

    _checkData(cmd_name, guildID){
        var commandFileSettings= this._cmdSettings[cmd_name];
        if(!Boolean(commandFileSettings))
            return;

        var perGuildSettings= undefined;
        if(!Boolean(perGuildSettings=commandFileSettings[guildID])){
            commandFileSettings[guildID]= {};
            perGuildSettings= commandFileSettings[guildID];
        }

        let f= perGuildSettings['file']
        if(!Boolean(f)){
            hereLog(`{data check} no data to check for '${cmd_name}'`)
            return;
        }
        let stats= fs.statSync(f)
        if(stats && stats.ctime>perGuildSettings['seenLast']){
            hereLog(`{data check} changes detected on '${f}' trying update...`)
            let obj= this.__loadingJSONObj(f)
            if(Boolean(obj)){
                perGuildSettings['object_json']= obj
            }
            perGuildSettings['seenLast']= new Date()
        }
    }

    async _saveData(cmd_name, guildID){
        //var cmd_name= my_utils.commandNameFromFilePath(cmdFilePath);

        while(this._save_lock){
            await __sleep(1000);
        }
        this._save_lock= true;
        
        var obj= this._cmdSettings[cmd_name]['object_json'];
        var data= JSON.stringify(obj, null, 2);

        var commandFileSettings= this._cmdSettings[cmd_name];
        var perGuildSettings= undefined;
        if(!Boolean(perGuildSettings=commandFileSettings[guildID])){
            this.addGuild(cmd_name, guildID);
            if(!Boolean(perGuildSettings=commandFileSettings[guildID])){
                return false;
            }
        }

        var obj= perGuildSettings['object_json'];
        var data= JSON.stringify(obj, null, 2);


        await fs.writeFile(perGuildSettings['file'], data, err => {
            if(err){
                hereLog(`[CS Saving](1) Couldn't write in file '${perGuildSettings['file']}'…`, err);
            }
            perGuildSettings['seenLast']= new Date()
        });

        this._save_lock= false;
    }
}

module.exports= CommandData