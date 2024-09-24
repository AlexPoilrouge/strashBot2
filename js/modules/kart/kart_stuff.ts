
const my_utils= require('../../utils');

const path= require('path')

import { AxiosResponse } from 'axios';
import {CallApi} from '../utils/api_call'
import { TokenKey, TokensHandler } from '../utils/token_maker';
import { Cacher } from '../utils/cacher';

let hereLog= (...args) => {console.log("[kart_stuff]", ...args);};


const RACERS_LIST_FIELDNAME: string = "racers"
const DEFAULT_RACER_FIELDNAME: string = "default_racer"

export const KART_JSON= path.resolve(__dirname, "../data/kart.json")

type KSErrorName=   'KART_SETTINGS_ERROR'
                |   'KART_SETTINGS_NO_DEFAULT'
                |   'KART_SETTINGS_BAD_RACER'
                |   'KART_SETTINGS_BAD_FIELDPATH'

export class KSError extends Error{
    name: KSErrorName
    message: string
    stack?: string

    constructor( {name, message, stack}:
        {
            name?: KSErrorName,
            message: string,
            stack?: string
        }        
    ){
        super();
        this.name= name?? 'KART_SETTINGS_ERROR'
        this.message= message;
        this.stack= stack
    }
}


export class KartSettings{
    private data: Object
    private path_separator: string

    constructor(data?: Object){
        this.data= data
        this.path_separator= '.'

        this._checkData()
    }

    loadFromJSON(json_filepath?: string){
        this.data= my_utils.loadJSONFile(json_filepath ?? KART_JSON)

        this._checkData()
    }

    private _checkData(){
        if(Boolean(this.data)){
            KartSettings.CheckDataObjectValid(this.data)
        }
        else{
            this.data= {}
        }
    }

    private static CheckDataObjectValid(data: Object){
        var errList: string= ""

        var tmp: any= undefined
        var b: boolean= false

        if(!Boolean(data[DEFAULT_RACER_FIELDNAME])) errList+= `Missing or empty 'default_racer'; `
        if(b=((!Boolean(tmp=data['racers'])) || tmp.length<=0)) errList+= `Missing or empty 'racers' list; `

        if(b){
            for(var racer_name of Object.keys(data['racers'])){
                var racer_data: Object= data['racers'][racer_name] 

                if(!(Boolean(tmp=racer_data['api']) && Boolean(tmp.host) && Boolean(tmp.token_keys))){
                    errList+= `[racer: "${racer_name}"]: missing api data; `
                }
            }
        }

        if(errList.length>0){
            throw new KSError({message: errList})
        }
    }

    private _getRacerName(racer?: string) : string {
        var racer_name: string= racer ?? this.data[DEFAULT_RACER_FIELDNAME]

        if(!Boolean(racer_name))
            throw new KSError( { name: 'KART_SETTINGS_NO_DEFAULT', message: "Missing data ('default_racer')…"})

        return racer_name
    }
    get DefaultRacer() : string { return this._getRacerName(undefined); }
    get RacerNames() : string[] {
        let racers= this.data[RACERS_LIST_FIELDNAME]
        if (!Boolean(racers)) return []

        return Object.keys(racers)
    }

    getRacerData(racer?: string) : Object {
        var racer_name: string= this._getRacerName(racer)
        var racer_data: Object= this.data[racer_name]

        if(!Boolean(racer_data)){
            throw new KSError( {name: 'KART_SETTINGS_BAD_RACER', message: `No data found for racer '${racer_name}'`})
        }

        return racer_data
    }

    set PathSeparator(s: string) { this.path_separator= s}

    getAt(fieldPath: string | string[]): any {
        var r: any= my_utils.getFromFieldPath(this.data,fieldPath,this.path_separator)
        if((!Boolean(r)) && r!==''){
            throw new KSError( {name: 'KART_SETTINGS_BAD_FIELDPATH', message: `No data found at '${fieldPath}'`})
        }

        return r;
    }

    getRacerField(fieldpath: string | string[], racer?: string) : any {
        var racer_name: string= this._getRacerName(racer)

        var f_path : string[]= [RACERS_LIST_FIELDNAME,racer_name].concat(
            (Array.isArray(fieldpath))?
                fieldpath.filter(e => e.length>0)
            :   fieldpath.split(this.path_separator).filter(e => e.length>0)
        )

        return this.getAt(f_path)
    }
    grf= (fieldpath: string | string[], racer?: string): any => this.getRacerField(fieldpath, racer)
}


type ServiceOp= "restart" | "stop"
type KartTokenType= "ADMIN" | "DISCORD_USER"
interface KartTokenAuth{
    role: KartTokenType,
    id: string
}

const EP_SERVICE_NAME           =   "service"
const EP_INFO_NAME              =   "info"
const EP_SERVICE_OP_BASE        =   "service_"
const EP_SERVICE_RESTART_NAME   =   `${EP_SERVICE_OP_BASE}restart`
const EP_SERVICE_STOP_NAME      =   `${EP_SERVICE_OP_BASE}stop`
const EP_ADDONS_NAME            =   "addons"

export class KartApi{
    private apiCaller: CallApi
    private settings: KartSettings
    private tokens: TokensHandler

