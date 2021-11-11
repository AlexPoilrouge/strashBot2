/***
 * Thanks to Seb "Firezard", for his help with this part
 ***/


const https = require('https')
const fs= require('fs')
const path= require('path')

let hereLog= (...args) => {console.log("[SmashGGReader]", ...args);};

class SGG_GQLQuery{
    constructor(token, fileName, operationName){
        this.token= token;
        this.query= undefined;
        this.operationName= operationName;

        this._loadQuery(fileName)
    }

    _loadQuery(fileName){
        try{
            this.query= fs.readFileSync(path.resolve(fileName), {encoding: 'utf-8'}).toString();
        }catch(err){
            hereLog(`[GQLQuery][loadQuery] failed at loading query form file ${fileName}:\n\t${err.message}`);
            this.query= undefined;
        }
    }

    isQueryReady(){
        return Boolean(this.query)
    }


    setVariables(varObj){
        this.variables= varObj
    }

    _getBodyObj(){
        let query= this.query;
        let variables= this.variables;
        return  (Boolean(query))?
                    ((Boolean(variables))?
                        {   query,
                            variables,
                            operationName: this.operationName
                        }
                    :   {   query,
                            operationName: this.operationName
                        }
                    )
                :   undefined;
    }

    _getHeadersObj(){
        return (Boolean(this.token))?
                    {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`,
                    }
                :   undefined;
    }

    _getRequestOptionsObj(){
        let headers= this._getHeadersObj();
        return (Boolean(headers))?
                    {
                        method: 'POST',
                        host: `api.smash.gg`,
                        path: `/gql/alpha`,
                        port: 443,
                        headers
                    }
                : undefined;
    }

    make(){
        let options= this._getRequestOptionsObj();
        let body= this._getBodyObj();

        return (new Promise((resolve, reject) => {
            if(Boolean(options) && Boolean(body)){
                let req = https.request(options, res => {
                    let result= ''
                    res.on('data', (chunk) => {result += chunk;})
                    res.on('end', () => {/*hereLog(`[GQLQuery][makeRequest][end] got ${result}`);*/ resolve(JSON.parse(result));} )
                    res.on('error', (err) => {hereLog(`[GQLQuery][request] error: ${err.message}`); reject(err)})
                })

                req.on('error', error => {
                    hereLog(`[GQLQuery][request] error: ${err.message}`);
                    reject(error)
                })
                req.write(JSON.stringify(body))
                req.end()
            }
        }))
    }




}


const GetEventQueryFile= `${__dirname}/smashgg/GetEvent_query.gql` 
const GetStandingQueryFile= `${__dirname}/smashgg/EventStandings_query.gql` 

class SmashGG_Top8Reader{
    constructor(token,url){
        this._token=token
        this._tourneySlug= undefined;
        this._eventSlug= undefined;

        this._gotEvents= {timestamp: undefined, obj: undefined}

        this.__slug(url);
    }


    __slug(url){
        let s_url= (Boolean(url))?url.split('/'):[]

        this._tourneySlug= (s_url.length>=5)?
                s_url[4]
            :   undefined;

        this._eventSlug= (s_url.length>=7)?
                s_url[6]
            :   "singles";
    }

    async _getEventsObj(){
        if(Boolean(this._gotEvents) && Boolean(this._gotEvents.obj) &&
            Boolean(this._gotEvents.timestamp) && (this._gotEvents.timestamp-Date.now()<30000))
        {
            return this._gotEvents.obj
        }

        if(!Boolean(this._token)){
            hereLog("[SGGReader][top8Event] Error: SmashGG access token not provided")
            return undefined;
        }

        if(!Boolean(this._tourneySlug)){
            hereLog("[SGGReader][top8Event] Error: SmashGG no url provided")
            return undefined;
        }

        if(!fs.existsSync(path.resolve(GetEventQueryFile))){
            hereLog(`[SGGReader][top8Event] Error: file \`${GetEventQueryFile}\` not accessible or non-existant`)
            return undefined;
        }

        let query= new SGG_GQLQuery(this._token, GetEventQueryFile, 'GetEvents');
        if(!query.isQueryReady()){
            hereLog("[SGGReader][top8Event] Error: query load error")
            return undefined;
        }
        query.setVariables({
            "slug": this._tourneySlug
        })

        var events= undefined;
        try{
            events= (await query.make());
        } catch(err){
            hereLog(`[SGGReader][top8Event] Request returned with error: ${err}`)
            events= undefined;
        }

        if(Boolean(events)){
            this._gotEvents= {timestamp: Date.now(), obj: events}
        }

