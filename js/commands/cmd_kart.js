
const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;
const splitString= require('../utils').splitString;

const KartServerInfo= require('./kart/serve_info').ServerInfo_Promise;

const child_process= require("child_process");
const fs= require( 'fs' );
const path= require( 'path' );
const request = require('request');

const fetch = require('node-fetch');

const my_utils= require('../utils.js')

const os = require('os');
const ifaces = os.networkInterfaces();

const cron= require('node-cron');

const {Attachment} = require('discord.js');

const axios= require('axios');

const jwt= require("jsonwebtoken");


let hereLog= (...args) => {console.log("[cmd_kart]", ...args);};

var kart_settings= undefined;


let E_RetCode= my_utils.Enums.CmdRetCode


const KART_DEFAULT_SERV_PORT= 5029

const KARTING_LEVEL={
    NONE:               0b000,
    KART_CHANNEL:       0b001,
    KARTER:             0b010,
    KART_ADMIN:         0b100,
}



function _getKartingLevel(message, utils){
    var result= KARTING_LEVEL.NONE;
    
    var k_chan= utils.settings.get(message.guild, 'kart_channel')
    if(Boolean(k_chan) && message.channel.id===k_chan){
        result= result | KARTING_LEVEL.KART_CHANNEL
    }

    var k_role= utils.settings.get(message.guild, 'kart_role')
    if(Boolean(k_role) && message.member.roles.cache.get(k_role)){
        result= result | KARTING_LEVEL.KARTER
    }

    k_role= utils.settings.get(message.guild, 'kart_admin_role')
    if(Boolean(k_role) && message.member.roles.cache.get(k_role)){
        result= result | KARTING_LEVEL.KART_ADMIN
    }

    return result
}

function _kartingClearanceCheck(message, utils, kart_cmd=undefined, clearanceLvl=undefined, requiredLvl=KARTING_LEVEL.KART_ADMIN){
    if((!(_getKartingLevel(message, utils) & requiredLvl)) && (clearanceLvl===undefined || clearanceLvl<CLEARANCE_LEVEL.ADMIN_ROLE)){
        message.member.send(`[kart command] You don't have the clearance for `+
            `${(Boolean(kart_cmd))? `\`!kart ${kart_cmd}\`` : " that"}…`
        );
        return false;
    }
    return true
}



function __loadingJSONObj(fileName){
    var fn= path.resolve(__dirname,fileName)
    if(fs.existsSync(fn)){
        var data= fs.readFileSync(fn);

        var r= undefined;
        if(Boolean(data) && Boolean(r=JSON.parse(data))){
            return r;
        }
        else{
            hereLog(`[Settings] Error reading data from '${fileName}'`);
            return undefined;
        }
    }
    else{
        return undefined;
    }
}

function __kartCmd(command){
    var ks= undefined, srv_cmd= undefined;
    return (Boolean(ks=kart_settings) && Boolean(command))?
                (Boolean(srv_cmd=ks.server_commands) && srv_cmd.through_ssh)?
                    Boolean(srv_cmd.server_ip) && Boolean(srv_cmd.distant_user)?
                        (`ssh ${srv_cmd.distant_user}@${srv_cmd.server_ip}`+
                            ((srv_cmd.server_port)?` -p ${srv_cmd.server_port}`:'')
                            + ` ${command}`
                        )
                    :       "false"
                :   command
            :   "false";
}

function __clearScores(user=undefined){
    if(Boolean(kart_settings.config_commands.clear_score)){
        var cmd= __kartCmd(kart_settings.config_commands.clear_score)
        try{
            str=child_process.execSync(`${cmd}${(Boolean(user))?` ${user.id}`:''}`, {timeout: 16000}).toString();
        }
        catch(err){
            hereLog("[auto stop] error while clearing scores on autoStop: "+err.message);
            return false;
        }

        return (Boolean(str) && Boolean(str.match(/^(.*)SCORES?_CLEARED$/)))
    }
    else{
        return false;
    }
}

function _stopServer(force=false){
    var str=undefined
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.stop))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.stop)
        str=child_process.execSync(cmd+`${(force)?" FORCE":""}`, {timeout: 32000}).toString();
    }
    catch(err){
        hereLog("Error while stopping server: "+err);
        return "error";
    }
    
    return (Boolean(str))?str:"ok";
}

function _startServer(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.start))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.start)
        child_process.execSync(cmd, {timeout: 32000});
        b= true;
    }
    catch(err){
        hereLog("Error while launching server: "+err);
        b= false;
    }
    return b;
}

function _restartServer(force=false){
    str=undefined;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.restart))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.restart)
        str= child_process.execSync(cmd+`${(force)?" FORCE":""}`, {timeout: 32000}).toString();
    }
    catch(err){
        hereLog("Error while restarting server: "+err);
        return "error"
    }

    return (Boolean(str))?str:"ok";
}

function _isServerRunning(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.is_active))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.is_active)
        child_process.execSync(cmd, {timeout: 16000});
        b= true;
    }
    catch(err){
        hereLog("Evaluating if server active: "+err);
        b= false;
    }

    return b;
}

function _serverRunningStatus_API(){
    return new Promise( (resolve, reject) => {
        if (!Boolean(kart_settings)){
            hereLog(`[server status] bad config…`);
            reject("Bad info - couldn't access kart_settings…")
        }

        if(Boolean(kart_settings.api) && Boolean(kart_settings.api.host)){
            api_addr=`${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}${kart_settings.api.root}/service`
    
            axios.get(api_addr)
                .then(response => {
                    if( response.status===200 &&
                        Boolean(response.data) && Boolean(response.data.status)
                    ){
                        hereLog(`[server status] from ${kart_settings.api.root}/service: ${response.data.status.toUpperCase()}`)
                        resolve(response.data.status.toUpperCase());
                    }

                    resolve('UNAVAILABLE');
                }).catch(err => {
                    hereLog(`[server status] API ${api_addr} error - ${err}`)

                    resolve('UNAVAILABLE');
                });
        }
        else{
            hereLog(`[server status] bad api settings…`);
            reject("Bad api - no api set in settings…")
        }
    });
}

function _initAddonsConfig(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.init))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.init)
        child_process.execSync(cmd, {timeout: 32000});
        b= true;
    }
    catch(err){
        hereLog("Error while initializing addons: "+err);
        b= false;
    }
    return b;
}

function _updateAddonsConfig(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.update))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.update)
        child_process.execSync(cmd, {timeout: 32000});
        b= true;
    }
    catch(err){
        hereLog("Error while updating addons: "+err);
        b= false;
    }
    return b;
}

function _listAddonsConfig(arg=""){
    var str= undefined;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.list))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.list)
        str= child_process.execSync(cmd+((Boolean(arg))?` ${arg}`:""), {timeout: 16000}).toString();
    }
    catch(err){
        if(Boolean(err.status) && err.status===3){
            str="No result found…";
        }
        else{
            hereLog("Error while listing addons: "+err);
            str= undefined;
        }
    }
    return str;    
}

function _removeAddonsConfig(arg){
    var str= undefined;
    var r=false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.remove))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.remove)
        str= child_process.execSync(cmd+` ${arg}`, {timeout: 32000}).toString();
        r=true;
    }
    catch(err){
        hereLog("Error while removing addons: "+err);
    }
    return [r,str]; 
}

function _getPassword(){
    b= false;
    stdout= undefined;
    try{
        // stdout=child_process.execSync("cat ${HOME}/.TMP_PASS", {timeout: 4000}).toString().replace('\n','');
        var cmd= __kartCmd("cat ${HOME}/.TMP_PASS");
        stdout=child_process.execSync(cmd,{timeout: 16000}).toString().replace('\n','');
        b= true;
    }
    catch(err){
        hereLog("Accessing srb2k server password: "+err);
        b= false;
    }

    if(!Boolean(stdout) || !b){
        return "password not found";
    }

    return stdout;
};



var l_guilds= [];



function _autoStopServer(utils){
    if(_isServerRunning()){
        __clearScores()

        hereLog("[auto stop] stopping server…");
        _stopServer(true);
        
        l_guilds.forEach( (g) =>{
            utils.settings.set(g, "auto_stop", true);
        });
    }
    else{
        hereLog("[auto stop] server already stopped…"); 
        l_guilds.forEach( (g) =>{
            utils.settings.set(guild, "auto_stop", false);
        });
    }
}

function _autoStartServer(utils){
    var didAutoStop= l_guilds.some( (g) => {
        return Boolean(utils.settings.get(g, "auto_stop"))
    });
    var serv_run= _isServerRunning();
    if(!serv_run && didAutoStop){
        hereLog("[auto start] restarting server…");
        _startServer();
    }

    l_guilds.forEach( (g) =>{
        utils.settings.set(g, "auto_stop", false);
    });

}

var _oldServInfos= undefined;

function _checkServerStatus(utils){
    var bot= utils.getBotClient();

    _askServInfos().then(servInfo =>{
        hereLog("_checkServerStatus")

        if((!Boolean(servInfo.service_status)) || (servInfo.service_status!=='UP')){
            hereLog(`SRB2Kart server service status is '${servInfo.service_status}'`);
            bot.user.setActivity('');
        
            _oldServInfos= undefined;
        }
        else{
            if(!(Boolean(servInfo) && Boolean(servInfo.server) && servInfo.server.numberofplayer!==undefined)){
                throw "Fetched bad servinfo";
            }

            if( ( !Boolean(_oldServInfos) || !Boolean(_oldServInfos.server)) ||
                ( servInfo.server.numberofplayer !== _oldServInfos.server.numberofplayer )
            ){
                if(servInfo.server.numberofplayer>1){
                    hereLog(`Changes in srb2kart server status detected… (player count: ${servInfo.server.numberofplayer})`);
                    bot.user.setActivity('Hosting SRB2Kart Races', { type: 'PLAYING' });
                }
                else{
                    hereLog(`Changes in srb2kart server status detected… (not enough player though)`);
                    bot.user.setActivity('');
                }

                _oldServInfos= servInfo;
            }
        }
    }).catch(err =>{
        bot.user.setActivity('');

        _oldServInfos= undefined;
        hereLog(`Error while checking status of SRB2Kart server… - ${err}`);
    })
}

var stop_job= undefined;
var start_job= undefined;
var status_job= undefined;

function cmd_init(utils){
    if(!Boolean(kart_settings=__loadingJSONObj("data/kart.json"))){
        hereLog("Not able to load 'kart.json' setting…");
    }
    _initAddonsConfig();

    if(!Boolean(stop_job)){
        stop_job= cron.schedule('0 4 * * *', () =>{
            hereLog("[schedule] 4 am: looking to stop srb2kart serv…");
            _autoStopServer(utils);
        });
    }

    if(!Boolean(start_job)){
        start_job= cron.schedule('0 8 * * *', () =>{
            hereLog("[schedule] 8 am: looking to start srb2kart serv…");
            _autoStartServer(utils)
        });
    }

    if(!Boolean(status_job)){
        status_job= cron.schedule('*/10 * * * *', () =>{
            _checkServerStatus(utils)
        });
    }
}


async function cmd_init_per_guild(utils, guild){
}

async function url_availabe(url){
    return new Promise((resolve)=>{
        fetch(url, {method: 'HEAD'}).then(()=>{resolve(true)}).catch(()=>{resolve(false)})
    })
}

async function __downloading(channel, url, destDir, utils, fileName=undefined){
    var filename= (!Boolean(fileName))? url.split('/').splice(-1)[0] : fileName;


    var retries= 16
    while(retries>0 && !(await url_availabe(url))){
        --retries;
        await my_utils.sleep()
    }
    if (retries<=0){
        channel.send(`❌ L'url \`${url}\` ne semble pas exister…`);
        return
    }

    var pct= 0;
    var dl_msg= await channel.send(
        `Downloading \`${filename}\` on server …\t[${pct} %]`
    );

    let _error= (msg='') => {
        if (Boolean(dl_msg)){
            dl_msg.edit(`Downloading \`${filename}\` on server …\t[ERROR!]`+
                ((Boolean(msg))?`\n\t(${msg})`:'')
            );

            dl_msg.react('❌');
        }
    }

    if(Boolean(dl_msg)){
        let filepath= destDir+'/'+filename;
        const file = fs.createWriteStream(filepath);
        var receivedBytes = 0;
        var totalBytes= 0;

        var t= Date.now();

        let exe_p= ( async () => { return new Promise( (resolve,reject) =>{
            request.get(url)
                .on('response', (response) => {
                    if (response.statusCode !== 200) {
                        _error('Response status was ' + response.statusCode);
                    }

                    totalBytes= response.headers['content-length'];
                })
                .on('data', (chunk) => {
                    receivedBytes += chunk.length;

                    if (Boolean(dl_msg) && (Date.now()-t>=2000)){
                        dl_msg.edit(`Downloading \`${filename}\` on server …\t[${(receivedBytes/totalBytes)*100} %]`);
                        t= Date.now();
                    }
                })
                .pipe(file)
                .on('error', (err) => {
                    fs.unlink(filepath, err => {
                        hereLog(`[file dl error] ${err}`)
                    });
                    _error();

                    reject(false);
                });

            file.on('finish', () => {
                file.close();

                if (Boolean(dl_msg)){
                    dl_msg.edit(`Downloading \`${filename}\` on server …\t[Done!]`);

                    dl_msg.react('✅');
                }

                resolve(true)
            });
        
            file.on('error', (err) => {
                fs.unlink(filepath, err => {
                    hereLog(`[file dl error] ${err}`)
                });
                _error(err.message);
                reject(false);
            });
        }); })

        return (await exe_p())
    }

    return false;
}

