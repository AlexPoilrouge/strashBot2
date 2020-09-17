const sqlite3 = require('sqlite3').verbose();
const cron= require('node-cron');

let hereLog= (...args) => {console.log("[playersDB]", ...args);};

function __loadFightersObj(){
    var fn= path.resolve(__dirname,"fighters.json")
    if(fs.existsSync(fn)){
        var data= fs.readFileSync(fn);

        var r= undefined;
        if(Boolean(data) && Boolean(r=JSON.parse(data))){
            return r;
        }
        else{
            hereLog(`[load_fighters] Error reading data from '${fn}'`);
            return undefined;
        }
    }
    else{
        hereLog(`[load_fighters]'${fn}' file not found`);
        return undefined;
    }
}

let fightersObj= undefined;

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

        if(!Boolean(fightersObj)){
            fightersObj= __loadFightersObj()
        }
        this.fightersObj= fightersObj;

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
                    hereLog(`[RunQuery] error: ${err.message}`)
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
                    hereLog(`[getQuery] error: ${err.message}`)
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

        await this.__runQuery('CREATE TABLE IF NOT EXISTS players (user_id INTEGER PRIMARY KEY,'+
                                'roster_1 TEXT DEFAULT "0", roster_2 TEXT DEFAULT "0", roster_3 TEXT DEFAULT "0", roster_4 TEXT DEFAULT "0")');

        this._closeRequest_db()
    }

    async playerExists(playerID){
        this._open_db()

        hereLog("test1")
        var res= Boolean(await this.__getQuery("SELECT * FROM players WHERE user_id = ?;", [playerID]));
        hereLog(`[playerExists?] ${res}`)

        this._closeRequest_db()
        return res
    }

    async setPlayerRoster(playerID, roster){
        this._open_db()

        if(!Boolean(roster) || roster.length<=0) return false;

        var res= false
        hereLog("[setroster] 1")
        if(await this.playerExists(playerID)){
            hereLog("[setroster] 2")
            var query= "UPDATE players SET "
            for(var i=0; i<roster.length; ++i){
                query+= `${(i>0?", ":"")}roster_${i} = ?`
            }
            query+= " WHERE user_id = ?"

            res= (Boolean( await (this.__runQuery(query, roster.concat(playerID)))));
        }
        else{
            hereLog("[setroster] 6")
            var query= "INSERT INTO players (user_id"
            for(var i=0; i<roster.length; ++i){
                query+= `,roster_${i}`
            }
            query+=`) VALUES (?,${roster.join(',')})`

            res= (Boolean( await (this.__runQuery(query, [ playerID ].concat(roster)) ) ));
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
            var tmp= ( await (this.__getQuery("SELECT roster_1,roster_2,roster_3,roster_4 FROM players WHERE user_id = ?", [playerID])))
            if(Boolean(tmp)){
                hereLog("[getroster] uh?")
                res= `${tmp.roster_1};${tmp.roster_2};${tmp.roster_3};${tmp.roster_4}`
            }
            hereLog(`[getroster] 3: res= ${res}`)
        }

        this._closeRequest_db()
        hereLog("[getroster] 4")
        return res
    }

    findFighter(name){
        if(Boolean(name) && Boolean(this.fightersObj)){
            var res= undefined
            for (var key of Object.keys(this.fightersObj)){
                var fighter= this.fightersObj[key]
                var regex= (Boolean(fighter) && Boolean(fighter.regex))?(new RegExp(fighter.regex)):undefined
                if(Boolean(regex) && (Boolean(name.toLowerCase().match(regex)) || Boolean(name===fighter.number))){
                    res= {"name": key, "number": fighter.number}
                    break;
                }
            }
            return res;
        }
        else{
            return undefined;
        }
    }

    _nameAndColorToRosterID(name,color){
        var f= this.findFighter(name);

        if(!Boolean(f) || !Boolean(f.number)) return undefined

        var s_color= undefined;
        if(Number.isInteger(color)){
            s_color= ((color>7)?7:(color<0)?0:color).toString();
        }
        else{
            s_color= color
        }

        return f.number+'.'+s_color;
    }

    async setRosterByNameAndColor(playerID, rosterNC){
        var roster= [];
        var leftovers= []

        for(var r of rosterNC){
            if(Boolean(r) && Boolean(r.name) && !([null,undefined].includes(r.color))){
                var chara= this._nameAndColorToRosterID(r.name, r.color);
                if(Boolean(chara)){
                    roster.push(chara);
                }
                else{
                    leftovers.push(r)
                }
            }
            else{
                leftovers.push(r)
            }
        }

        if(roster.length>0){
            if(!Boolean(await (this.setPlayerRoster(playerID, roster)))){
                return undefined
            }
        }

        return leftovers;
    }
}


module.exports.PlayerDataManager= PlayerDataManager