    constructor(kart_settings : KartSettings){
        this.settings= kart_settings
        this.apiCaller= new CallApi( kart_settings.grf('api.host'),
        {   port: kart_settings.grf('api.port'),
            api_root: kart_settings.grf('api.root') 
        })

        this.apiCaller.registerEndPoint(EP_SERVICE_NAME, "service/:karter")
        this.apiCaller.registerEndPoint(EP_SERVICE_RESTART_NAME, "service/restart/:karter")
        this.apiCaller.registerEndPoint(EP_SERVICE_STOP_NAME, "service/stop/:karter")
        this.apiCaller.registerEndPoint(EP_INFO_NAME, "info")
        this.apiCaller.registerEndPoint(EP_ADDONS_NAME, "addons/:karter/info")

        this.tokens= new TokensHandler()

        this.tokens.register( "ADMIN",
            {   key: TokenKey.create({
                    file: this.settings.grf('api.token_keys.adminSignkey')
                }),
                defaultOptions: { expiresIn: '1m', algorithm:  "RS256" },
            }
        )
        this.tokens.register( "DISCORD_USER",
            {   key: TokenKey.create({
                    file: this.settings.grf('api.token_keys.discorduserSignkey')
                }),
                defaultOptions: { expiresIn: '1m', algorithm:  "RS256" },
            }
        )
    }


    info(address?: string, port?: string | number)
        : Promise<AxiosResponse<any>>
    {
        var queries= {}
        if(Boolean(address)) queries['address']= address;
        let _port= Number(port)
        if(!isNaN(_port)) queries['port']= _port;

        return this.apiCaller.Call(EP_INFO_NAME,
                {   method: "get",
                    queries          })
    }

    service(karter?: string): Promise<AxiosResponse<any>>{
        var _karter= karter ?? this.settings.DefaultRacer

        return this.apiCaller.Call(EP_SERVICE_NAME,
            {   method: "get",
                values: { karter: _karter }  })
    }

    service_op(op: ServiceOp, auth: KartTokenAuth, karter?: string) 
        : Promise<AxiosResponse<any>>
    {
        var _karter= karter ?? this.settings.DefaultRacer

        let token= this.tokens.generateToken(auth.role, {auth})

        return this.apiCaller.Call(`${EP_SERVICE_OP_BASE}${op}`,
            {   method: "get",
                values: { karter: _karter},
                axiosRequestConfig: {
                    headers: {'x-access-token': token}
                }
            }
        )
    }
    service_restart= (auth: KartTokenAuth, karter?: string) => this.service_op(
        "restart", auth, karter
    )
    service_stop= (auth: KartTokenAuth, karter?: string) => this.service_op(
        "stop", auth, karter
    )

    get_addons(addon?: string, karter?: string){
        var _karter= karter ?? this.settings.DefaultRacer

        var queries= {}
        if(Boolean(addon)) queries= { addon }

        return this.apiCaller.Call(EP_ADDONS_NAME,
            {   method: "get",
                values: { karter: _karter },
                queries
            }
        )
    }
}

const ENTRY_ADDONS_NAMES_BASE_NAME  =   "_installed_addons"

const KARTAPICACHE_DEFAULT_TTL_MS   =   60000

class KartApiCache{
    private kart_settings : KartSettings
    private cache : Cacher

    constructor(kart_settings: KartSettings, kart_api: KartApi){
        this.kart_settings= kart_settings
        this.cache= new Cacher()

        for(var karter of this.kart_settings.RacerNames){
            let _kater= karter //else, in following promise we'd always work with last value of karter in loop
            this.cache.registerEntryAccess(`${_kater}${ENTRY_ADDONS_NAMES_BASE_NAME}`,
                async () : Promise<string[]> => {
                    hereLog(`[KartApiCache] registering '${_kater}${ENTRY_ADDONS_NAMES_BASE_NAME}'`)
                    var addons= []
                    try{
                        addons= await kart_api.get_addons(undefined, _kater).then( response => {
                            if(response.status===404) return []
                            else if( response.status!==200 || (!Boolean(response.data))){
                                throw new Error(`Bad result from /addons/${_kater} (1)…`)
                            }

                            let response_data= response.data

                            if(response_data.status==="not_found") return []
                            if( Boolean(response_data.result) && Boolean(response_data.result.infos) ){
                                if(response_data.status==="fetched"){
                                    return response_data.result.infos.map(
                                        (a : {name: string, [key:string]: any}) => a.name.toLowerCase()
                                    )
                                } else if(response_data.status==="found"){
                                    return [ response_data.result.infos.name.toLowerCase() ]
                                }
                                else{
                                    return []
                                }
                            }
                            else{
                                return []
                            }
                        })
                    } catch(err) {
                        hereLog(`[KartApiCache] addons names access… - ${err}`)
                        addons= []
                    }

                    return addons
                },
                []
            )
        }
    }

    async getInstalledAddonsNames(karter?: string, awaitRefresh: boolean= false) : Promise<string[]> {
        var _karter= karter ?? this.kart_settings.DefaultRacer
        let entryName= `${_karter}${ENTRY_ADDONS_NAMES_BASE_NAME}`

        return (await this.cache.getEntry<string[]>(entryName,
            { awaitRefresh, ttl: KARTAPICACHE_DEFAULT_TTL_MS }
        ).catch(err => {
            hereLog(`[kartApiCache]{${_karter}} can't get cached installed addons names - ${err}`)
            return []
        }))
    }
}

export class KartStuff{
    private settings : KartSettings
    private api : KartApi
    private cache : KartApiCache

    constructor(json_filepath?: string){
        this.settings= new KartSettings()
        this.settings.loadFromJSON(json_filepath)

        this.api= new KartApi(this.settings)
        
        this.cache= new KartApiCache(this.settings, this.api)
    }

    get Settings() : KartSettings { return this.settings }
    get Api() : KartApi { return this.api }
    get ApiCache() : KartApiCache { return this.cache }

}
