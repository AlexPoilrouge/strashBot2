const axios= require('axios');
import { AxiosRequestConfig, AxiosResponse, Method } from "axios";
import { KSError } from "../kart/kart_stuff";

let hereLog= (...args) => {console.log("[api_call]", ...args);};

interface CApi_options {
    port?: number,
    api_root?: string
}

interface Endpoint_pointer {
    alias?: string,
    route?: string
}

interface EndPointConfig<D=any> {
    method?: Method,
    values?: Object,
    queries?: Object
    axiosRequestConfig?: AxiosRequestConfig<D>
}

type StatusCodeAction= (response: AxiosResponse<any>, ...args: any) => any | Promise<any>
type ErrorAction= (error: Error, ...args: any) => any | Promise<any>

type ErrorResponseHandleName=   'UNDEFINED_ERROR'
                            |   'NO_ACTION_DEFINED'
                            |   'NO_RESONSE_SET';

export class ErrorResponseHandle extends Error {
    name: ErrorResponseHandleName
    message: string
    stack?: string

    constructor( {name, message, stack}:
        {
            name?: ErrorResponseHandleName,
            message: string,
            stack?: string
        }        
    ){
        super();
        this.name= name?? 'UNDEFINED_ERROR'
        this.message= message;
        this.stack= stack
    }
}

export class ApiResponseHandle<T>{
    private response: AxiosResponse<T>

    private action: StatusCodeAction
    private error_action: ErrorAction

    constructor(response: AxiosResponse<T>){
        this.response= response;
    }

    get Response(): AxiosResponse<T> { return this.response; }

    onCode(returnCode: number | Array<number>, action: StatusCodeAction) : ApiResponseHandle<T> {
        var codes: Array<number>= (returnCode instanceof Array)? returnCode : [ returnCode ];

        if (codes.includes(this.response.status)){
            this.action= action
        }

        return this;
    }

    onSuccess= (action: StatusCodeAction) => this.onCode(200, action);

    fallBack(action: StatusCodeAction) : ApiResponseHandle<T>{
        if(!this.action){
            this.action= action
        }

        return this;
    }

    catch(action: ErrorAction) : ApiResponseHandle<T> {
        this.error_action= action

        return this;
    }

    private static async run_action(action: StatusCodeAction, response: AxiosResponse<any>, ...args: any) : Promise<any>{
        var result= action(response, args);
        if(result instanceof Promise){
            return await result;
        }
        return result
    }

    private static async run_catch(action: ErrorAction, error: Error, ...args: any) : Promise<any>{
        var result= action(error, args);
        if(result instanceof Promise){
            return await result;
        }
        return result
    }

    async Parse() : Promise<any>{
        try{
            if(!this.response){
                throw new ErrorResponseHandle({name: 'NO_RESONSE_SET', message: 'null or undefined response for this handle'})
            }

            var code: number= this.response.status;

            if(!this.action){
                var error: ErrorResponseHandle= new ErrorResponseHandle({
                    name: 'NO_ACTION_DEFINED',
                    message: `No action could match code '${code}', nor any fallback found.`
                })

                if(this.error_action){
                    return await ApiResponseHandle.run_catch(this.error_action, error);
                }
                else{
                    throw error;
                }
            }

            return await ApiResponseHandle.run_action(this.action, this.response);
        } catch(e){
            if(e instanceof ErrorResponseHandle) throw e;
            else if(this.error_action){
                return await ApiResponseHandle.run_catch(this.error_action, e)
            }
            else throw e;
        }
    }
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

    fetchEndpoint(endpoint: Endpoint_pointer) : Endpoint_pointer[] {
        var tmp: any= undefined
        if(endpoint.alias && endpoint.route
            && this.AliasEnpoint[endpoint.alias]===endpoint.route
        ){
            return [Object.assign({},endpoint)];
        }
        else if(endpoint.alias && (tmp=this.AliasEnpoint[endpoint.alias])){
            return [{alias: endpoint.alias, route: tmp}]
        }
        else if(endpoint.route){
            return Object.keys(this.AliasEnpoint)
                    .filter(k => this.AliasEnpoint[k]===endpoint.route) //all aliases
                    .map(a => ({alias: a, route: endpoint.route}))      //into Endpoint_pointer list
        }

        return []
    }

    unregisterEndPoint(endpoint: Endpoint_pointer | Endpoint_pointer[]) : boolean {
        if(!endpoint) return false

        var t_ep: Endpoint_pointer[]= (Array.isArray(endpoint))? endpoint : [ endpoint ]
        var count= this.AliasEnpoint.length
        for(var ep of t_ep){
            var fetched_removableEndpoints= this.fetchEndpoint(ep)

            for(var f_ep of fetched_removableEndpoints){
                if(f_ep.alias) delete this.AliasEnpoint[f_ep.alias];
            }
        }

        return count!==this.AliasEnpoint.length
    }

    async Call<D= any, T = any>(alias_or_route: string, config?: EndPointConfig<D>): Promise<ApiResponseHandle<T>>{
        var url: string= this._endPointURL(
            this.AliasEnpoint[alias_or_route] ?? alias_or_route,
            config
        )
        let method: Method= config.method ?? 'get'

        // hereLog(`[Call]{${alias_or_route},<${method}> ${JSON.stringify(config)}} -> ${url}`)
        let callConfig: AxiosRequestConfig<D>= Object.assign({}, config.axiosRequestConfig, {url, method} )

        var result: AxiosResponse<T>
        try{
            result= await axios(callConfig)
        }
        catch(err){
            if(err.response && err.response.status){
                result= err.response
            }
            else throw err;
        }
        
        return new ApiResponseHandle(result)
    }

}