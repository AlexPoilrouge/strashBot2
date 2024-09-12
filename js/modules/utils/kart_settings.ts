
const my_utils= require('../../utils');

const path= require('path')


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
