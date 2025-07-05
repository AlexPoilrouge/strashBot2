

let hereLog= (...args) => {console.log("[cacher]", ...args);};


interface CacheEntry<T>{
    access_function: (...args: any) => T | Promise<T>,
    ttl: number
    refreshDate?: number,
    refreshing: boolean
    lastValue?: T
}

export interface AccessEntryOptions{
    ttl?: number,
    awaitRefresh: boolean
}

type CacherErrorName=   'CACHE_ENTRY_UNREGISTERED'

export class CacherError extends Error{
    name: CacherErrorName
    message: string
    stack?: string

    constructor( {name, message, stack}:
        {
            name?: CacherErrorName,
            message: string,
            stack?: string
        }        
    ){
        super();
        this.name= name
        this.message= message;
        this.stack= stack
    }
}

export class Cacher{
    private entries : {[key: string]: CacheEntry<any>} = {}

    registerEntryAccess<T>(name: string, accessFunc: (...args: any) => T | Promise<T>, defaultValue?: T){
        this.entries[name]= {
            access_function: accessFunc,
            ttl: 0,
            lastValue: defaultValue,
            refreshing: false
        }
    }

    registered(name: string) : boolean {
        return Boolean(this.entries[name])
    }

    available(name: string) : boolean {
        return this.registered(name) && this.entries[name].lastValue!==undefined
    }

    async getEntry<T>(name: string, options: AccessEntryOptions, ...args : any): Promise<T> {
        if(!this.registered(name)){
            throw new CacherError( {
                name: 'CACHE_ENTRY_UNREGISTERED',
                message: `No entry '${name}' registered …`
            } )
        }
        
        let entry : CacheEntry<T>= this.entries[name]

        if(entry.ttl>0 || !entry.refreshDate){
            let ellapsed : number = Date.now() - (entry.refreshDate ?? 0)
            if(entry.ttl<=ellapsed){
                if(!entry.refreshing){ //mecanism to not repeat access milliseconds appart…
                    let promise : Promise<T> = new Promise( (resolve, reject) => {
                        entry.refreshDate= Date.now()
                        entry.refreshing= true
                        var result= entry.access_function(...args)
                        if(result instanceof Promise){
                            result.then( res => resolve(res))
                                .catch(err => reject(err))
                        }
                        else{
                            resolve(result)
                        }
                    })

                    let res_promise=promise.then(result => {
                            entry.lastValue= result
                            if(options.ttl!==undefined) entry.ttl= options.ttl
                            entry.refreshDate= Date.now()
                            entry.refreshing= false
                        }).catch(err => {
                            hereLog(`[getEntry] error refreshing entry '${name}' - ${err}`)
                            if(options.ttl!==undefined) entry.ttl= options.ttl
                            entry.refreshDate= Date.now()
                            entry.refreshing= false
                        })

                    if(options.awaitRefresh){
                        await res_promise
                    }
                }
                else{
                    entry.refreshing= false
                }
            }
        }

        return entry.lastValue;
    }
}