async function __ssh_download_cmd(cmd, channel, url, utils, fileName=undefined){
    hereLog(`[ssh dl] cmd: ${cmd} - url: ${url}`)
    var filename= (!Boolean(fileName))? url.split('/').splice(-1)[0] : fileName;

    
    var retries= 16
    while(retries>0 && !(await url_availabe(url))){
        --retries;
        await my_utils.sleep()
    }
    if (retries<=0){
        channel.send(`❌ L'url \`${url}\` ne semble pas exister…`);
        return
    }
    var addr=undefined, dUser=undefined;
    if(!Boolean(addr=kart_settings.server_commands.server_ip) || !Boolean(dUser=kart_settings.server_commands.distant_user)){
        hereLog("[ssh dl] missing distant user or addr info…")
        channel.send(`❌ Internal error…`);
        return
    }

    var pct= '\t0';
    var dl_msg= await channel.send(
        `Downloading \`${filename}\` on server …\t[${pct} %]`
    );

    let _error= (msg='') => {
        if (Boolean(dl_msg)){
            dl_msg.edit(`Downloading \`${filename}\` on server …\t[ERROR!]`+
                ((Boolean(msg))?`\n\t(${msg})`:'')
            );

            dl_msg.react('❌');
        }
    }


    if(Boolean(dl_msg)){
        let exe_p= ( async () => { return new Promise( (resolve,reject) =>{
            let ssh_cmd= `ssh ${dUser}@${addr}`+
                ( (Boolean(kart_settings.server_commands.server_port))?
                    ` -p ${kart_settings.server_commands.server_port}`
                    : ``
                ) +
                ` ${cmd} ${url} ${Boolean(fileName)?fileName:''}`;
            var cmd_process= child_process.exec(ssh_cmd, {timeout:120000});

            var t= Date.now();

            cmd_process.stdout.on('data', function (data) {
                var lines= data.split('\n');
                var res=""
                if(lines.length>0){
                    res= lines[lines.length-1];
                }
                if(Boolean(res)){
                    pct=res

                    if (Boolean(dl_msg) && (Date.now()-t>=1000)){
                        dl_msg.edit(`Downloading \`${filename}\` on server …\t[${pct}]`);
                        t= Date.now();
                    }
                }
            });

            cmd_process.stderr.on('data', function (data) {
                hereLog(`[file dl error] ${data}`)
            });

            cmd_process.on('error', function (err){
                hereLog(`[file dl process error] ${err}`);

                _error();

                reject(false)
            });

            cmd_process.on('close', function (code) {
                if(code!==0){
                    hereLog(`[ssh dl] returned ${code}`);
                    _error();
                }
                else{
                    if (Boolean(dl_msg)){
                        dl_msg.edit(`Downloading \`${filename}\` on server …\t[Done!]`);

                        dl_msg.react('✅');
                    }

                    resolve(true);
                }
            });
        }) });

        return await exe_p();
    }

    return false;
}

async function _cmd_addons(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    if(["try","add","get","new"].includes(args[0])){
        // if(!_kartingClearanceCheck(message, utils, `${sub_cmd} ${args[0]}`, clearanceLvl)) return false
        let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, ["addon","add-rm"])
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f, false)
        if(!my_utils.AuthAllowed_dataOnly(missingAuth_f)){
            return auth_retCode
        }

        let _serv_run= _isServerRunning();
        var perma= false;
        var url_rgx= /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/;
        var url= undefined;
        if(Boolean(args[1])){
            if(["keep","dl","perma","fixed","final"].includes(args[1])){
                perma= true;
                args= args.slice(1);
            }
            else if(!args[1].match(url_rgx)){
                message.reply(`'${args[1]}' is not a recognized instruction or url…`);

                return E_RetCode.ERROR_INPUT;
            }
        }

        if(Boolean(args[1]) && args[1].match(url_rgx)){
            url= args[1]            
        }
        else if(Boolean(message.attachments) && message.attachments.size>=1){
            url= message.attachments.first().url;
        }

        if(!Boolean(url)){
            message.reply(`\`!kart ${sub_cmd} ${args[0]}\` needs a joined file or a url…`)
            return E_RetCode.ERROR_INPUT
        }

        var filename= url.split('/').slice(-1)[0]

        let ext= [".pk3",".wad",".lua",".kart",".pk7"];
        var _ls="";
        if((_ls=_listAddonsConfig(url.split('/').splice(-1)[0]))!=="No result found…"){
            message.reply(`The following addons already exist on server:\n${_ls}`);

            return E_RetCode.ERROR_REFUSAL;
        }
        else if(!Boolean(url) || !ext.some(e => {return url.endsWith(e)})){
            message.reply(`Seuls les fichiers addons d'extension \`${ext}\` sont acceptés…`)

            return E_RetCode.ERROR_REFUSAL;
        }
        else if (!Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ||
            (!_serv_run && !Boolean(kart_settings.dirs.dl_dirs.permanent)) ||
            !Boolean(kart_settings.dirs.dl_dirs.temporary)
        ){
            hereLog("[addons add] no dest directory for addon dl");
            message.reply(`❌ server internal error`);

            return E_RetCode.ERROR_INTERNAL;
        }
        else{
            // __downloading(message.channel, url, utils, perma)
            var destDir= (_serv_run)?
                kart_settings.dirs.dl_dirs.temporary :
                kart_settings.dirs.dl_dirs.permanent;
            
            var _b=false;
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                _b= (await __ssh_download_cmd(
                        kart_settings.config_commands.addon_url,
                        message.channel, url, utils
                    ) );
            }
            else{
                _b = (await __downloading(message.channel, url, destDir, utils) );
            }

            if(!_b || !_updateAddonsConfig()){
                message.reply(`❌ An error as occured, can't properly add \`${filename}\` to the server addons…`);

                return E_RetCode.ERROR_INTERNAL;
            }

            if(_serv_run){
                var str= `\`${filename}\` a bien été ajouté au serveur.\n`+
                    `Cependant, il ne peut être utilisé pour une session déjà en cours`;
                message.reply(str+'.')         
            }
            else{
                message.reply(`\`${filename}\` a bien été ajouté et sera disponible prêt à l'emploi lors de la prochaine session.`);
            }

            return auth_retCode;
        }
    }
    else if(["rm","remove","del","delete","suppr"].includes(args[0])){
        // if(!_kartingClearanceCheck(message, utils, `${sub_cmd} ${args[0]}`, clearanceLvl)) return false
        let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, ["addon","add-rm"])
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f, false)
        if(!my_utils.AuthAllowed_dataOnly(missingAuth_f)){
            return auth_retCode
        }

        if(Boolean(args[1])){
            var resp= _removeAddonsConfig(args[1]);
            if(Boolean(resp) && resp[0] && Boolean(resp[1])){
                if(resp[1]==="SCHEDULED_FOR_REMOVAL\n"){
                    message.reply("Addons will be removed on server restart:\n\t"+args[1]);
                    return auth_retCode
                }
                else{
                    message.reply("Removed addons for srb2kart server:\n"+resp[1]);
                }
                if(_updateAddonsConfig()){
                    return auth_retCode;
                }
                else{
                    hereLog("[rm] Error occured when updating addons after 'rm' call")
                    return E_RetCode.ERROR_INTERNAL;
                }
            }
            else{
                hereLog("[rm] got bad resp: "+resp);
                message.reply(`❌ Unable to remove${(Boolean(resp[1]))?(`:\n*\t${resp[1]}*`):"…"}`);
                return E_RetCode.ERROR_INTERNAL;
            }
        }
    }
    else if(["list","ls","all","what","which"].includes(args[0]) || !Boolean(args[0])){
        let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, ["addon","ls"])
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f)
        if(!my_utils.AuthAllowed_noData(missingAuth_f)){
            return auth_retCode
        }
        
        var list= _listAddonsConfig((Boolean(args[1]))?args[1]:"");
        if(Boolean(list)){
            if(!Boolean(args[1]) && Boolean(kart_settings) && Boolean(kart_settings.http_url)){
                list+=`\n\nStrashbot addons download: ${kart_settings.http_url}/strashbot_addons.zip`
            }

            var resp= "Addons list for srb2kart server:\n"+list;
            var _many_resp= splitString(resp);
            if (_many_resp.length>1){
                for (var i=0; i<_many_resp.length; ++i){
                    await message.reply(`${_many_resp[i]}`);
                }
            }
            else{
                message.reply("Addons list for srb2kart server:\n"+list);
            }
            return auth_retCode;
        }
        else{
            return E_RetCode.ERROR_REFUSAL;
        }
    }
    else if(["dl","links","link","zip","archive"]){
        let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, ["addon","dl"])
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f)
        if(!my_utils.AuthAllowed_noData(missingAuth_f)){
            return auth_retCode
        }

        if(!Boolean(args[1]) && Boolean(kart_settings) && Boolean(kart_settings.http_url)){
            message.reply(`You can try downloading the SRB2Kart server's addons at: ${kart_settings.http_url}/strashbot_addons.zip`);
            return auth_retCode;
        }
        else{
            message.reply(`Addons direct download link unavailable, sorry… 😩`);
            return E_RetCode.ERROR_INTERNAL;
        }
    }

    return E_RetCode.ERROR_INPUT;
}

