const fs= require('fs');
const path= require( 'path' );

var Mutex = require('async-mutex').Mutex;

const my_utils= require('../utils');
const CommandData = require('./CommandData');



let hereLog= (...args) => {console.log("[CommandSettings]", ...args);};




class CommandSettings extends CommandData{
    constructor(){
        super("commands")

        this.mutex= new Mutex();
    }

    getField(cmd_name, guild, fieldName){
        this._checkData(cmd_name, guild)

        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(!Boolean(commandFileSettings=this._cmdSettings[cmd_name]) ||
            !Boolean(guild) || !Boolean(perGuildSettings=commandFileSettings[guild.id]) ||
            !Boolean(obj=perGuildSettings['object_json'])
        ){
            return undefined;
        }
        else{
            var fields=fieldName.split('.');
            var t= obj;
            for (var f of fields){
                if(!Boolean(t=obj[f])){
                    break;
                }
            }
            if(!Boolean(t)) return undefined;
            return t;
        }
    }

    setField(cmd_name, guild, fieldName, value){
        this._checkData(cmd_name, guild.id)
        // hereLog(`setField ${cmd_name} ${guild.id} ${fieldName} ${value}`)
        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(!Boolean(commandFileSettings=this._cmdSettings[cmd_name]) ||
            !Boolean(perGuildSettings=commandFileSettings[guild.id]) ||
            !Boolean(obj=perGuildSettings['object_json'])
        ){
            return false;
        }
        else{
            var fields=fieldName.split('.');
            var t= obj;
            var tt= undefined;
            for (var f of fields){
                tt=t;
                if(!Boolean(t=obj[f])){
                    obj[f]= undefined;
                    t=obj[f];
                }
            }

            var l=0;
            if(!Boolean(l=fields.length)) obj= value;
            else{
                tt[fields[l-1]]= value;
            }
            this._saveData(cmd_name, guild.id);

            return true;
        }
    }

    removeField(cmd_name, guild, fieldName){
        this._checkData(cmd_name, guild.id)
        
        var commandFileSettings= undefined;
        var perGuildSettings= undefined;
        var obj= undefined;
        if(Boolean(commandFileSettings=this._cmdSettings[cmd_name]) &&
            Boolean(perGuildSettings=commandFileSettings[guild.id]) &&
            Boolean(obj=perGuildSettings['object_json'])
        ){
            delete obj[fieldName];
            this._saveData(cmd_name, guild.id);
        }
    }

    getField_Mtx(cmd_name, guild, fieldName){
        return this.mutex.runExclusive( () => {
            return this.getField(cmd_name, guild, fieldName)
        })
    }

    setField_Mtx(cmd_name, guild, fieldName, value){
        return this.mutex.runExclusive( () => {
            return this.setField(cmd_name, guild, fieldName, value)
        })
    }

    removeField_Mtx(cmd_name, guild, fieldName){
        return this.mutex.runExclusive( () => {
            this.removeField(cmd_name, guild, fieldName)
        })
    }
}

module.exports= CommandSettings;