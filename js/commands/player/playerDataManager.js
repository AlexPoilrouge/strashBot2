const sqlite3 = require('sqlite3').verbose();
const cron= require('node-cron');

let hereLog= (...args) => {console.log("[playersDB]", ...args);};

class PlayerDataManager{
    constructor(db_filepath){
        this._db_path= db_filepath

        this._db= null
        this._db_closeStamp= undefined

        this._cron_db_closer= cron.schedule('*/5 * * * *', () =>{
            if(Boolean(this._db_closeStamp) && ((Date.now()-this._db_closeStamp)>120000)
                && Boolean(this._db)
            ){
                this._db.close()
                hereLog("Closing database…")
                this._db= null
                this._db_closeStamp= undefined
            }
        });

        this._init_db()
    }

    _open_db(){
        if(!Boolean(this._db)){
            this._db_closeStamp= undefined
            this._db= new sqlite3.Database( this._db_path, (err) =>{
                if(err){
                    hereLog(err.message)
                    this._db_closeStamp= Date.now()-5000
                }
    
                hereLog(`Connection to ${this._db_path}`)
            })
        }
        else{
            this._db_closeStamp= undefined
        }
    }

    _closeRequest_db(){
        this._db_closeStamp= Date.now()
    }

    __runQuery(query, placeholders=[]){
        return new Promise((resolve, reject)=>{
            this._db.run(query,placeholders,(err)=>{
                hereLog(`[RunQuery] query: ${query}; placeholders: ${placeholders}`)
                if(Boolean(err)){
                    hereLog(`[RunQuery] ${err.message}`)
                    resolve(false);
                }

                resolve(true)
            })
        })
    }

    __getQuery(query,placeholders=[]){
        return new Promise((resolve, reject)=>{
            var t= this;
            this._db.serialize(function(){
            t._db.get(query,placeholders,(err,row)=>{
                hereLog(`query: ${query} ; placeholders: ${placeholders}`)
                if(Boolean(err)){
                    hereLog(`[getQuery] err ${err} - ${err.message}`)
                    resolve(undefined)
                }
                else{
                    hereLog(`[getQuery] no err`) 
                }
                hereLog(`[getQuery] row= ${row}`)
                //hereLog(`[getQuery] -${row}- roster? ${row.roster}`)
                resolve(row)
            })
            })
        })
    }

    async _init_db(){
        this._open_db()

        await this.__runQuery('CREATE TABLE IF NOT EXISTS players (user_id INTEGER PRIMARY KEY, roster TEXT DEFAULT "0")');

        this._closeRequest_db()
    }

    async playerExists(playerID){
        this._open_db()

        hereLog("test1")
        var res= Boolean(await this.__getQuery("SELECT roster FROM players WHERE user_id = ?;", [playerID]));
        hereLog(`[playerExists?] ${res}`)

        this._closeRequest_db()
        return res
    }

    async setPlayerRoster(playerID, roster){
        this._open_db()

        var res= false
        hereLog("[setroster] 1")
        if(await this.playerExists(playerID)){
            hereLog("[setroster] 2")
            res= (Boolean( await (this.__runQuery("UPDATE players SET roster = ? WHERE user_id = ?", [ roster, playerID ]))));
        }
        else{
            hereLog("[setroster] 6")
            res= (Boolean( await (this.__runQuery("INSERT INTO players (user_id,roster) VALUES (?,?)", [ playerID, roster ]))));
        }

        this._closeRequest_db()
        hereLog("[setroster] 8")
        return res
    }

    async getPlayerRoster(playerID){
        this._open_db()

        var res= undefined
        hereLog("[getroster] 1")
        if(await this.playerExists(playerID)){
            hereLog("[getroster] 2")
            var tmp= ( await (this.__getQuery("SELECT * FROM players WHERE user_id = ?", [playerID])))
            if(Boolean(tmp)){
                hereLog("[getroster] uh?")
                res= tmp.roster
            }
            hereLog(`[getroster] 3: res= ${res}`)
        }

        this._closeRequest_db()
        hereLog("[getroster] 4")
        return res
    }
}


module.exports.PlayerDataManager= PlayerDataManager