async function _cmd_config(cmdObj, clearanceLvl, utils){
    let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, "config")
    let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f, false)
    if(!my_utils.AuthAllowed_dataOnly(missingAuth_f)){
        return auth_retCode
    }

    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    if(args.length===0 || ["get","dl","download","check"].includes(args[0])){
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.get_config);
            str= child_process.execSync(cmd, {timeout: 32000}).toString();
        }
        catch(err){
            hereLog("Error while keeping addons: "+err);
            str= undefined
        }

        if(Boolean(str)){
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                if(Boolean(kart_settings.http_url)){
                    message.reply(`Srb2kart server's startup user config file: ${kart_settings.http_url}/${str}`);
                    return auth_retCode;
                }
                else{
                    message.reply("❌ Can't access srb2kart server's config file…")
                    return E_RetCode.ERROR_INTERNAL;
                }
            }
            else if(fs.existsSync(str)){
                message.reply({
                    content: "Srb2kart server's startup user config file:",
                    files: [{
                        attachment: `${str}`,
                        name: `startup.cfg`
                    }]
                });

                return auth_retCode;
            }
            else{
                message.reply("❌ Can't access server's config file…")
                return E_RetCode.ERROR_INTERNAL;
            }
        }
        else{
            message.reply("❌ Server internal error…")
            return E_RetCode.ERROR_INTERNAL;
        }
    }
    else if(["set","up","ul","upload","change"].includes(args[0])){
        if(!_kartingClearanceCheck(message, utils, `${sub_cmd} ${args[0]}`, clearanceLvl)) return false

        if(Boolean(message.attachments) && message.attachments.size>=1){
            var url= message.attachments.first().url;
            
            if ( !Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ){
                hereLog("[cfg upload] no dest directory for cfg dl");
                message.reply(`❌ server internal error`);
            }
            else if(url.endsWith('.cfg')){
                // await __uploading_cfg(message.channel,url);

                var _b= false;
                if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                    _b= await __ssh_download_cmd(
                        kart_settings.config_commands.add_config_url,
                        message.channel, url, utils
                    );
                }
                else{
                    _b= await __downloading(message.channel, url,
                        kart_settings.dirs.main_folder, utils, "new_startup.cfg"
                    );
                }

                if(!_b){
                    hereLog("[uploading cfg] command fail");
                    message.reply(`❌ internal error preventing .cfg upload…`);
                    
                    return E_RetCode.ERROR_INTERNAL;
                }

                var str= undefined
                try{
                    var cmd= __kartCmd(kart_settings.config_commands.change_config);
                    str= child_process.execSync(cmd+" new_startup.cfg", {timeout: 16000}).toString();
                }
                catch(err){
                    hereLog("Error while changing config: "+err);
                    str= undefined
                }

                if(Boolean(str)){
                    hereLog(`[change cfg] ret: ${str}`)
                    let payload= (str==="updated" && !kart_settings.server_commands.through_ssh)?
                        {
                            files: [{
                                attachment: `${str}`,
                                name: `startup.cfg.diff`
                            }]
                        } : {}
                    if(_isServerRunning()){
                        payload.content=
                            `\`startup.cfg\` a bien été mis à jour.\n`+
                            `Cependant, cela n'aura aucun effet pour la session déjà en cours\n` +
                            ( (kart_settings.server_commands.through_ssh)?
                                `\nDiff: ${kart_settings.http_url}/startup.cfg.diff`
                                : "Diff generated file"
                            )
                    }
                    else{
                        payload.content= 
                            (kart_settings.server_commands.through_ssh)?
                                    `\nDiff: ${kart_settings.http_url}/startup.cfg.diff`
                                :   "Diff generated file" 
                    }
                    message.reply(payload)
                }
                else{
                    message.reply(`❌ internal error while trying to update *startup.cfg*…`);
                }

                return auth_retCode;
            }
            else{
                message.reply("❌ only .cfg files…");
                return E_RetCode.ERROR_INPUT;
            }
        }
    }
    else if(["filter","forbidden","out","off","nope","bad","cfg","blacklist","cmd","deny","denies","denied"].includes(args[0])){
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.cfg_blacklist);
            str= child_process.execSync(cmd, {timeout: 16000}).toString();
        }
        catch(err){
            hereLog("Error while looking for cfg blacklist: "+err);
            str= undefined
        }

        if(Boolean(str)){
            message.reply(`Forbidden commands within *custom configuration startup script*:\n\t${str}`);
            return auth_retCode;
        }
        else{
            message.reply("❌ server internal error");
            return E_RetCode.ERROR_INTERNAL;
        }
    }

    return E_RetCode.ERROR_INPUT;
}

async function _cmd_addon_load(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    if(args.length===0 || ["get","dl","download","check"].includes(args[0])){
        let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, ["addon_load","get"])
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f)
        if(!my_utils.AuthAllowed_noData(missingAuth_f)){
            return auth_retCode
        }
        
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.get_addon_load_config);
            str= child_process.execSync(cmd, {timeout: 32000}).toString();
        }
        catch(err){
            hereLog("Error while looking for addons order file: "+err);
            str= undefined
        }

        if(Boolean(str)){
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                if(Boolean(kart_settings.http_url)){
                    message.reply(`Srb2kart server's addons load order config file: ${kart_settings.http_url}/${str}`);
                    return auth_retCode;
                }
                else{
                    message.reply("❌ Can't access srb2kart server's addons load order config file…")
                    return E_RetCode.ERROR_INTERNAL;
                }
            }
            else if(fs.existsSync(str)){
                message.reply(
                    {
                        content: "Srb2kart server's addons load order config file:",
                        files: [{
                            attachment: `${str}`,
                            name: `addon_load_order.txt`
                        }]
                    }
                );

                return auth_retCode;
            }
            else{
                message.reply("❌ Can't access server's addons load order config file…")
                return E_RetCode.ERROR_INTERNAL;
            }
        }
        else{
            message.reply("❌ Server internal error…")
            return E_RetCode.ERROR_INTERNAL;
        }
    }
    else if(["set","up","ul","upload","change"].includes(args[0])){
        // if(!_kartingClearanceCheck(message, utils, `${sub_cmd} ${args[0]}`, clearanceLvl)) return false
        let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, ["addon_load","set"])
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f, false)
        if(!my_utils.AuthAllowed_dataOnly(missingAuth_f)){
            return auth_retCode
        }

        if(Boolean(message.attachments) && message.attachments.size>=1){
            var url= message.attachments.first().url;
            
            if ( !Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ){
                hereLog("[upload] no dest directory for addon order config dl");
                message.reply(`❌ server internal error`);
            }
            else{
                // await __uploading_cfg(message.channel,url);

                var _b= false;
                if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                    _b= await __ssh_download_cmd(
                        kart_settings.config_commands.add_addon_order_config_url,
                        message.channel, url, utils
                    );
                }
                else{
                    _b= await __downloading(message.channel, url,
                        kart_settings.dirs.main_folder, utils, "new_addon_load_order.txt"
                    );
                }

                if(!_b){
                    hereLog("[uploading load order config] command fail");
                    message.reply(`❌ internal error preventing addon order config upload…`);
                    
                    return E_RetCode.ERROR_INTERNAL;
                }

                var str= undefined
                try{
                    var cmd= __kartCmd(kart_settings.config_commands.change_addon_order_config);
                    str= child_process.execSync(cmd+" new_addon_load_order.txt", {timeout: 16000}).toString();
                }
                catch(err){
                    hereLog("Error while changing addon order config: "+err);
                    str= undefined
                }

                if(Boolean(str)){
                    hereLog(`[change cfg] ret: ${str}`)
                    let payload= (str==="updated" && !kart_settings.server_commands.through_ssh)?
                        {
                            files: [{
                                attachment: `${str}`,
                                name: `addon_load_order.txt.diff`
                            }]
                        } : {}
                    if(_isServerRunning()){
                        payload.content=
                            `\`addon_load_order.txt\` a bien été mis à jour.\n`+
                            `Cependant, cela n'aura aucun effet pour la session déjà en cours\n` +
                            ( (kart_settings.server_commands.through_ssh)?
                                    `\nDiff: ${kart_settings.http_url}/addon_load_order.txt.diff`
                                :   "Diff generated file"
                            )
                    }
                    else{
                        payload.content=
                            ( (kart_settings.server_commands.through_ssh)?
                                    `\nDiff: ${kart_settings.http_url}/addon_load_order.txtdiff`
                                :   "Diff generated file"
                            )
                    }
                    message.reply(payload)
                }
                else{
                    message.reply(`❌ internal error while trying to update *addon_load_order.txt.cfg*…`);
                    return E_RetCode.ERROR_INTERNAL
                }

                return auth_retCode;
            }
        }
    }

    return E_RetCode.ERROR_INPUT;
}

async function ___stringFromID(guild, id){
    var member= undefined;
    try{
        member= await guild.members.fetch(id)
    }
    catch(err){
        hereLog(`[StringFromID] Error while searching member '${id}' in guild ${guild}…`);
        member= undefined
    }

    if(Boolean(member)){
        if(Boolean(member.nickname)){
            return member.nickname;
        }
        else{
            return member.user.username;
        }
    }
    else return "Unknown";
}

async function __replaceIDinString(guild, string){
    var ret= string
    var match= undefined;
    var id= undefined;
    var name= "unknown";
    if( Boolean(match=(string.match("([0-9]{18})"))) && match.length>1
            && Boolean(id=match[1]) && Boolean(name=(await ___stringFromID(guild, id))) )
    {
        ret=ret.split(id).join(`*${name}*`);
    }

    return ret;
}

// async function __uploading_lmp(channel,url,id){
//     if(!Boolean(kart_settings) || !Boolean(kart_settings.config_commands.add_times)){
//         channel.send(`❌ Internal error while trying to add lmp record…`);

//         return false
//     }

//     if (!urlExistSync(url)){
//         channel.send(`❌ L'url \`${url}\` ne semble pas exister…`);

//         return false
//     }

//     let filename= `${id}.lmp`
//     let filepath= kart_settings.dirs.main_folder+`/${filename}`;

//     var pct= 0;
//     var dl_msg= await channel.send(
//         `Downloading \`${filename}\` on server …\t[${pct} %]`
//     );

//     let _error= (msg='') => {
//         if (Boolean(dl_msg)){
//             dl_msg.edit(`Downloading \`${filename}\` on server …\t[ERROR!]`+
//                 ((Boolean(msg))?`\n\t(${msg})`:'')
//             );

//             dl_msg.react('❌');
//         }
//     }

//     if(Boolean(dl_msg)){
//         const file = fs.createWriteStream(filepath);
//         var receivedBytes = 0;
//         var totalBytes= 0;

//         var t= Date.now();

//         request.get(url)
//             .on('response', (response) => {
//                 if (response.statusCode !== 200) {
//                     _error('Response status was ' + response.statusCode);
//                 }

//                 totalBytes= response.headers['content-length'];
//             })
//             .on('data', (chunk) => {
//                 receivedBytes += chunk.length;

//                 if (Boolean(dl_msg) && (Date.now()-t>=2000)){
//                     dl_msg.edit(`Downloading \`${filename}\` on server …\t[${(receivedBytes/totalBytes)*100} %]`);
//                     t= Date.now();
//                 }
//             })
//             .pipe(file)
//             .on('error', (err) => {
//                 fs.unlink(filepath, err => {
//                     hereLog(`[file dl error] ${err}`)
//                 });
//                 _error();
//             });

//             file.on('finish', () => {
//                 file.close();

//                 if (Boolean(dl_msg)){
//                     dl_msg.edit(`Downloading \`${filename}\` on server …\t[Done!]`);

//                     dl_msg.react('✅');
//                 }

