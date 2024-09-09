const axios= require('axios');
import { AxiosRequestConfig, AxiosResponse } from "axios";

let hereLog= (...args) => {console.log("[api_call]", ...args);};

interface CApi_options {
    port?: number,
    api_root?: string
}

interface Endoint_pointer {
    alias?: string,
    route?: string
}

export type Method= 'get' | 'post' | 'put' | 'delete'

interface EndPointConfig {
    method?: Method,
    values?: Object,
    queries?: Object
    axiosRequestConfig?: AxiosRequestConfig<any>
}

export class CallApi {
    private address: string
    private api_root: string = ''
    private port?: number

    private AliasEnpoint : {[key: string]: string} = {}

    constructor(address: string, options?: CApi_options){
        this.address= address
        if(options){
            this.api_root= options.api_root ?? ''
            this.port= options.port
        }
    }

    get Address(): string { return this.address;}
    get Port(): number | undefined {return this.port;}
    get Root(): string {return this.api_root}

    private _baseUrl() : string {
        return  `${this.address}${this.port?`:${this.port}`:''}/${this.api_root}`
    }

    private _formatRoute(route: string, values?: Object) : string {
        var split_route : string[] = route.split('/');
        var final_route : string = ''
        for(var elem of split_route){
            final_route+= '/'
            if(!elem.startsWith(':')){
                final_route+= `${elem}`
            }
            else if(values){
                var value_name: string = elem.slice(1)
                final_route+= `${values[value_name]??''}`
            }
        }

        return final_route
    }

    private _endPointURL(route: string, config?: EndPointConfig) : string {
        if(!config) return route

        var url: string= `${this._baseUrl()}${this._formatRoute(route, config.values)}`

        var once: boolean= false
        if(config.queries){
            for(var param in config.queries){
                url+= (once?'&':'?')
                once= true
                url+= `${param}=${config.queries[param]??''}`
            }
        }

        return url
    }

    registerEndPoint(alias: string, route: string){
        this.AliasEnpoint[alias]= route
    }

    unregisterEndPoint(endpoint: Endoint_pointer | Endoint_pointer[]) : boolean {
        if(!endpoint) return false

        var t_ep: Endoint_pointer[]= (Array.isArray(endpoint))? endpoint : [ endpoint ]
        var count= this.AliasEnpoint.length
        for(var ep of t_ep){
            if(ep.alias && ep.route){
                if(this.AliasEnpoint[ep.alias]===ep.route) delete this.AliasEnpoint[ep.alias]
            }
            else if(ep.alias){
                delete this.AliasEnpoint[ep.alias]
            }
            else if(ep.route){
                let removable_aliases: string[]= Object.keys(this.AliasEnpoint)
                        .filter(k => this.AliasEnpoint[k]===ep.route)
                for(var a of removable_aliases){
                    delete this.AliasEnpoint[a]
                }
            }
        }

        return count!==this.AliasEnpoint.length
    }

    Call<T = any, R = AxiosResponse<T>>(alias_or_route: string, config?: EndPointConfig): Promise<R>{
        var url: string= this._endPointURL(
            this.AliasEnpoint[alias_or_route] ?? alias_or_route,
            config? config.values: undefined
        )

        let method: Method= config.method ?? 'get'

        return axios[method](url, config.axiosRequestConfig)
    }

}