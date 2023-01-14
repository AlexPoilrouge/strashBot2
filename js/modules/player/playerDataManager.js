const fs= require( 'fs' );
const path= require( 'path' );
const child_process= require("child_process");

const my_utils= require("../../utils")

let hereLog= (...args) => {console.log("[playersDB]", ...args);};


let fightersObj= undefined;

function __loadFightersObj(){
    var fn= path.resolve(__dirname,"fighters.json")

    fightersObj= my_utils.fighterStuff.getFighters()
    if(!Boolean(fightersObj)){
        fightersObj= my_utils.fighterStuff.loadFighters(fn)
    }

    return fightersObj
}

class PlayerDataManager{
    constructor(dbManager){
        this._db= dbManager

        if(!Boolean(fightersObj)){
            fightersObj= __loadFightersObj()
        }
        this.fightersObj= fightersObj;

        this._init_db()
    }

    _open_db(){
        if(Boolean(this._db))
            this._db._open_db();
    }

    _closeRequest_db(){
        if(Boolean(this._db))
            this._db._closeRequest_db();
    }

    __runQuery(query, placeholders=[]){
        return this._db.__runQuery(query, placeholders);
    }

    __getQuery(query,placeholders=[]){
        return this._db.__getQuery(query, placeholders);
    }

    async _init_db(){
        this._open_db()

        await this.__runQuery('CREATE TABLE IF NOT EXISTS players (user_id INTEGER PRIMARY KEY,'+
                                'roster_1 TEXT DEFAULT "0", roster_2 TEXT DEFAULT "0", roster_3 TEXT DEFAULT "0", roster_4 TEXT DEFAULT "0", '+
                                'roster_msg_id TEXT DEFAULT "-", '+
                                'name TEXT DEFAULT "", team TEXT DEFAULT "")')
                            ;

        this._closeRequest_db()
    }

    async playerExists(playerID){
        this._open_db()

        var res= Boolean(await this.__getQuery("SELECT * FROM players WHERE user_id = ?;", [playerID]));

        this._closeRequest_db()
        return res
    }

    async setPlayerRoster(playerID, roster){
        this._open_db()

        if(!Boolean(roster) || roster.length<=0) return false;

        var res= false
        var m_roster= roster.filter((chara, pos, self) => {
            return ( self.findIndex(chr =>{
                        return chr.split('.')[0]===chara.split('.')[0];
            }) ) === pos;
        });
        if(await this.playerExists(playerID)){
            var query= "UPDATE players SET "
            for(var i=0; i<4; ++i){
                query+= `${(i>0?", ":"")}roster_${i+1} = ?`
                if(i>=m_roster.length){
                    m_roster.push('0')
                }
            }
            query+= " WHERE user_id = ?"

            res= (Boolean( await (this.__runQuery(query, m_roster.concat(playerID)))));
        }
        else{
            var query= "INSERT INTO players (user_id"
            for(var i=0; i<4; ++i){
                query+= `,roster_${i+1}`
                if(i>=m_roster.length){
                    m_roster.push('0')
                }
            }
            query+= (`) VALUES (?, ?, ?, ?, ?)`)

            res= (Boolean( await (this.__runQuery(query, [ playerID ].concat(m_roster)) ) ));
        }

        this._closeRequest_db()
        return res
    }

    async getPlayerRoster(playerID){
        this._open_db()

        var res= undefined;
        if(await this.playerExists(playerID)){
            var tmp= ( await (this.__getQuery("SELECT roster_1,roster_2,roster_3,roster_4 FROM players WHERE user_id = ?", [playerID])))
            if(Boolean(tmp)){
                res= [tmp.roster_1,tmp.roster_2,tmp.roster_3,tmp.roster_4]
            }
        }

        this._closeRequest_db()
        return res
    }