//                 var str= undefined
//                 try{
//                     var cmd= __kartCmd(kart_settings.config_commands.add_times);
//                     str= child_process.execSync(cmd+` ${filepath} ${id}`, {timeout: 4000}).toString();
//                 }
//                 catch(err){
//                     hereLog("Error while adding time: "+err);
//                     str= undefined
//                 }

//                 var _f_str= str
//                 if(Boolean(str) && ( ( (typeof(str)==='string') && str.startsWith("ADDED")) || (str=str.toString()).startsWith("ADDED") ) ){
//                     channel.send( _f_str );
//                 }
//                 else{
//                     channel.send(`❌ internal error while trying to add recorded time [${str}]`);
//                 }
//             });
        
//             file.on('error', (err) => {
//                 fs.unlink(filepath, err => {
//                     hereLog(`[file dl error] ${err}`)
//                 });
//                 _error(err.message);
//             });
//     }
// }

async function _cmd_timetrial(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    const _base_cmd= async (mapName=undefined)=>{
        var cmd= __kartCmd(kart_settings.config_commands.map_times);

        if(!Boolean(mapName)){
            var str= undefined
            try{
                str= child_process.execSync(cmd, {timeout: 32000}).toString();
            }
            catch(err){
                hereLog("Error while fetchin map times: "+err);
                str= undefined
            }

            if(!Boolean(str) || str.length===0){
                message.channel.send(`❌ no time data found…`);
                return true;
            }

            var lines= str.split('\n');
            var sendings= [];
            var msg="";
            for (var i=0; i< lines.length; ++i){
                var l= (await __replaceIDinString(message.guild, lines[i]))+'\n';
                if ((msg.length+l.length)>1995){
                    sendings.push(msg)
                    msg=l;
                }
                else{
                    msg+=l;
                }
            }

            for(var i=0; i<sendings.length; ++i){
                message.channel.send(sendings[i]);
            }
            if(msg.length>0) message.channel.send(msg);

            return true;
        }
        else{
            var str= undefined
            try{
                str= child_process.execSync(cmd+` ${mapName}`, {timeout: 32000}).toString();
            }
            catch(err){
                hereLog("Error while fetchin map times: "+err);
                str= undefined
            }

            if(!Boolean(str)){
                message.channel.send(`❌ no time data found…`);
                return false;
            }

            var msg= `On **${mapName}**:\n`;
            var lines= str.split('\n');
            
            const readMapTimes= async (lines) =>{
                var name="unknown"
                var time="59'59'99"
                var by= "unknown"
                var wth= "character"
                var stats= "unknown stats"
                var files= '0 files'

                var ret=""
                for(var i=0; i<lines.length; ++i){
                    //hereLog(`\t[base_cmd]i= ${i}`)
                    switch (i%9){
                    case 0:
                    {
                        //hereLog(`\t[base_cmd]case 0`)
                        name="unknown"
                        time="59'59'99"
                        by= "unknown"
                        wth= "character"
                        stats= "unknown stats"
                        files= '0 files'
                    }
                    break;
                    case 2:
                    {
                        name= await __replaceIDinString(message.guild, lines[i]);
                    }
                    break;
                    case 3:
                    {
                        time= lines[i]
                    }
                    break;
                    case 4:
                    {
                        by= lines[i]
                    }
                    break;
                    case 5:
                    {
                        wth= lines[i]
                    }
                    break;
                    case 6:
                    {
                        var s_w= lines[i].split(' ');
                        stats=`speed: ${s_w[0]}; weight: ${s_w[1]}`
                    }
                    break;
                    case 8:
                    {
                        var _r= undefined
                        var n_files= undefined
                        if(Boolean(_r=(lines[i].match(/^\[ ([0-9]*) \]+.*/))) && Boolean(n_files=parseInt(_r[1]))){
                            files= `${n_files} files: ${lines[i].substring(_r[1].length+4,200)+((lines[i].length>=100)?"…":"")}`
                        }

                        ret+= `\`${time}\` by ${by} (from ${name}) with ${wth} (${stats})\n`
                        ret+= `\t\t${files}\n`
                    }
                    }
                }

                ret=(ret.length>1900)?(ret.substring(0,1900)+"\n[…]"):ret;

                return ret;
            }

            msg+= (await readMapTimes(lines));

            if(Boolean(msg)){
                message.channel.send(msg);

                return true;
            }
        }

        return false;
    }

    if(args.length===0){
        return (await _base_cmd())
    }
    else if(["add","a","upload","ul","new","n","record","r"].includes(args[0])){
        if(Boolean(message.attachments) && message.attachments.size>=1){
            var url= message.attachments.first().url;
            
            if ( !Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ){
                hereLog("[lmp upload] no dest directory for lmp dl");
                message.channel.send(`❌ server internal error`);
            }
            else if(url.endsWith('.lmp')){
                // await __uploading_lmp(message.channel,url,message.author.id);
                var _b= false;
                if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                    _b= await __ssh_download_cmd(
                        kart_settings.config_commands.add_times_url,
                        message.channel, url, utils, `${message.author.id}.lmp`
                    );
                }
                else{
                    _b= await __downloading(message.channel, url,
                        kart_settings.dirs.main_folder, utils,
                        `${message.author.id}.lmp`
                    );
                }

                if(!_b){
                    hereLog("[uploading lmp] command fail");
                    message.channel.send(`❌ internal error preventing .lmp upload…`);
                    
                    return false;
                }

                let filepath= kart_settings.dirs.main_folder+`/${message.author.id}.lmp`;
                var str= undefined
                try{
                    var cmd= __kartCmd(kart_settings.config_commands.add_times);
                    str= child_process.execSync(cmd+` ${filepath} ${message.author.id}`, {timeout: 32000}).toString();
                }
                catch(err){
                    hereLog("Error while adding time: "+err);
                    str= undefined
                }

                var _f_str= str
                if(Boolean(str) && ( ( (typeof(str)==='string') && str.startsWith("ADDED")) || (str=str.toString()).startsWith("ADDED") ) ){
                    message.channel.send( _f_str );
                }
                else{
                    message.channel.send(`❌ internal error while trying to add recorded time [${str}]`);

                    return false;
                }

                return true;
            }
            else{
                message.channel.send("❌ only .lmp files…");
                return false;
            }
        }
        
    }
    else if(["get","download","dl","challenge"].includes(args[0])){
        if(args.length<=1){
            return false;
        }

        var mapname= args.slice(1).join(' ');
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.get_times);
            str= child_process.execSync(cmd+` ${mapname}`, {timeout: 32000}).toString();
        }
        catch(err){
            hereLog("Error while fetching time: "+err);
            str= undefined
        }

        if(!Boolean(str)){
            message.channel.send( "❌ couldn't find or access requested time record…"
                                +((Boolean(str))?` (${str})`:'') );

            return false;
        }

        match= str.match(/ZIPPED - (\/?((.+)\/)*.+)/)
        var path= undefined;
        if(Boolean(match) && Boolean(path=match[1])){
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                if(Boolean(kart_settings.http_url) ){
                    message.channel.send(`"Submitted time for **${mapname}**: ${kart_settings.http_url}/${path}`)
                    
                    return true;
                }
                else{
                    message.channel.send("❌ couldn't find or access requested time record on srb2kart server…");

                    return false;
                }
            }
            else if(Boolean(path=match[1]) && fs.existsSync(path)){
                message.channel.send(`"Submitted time for **${mapname}**:`,
                    {
                        files: [{
                            attachment: `${path}`
                        }]
                    }
                );

                return true;
            }
            else{
                message.channel.send("❌ couldn't find or access requested time record…");
    
                return false;
            }
        }
        else{
            message.channel.send("❌ couldn't find or access requested time record…");

            return false;
        }

    }
    else if(["remove","rm","delete","d"].includes(args[0])){
        if(args.length<=1){
            return false;
        }

        var mapname= args.slice(1).join(' ');
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.remove_times);
            str= child_process.execSync(cmd+` ${message.author.id} ${mapname}`, {timeout: 32000}).toString();
        }
        catch(err){
            hereLog("Error while removing time: "+err);
            str= undefined
        }

        if(!Boolean(str) || !Boolean(str.startsWith("RECORD_REMOVED"))){
            message.channel.send( "❌ couldn't find or remove designated time record…"
                                +((Boolean(str))?` (${str})`:'') );

            return false;
        }
        else{
            message.channel.send(`Your time record has been removed on map *“${mapname}”*`)
            return true;
        }


    }
    else{
        return (await _base_cmd(args.join(' ')));
    }

    return false;
}

async function _cmd_register(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    if(args[0]==='new'){
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.register);
            str= child_process.execSync(`${cmd} ${message.author.id}`, {timeout: 16000}).toString();
        }
        catch(err){
            hereLog(`[cmd_register][new] Error while registering user ${message.author}…\n\t${err}`);
            str= undefined
        }

        if(Boolean(str) && Boolean(["NEW_MEMBER","CHANGE_MEMBER"].find(e=>{return str.startsWith(e);}))){
            let _t= str.replace(/\n/g,'').split(' ')
            let token= _t[1]
            let welcome= _t[2].split(':')

            let dirPath= __dirname+`/data/${message.author.id}`;
            if(!fs.existsSync(dirPath)){
                fs.mkdirSync(dirPath,{recursive: true});
            }
            let welcomeFilePath= `${dirPath}/strashbot_welcome.cfg`
            let tokenFilePath= `${dirPath}/strashbot_token_${welcome[1]}.cfg`

            var b_success= true
            fs.writeFileSync(welcomeFilePath, `strashBot_welcome ${welcome[0]}`, (err)=>{
                if(err){
                    hereLog(`[cmd_register][new] couldn't write file '${welcomeFilePath}':\n\t${err.message}`)
                    b_success= false
                }
            })
            fs.writeFileSync(tokenFilePath, `strashBot_submitToken ${token}`, (err)=>{
                if(err){
                    hereLog(`[cmd_register][new] couldn't write file '${welcomeFilePath}':\n\t${err.message}`)
                    b_success= false
                }
            })
            if(b_success){
                let r= false
                try{
                    r= ( await ( new Promise( (resolve, reject) => { message.author.send(
                            `[${message.guild.name}] Enregisterment aupès du serveur SRB2Kart réussi!\n`+
                            `Téléchargez et placez ces 2 fichiers à la racine de votre dossier d'installation srb2kart.`,
                            {   files: [welcomeFilePath, tokenFilePath],
                                split: true
                            }
                        ).catch(err=>{
                            resolve(false);
                        }).finally(()=>{
                            fs.unlink(welcomeFilePath, (err)=>{
                                if(err){
                                    hereLog(`[cmd_register][new] error while getting rid of file ${welcomeFilePath}:\n\t${err.message}`)
                                }
                            })
                            fs.unlink(tokenFilePath, (err)=>{
                                if(err){
                                    hereLog(`[cmd_register][new] error while getting rid of file ${welcomeFilePath}:\n\t${err.message}`)
                                }
                            })
                            fs.rmdir(dirPath, {recursive: true}, (err)=>{
                                if(err){
                                    hereLog(`[cmd_register][new] error while getting rid of directory ${dirPath}:\n\t${err.message}`)
                                }
                            })
                            resolve(true);
                        })
                    } ) ) )
                } catch(err){
                    if(err){
                        hereLog(`[cmd_register][new]error during registeration of ${message.author}:\n\t${err.message}`)
                        r= false;
                    }
                }
                return r;
            }
            else{
                message.author.send(`[${message.guild.name}] command \`!${sub_cmd} new\` failed: internal error`)
                return false;
            }
        }
    }
    else{
        var r= (Boolean(message.mentions.roles) && Boolean(r=message.mentions.users.first()))?
                    r
                :   message.author;

        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.is_registered);
            str= child_process.execSync(`${cmd} ${r.id}`, {timeout: 16000}).toString();
        }
        catch(err){
            hereLog(`Error while registering user ${message.author}…\n\t${err}`);
            str= undefined
        }

        if(!Boolean(str)){
            message.channel.send("❌ Internal error…")
            return false
        }

        message.channel.send(
            (str.startsWith("REGISTERED"))?
                `✅ User ${r} is registered!`
            :   `❌ User ${r} not registered…`
        )

        return true;
    }
}