        return events;
    }

    async _getTop8Standing(){
        let eventsQueryRes= (await this._getEventsObj())

        if(!Boolean(eventsQueryRes)){
            hereLog(`[SGGReader][top8Standing] Error: couldn't access event list…`)
            return undefined
        }

        let getSubObj= (str, obj=eventsQueryRes) =>{
            let l= str.split('/')
            var obj= obj
            while(Boolean(obj) && l.length>0){
                let n= l.shift()
                if(!Boolean(obj[n])) return undefined;
                obj= obj[n]
            }
            return obj;
        }
        let l_events= getSubObj("data/tournament/events")
        if(!Boolean(l_events)){
            hereLog(`[SGGReader][top8Standing] Error: couldn't access event list from smashgg`)
            return undefined;
        }
        let singleEvent= l_events.find(ev => {return ev.name.toLowerCase()===this._eventSlug;})
        var sEv_id= undefined;
        if(!Boolean(singleEvent) || !Boolean(sEv_id=singleEvent.id)){
            hereLog(`[SGGReader][top8Standing] Error: couldn't acces \`${this._eventSlug}\` event from smashgg`)
            return undefined;
        }
        
        let query= new SGG_GQLQuery(this._token, GetStandingQueryFile, 'EventStandings');
        if(!query.isQueryReady()){
            hereLog("[SGGReader][top8Standing] Error: query load error")
            return undefined;
        }
        query.setVariables({
            "eventId": sEv_id,
            "page": 1,
            "perPage": 8
        })

        var standing= undefined;
        try{
            standing= (await query.make());
        } catch(err){
            hereLog(`[SGGReader][top8Standing] Request returned with error: ${err}`)
            standing= undefined;
        }

        return (Boolean(standing))?
                    {   
                        numEntrants: getSubObj("data/event/numEntrants",standing),
                        standings: getSubObj("data/event/standings",standing)
                    }
                :   undefined;
        ;
    }

    async getTop8(){
        let standingsQueryRes= (await this._getTop8Standing())

        var nodes= undefined;
        if(!Boolean(standingsQueryRes) || !Boolean(nodes=standingsQueryRes.standings) ||
            !Boolean(nodes=standingsQueryRes.standings.nodes) || nodes.length<=0)
        {
            hereLog(`[SGGReader][top8Standing] Error: couldn't access tournament standing…`)
            return undefined
        }

        nodes.sort((n1,n2) => {return (n1.placement-n2.placement)})
        let sep= " | "
        return {numEntrants: standingsQueryRes.numEntrants,
                top8: nodes.map(n => {return {
                        placement: n.placement,
                        name: ((n.entrant.name.includes(sep))? n.entrant.name.split(sep).pop(): n.entrant.name),
                        team: ((n.entrant.name.includes(sep))? n.entrant.name.split(sep).slice(0,-1).join(sep): undefined),
                        twitter: (Boolean(n.entrant.participants[0].user.authorizations) && Boolean(n.entrant.participants[0].user.authorizations[0]))?
                                    n.entrant.participants[0].user.authorizations[0]['externalUsername']
                                :   undefined
                    }})
                }
    }

    async getInfos(){
        let ev= (await this._getEventsObj())
        let top8Infos= (await this.getTop8())

        if(!Boolean(ev) || !Boolean(top8Infos)){
            hereLog(`[SGGReader][getInfos] error while requesting data`)
            return undefined;
        }

        var d= new Date(0)
        d.setUTCSeconds(ev.data.tournament.startAt)
        return {
            venueAdress: ev.data.tournament.venueAddress,
            date: d,
            numEntrants: top8Infos.numEntrants,
            top8: top8Infos.top8
        }
    }
}

const SmashGGInfosFile= `${__dirname}/smashgg/smashgg_infos.json`

const GetSmashGGToken= () =>{
    try{
        var data= fs.readFileSync(path.resolve(SmashGGInfosFile));

        var r= undefined;
        try{
            if(!Boolean(data) || !Boolean(r=JSON.parse(data))){
                hereLog(`[GetSmashGGToken] Error reading data from '${SmashGGInfosFile}'`);
                return undefined;
            }
        }
        catch(error){
            hereLog(`[GetSmashGGToken] Error loading JSON data from '${SmashGGInfosFile}':\n\t${error}`)
            return undefined;
        }
    }catch(err){
        hereLog(`[GetSmashGGToken] failed at loading infos from file ${SmashGGInfosFile}:\n\t${err.message}`);
        return undefined;
    }

    if(!Boolean(r) || !Boolean(r.token)){
        hereLog(`[GetSmashGGToken] couldn't read token data from file ${SmashGGInfosFile}}`)
    }

    return r.token
}

module.exports.SmashGG_Top8Reader= SmashGG_Top8Reader
module.exports.GetSmashGGToken= GetSmashGGToken