    findFighter(name){
        if(Boolean(name) && Boolean(this.fightersObj)){
            let keys= Object.keys(this.fightersObj);
            var res= undefined

            if(Boolean(name.toLowerCase().match(/^(ra?n?do?m)|(rng)|(al([éeè])atoire?)$/))){
                var idx= Math.floor(Math.random() * Math.floor(keys.length))
                res= {"name" : keys[idx], "number": this.fightersObj[keys[idx]].number}
            }
            else{
                for (var key of keys){
                    let l_name= name.toLowerCase()
                    var fighter= this.fightersObj[key]
                    var regex= (Boolean(fighter) && Boolean(fighter.regex))?(new RegExp(fighter.regex)):undefined
                    if( l_name===key ||
                        (   Boolean(regex) && (
                                Boolean(l_name.match(regex))
                                || l_name===fighter.number.toLowerCase()
                                || l_name===fighter.name.toLowerCase()
                            )
                        )
                    ){
                        res= {"name": key, "number": fighter.number}
                        break;
                    }
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
            var n= 0
            s_color= (Boolean(color.match(/^-?[0-9]+$/)))?
                        ( ((n=Number(color))>7)?
                            "7"    
                        : ( (n<0)?
                            "0"
                            : n.toString()
                            )
                        )
                    : "0";
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

    async getPlayerIconsPaths(playerID){
        var r= ( await this.getPlayerRoster(playerID))

        var icons= []
        if(Boolean(r)){
            for(var chara of r){
                var base= chara.split('.')[0]
                var skin= chara.split('.')[1]
                skin= (!Boolean(skin))?
                            "00"
                        : ( (!isNaN(Number(skin)))?
                                ("00"+skin).slice(-2)
                            :  "00" 
                            )


                if(Boolean(base) && base!=='0'){
                    icons.push(__dirname+`/stock_icons/${base}/${skin}.png`)
                }
            }

            return icons;
        }

        return undefined
    }

    async getPlayerIconRosterPath(playerID){
        var dir= __dirname+`/tmp_roster_imgs`
        if(!fs.existsSync(dir)){
            fs.mkdirSync(dir)
        }

        var icons= ( await this.getPlayerIconsPaths(playerID))
        if(Boolean(icons) && icons.length>0){
            var svg=
                `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`+
                `<svg width="416" height="96"\n`+
                `\txmlns="http://www.w3.org/2000/svg" `+
                `xmlns:xlink="http://www.w3.org/1999/xlink">\n`;
            
            for(var i=0; i<icons.length; ++i){
                var s= (i===0)?96:64
                svg+= `\t<image xlink:href="${icons[i]}" width="${s}" height="${s}" x="${((i>0)?32:0)+(i+1)*64}" y="${96-s}"/>\n`
            }
            svg+= `</svg>`

            // hereLog(`===> svg: ${svg}`)

            var svg_file= dir+`/${playerID}.svg`
            var b_success= true
            fs.writeFileSync(svg_file, svg, (err)=>{
                if(err){
                    b_success= false
                }
            })

            if(b_success){
                var png_file= dir+`/${playerID}.png`
                b_success= true
                try{
                    //var cmd= `convert -background none ${svg_file} -resize 50% ${png_file}`
                    var cmd= `inkscape ${svg_file} --export-width=213 --export-filename=${png_file}`
                    child_process.execSync(cmd, {timeout: 16000});
                }
                catch(err){
                    hereLog(`Error while converting svg roster for ${playerID}: ${err.message}`);
                    b_success= false
                }

                if(b_success){
                    fs.unlink(svg_file, err => {
                        if(err){
                            hereLog(`[cleaning gen imgs] svg_file: ${err.message}`)
                        }
                    })
                    
                    return png_file
                }
            }
        }

        return undefined
    }

    async playerHasRoster(playerID){
        var r= (await this.getPlayerRoster(playerID))
        return ( Boolean(r) && r.length>0 &&
            r.some(e => { return e!=="0"; })
        );
    }

    async setPlayerRosterMessage(playerID, messageID){
        this._open_db();

        var res= false
        if(!( await this.playerExists(playerID) ) || !Boolean(messageID)){
            var query= "INSERT INTO players (user_id, roster_msg_id) VALUES (?, ?)"

            res= (Boolean( await (this.__runQuery(query, [ playerID, messageID ]) ) ));
        }
        else{
            var query= "UPDATE players SET roster_msg_id = ? WHERE user_id = ?"

            res= (Boolean( await (this.__runQuery(query, [messageID, playerID])) ));
        }

        this._closeRequest_db();

        return res;
    }

    async getPlayerRosterMessage(playerID){
        this._open_db()

        var res= undefined
        if(await this.playerExists(playerID)){
            var tmp= ( await (this.__getQuery("SELECT roster_msg_id FROM players WHERE user_id = ?", [playerID])))
            if(Boolean(tmp)){
                res= tmp.roster_msg_id;
            }
        }

        this._closeRequest_db()
        return res
    }

    async removeRosterMessage(messageID){
        this._open_db()

        var res= Boolean( await (this.__runQuery("UPDATE players SET roster_msg_id = ? WHERE roster_msg_id = ?", ['-', messageID])) );

        this._closeRequest_db()

        return res;
    }

    async removeAllRosterMessages(){
        this._open_db()

        var res= Boolean( await (this.__runQuery("UPDATE players SET roster_msg_id = ?", ['-', messageID])) )

        this._closeRequest_db()

        return res;
    }

    async isMessageIDReferenced(messageID){
        this._open_db()

        var res= Boolean(await this.__getQuery("SELECT * FROM players WHERE roster_msg_id = ?;", [messageID]));

        this._closeRequest_db()

        return res;
    }

    async setPlayerName(playerID, name){
        this._open_db();

        var res= false
        if(!( await this.playerExists(playerID) )){
            var query= "INSERT INTO players (user_id, name) VALUES (?, ?)"

            res= (Boolean( await (this.__runQuery(query, [ playerID, name ]) ) ));
        }
        else{
            var query= "UPDATE players SET name = ? WHERE user_id = ?"

            res= (Boolean( await (this.__runQuery(query, [name, playerID])) ));
        }

        this._closeRequest_db();

        return res;
    }

    async setPlayerTeam(playerID, team){
        this._open_db();

        var res= false
        if(!( await this.playerExists(playerID) )){
            var query= "INSERT INTO players (user_id, team) VALUES (?, ?)"

            res= (Boolean( await (this.__runQuery(query, [ playerID, team ]) ) ));
        }
        else{
            var query= "UPDATE players SET team = ? WHERE user_id = ?"

            res= (Boolean( await (this.__runQuery(query, [team, playerID])) ));
        }

        this._closeRequest_db();

        return res;
    }

    async getPlayerTag(playerID){
        this._open_db()

        var res= undefined
        if(await this.playerExists(playerID)){
            var tmp= ( await (this.__getQuery("SELECT name, team FROM players WHERE user_id = ?", [playerID])))
            if(Boolean(tmp)){
                res= { name: tmp.name, team: tmp.team };
            }
        }

        this._closeRequest_db()
        return res
    }

    async removePlayer(playerID){
        this._open_db()

        var res= false;
        if(await this.playerExists(playerID)){
            res= (Boolean( await (this.__runQuery('DELETE FROM players WHERE user_id = ?', [playerID])) ));
        }

        this._closeRequest_db()
        return res;
    }
}


module.exports.PlayerDataManager= PlayerDataManager