function _askServInfos(address=undefined, port=undefined){
    var a= address, p= port;
    var m= undefined;
    if(Boolean(a) && Boolean(m=a.match(/(.*)\:([0-9]+)$/))){
        a= m[1];
        p= m[2];
    }
    var p= (Boolean(port) && Boolean(port.match(/^[0-9]+$/)))? port : p;

    var query=""
    if(Boolean(a))
        query+= `address=${a}`
    if(Boolean(p))
        query+= `${Boolean(query)?'&':''}port=${p}`
    query= (Boolean(query)?`?`:'')+query

    return new Promise( (resolve, reject) => {
        if (!Boolean(kart_settings)){
            hereLog(`[askServInfos] bad config…`);
            reject("Bad info - couldn't access kart_settings…")
        }

        if(Boolean(kart_settings.api) && Boolean(kart_settings.api.host)){
            ( ( Boolean(p) || Boolean(a))?
                    new Promise( (res, rej) => {rej("SKIP");} )
                :   _serverRunningStatus_API()
            )
                .catch(e => {
                    if (e==="SKIP") return { status: "SKIP" }
                    return { status: 'UNAVAILABLE' }
                })
                .then( service_res => {
                    let api_info_addr=`${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}${kart_settings.api.root}/info${query}`

                    if (service_res==='DOWN') resolve( {service_status: 'DOWN'} );
                    else {
                        hereLog(`[askServInfo] Asking API ${api_info_addr}…`);
                        axios.get(api_info_addr)
                            .then(response => {
                                if(response.status!=200){
                                    hereLog(`[askServInfo] API ${api_info_addr} bad response`);
                                    reject("Bad API response")
                                }

                                response.data.service_status= service_res

                                resolve(response.data)
                            }).catch(err => {
                                hereLog(`[askServInfo] API ${api_info_addr} error - ${err}`)
                                reject(`Error API /info - ${err}`)
                            });
                    }
                } )
                .catch(err => {
                    hereLog(`[askServInfo] API ${api_service_addr} error - ${err}`)
                    reject(`Error API /service - ${err}`)
                })
        }
        else{
            hereLog(`[askServInfos] bad api settings…`);
            reject("Bad api - no api set in settings…")
        }
    })
}

function _getServMode(){
    if(!Boolean(kart_settings) || !Boolean(kart_settings.config_commands)
        || !Boolean(kart_settings.config_commands.serv_info)
    ){
        hereLog(`[getInfos] bad config…`);
        return undefined;
    }

    var str= undefined
    try{
        var cmd= __kartCmd(kart_settings.config_commands.serv_info);
        str= child_process.execSync(cmd, {timeout: 5000}).toString();
    }
    catch(err){
        hereLog("[getInfos] Error while looking for server infos: "+err);
        str= undefined
    }

    if(!Boolean(str)) return undefined

    var obj= undefined
    try{
        obj= JSON.parse(str)
    } catch(err){
        hereLog(`[setServMode] couldn't get server mode info:\n\t${err}`)
        obj= undefined
    }
    if(!Boolean(obj)) return undefined

    if(!Boolean(obj.modes)){
        hereLog(`[setServMode] No mode info recieved from \'${kart_settings.config_commands.serv_info}\'`)
        return undefined
    }
    var t= obj.modes.map(m => {
        var b= false
        var s= (b=m.startsWith('*'))?m.substr(1):m
        var c= b?'*':''
        switch(s){
            case "FRIEND":
                return `${c}FriendMod`
            case "SPBATK":
                return `${c}SPB Attack`
            case "ELIM":
                return `${c}Elimination`
            case "JUICEBOX":
                return `${c}JuiceBox`
            case "ACRO":
                return `${c}Acrobatics`
            case "HP":
                return `${c}HP`
            case "CRUEL":
                return `${c}Cruel`
            default:
                return `${c}${s}`
        }
    })

    return t
}

function __cmd_fetchJsonInfo(kcmd){
    if(!Boolean(kcmd)){
        hereLog(`[fetchInfos] bad cmd config…`);
        return undefined;
    }

    var str= undefined
    try{
        var cmd= __kartCmd(kcmd);
        str= child_process.execSync(`${cmd}`, {timeout: 32000}).toString();
    }
    catch(err){
        hereLog(`Error while fetching maps infos…\n\t${err}`);
        str= undefined
    }


    if(!Boolean(str)) return undefined

    var obj= undefined
    try{
        obj= JSON.parse(str)
    } catch(err){
        hereLog(`[setServMode] couldn't get server mode info:\n\t${err}`)
        obj= undefined
    }
    return obj
}

function _cmd_mapInfo(cmdObj,clearanceLvl,utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);
    
    // if(!_kartingClearanceCheck(message, utils, `${sub_cmd} ${args[0]}`, clearanceLvl)) return false
    let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, "maps-skins")
    let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f)
    if(!my_utils.AuthAllowed_noData(missingAuth_f)){
        return auth_retCode
    }

    if(!Boolean(kart_settings) || !Boolean(kart_settings.config_commands)){
        hereLog(`[fetchInfos] bad config…`);
        message.reply("❌ Internal error")
        return E_RetCode.ERROR_INTERNAL;
    }

    var mapObj= __cmd_fetchJsonInfo(kart_settings.config_commands.maps_info)

    if(!(Boolean(mapObj)) || !(Boolean(mapObj.maps))){
        hereLog(`[mapInfos] couldn't fetch maps infos…`)
        message.reply("❌ Data access error")
        return E_RetCode.ERROR_INTERNAL
    }    
    
    
    var mapIDs= Object.keys(mapObj.maps)
    
    var options= args
    var search_terms= []
    var i_ls= args.indexOf('ls')
    if (i_ls>=0){
        options= args.slice(0,i_ls)
        search_terms= args.slice(i_ls+1)
    }

    var b_num= false
    
    var lookup_f= 0
    for(var opt of options){
        if (["battle","bottle","b"].includes(opt)){
            lookup_f= lookup_f | 1
        }
        else if(["section","sec","s"].includes(opt)){
            lookup_f= lookup_f | 2
        }
        else if(["hell","h"].includes(opt)){
            lookup_f= lookup_f | 4
        }
        else if(["discard","discarded","ban","banned","d"].includes(opt)){
            lookup_f= lookup_f | 8
        }
        else if(["all","a","everymap","each"].includes(opt)){
            lookup_f= (~ 0)
        }
        else {
            b_num= ['num','much','count','n','number'].includes(opt)
        }
    }

    var mapIDs= mapIDs.filter(mapID => {
        var map= mapObj.maps[mapID]

        var matching_f= 
            ((map.type=='Battle')?1:0) | ((map.sections)?2:0) |
            ((map.hell)?4:0) | (map.type=="Discarded"?8:0)

        return (
            ( (lookup_f==(~0)) || (
                    ( (matching_f & (1|4|8))==(lookup_f & (1|4|8)) ) &&
                    ( ((!(lookup_f & 2)) || (map.sections)) ) //&& 
                    //map.type=="Race"
                )
            ) &&
            (
                (search_terms.length<=0) || (
                    search_terms.some(st =>{
                        var lc_st= st.toLowerCase()
                        return (
                            mapID.toLowerCase().includes(lc_st) ||
                            map.title.toLowerCase().includes(lc_st) ||
                            map.zone.toLowerCase().includes(lc_st) ||
                            map.subtitle.toLowerCase().includes(lc_st)
                        )
                    })
                )
            )
        )
    })

    var l_ret= mapIDs.map(mapID => {
        var map= mapObj.maps[mapID]
        return `🔹 [MAP${mapID}]: *${map.title} ${map.zone}*`+
                `${(map.subtitle && map.subtitle.length>0)?` (*${map.subtitle}*)`:''}`+
                `${(Boolean(map.hell))?" > HELL <":""}`
    })

    if (l_ret.length>0 && !b_num)
        message.reply(`Found ${l_ret.length} maps:\n\n${l_ret.join('\n')}`, {split: true})
    else if (l_ret.length>0)
        message.reply(`Found ${l_ret.length} maps!`)
    else
        message.reply(`No map found…`)

    return auth_retCode
}

function _cmd_skinInfo(cmdObj,clearanceLvl,utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    // if(!_kartingClearanceCheck(message, utils, `${sub_cmd} ${args[0]}`, clearanceLvl)) return false
    let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, "maps-skins")
    let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f)
    if(!my_utils.AuthAllowed_noData(missingAuth_f)){
        return auth_retCode
    }

    if(!Boolean(kart_settings) || !Boolean(kart_settings.config_commands)){
        hereLog(`[fetchInfos] bad config…`);
        message.reply("❌ Internal error")
        return E_RetCode.ERROR_INTERNAL;
    }

    var skinObj= __cmd_fetchJsonInfo(kart_settings.config_commands.skins_info)

    if((!Boolean(skinObj)) || (!Boolean(skinObj.skins))){
        hereLog(`[mapInfos] couldn't fetch maps infos…`)
        message.reply("❌ Data access error")
        return E_RetCode.ERROR_INTERNAL
    }

    var skinNames= Object.keys(skinObj.skins)
    
    var options= args
    var search_terms= []
    var i_ls= args.indexOf('ls')
    if (i_ls>=0){
        options= args.slice(0,i_ls)
        search_terms= args.slice(i_ls+1)
    }

    var b_num= false
    
    var speed_lookup= undefined
    var weight_lookup= undefined
    for(var opt of options){
        var match= undefined
        if(Boolean(match=opt.match(/^s(pe+d)?([0-9]{1,2}):?$/))){
            var sp= Number(match[2])
            speed_lookup= (isNaN(sp))?undefined:sp
        }
        else if(Boolean(match=opt.match(/^w(eigh?t?h?)?([0-9]{1,2}):?$/))){
            var wt= Number(match[2])
            weight_lookup= (isNaN(wt))?undefined:wt
        }
        else if(Boolean(match=opt.match(/^[0-9]{1,2}$/))){
            var n= Number(match[0])
            if (!isNaN(n)){
                if (speed_lookup==undefined) speed_lookup= n
                else if (weight_lookup==undefined) weight_lookup= n
            }
        }
        else{
            b_num= ['num','much','count','n','number'].includes(opt)
        }
    }

    skinNames= skinNames.filter(skinName => {
        skin= skinObj.skins[skinName]

        return (
            (speed_lookup==undefined || skin.speed==speed_lookup) &&
            (weight_lookup==undefined || skin.weight==weight_lookup) &&
            (search_terms.length<=0 || (
                search_terms.some(st =>{
                    var lc_st= st.toLowerCase()
                    return (
                        skinName.toLowerCase().includes(lc_st) ||
                        skin.realname.toLowerCase().includes(lc_st)
                    )
                })
            ))
        )
    })

    var l_ret= skinNames.map(skinName =>{
        skin= skinObj.skins[skinName]

        return `🔸 *${skin.realname}* (\`${skinName}\`) [${skin.speed}, ${skin.weight}]`
    })


    var response= `No skin found…`
    if (l_ret.length>0)
        response= `Found ${l_ret.length} skins!`

    var alert= undefined
    if (Boolean(skinObj.alert) && (alert=Number(skinObj.alert))
        && !isNaN(alert) && alert>127
    ){
        response+= `!\n\t⚠ Skins limit reached (*some skins might be missing*)!`
    }

    if (l_ret.length>0 && !b_num)
        response+= `\n\n${l_ret.join('\n')}`
        

    message.reply(response, {split: true})

    return auth_retCode
}

