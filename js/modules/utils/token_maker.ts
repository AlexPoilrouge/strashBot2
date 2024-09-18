const fs= require('fs')
const path= require('path')

import jwt = require('jsonwebtoken')

let hereLog= (...args) => {console.log("[token_maker]", ...args);};


type TokenErrorName=    "UNKNOWN_SOURCE_PARAM" |
                        "UNREISTERED_TOKEN"

export class TokenError extends Error{
    name: TokenErrorName
    message: string
    stack?: string

    constructor( {name, message, stack}:
        {
            name?: TokenErrorName,
            message: string,
            stack?: string
        }        
    ){
        super();
        this.name= name?? 'UNKNOWN_SOURCE_PARAM'
        this.message= message;
        this.stack= stack
    }
}


interface SourceOfKey {
    file?: string, data?:string
}

export abstract class TokenKey{
    abstract get Key() : string;

    static create( info: SourceOfKey ) : TokenKey {
        if(info['file'])
            return new TokenKey_File(info.file)
        if(info['data'])
            return new TokenKey_Raw(info.data)

        throw new TokenError({
            name: "UNKNOWN_SOURCE_PARAM",
            message: "No recognized source for token creation"
        })
    }
}

class TokenKey_Raw extends TokenKey{
    private data: string

    constructor(key : string){
        super();
        this.data= key; 
    }

    get Key() : string {
        return this.data
    }
}

const MINUTE_IN_MS= 60000

class TokenKey_File extends TokenKey{
    private filePath: string
    private data: string= 'secret'

    private lastUpdated_timestamp: number= 0
    private static timeToLive : number = 5 * MINUTE_IN_MS    

    constructor(path : string){
        super();
        this.filePath= path
    }

    get Key() : string {
        let now= Date.now()

        if(now-this.lastUpdated_timestamp>TokenKey_File.timeToLive){
            this.lastUpdated_timestamp= now
            this.data= fs.readFileSync(path.resolve(this.filePath))
        }

        return this.data;
    }
}

class TokenMaker{
    static make(tokenKey : TokenKey | SourceOfKey,
                payload : string | Buffer | Object,
                options : jwt.SignOptions
    ) : string
    {
        var source: TokenKey= (tokenKey instanceof TokenKey)?
                tokenKey
            :   TokenKey.create(tokenKey)
        
        return jwt.sign(payload, source.Key, options)
    } 
}

export interface TokenEntry{
    key: TokenKey,
    defaultPayload? : string | Buffer | Object,
    defaultOptions?: jwt.SignOptions
}

export class TokensHandler{
    private entries: { [key: string]: TokenEntry } = {}

    register(name: string, tokenInfo: TokenEntry){
        this.entries[name]= tokenInfo;
    }

    unregister(name){
        delete this.entries[name];
    }

    generateToken(  name : string,
                    payload?: string | Buffer | Object,
                    options?: jwt.SignOptions   )
                : string
    {
        var entry: TokenEntry= this.entries[name];

        if(!entry){
            throw new TokenError({
                name: "UNREISTERED_TOKEN",
                message: `No token register under '${name}'`
            })
        }

        var _payload: string | Buffer | Object= payload ?? entry.defaultPayload ?? {}
        var _options: jwt.SignOptions= options ?? entry.defaultOptions

        return TokenMaker.make(
            entry.key,
            _payload,
            _options
        )
    }
}
