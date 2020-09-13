const sqlite3 = require('sqlite3').verbose();
const cron= require('node-cron');

let hereLog= (...args) => {console.log("[playersDB]", ...args);};

class PlayerDataManager{
    constructor(db_filepath){
        this._db_path= db_filepath

        this._db= null
        this._db_closeRequest= false

        this._cron_db_closer= cron.schedule('*/5 * * * *', () =>{
            if(this._db_closeRequest && Boolean(this._db)){
                this._db.close()
                hereLog("Closing database…")
                this._db= null
                this._db_closeRequest= false
            }
        });

        this._init_db()
    }

    _open_db(){
        if(!Boolean(this._db)){
            this._db_closeRequest= false
            this._db= new sqlite3.Database( this._db_path, (err) =>{
                if(err){
                    hereLog(err.message)
                    this._db_closeRequest= true
                }
    
                hereLog(`Connection to ${this._db_path}`)
            })
        }
        else{
            this._db_closeRequest= false
        }
    }

    _closeRequest_db(){
        this._db_closeRequest= true
    }

    _init_db(){
        this._open_db()

        this._db.run('CREATE TABLE IF NOT EXISTS players (user_id INTEGER PRIMARY KEY, roster TEXT DEFAULT "0")');

        this._closeRequest_db()
    }

    playerExists(playerID){
        this._open_db()

        hereLog("test1")
        var res= true
        this._db.get("SELECT EXISTS(SELECT 1 FROM players WHERE user_id = ? LIMIT 1", [playerID], (row,err)=>{
            if(err){
                hereLog(err.message)
                res= false
                return
            }
            
            res= Boolean(row)
            hereLog("test2")

            return
        })
        hereLog("test3")

        this._closeRequest_db()
        return res
    }

    setPlayerRoster(playerID, roster){
        this._open_db()

        var res= false
        if(this.playerExists(playerID)){
            this._db.run("UPDATE players SET roster = ? WHERE user_id = ?", [ roster, playerID ], (err)=>{
                if(err){
                    hereLog(err.message)
                    res= false
                    return
                }

                res= true
            })
        }
        else{
            this._db.run("INSERT INTO players (user_id,roster) VALUES (?,?)", [ playerID, roster ], (err)=>{
                if(err){
                    hereLog(err.message)
                    res= false
                    return
                }
                res= false
            })
        }

        this._closeRequest_db()
        return res
    }

    getPlayerRoster(playerID){
        this._open_db()

        var res= undefined
        if(this.playerExists(playerID)){
            this._db.get("SELECT roster FROM players WHERE user_id = ?", [playerID], (row, err)=>{
                if(err){
                    res= undefined
                    hereLog(err.message)
                    return
                }

                res= row.roster
                return
            })
        }

        this._closeRequest_db()
        return res
    }
}


module.exports.PlayerDataManager= PlayerDataManager