function __api_generateUserPrivilegedToken(user, clearanceLvl){
    var key= undefined
    if(Boolean(kart_settings.api && kart_settings.api.token_keys)){
        if(clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE &&
            Boolean(kart_settings.api.token_keys.adminkey)
        ){
            key= kart_settings.api.token_keys.adminkey
        }
    }
    if( (!Boolean(kart_settings.api && kart_settings.api.token_keys))
        || (clearanceLvl<CLEARANCE_LEVEL.ADMIN_ROLE && !Boolean(key=kart_settings.api.token_keys.discorduserkey))
        || (clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE && !Boolean(key=kart_settings.api.token_keys.adminkey))
    ){
        hereLog(`[api_priviledged_tokens] couldn't get proper token for clearanceLvl ${clearanceLvl}...`)
        return undefined
    }

    let auth= {
        role: (clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE)?'ADMIN':'DISCORD_USER',
        id: user.id
    }

    return jwt.sign({auth}, key, {expiresIn: '1m'})
}

async function _clipsState(){
    if(Boolean(kart_settings.api) && Boolean(kart_settings.api.host)){
        let api_info_addr=`${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}${kart_settings.api.root}/clips?perPage=1`

        hereLog(`[clipsCount] Asking API ${api_info_addr}…`);
        return (await axios.get(api_info_addr).then(response => {
            if(response.status===200){
                return {
                    clipsNumber: response.data.availableClipsCount,
                    last_clip: response.data.clips[0]
                }
            }
            else if(response.status===204){
                hereLog(`[clipsCount] got 204 - ${JSON.stringify(response.data)}`)
                throw "no clips found"
            }
            else{
                hereLog(`[clipsCount] bad api response on '${api_info_addr}'`)
                throw "Bad API reponse"
            }
        }) )
    }
    else {
        hereLog(`[clipsCount] bad api settings`)
        throw "Bad api - no api set in settings…"
    }
}

function _send_clipsState(message, utils){
    let missingAuth_f= utils.checkAuth(message, ["clips","info"])
    let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f)
    if(!my_utils.AuthAllowed_noData(missingAuth_f)){
        return auth_retCode
    }

    return _clipsState().then(info => {
        embed= {}
        embed.fields= []
        embed.title= `Strashthèque`
        embed.description= "Collection de clips de Strashbot Karting!"
        embed.url= `${kart_settings.web_page.base_url}/${kart_settings.web_page.clips_page}`
        embed.fields.push({
            name: "Number of clips",
            value: `${info.clipsNumber}`,
            inline: false
        })
        embed.fields.push({
            name: "Last clip",
            value: `${kart_settings.web_page.base_url}/${kart_settings.web_page.clips_page}?clip=${info.last_clip._id}`,
            inline: true
        })
        embed.thumbnail= { url: "https://strashbot.fr/img/clips_thumb.png" }

        message.reply({embeds: [embed]})

        return auth_retCode
    }).catch(err => {
        hereLog(`[clipState] trying to get clips state - ${err}`)
        message.reply(`Error while fetching clips infos... :()`)

        return E_RetCode.ERROR_INTERNAL
    })
}

async function __send_clipInfo_req(clipID, message, utils){
    let api_clip_addr=`${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}${kart_settings.api.root}/clip/${clipID}`

    let missingAuth_f= utils.checkAuth(message, ["clips","info"])
    let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f)
    if(!my_utils.AuthAllowed_noData(missingAuth_f)){
        return auth_retCode
    }

    return axios.get(api_clip_addr).then(async response => {
        if(response.status===200){
            let clip= response.data

            var embed= {}
            embed.title= `Strashthèque clip id: ${clipID}`
            embed.url= `${kart_settings.web_page.base_url}/${kart_settings.web_page.clips_page}?clip=${clipID}`
            embed.timestamp=clip.timestamp
            if(Boolean(clip.thumbnail)) embed.thumbnail= { url: clip.thumbnail }
            if(Boolean(clip.description)) embed.description= clip.description
            if(Boolean(clip.submitter_id)){
                await message.guild.members.fetch(clip.submitter_id).then(m =>{
                    var name= (Boolean(m.nickname) && m.nickname.length>0)?m.nickname:m.user.username

                    embed.author= {
                        name,
                        iconURL: m.displayAvatarURL
                    }
                }).catch(err =>{
                    hereLog(`[clip info] couldn't find user ${clip.submitter_id} on this guild ${message.guild}: ${err}`)
                })
            }
            embed.fields= [
                {name: "Type", value: clip.type, inline: false},
                {name: "Direct link", value: clip.url, inline: true}
            ]
            embed.footer= { text: "Published on https://strashbot.fr/gallery.html"}

            message.reply({embeds: [embed]})
            return auth_retCode
        }
        else{
            hereLog(`[clipApiInfo] bad api response on '${api_clip_addr}' - status: ${response.status}`)
            return E_RetCode.ERROR_INTERNAL
        }
    }).catch(err =>{
        if(err.response.status===404){
            hereLog(`[clipApiInfo] got 404 - ${JSON.stringify(err.response.data)}`)

            message.author.send(`[${message.guild}] **Clip not found**: No clip was found under id: ${clipID} …`)
            return E_RetCode.ERROR_INPUT
        }
        else{
            hereLog(`[clipApiInfo] api error on '${api_clip_addr}' - ${err}`)
            return E_RetCode.ERROR_INTERNAL
        }
    })
}

async function _cmd_clip_api(cmdObj, clearanceLvl, utils){
    if(!(Boolean(kart_settings.api) && Boolean(kart_settings.api.host))){
        return E_RetCode.ERROR_INTERNAL
    }

    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    let msg_url_rgx= /^<?(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+>?$/;


    let __description_clean= ( async (txt, guild) =>{
        var rx_customEmoji= /<:(.+?):\d+>/g
        var rx_channelMention_id= /<#(\d+)>/g
        var rx_userMention_id= /<@(\d+)>/g
        var rx_groupMention_id= /<@&(\d+)>/g

        var r= txt.replace('"','').replace('\\','').slice(0,250).replace(rx_customEmoji, "$1")

        var ___name_lookups={
            "members": (x) =>{
                var n= null
                return (Boolean(n=x.nickname))? n : x.user.name;
            },
            "*": (x) => {return x.name;}
        }

        var ___process_discord_objs= (async (txt, regex, guild_attr) => {
            var res= txt
            var tmp= null
            if (Boolean(tmp=r.match(regex))){
                var replace_table= []
                for (var pattern in tmp){
                    var m_id= null, id= null, name= null
                    if(Boolean(m_id=pattern.match(/\d+/)) && Boolean(id=m_id[0])){
                        await guild[guild_attr].fetch(id).then(obj =>{
                            name= ___name_lookups(guild_attr)
                        }).catch(err =>{
                            hereLog(`[clip][decription processing] error trying to fetch name of '${pattern}' - ${err}`)
                        })
                    }
                    name= (Boolean(name) && name.length>0)?name:"-unknown-"

                    replace_table.push([pattern, name])
                }
                for (var replacement in replace_table){
                    res= res.replace(replacement[0],replacement[1])
                }
            }

            return res
        })

        r= (await ___process_discord_objs(r, rx_channelMention_id, "channels"))
        r= (await ___process_discord_objs(r, rx_userMention_id, "members"))
        r= (await ___process_discord_objs(r, rx_groupMention_id, "groups"))

        return r
    })

    let has_attachments= Boolean(message.attachments) && message.attachments.size>=1;

    var add_opt= {desc: ""}
    if(args.length>0){
        if(args[0].toLowerCase()==="info"){
            let c_id= parseInt(args[1])
            if(isNaN(c_id)){
                return await _send_clipsState(message, utils)
            }
            else{
                return (await __send_clipInfo_req(c_id, message, utils))
            }
        }
        else if ((!isNaN(parseInt(args[0]))) && !has_attachments){
            return (await __send_clipInfo_req(parseInt(args[0]), message, utils))
        }
        else if(["rm","del","delete","remove","delete"].includes(args[0].toLowerCase())){
            let missingAuth_f= utils.checkAuth(message, ["clips","manage"])
            let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f, false)
            if(!my_utils.AuthAllowed_dataOnly(missingAuth_f)){
                return auth_retCode
            }
            
            let c_id= parseInt(args[1])
            if(args.length<2 || isNaN(c_id)){
                message.author.send(`[${message.guild}] command \`!kart ${sub_cmd}\` needs a "clipID" as argument`)
                return ERROR_INPUT
            }

            let api_clip_addr=`${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}${kart_settings.api.root}/clip/${c_id}`

            token= __api_generateUserPrivilegedToken(message.author, clearanceLvl)
            if(!Boolean(token)){
                message.author.send(`[${message.guild}] unable to grant necessary privileges to remove clip id: ${c_id}`)

                return E_RetCode.ERROR_REFUSAL
            }

            return (await axios.delete(api_clip_addr, {headers: {'x-access-token': token}, data: {submitter_id: message.author.id}})
                .then(async response => {
                    if(response.status===200){
                        return auth_retCode
                    }
                    else{
                        hereLog(`[clipApiRemove] bad api response on '${api_clip_addr}' - status: ${response.status}`)
                        return E_RetCode.ERROR_INTERNAL
                    }
                }).catch(err =>{
                    if(err.response.status===403){
                        message.author.send(`[${message.guild}]{403} you lack necessary privileges to remove clip id: ${c_id}`)
                        return E_RetCode.ERROR_REFUSAL
                    }
                    else if(err.response.status===404){
                        message.reply(`[${message.guild}]{404} **Clip not found**: No clip was found under id: ${c_id} …`)
                        return E_RetCode.ERROR_INPUT
                    }
                    else{
                        hereLog(`[clipApiRemove] api error on '${api_clip_addr}' - ${err}`)
                        return E_RetCode.ERROR_INTERNAL
                    }
                })
            )
        }
        else if(["edit","desc","description","text"].includes(args[0].toLowerCase())){
            let missingAuth_f= utils.checkAuth(message, ["clips","manage"])
            let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f, false)
            if(!my_utils.AuthAllowed_dataOnly(missingAuth_f)){
                return auth_retCode
            }
            
            let c_id= parseInt(args[1])
            if(args.length<2 || isNaN(c_id)){
                message.author.send(`[${message.guild}] command \`!kart ${sub_cmd}\` needs a "clipID" as argument`)
                return E_RetCode.ERROR_INPUT
            }

            let desc= ""
            if(args.length>=3){
                desc= await __description_clean(args.slice(2).join(' '), message.guild).then(r=> {return r})
                        .catch(err=> {
                            hereLog(`[clipApiDescEdit] error cleaning description: ${err}`)
                            return ""
                        })
            }

            let api_clip_addr=`${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}${kart_settings.api.root}/clip/${c_id}`

            token= __api_generateUserPrivilegedToken(message.author, clearanceLvl)
            if(!Boolean(token)){
                message.author.send(`[${message.guild}] unable to grant necessary privileges to remove clip id: ${c_id}`)

                return E_RetCode.ERROR_INPUT
            }

            let data= {submitter_id: message.author.id, description: desc}
            return (await axios.put(api_clip_addr, data, {headers: {'x-access-token': token}})
                .then(async response => {
                    if(response.status===200){
                        return auth_retCode
                    }
                    else{
                        hereLog(`[clipApiEdit] bad api response on '${api_clip_addr}' - status: ${response.status}`)
                        return E_RetCode.ERROR_INTERNAL
                    }
                }).catch(err =>{
                    if(err.response.status===403){
                        message.author.send(`[${message.guild}]{403} you lack necessary privileges to access clip id: ${c_id}`)

                        return E_RetCode.ERROR_REFUSAL
                    }
                    else if(err.response.status===404){
                        message.reply(`[${message.guild}]{404} **Clip not found**: No clip was found under id: ${c_id} …`)
                        return E_RetCode.ERROR_INPUT
                    }
                    else{
                        hereLog(`[clipApiEdit] api error on '${api_clip_addr}' - ${err}`)
                        return E_RetCode.ERROR_INTERNAL
                    }
                })
            )
        }
        else if(Boolean(args[0].match(msg_url_rgx))){
            add_opt.url= args[0]
            add_opt.desc= (await __description_clean(args.slice(1).join(' '), message.guild));
        }
        else if(Boolean(message.attachments) && message.attachments.size>=1){
            add_opt.url= message.attachments.first().url;
            add_opt.desc= (await __description_clean(args.join(' '), message.guild));
        }
    }
    else if(has_attachments){
        add_opt.url= message.attachments.first().url;
    }
    else{
        return await _send_clipsState(message, utils)
    }

    if(Boolean(add_opt.url)){
        add_opt.url= add_opt.url.match(/^<*(.*)>*$/)[1]

        let api_clip_addr=`${kart_settings.api.host}${(Boolean(kart_settings.api.port)?`:${kart_settings.api.port}`:'')}${kart_settings.api.root}/clip/new`

        let missingAuth_f= utils.checkAuth(message, ["clips","manage"])
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f, false)
        if(!my_utils.AuthAllowed_dataOnly(missingAuth_f)){
            return auth_retCode
        }

        token= __api_generateUserPrivilegedToken(message.author, clearanceLvl)
        if(!Boolean(token)){
            message.author.send(`[${message.guild}] unable to grant necessary privileges to add new clip`)

            return E_RetCode.ERROR_REFUSAL
        }


        let data= {submitter_id: message.author.id, description: add_opt.desc, url: add_opt.url}
        return (await axios.post(api_clip_addr, data, {headers: {'x-access-token': token}})
            .then(async response => {
                if(response.status===200){
                    return auth_retCode
                }
                else{
                    hereLog(`[clipApiAdd] bad api response on '${api_clip_addr}' - status: ${response.status}`)
                    return E_RetCode.ERROR_INTERNAL
                }
            }).catch(async err =>{
                if(err.response.status===403){
                    message.author.send(`[${message.guild}]{403} you lack necessary privileges to add new clip`)
                    return E_RetCode.ERROR_REFUSAL
                }
                else if(err.response.status===440){
                    message.author.send(
                        `[${message.guild}]{440} the url/file to try to register as clip isn't valid:\n`+
                        `Please only:\n\t* youtube links\n\t* streamable.com links\n\t* .gif,.mp4,.webm links/file`
                    )
                    return E_RetCode.ERROR_INPUT
                }
                else if(err.response.status===400){
                    message.author.send(
                        `[${message.guild}]{400} missing or invalid url?`
                    )
                    return E_RetCode.ERROR_INPUT
                }
                else if(err.response.status===441){
                    hereLog(`[clipApiAdd] bad identification for user ${author.id} - ${JSON.stringify(response.data)}`)
                    return E_RetCode.ERROR_REFUSAL
                }
                else if(err.response.status===409){
                    message.author.send(
                        `[${message.guild}]{409} clip '${add_opt.url}' already exist using url?`
                    )

                    if(Boolean(response.data && response.data.resource)){
                        f_c_id= err.response.data.resource.split('/')[2]

                        return (await __send_clipInfo_req(f_c_id, message, utils))
                    }

                    return E_RetCode.ERROR_REFUSAL
                }
                else{
                    hereLog(`[clipApiAdd] api error on '${api_clip_addr}' - ${err}`)
                    return E_RetCode.ERROR_INTERNAL
                }
            })
        )
    }
    else{
        hereLog(`[clipApi] no action found…`)

        return E_RetCode.ERROR_INPUT
    }
}


async function cmd_main(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let args= cmdObj.args;

    if(["run","launch","start","go","vroum"].includes(args[0])){
        let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, "start-stop-restart")
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f, false)
        if(!my_utils.AuthAllowed_dataOnly(missingAuth_f)){
            return auth_retCode
        }

        if(_isServerRunning()){
            str="Server SRB2Kart is already running…";
            message.reply(str);
        }
        else{
            var success= _startServer();

            if(!success){
                _stopServer(true);
                message.reply(`[kart command] unable to start SRB2Kart server…`);

                return E_RetCode.ERROR_INTERNAL;
            }

            return auth_retCode;
        }
    }
    else if(["halt","quit","stop","nope","kill","shutdown","done"].includes(args[0])){
        // if(!_kartingClearanceCheck(message, utils, args[0], clearanceLvl)) return false
        let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, "start-stop-restart")
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f, false)
        if(!my_utils.AuthAllowed_dataOnly(missingAuth_f)){
            return auth_retCode
        }
        res= _stopServer( args.length>1 && args[1]==="force" );
        if(res!=="error"){
            if(res==="populated"){
                message.reply("There might be some players remaining on Strashbot srb2kart server…\n"+
                    "Are you sure you want to stop the server?\n"+
                    `If so use: \`!kart stop force\``
                );
                return E_RetCode.ERROR_REFUSAL;
            }
            else{
                message.reply("Strashbot srb2kart server stopped…");
                return auth_retCode;
            }
        }
        else{
            message.reply("Error while trying to stop server… 😰");
            return E_RetCode.ERROR_INTERNAL;
        }
    }
    else if(["restart","retry","re","again","relaunch"].includes(args[0])){
        // if(!_kartingClearanceCheck(message, utils, args[0], clearanceLvl)) return false
        let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, "start-stop-restart")
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f, false)
        if(!my_utils.AuthAllowed_dataOnly(missingAuth_f)){
            return auth_retCode
        }

        var b_force= ( args.length>1 && args.includes("force"));
        var res= _restartServer(b_force);
        if(res==="error"){
            var str="Error while restarting server…"
            if (_isServerRunning()){
                str+="\n\tServer seems to remain active…";
            }
            else{
                str+="\n\tServer seems stopped… ";
            }
            message.reply(str);
            return E_RetCode.ERROR_INTERNAL;
        }
        else{
            if(res==="populated"){
                message.reply("There might be some players remaining on Strashbot srb2kart server…\n"+
                    "Are you sure you want to restart the server?\n"+
                    `If so use: \`!kart restart force\``
                );
                return E_RetCode.ERROR_REFUSAL;
            }

            return auth_retCode;
        }
    }
    else if(["password","pwd","access","admin"].includes(args[0])){
        // if(!_kartingClearanceCheck(message, utils, args[0], clearanceLvl)) return false
        let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, "start-stop-restart")
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f, false)
        if(!my_utils.AuthAllowed_dataOnly(missingAuth_f)){
            return auth_retCode
        }

        if(!_isServerRunning()){
            message.reply(`Aucun serveur SRB2Kart actif…`);
            return E_RetCode.ERROR_INTERNAL;
        }

        pwd= _getPassword();
        message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`)
        return auth_retCode;
    }
    else if(["server","info","about","?"].includes(args[0])){
        let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, "info")
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f)
        if(!my_utils.AuthAllowed_noData(missingAuth_f)){
            return auth_retCode
        }

        var embed= {}
        embed.title=
            (Boolean(args[1]))?
                    `${args[1]}${(Boolean(args[2]))?`:${args[2]}`:''}`
                :   "Strashbot server";
        embed.color= 0xff0000 //that's red (i hope? this rgba, right?)

        return await _askServInfos(args[1], args[2]).then(serverInfos => {
            embed.fields=[];

            var ret_code= auth_retCode
            if(Boolean(serverInfos.service_status) && serverInfos.service_status==="DOWN"){
                embed.color= 0x808080
                embed.fields=[]
                embed.fields.push({
                    name: "Strashbot server",
                    value: "Le serveur semble inactif…",
                    inline: false
                })
                embed.thumbnail= {
                    url: 'http://strashbot.fr/img/server/inactive_thumb.png'
                }
            }
            else if(Boolean(serverInfos)){
                var ss= serverInfos.server
                if(Boolean(ss) && Boolean(ss.servername)
                    && ss.servername.length>0
                ){
                    embed.title= `${ss.servername}`
                }
                if(Boolean(ss) && Boolean(ss.application)
                    && ss.application.length>0
                ){
                    embed.footer= {
                        text:
                            `---\n${ss.application}` +
                            `${(Boolean(ss.version) && Boolean(ss.subversion))?
                                ` v${ss.version}.${ss.subversion}`
                            :   ''
                            }`
                    }
                }

                if(Boolean(serverInfos) && Boolean(serverInfos.thumbnail)){
                    embed.thumbnail= {
                        url: serverInfos.thumbnail
                    }
                }

                if(Boolean(serverInfos) && Boolean(serverInfos.address)){
                    embed.fields.push({
                        name: 'Adresse de connexion',
                        value: `\`${serverInfos.address}\``,
                        inline: true
                    })
                }

                embed.fields.push({
                    name: 'Map',
                    value:
                        `${Boolean(ss)?
                            `${ss.mapname} - *${ss.maptitle}*`
                        :   'erreur'
                        }`,
                    inline: true
                })
                embed.fields.push({
                    name: "Population",
                    value:
                        `${Boolean(ss)?
                            `${ss.numberofplayer} / ${ss.maxplayer}`
                        :   'erreur'
                        }`,
                    inline: true
                })

                if(Boolean(ss) && [2,3].includes(ss.gametype)){
                    embed.fields.push({
                        name: (ss.gametype===2)?'KartSpeed':'Gametype',
                        value: (ss.gametype===2 && Boolean(ss.kartspeed))?
                                ss.kartspeed
                            :   "Battle",
                        inline: true
                    })
                }

                var modes= 
                    (Boolean(serverInfos.modes) && Boolean(serverInfos.modes.status=="OK"))?
                        ( Boolean(serverInfos.modes.modes)? serverInfos.modes.modes : [] )
                    :   undefined;
                if(Boolean(modes) && modes.length>0){
                    embed.fields.push({
                        name: "Modes",
                        value: modes.join('; '),
                        inline: false
                    })
                }

                var players= [], spectators= []
                var sp= serverInfos.players
                if(Boolean(sp) && sp.length>0){
                    for (var player of sp){
                        if(!Boolean(player.team) || player.team.length<=0
                            || player.team==="UNKNOWN"
                        )
                            continue
                        else if(player.team==="SPECTATOR"){
                            spectators.push(player.name)
                        }
                        else{
                            players.push(player.name)
                        }
                    }
                }
                var s_players='-', s_spectators='-'
                if(players.length>0){
                    s_players=''
                    for(var name of players){
                        s_players+= `*${name}*;\t `
                    }
                }
                if(spectators.length>0){
                    s_spectators=''
                    for(var name of spectators){
                        s_spectators+= `*${name}*;\t `
                    }
                }

                embed.fields.push({
                    name: "Players",
                    value: s_players,
                    inline: false
                })
                embed.fields.push({
                    name: "Spectators",
                    value: s_spectators,
                    inline: false
                })
            }
            else{
                hereLog(`[ !kart info ] Bad info from API…`)

                embed.color= 0x808080
                embed.fields=[]
                embed.fields.push({
                    name: "Erreur",
                    value: "Problème lors de la récupération des infos…",
                    inline: false
                })
                embed.thumbnail= {
                    url: 'https://cdn-icons-png.flaticon.com/512/7706/7706689.png'
                }

                ret_code= E_RetCode.ERROR_INTERNAL
            }

            message.reply({embeds: [embed]})

            return ret_code;
        }).catch(err => {
            hereLog(`[ !kart info ] No serv info - ${err}`)
            embed.color= 0x808080
            embed.fields=[]
            embed.fields.push({
                name: "Offline",
                value: "Le serveur semble injoignable…",
                inline: false
            })
            embed.thumbnail= {
                url: 'https://cdn-icons-png.flaticon.com/512/8018/8018865.png'
            }
            
            message.reply({embed: embed})
            return auth_retCode;
        }) 
    }
    else if(["code","source","git"].includes(args[0])){
        if(Boolean(kart_settings) && Boolean(kart_settings.source_url)){
            message.reply(`SRB2Kart server manager source at: <${kart_settings.source_url}>`);
            
            return E_RetCode.SUCCESS;
        }
        else{
            message.reply(`Unavailable…`);

            return E_RetCode.ERROR_INTERNAL;
        }
    }
    else if (["addons","add-ons","addon","add-on","module","modules","mod","mods"].includes(args[0])){
        return (await _cmd_addons(cmdObj, clearanceLvl, utils))
    }
    else if (["config","startup"].includes(args[0])){
        return (await _cmd_config(cmdObj, clearanceLvl, utils))
    }
    else if (["addon_load","addon_order","order","load_sequence"].includes(args[0])){
        return (await _cmd_addon_load(cmdObj, clearanceLvl, utils))
    }
    else if (["log","logs","log.txt"].includes(args[0])){
        let missingAuth_f= utils.checkAuth(cmdObj.msg_obj, "logs")
        let auth_retCode= my_utils.MissingAuthFlag_to_CmdRetCode(missingAuth_f)
        if(!my_utils.AuthAllowed_noData(missingAuth_f)){
            return auth_retCode
        }

        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.get_log);
            str= child_process.execSync(cmd, {timeout: 16000}).toString();
        }
        catch(err){
            hereLog("Error while looking for log.txt: "+err);
            str= undefined
        }

        
        if(Boolean(str)){
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                if(Boolean(kart_settings.http_url) ){
                    message.reply(`Server's last recorded logs: ${kart_settings.http_url}/${str}`)
                    return auth_retCode;
                }
                else{
                    message.reply("❌ server internal error");
                    return E_RetCode.ERROR_INTERNAL;
                }
            }
            else{
                message.reply(`Server's last recorded logs:`,
                    {files: [{
                        attachment: `${str}`,
                        name: `log.txt`
                    }]}
                );
                return auth_retCode;
            }
        }
        else{
            message.reply("❌ server internal error");
            return E_RetCode.ERROR_INTERNAL;
        }
    }
    else if(["clip","clips","replay","replays","video","vid","videos"].includes(args[0])){
        return (await _cmd_clip_api(cmdObj,clearanceLvl,utils));
    }
    else if(["map","maps","race","races","level","levels","stage","stages"].includes(args[0])){
        return _cmd_mapInfo(cmdObj,clearanceLvl,utils);
    }
    else if(["skin", "skins", "char", "chara" ,"perso", "character", "racer", "racers", "characters"].includes(args[0])){
        return _cmd_skinInfo(cmdObj,clearanceLvl,utils);
    }
    else if (args[0]==="help"){
        return cmd_help(cmdObj, clearanceLvl)
    }

    return false;
}


function cmd_help(cmdObj, clearanceLvl){
    
    cmdObj.msg_obj.author.send(
        `\nFollowing commands are only usable depending on the guild (*${cmdObj.message.guild.name}*)'s auth configuration.\n`+
        "\tRead the rules & ask your local admins where & how to uses these commands."+
        "\t*(commands that are liste with a preceeding 😎 are commands for 'priviledged users' only*)\n\n"+
        "😎\t`!kart start`\n\n"+
        "\tTry to start the SRB2Kart server.\n\tIf success, the server password is send via private message.\n\n"+
        "😎\t`!kart stop`\n\n"+
        "\tIf active, attempt to stop the SRB2Kart server.\n\n"+
        "😎\t`!kart restart`\n\n"+
        "\tAttempt to restart the SRB2Kart server.\n"+
        "\t⚠ **_Note:** the SRB2Kart server will automatically shutdown at 4 am. It will restart at 8 am, __unless__ it was stopped manually.\n\n"+
        "😎\t`!kart password`\n\n"+
        "\tRequest to recieve the password of the active (if any) SRB2Kart server.\n\n"+
        "\t`!kart info`\n\n"+
        "\tDisplay whether of not the SRB2Kart server is running along with its ownership\n"+
        "\tAlso displays the server's ip address.\n\n"+
        "\t`!kart maps ['hell'] ['ban'] ['section'] ['battle'] [ls <pattern>]`\n\n"+
        "\tDisplays a list of maps installed on the srb2kart server\n"+
        "\t\t- Use options `hell`, `ban`, `section`, `battle` to respectively display 'hell maps', 'banned map', section 'maps' or 'battle maps'.\n"+
        "\t\t- Use options the `ls` subcommand to look for a map corresponding to a text pattern. Example:\n"+
        "\t\t\t`!kart maps ls green`\n\n"+
        "\t`!kart skins [[w]{0-9}] [ls <pattern>]`\n\n"+
        "\tDisplays a list of skins installed on the srb2kart server\n"+
        "\t\t- Use options the `ls` subcommand to look for a skin corresponding to a text pattern. Example:\n"+
        "\t\t\t`!kart skins ls sonic`\n\n"+
        "\t`!kart log`\n\n"+
        "\tAllows to download the latest log file generated by the server.\n\n"+
        "\t`!kart source`\n\n"+
        "\tSource code for the used server manager\n\n"+
        "\t`!kart help`\n\n"+
        "\tDisplay this help (PM)\n\n",
        {split: true}
    );
    cmdObj.msg_obj.author.send(
        "---\n*SRB2Kart server's addons management:*\n\n"+
        "\t`!kart addons ls [pattern]`\n\n"+
        "\tList all availabe addons under three categories:\n"+
        "\t\t*[Temporary]*: addons that will removed once the current session (or next one if no server is running) is over\n"+
        "\t\t*[Downloaded]*: addons that were added manually\n"+
        "\t\t*[Base]*: addons that are loaded by default\n"+
        "\tIf `[pattern]` is given, this command will search for matching pattern amongs availabe addons.\n"+
        "\t\texample: `!kart addons ls rayman`\n\n"+
        "😎\t`!kart addons add [url]`\n\n"+
        "\tThe addon must be an attachment to the same message as the command, and have a valid addon extension (.pk3,.lua,.wad,.kart)\n\n"+
        "\t⚠ If the kart server is running, this addon will be added under the *[temporary]* section until next session…\n\n"+
        "😎\t`!kart addons rm <addon_filename>`\n\n"+
        "\tRemove the addon designated by the given name from the server.\n"+
        "\t⚠ this only works for addons under the *[downloaded]* section!\n\n"+
        "\t`!kart addons link`\n\n"+
        "\tGet the link to DL a zip archives that contains all of the addons\n\n"+
        "\t`!kart addon_load get`\n\n"+
        "\tAllows to download the current config file that sets rules to set the order in which the addons load when the server starts\n\n"+
        "😎\t`!kart addon_load set`\n\n"+
        "\tDownloads a new version of the addon load order config file onto the server\n"+
        "\t⚠ The new version of the file must be provided as a file attachment to the same message as the command as a text file.\n\n"+
        "\t__Example of `addon_load _order_config.txt`__: making sure *addonA* is loaded firt, *addonB* last, and *addonC* before *addonD*\n"+
        "```\nFIRST: \"addonA.pk3\"\n\"addonC.wad\" < \"addonD.pk3\"\n\"\"LAST: \"addonB.pk3\"\n```\n"
    );
    cmdObj.msg_obj.author.send(
        "----\n*SRB2Kart server's startup config management:*\n\n"+
        "\t`!kart config get`\n\n"+
        "\tAllows to download the current `startup.cfg` config script executed when server starts\n\n"+
        "😎\t`!kart config set`\n\n"+
        "\tDownloads a new version of the `startup.cfg` config script onto the server\n"+
        "\t⚠ The new version of the script must be provided as a file attachment to the same message as the command, and must have `.cfg` extension.\n"+
        "\t⚠ When this config script is downloaded, some commands are filtered out of the script rendering them ineffective.\n"+
        "\t\tYou can obtain a list of said forbidden srb2kart configuration commands with the command below.\n\n"+
        "\t`!kart config filter`\n\n"+
        "\tGives a list of all forbidden srb2kart configuration commands that are filtered out of the `startup.cfg` config startup script.\n\n"
    );
    // cmdObj.msg_obj.author.send(
    //     "----\n*SRB2Kart server's time record management:*\n\n"+
    //     "\t`!kart time`\n\n"+
    //     "\tLists all the maps that have a time record submitted.\n\n"+
    //     "\t`!kart time [map name]`\n\n"+
    //     "\tLists all the time that were submitter for a given map.\n\n"+
    //     "\t`!kart time add`\n\n"+
    //     "\tAdds a new time record on the server given the .lmp file was provided as a message attachment. (One per person per map)\n\n"+
    //     "\t⚠ The new time record must be provided as a file attachment to the same message as the command, and must have `.lmp` extension.\n"+
    //     "\t`!kart time rm [map name]`\n\n"+
    //     "\tRemoves a time record you have submitted for a given map.\n\n"+
    //     "\t`!kart time get [map name]`\n\n"+
    //     "\tLink to download uploaded times for a given map.\n\n"
    // );
    cmdObj.msg_obj.author.send(
        "----\n*SRB2Kart server's clips library management:*\n\n"+
        "\t`!kart clip`\n\n"+
        "\tAdds a clip `.gif|.ogg|.webm|.mp4`, provided as a message attachement, to the library. (Only `.gif|.ogg|.webm|.mp4` files)\n\n"+
        "\t`!kart clip info [clip_id]`\n\n"+
        "\tPrint infos for a given clip. (The id of said clip should be displayed in the gallery page)\n\n"+
        "\t`!kart clip rm <clip_id>`\n\n"+
        "\t Removes a given clip from the gallery. (The id of said clip should be displayed in the gallery page)\n"+
        "\t __Note:__ only an admin or the person that referenced the clip in the first place can remove said clip\n\n"+
        "\t`!Kart clip description [bla bla bla]`\n\n"+
        "\tEdit the description of a given clip. (The id of said clip should be displayed in the gallery page)\n\n"
    );
    return E_RetCode.SUCCESS;
}


async function cmd_event(eventName, utils){
}


function cmd_guild_clear(guild){}

function cmd_destroy(utils){
    hereLog("destroy…");
    if(Boolean(stop_job)){
        delete stop_job;
        stop_job= undefined;
    }
    if(Boolean(start_job)){
        delete start_job;
        start_job= undefined;
    }
    if(Boolean(status_job)){
        delete status_job;
        status_job= undefined;
    }
}


module.exports.name= ['kart'];
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear, destroy: cmd_destroy};
