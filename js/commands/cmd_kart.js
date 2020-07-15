
const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;
const splitString= require('../utils').splitString;

const child_process= require("child_process");
const fs= require( 'fs' );
const path= require( 'path' );
const request = require('request');
const urlExistSync = require("url-exist-sync");

const os = require('os');
const ifaces = os.networkInterfaces();

const {Attachment} = require('discord.js');



let hereLog= (...args) => {console.log("[cmd_kart]", ...args);};

var kart_settings= undefined;

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
                    Boolean(srv_cmd.server_addr) && Boolean(srv_cmd.distant_user)?
                        (`ssh ${srv_cmd.distant_user}@${srv_cmd.server_addr}`+
                            ((srv_cmd.server_port)?` -p ${srv_cmd.server_port}`:'')
                            + ` ${command}`
                        )
                    :       "false"
                :   command
            :   "false";
}

function _stopServer(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.stop))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.stop)
        child_process.execSync(cmd, {timeout: 16000});
        b= true;
    }
    catch(err){
        hereLog("Error while stopping server: "+err);
        b= false;
    }
    return b;
}

function _startServer(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.server_commands.start))?cmd:"false";
        var cmd= __kartCmd(kart_settings.server_commands.start)
        child_process.execSync(cmd, {timeout: 16000});
        b= true;
    }
    catch(err){
        hereLog("Error while launching server: "+err);
        b= false;
    }
    return b;
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

function _initAddonsConfig(){
    b= false;
    try{
        // var cmd= (Boolean(kart_settings) && Boolean(cmd=kart_settings.config_commands.init))?cmd:"false";
        var cmd= __kartCmd(kart_settings.config_commands.init)
        child_process.execSync(cmd, {timeout: 16000});
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
        child_process.execSync(cmd, {timeout: 16000});
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
        str= child_process.execSync(cmd+` ${arg}`, {timeout: 16000}).toString();
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

function cmd_init(utils){
    if(!Boolean(kart_settings=__loadingJSONObj("data/kart.json"))){
        hereLog("Not able to load 'kart.json' setting…");
    }
    _initAddonsConfig();
}


async function cmd_init_per_guild(utils, guild){
    var servOwner= utils.settings.get(guild, "serv_owner");
    var m_owner= undefined;
    if( Boolean(servOwner) &&
        (!Boolean(m_owner= await guild.fetchMember(servOwner)) || !_isServerRunning())    
    ){
        utils.settings.remove(guild, "serv_owner");
    }

    var chanKart= utils.settings.get(guild, 'kart_channel');
    var channel= undefined;
    if(!Boolean(chanKart) || !Boolean(channel= guild.channels.get(chanKart))){
        if(Boolean(m_owner)){
            var chanKart= utils.settings.remove(guild, 'serv_owner');
            if(_isServerRunning()){
                _stopServer();
            }
        }
    }
}

async function __downloading(channel, url, destDir, utils, fileName=undefined){
    var filename= (!Boolean(fileName))? url.split('/').splice(-1)[0] : fileName;

    let _serv_run= _isServerRunning();
    // if (_serv_run && !permanent){
    //     channel.send(`❌ Il est futil d'ajouter un addon *temporaire* alors qu'une session est déjà en cours…`);
    //     return;
    // }

    if (!urlExistSync(url)){
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

    // if(!Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ||
    //     (permanent && !Boolean(kart_settings.dirs.dl_dirs.permanent)) ||
    //     (!permanent && !Boolean(kart_settings.dirs.dl_dirs.temporary))
    // ){
    //     _error();

    //     return;
    // }

    if(Boolean(dl_msg)){
        // let filepath= kart_settings.dirs.main_folder+'/'+
        //     ((permanent)?kart_settings.dirs.dl_dirs.permanent:kart_settings.dirs.dl_dirs.temporary)
        //     +'/'+filename;
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

                if(_serv_run){
                    var servOwner= utils.settings.get(channel.guild, "serv_owner");
                    var owner= undefined;
                    var str= `\`${filename}\` a bien été ajouté au serveur.\n`+
                        `Cependant, il ne peut être utilisé pour une session déjà en cours`;
                    channel.send(str+'.')         
                }
                else{
                    channel.send(`\`${filename}\` a bien été ajouté et sera disponible prêt à l'emploi lors de la prochaine session.`);
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

    
    if (!urlExistSync(url)){
        channel.send(`❌ L'url \`${url}\` ne semble pas exister…`);
        return
    }
    var addr=undefined, dUser=undefined;
    if(!Boolean(addr=kart_settings.server_commands.server_addr) || !Boolean(dUser=kart_settings.server_commands.distant_user)){
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

                    if(_isServerRunning()){
                        var servOwner= utils.settings.get(channel.guild, "serv_owner");
                        var owner= undefined;
                        var str= `\`${filename}\` a bien été ajouté au serveur.\n`+
                            `Cependant, il ne peut être utilisé pour une session déjà en cours`;
                        channel.send(str+'.')         
                    }
                    else{
                        channel.send(`\`${filename}\` a bien été ajouté et sera disponible prêt à l'emploi lors de la prochaine session.`);
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
                message.channel.send(`'${args[1]}' is not a recognized instruction or url…`);

                return false;
            }
        }

        if(Boolean(args[1]) && args[1].match(url_rgx)){
            url= args[1]            
        }
        else if(Boolean(message.attachments) && message.attachments.size>=1){
            url= message.attachments.first().url;
        }

        let ext= [".pk3",".wad",".lua",".kart",".pk7"];
        var _ls="";
        if((_ls=_listAddonsConfig(url.split('/').splice(-1)[0]))!=="No result found…"){
            message.channel.send(`The following addons already exist on server:\n${_ls}`);

            return false;
        }
        else if(!Boolean(url) || !ext.some(e => {return url.endsWith(e)})){
            message.channel.send(`Seuls les fichiers addons d'extension \`${ext}\` sont acceptés…`)

            return false;
        }
        else if (!Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ||
            (!_serv_run && !Boolean(kart_settings.dirs.dl_dirs.permanent)) ||
            !Boolean(kart_settings.dirs.dl_dirs.temporary)
        ){
            hereLog("[addons add] no dest directory for addon dl");
            message.channel.send(`❌ server internal error`);

            return false;
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
                message.channel.send(`❌ An error as occured, can't properly add \`${filename}\` to the server addons…`);

                return false;
            }

            return true;
        }
    }
    else if(["keep","perma","fixed","final"].includes(args[0])){
        if(Boolean(args[1])){
            var str= undefined
            var b=false;
            try{
                var cmd= __kartCmd(kart_settings.config_commands.keep);
                str= child_process.execSync(cmd+` ${args[1]}`, {timeout: 16000}).toString();
                b=true;
            }
            catch(err){
                hereLog("Error while keeping addons: "+err);
                str= undefined
            }

            if(b && Boolean(str)){
                message.channel.send(str);

                return true;
            }
            else{
                message.channel.send(`Unable to move addon *${args[1]}* to **temporary** section${(Boolean(str))?`:\n\t${str}`:"…"}`);

                return false;
            }
        }
    }
    else if(["rm","remove","del","delete","suppr"].includes(args[0])){
        if(Boolean(args[1])){
            var resp= _removeAddonsConfig(args[1]);
            if(Boolean(resp) && resp[0] && Boolean(resp[1])){
                message.channel.send("Removed addons for srb2kart server:\n"+resp[1]);
                if(_updateAddonsConfig()){
                    return true;
                }
                else{
                    hereLog("Error occured when updating addons after 'rm' call")
                    return false;
                }
            }
            else{
                message.channel.send(`❌ Unable to remove${(Boolean(resp[1]))?(`:\n*\t${resp[1]}*`):"…"}`);
                return false;
            }
        }
    }
    else if(["list","ls","all","what","which"].includes(args[0]) || !Boolean(args[0])){
        var list= _listAddonsConfig((Boolean(args[1]))?args[1]:"");
        if(Boolean(list)){
            if(!Boolean(args[1]) && Boolean(kart_settings) && Boolean(kart_settings.http_url)){
                list+=`\n\nStrashbobt addons download: ${kart_settings.http_url}/strashbot_addons.zip`
            }

            var resp= "Addons list for srb2kart server:\n"+list;
            var _many_resp= splitString(resp);
            if (_many_resp.length>1){
                for (var i=0; i<_many_resp.length; ++i){
                    await message.channel.send(`${_many_resp[i]}`);
                }
            }
            else{
                message.channel.send("Addons list for srb2kart server:\n"+list);
            }
            return true;
        }
        else{
            return false;
        }
    }
    else if(["dl","links","link","zip","archive"]){
        if(!Boolean(args[1]) && Boolean(kart_settings) && Boolean(kart_settings.http_url)){
            message.channel.send(`You can try downloading the SRB2Kart server's addons at: ${kart_settings.http_url}/strashbot_addons.zip`);
            return true;
        }
        else{
            message.channel.send(`Addons direct download link unavailable, sorry… 😩`);
            return false;
        }
    }

    return false;
}

// async function __uploading_cfg(channel, url){
//     if(!Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder)){
//         return
//     }

//     if (!urlExistSync(url)){
//         channel.send(`❌ L'url \`${url}\` ne semble pas exister…`);
//         return
//     }

//     let filename= "new_startup.cfg"
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
//                     var cmd= __kartCmd(kart_settings.config_commands.change_config);
//                     str= child_process.execSync(cmd+` ${filepath}`, {timeout: 4000}).toString();
//                 }
//                 catch(err){
//                     hereLog("Error while keeping addons: "+err);
//                     str= undefined
//                 }

//                 if(Boolean(str)){
//                     let options= (str==="updated")? {} :
//                         {
//                             files: [{
//                                 attachment: `${str}`,
//                                 name: `startup.cfg.diff`
//                             }]
//                         }
//                     if(_isServerRunning()){
//                         channel.send(`\`startup.cfg\` a bien été mis à jour.\n`+
//                             `Cependant, celan n'aura aucun effet pour la session déjà en cours`,
//                             options
//                         );
//                     }
//                     else{
//                         channel.send(`\`startup.cfg\` a bien été mis à jour et sera effectif lors de la prochaine session.`,
//                                 options
//                         );
//                     }
//                 }
//                 else{
//                     channel.send(`❌ internal error while trying to update *startup.cfg*…`);
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

async function _cmd_config(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let sub_cmd= cmdObj.args[0]
    let args= cmdObj.args.slice(1);

    if(args.length===0 || ["get","dl","download","check"].includes(args[0])){
        var str= undefined
        try{
            var cmd= __kartCmd(kart_settings.config_commands.get_config);
            str= child_process.execSync(cmd, {timeout: 16000}).toString();
        }
        catch(err){
            hereLog("Error while keeping addons: "+err);
            str= undefined
        }

        if(Boolean(str)){
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                if(Boolean(kart_settings.http_url)){
                    message.channel.send(`Srb2kart server's startup user config file: ${kart_settings.http_url}/${str}`);
                    return true;
                }
                else{
                    message.channel.send("❌ Can't access srb2kart server's config file…")
                    return false;
                }
            }
            else if(fs.existsSync(str)){
                message.channel.send("Srb2kart server's startup user config file:",
                    {
                        files: [{
                            attachment: `${str}`,
                            name: `startup.cfg`
                        }]
                    }
                );

                return true;
            }
            else{
                message.channel.send("❌ Can't access server's config file…")
                return false;
            }
        }
        else{
            message.channel.send("❌ Server internal error…")
            return false;
        }
    }
    else if(["set","up","ul","upload","change"].includes(args[0])){
        if(Boolean(message.attachments) && message.attachments.size>=1){
            var url= message.attachments.first().url;
            
            if ( !Boolean(kart_settings) || !Boolean(kart_settings.dirs.main_folder) ){
                hereLog("[cfg upload] no dest directory for cfg dl");
                message.channel.send(`❌ server internal error`);
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
                    message.channel.send(`❌ internal error preventing .cfg upload…`);
                    
                    return false;
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
                    let options= (str==="updated" && !kart_settings.server_commands.through_ssh)?
                        {
                            files: [{
                                attachment: `${str}`,
                                name: `startup.cfg.diff`
                            }]
                        } : {}
                    if(_isServerRunning()){
                        message.channel.send(`\`startup.cfg\` a bien été mis à jour.\n`+
                            `Cependant, celan n'aura aucun effet pour la session déjà en cours\n` +
                            ( (kart_settings.server_commands.through_ssh)?
                                `\nDiff: ${kart_settings.http_url}/startup.cfg.diff`
                                : "Diff generated file" ),
                            options
                        );
                    }
                    else{
                        message.channel.send(
                            ( (kart_settings.server_commands.through_ssh)?
                                `\nDiff: ${kart_settings.http_url}/startup.cfg.diff`
                                : "Diff generated file" ),
                            options
                        );
                    }
                }
                else{
                    message.channel.send(`❌ internal error while trying to update *startup.cfg*…`);
                }

                return true;
            }
            else{
                message.channel.send("❌ only .cfg files…");
                return false;
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
            message.channel.send(`Forbidden commands within *custom configuration startup script*:\n\t${str}`);
            return true;
        }
        else{
            message.channel.send("❌ server internal error");
            return false;
        }
    }

    return false;
}

async function ___stringFromID(guild, id){
    var member= await guild.fetchMember(id)

    if(Boolean(member)){
        if(Boolean(member.nickname)){
            return member.nickname;
        }
        else{
            return member.user.username;
        }
    }
    else return undefined;
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
                str= child_process.execSync(cmd, {timeout: 16000}).toString();
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
                str= child_process.execSync(cmd+` ${mapName}`, {timeout: 16000}).toString();
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
                    hereLog(`\t[base_cmd]i= ${i}`)
                    switch (i%9){
                    case 0:
                    {
                        hereLog(`\t[base_cmd]case 0`)
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
                        files= `${lines[i][2]} files: ${lines[i].substring(5,200)+((lines[i].length>=100)?"…":"")}`

                        ret+= `\`${time}\` by ${by} (from ${name}) with ${wth} (${stats})\n`
                        ret+= `\t\t${files}\n`
                    }
                    }
                }

                ret=(ret.lenght>1900)?(ret.substring(0,1900)+"\n[…]"):ret;

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
                    str= child_process.execSync(cmd+` ${filepath} ${id}`, {timeout: 16000}).toString();
                }
                catch(err){
                    hereLog("Error while adding time: "+err);
                    str= undefined
                }

                var _f_str= str
                if(Boolean(str) && ( ( (typeof(str)==='string') && str.startsWith("ADDED")) || (str=str.toString()).startsWith("ADDED") ) ){
                    channel.send( _f_str );
                }
                else{
                    channel.send(`❌ internal error while trying to add recorded time [${str}]`);
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
            str= child_process.execSync(cmd+` ${mapname}`, {timeout: 16000}).toString();
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

        match= str.match(/ZIPPED - (\/((.+)\/)*.+)/)
        var path= undefined;
        if(Boolean(match) && Boolean(path=match[1]) && fs.existsSync(path)){
            if(Boolean(kart_settings.server_commands) && kart_settings.server_commands.through_ssh){
                if(Boolean(kart_settings.http_url) ){
                    message.channel.send(`"Submitted time for **${mapname}**: ${http_url}/${path}`)
                    
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
            str= child_process.execSync(cmd+` ${message.author.id} ${mapname}`, {timeout: 16000}).toString();
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

async function cmd_main(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let args= cmdObj.args;
    if(args[0]==="channel" && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        if(args[1]==="clear"){
            utils.settings.remove(message.guild, 'kart_channel');

            if(_isServerRunning()){
                _stopServer();
            }

            return true;
        }
        else if(args[1]==="which"){
            var chanKart= utils.settings.get(message.guild, 'kart_channel');
            var channel= undefined;
            if(!Boolean(chanKart) || !Boolean(channel=message.guild.channels.get(chanKart))){
                message.author.send("No channel set as *dedicated srb2kart channel*…");

                return true;
            }
            else{
                message.author.send(`Channel \"${channel}\" is set as the *dedicated srb2kart channel*…`);

                return true;
            }
        }
        var channel= undefined
        if(!Boolean(message.mentions) || !Boolean(message.mentions.channels) || !Boolean(channel=message.mentions.channels.first())){
            message.member.send("[kart command] No mention to any channel found… Format is:\n\t`!karthannel #channelmention`");

            return false;
        }

        utils.settings.set(message.guild, 'kart_channel', channel.id);

        return true;

    }
    else{
        var chanKart= utils.settings.get(message.guild, 'kart_channel');
        if(!Boolean(chanKart) || chanKart!==message.channel.id){
            message.member.send(`[kart command] command \`!kart ${args[0]}\` only possible in dedicated kart channel…`);
            return false;
        }

        if(["run","launch","start","go","vroum"].includes(args[0])){
            if(_isServerRunning()){
                str="Server SRB2Kart is already running…";

                var servOwner= utils.settings.get(message.guild, "serv_owner");
                var owner= undefined;
                if(!Boolean(servOwner) || !Boolean(owner= await utils.getBotClient().fetchUser(servOwner))){
                    str+=`\n\t⚠ No SRB2Kart server owner set. (use \`!kart claim\` to take admin privileges)`;
                }
                else{
                    str+=`\n\t*Server owner is ${owner}*`;
                }
                message.channel.send(str);
            }
            else{
                var success= _startServer();

                if(!success){
                    _stopServer();
                    message.member.send(`[kart command] unable to start SRB2Kart server…`);

                    return false;
                }

                if( args.length>1 && ["lone","void","stand","alone","free","standalone"].includes(args[1])){
                    message.channel.send("Strashbot srb2kart server started…\n"+
                        "\t⚠ No SRB2Kart server owner set. (use \`!kart claim\` to take admin privileges)"
                    );
                }
                else{
                    pwd= _getPassword();
                    utils.settings.set(message.guild, "serv_owner", message.member.id);
                    message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`);
                    message.channel.send("Strashbot srb2kart server started…");
                }

                return true;
            }
        }
        else if(["halt","quit","stop","nope","kill","shutdown"].includes(args[0])){
            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if( (!Boolean(servOwner) || !Boolean(owner= await utils.getBotClient().fetchUser(servOwner))) ||
                ((clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE) || (owner.id===message.author.id))
            ){
                _stopServer();
                message.channel.send("Strashbot srb2kart server stopped…");
                utils.settings.remove(message.guild, "serv_owner");
                return true;
            }
            else{
                message.channel.send("Seule la personne qui a lancé le serveur SRB2Kart peut le stopper…");
                return false;
            }
        }
        else if(["password","pwd","access","admin"].includes(args[0])){
            if(!_isServerRunning()){
                message.channel.send(`Auncun serveur SRB2Kart actif…`);
                return false;
            }

            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if( (clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE) || 
                (Boolean(servOwner) && Boolean(owner= await utils.getBotClient().fetchUser(servOwner)) && (owner.id===message.author.id) )
                || !Boolean(servOwner) || !Boolean(owner)
            ){
                pwd= _getPassword();
                message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`)
                return true;
            }

            return false;
        }
        else if(["takeover","claim","seize","force","own","lock","lead","control","ctrl"].includes(args[0])){
            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if(!_isServerRunning()){
                message.channel.send(`Auncun serveur SRB2Kart actif…`);
                return false;
            }
            if( (clearanceLvl>CLEARANCE_LEVEL.ADMIN_ROLE)
                || !Boolean(servOwner) || !Boolean(owner= await utils.getBotClient().fetchUser(servOwner))
            ){
                pwd= _getPassword();
                await message.member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`);
                utils.settings.set(message.guild, "serv_owner", message.member.id);
                message.channel.send(`Nouvel admin désigné du serveur SRB2Kart: ${message.member.user}…`);

                return true;
            }
            else{
                message.channel.send(`Le serveur SRB2Kart a toujours un admin désigné (${owner})…`);

                return false;
            }

        }
        else if(["give","chown","transfer"].includes(args[0])){
            var member= undefined
            if(!Boolean(message.mentions) || !Boolean(message.mentions.members) || !Boolean(member=message.mentions.members.first())){
                message.member.send(`[kart command] No mention to any user found… Format is:\n\t\`!kart ${args[0]} @usermention\``);

                return false;
            }

            if(!_isServerRunning()){
                message.channel.send(`Auncun serveur SRB2Kart actif…`);
                return false;
            }

            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if( (clearanceLvl>=CLEARANCE_LEVEL.ADMIN_ROLE) ||
            ( Boolean(servOwner) && Boolean(owner= await utils.getBotClient().fetchUser(servOwner)) && owner.id===message.author.id)
            ){
                pwd= _getPassword();
                member.send(`Server admin password: \`${pwd}\`\n\tUne fois connecté au serveur SRB2Kart, ingame, utilise la commande \`login ${pwd}\` pour accéder à l'interface d'admin!`);
                utils.settings.set(message.guild, "serv_owner", member.id);
                message.channel.send(`Nouvel admin désigné du serveur SRB2Kart: ${member}…`);

                return true
            }
            else{
                message.member.send(`Only the owner of the SRB2Kart server (or discord guild admin) can transfer ownership…`);

                return false;
            }
        }
        else if(["leave","quit","ragequit","unlock","disown","alone","gone","flee","john"].includes(args[0])){
            if(!_isServerRunning()){
                message.channel.send(`Auncun serveur SRB2Kart actif…`);
                return false;
            }

            var servOwner= utils.settings.get(message.guild, "serv_owner");
            var owner= undefined;
            if( (clearanceLvl<=CLEARANCE_LEVEL.ADMIN_ROLE) ||
            ( Boolean(servOwner) && Boolean(owner= await utils.getBotClient().fetchUser(servOwner)) && owner.id===message.author.id)
            ){
                utils.settings.remove(message.guild, "serv_owner");
                message.channel.send(`⚠ Le serveur SRB2Kart n'a plus d'admin désigné… 😢\n`+
                    `\t⚠ Il faut qu'un joueur récupère la propriété en utilisant la commande \`!kart claim\`!`
                );

                return true;
            }
        }
        else if(["server","info","about","?"].includes(args[0])){
            str="";
            if(_isServerRunning()){
                str+="Strashbot SRB2Kart server is running!"

                var servOwner= utils.settings.get(message.guild, "serv_owner");
                var owner= undefined;
                if(Boolean(servOwner) && Boolean(owner= await utils.getBotClient().fetchUser(servOwner))){
                    str+=`\nL'admin désigné du serveur SRB2Kart est **${owner.username}**.`;
                }
                else{
                    str+=`\n⚠ Le serveur SRB2Kart n'a pas d'admin désigné… 😢`;
                }

                if (Boolean(kart_settings) && Boolean(kart_settings.server_commands)
                    && Boolean(kart_settings.server_commands.through_ssh)
                ){
                    var _addr= kart_settings.server_commands.server_addr
                    if(Boolean(_addr) && Boolean(_addr.match(/^([0-9]{1,3}\.){3}[0-9]{1,3}$/))){
                        str+=`\n\n\tL'adresse ip du serveur est \`${_addr}\``;
                    }
                }
                else{
                    var net= undefined;
                    if(Boolean(ifaces) && Boolean(ifaces['eth0']) && ifaces['eth0'].length>0 &&
                        ( net= ifaces['eth0'].find(nif => {return Boolean(nif['address'].match(/^([0-9]{1,3}\.){3}[0-9]{1,3}$/))}) )
                    ){
                        str+=`\n\n\tL'adresse ip du serveur est \`${net['address']}\``;
                    }
                }
            }
            else{
                str+="Strashbot SRB2Kart server is inactive!";
            }

            if(str){
                message.channel.send(str);
                return true;
            }
        }
        else if (["addons","add-ons","addon","add-on","module","modules","mod","mods"].includes(args[0])){
            return (await _cmd_addons(cmdObj, clearanceLvl, utils))
        }
        else if (["config","startup"].includes(args[0])){
            return (await _cmd_config(cmdObj, clearanceLvl, utils))
        }
        else if (["log","logs","log.txt"].includes(args[0])){
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
                        message.channel.send(`Server's last recorded logs: ${kart_settings.http_url}/${str}`)
                        return true;
                    }
                    else{
                        message.channel.send("❌ server internal error");
                        return false;
                    }
                }
                else{
                    message.channel.send(`Server's last recorded logs:`,
                        {files: [{
                            attachment: `${str}`,
                            name: `log.txt`
                        }]}
                    );
                    return true;
                }
            }
            else{
                message.channel.send("❌ server internal error");
                return false;
            }
        }
        else if(['timetrial','timeattack','time','tt', 'ta'].includes(args[0])){
            return _cmd_timetrial(cmdObj, clearanceLvl, utils);
        }
        else if (args[0]==="help"){
            return cmd_help(cmdObj, clearanceLvl)
        }
    }

    return false;
}


function cmd_help(cmdObj, clearanceLvl){
    cmdObj.msg_obj.author.send(
        "⚠ **_IMPORTANT:_** SRB2Kart server is exclusively for Strasbourg Smasher's usage. Please **always** shutdown the server (`!kart stop`) once the playing session is over\n\n"+
        `__**kart** command___:\n\n`+
        ((clearanceLvl<CLEARANCE_LEVEL.ADMIN)? "": ("**Admins only (usable in other channels):**\n\n"+
            "\t`!kart channel #channelmention`\n\n"+
            "\tset which channel gets to be the *designated srb2kart channel*\n\n"+
            "\t`!kart channel clear`\n\n"+
            "\tunset the *designated srb2kart channel*\n\n"+
            "\t`!kart channel which`\n\n"+
            "\ttells which channel is set as the *designated srb2kart channel*\n\n"+
            "**All users commands:**\n"
        )) +
        "**Following commands are only usable in the designated \"srb2kart channel\"!**\n\n"+
        "\t`!kart start ['stand']`\n\n"+
        "\tTry to start the SRB2Kart server.\n\tIf success, the server password is send via private message, the reciever is considered as the *designated admin* of the server.\n"+
        "\t  If the optional argument `stand` is given, the server will have *__no__ designated admin*…\n\n"+
        "\t`!kart stop`\n\n"+
        "\tIf active, attempt to stop the SRB2Kart server.\n\n"+
        "\t`!kart password`\n\n"+
        "\tRequest to recieve the password of the active (if any) SRB2Kart server. (guild admin or designated SRB2Kart server admin only)\n\n"+
        "\t`!kart claim`\n\n"+
        "\tClaim the vacant ownership of the current running (if any) SRB2Kart server. (guild admin or designated SRB2Kart server admin only)\n\n"+
        "\t`!kart transfer @usermention`\n\n"+
        "\tGive the ownership of the current running (if any) SRB2Kart server to the mentionned user. (guild admin or designated SRB2Kart server admin only)\n\n"+
        "\t`!kart leave`\n\n"+
        "\tGive up the ownership of the current running (if any) SRB2Kart server, leaving it vacant. (designated SRB2Kart server admin only)\n\n"+
        "\t`!kart info`\n\n"+
        "\tDisplay whether of not the SRB2Kart server is running along with its ownership\n"+
        "\tAlso displays the server's ip address.\n\n"+
        "\t`!kart log`\n\n"+
        "\tAllows to download the latest log file generated by the server.\n\n"+
        "\t`!kart help`\n\n"+
        "\tDisplay this help (PM)\n\n"
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
        // "\t`!kart addons add [url]`\n\n"+
        // "\tDownload an addon onto the server.\n\tIf `[url]` is used, the url must point directly at a file of valid extension (.pk3,.lua,.wad,.kart)"+
        // " example: `https://url/bla/bla/addon.pk3`\n\tIf no url is given, the addon must be an attachment to the same message as the command, and still"+
        // " have a valid addon extension (.pk3,.lua,.wad,.kart)\n"+
        // "\t⚠ This addon will be added under the *[temporary]* section, meaning it will be removed after next sessions ends.\n\n"+
        "\t`!kart addons add [url]`\n\n"+
        "\tThe addon must be an attachment to the same message as the command, and have a valid addon extension (.pk3,.lua,.wad,.kart)\n\n"+
        "\t⚠ If the kart server is running, this addon will be added under the *[temporary]* section until next session…\n\n"+
        // "\t`!kart addons add keep [url]`\n\n"+
        // "\tSame as the previous command, except that the addons will be added into the *[downloaded]* section. Meaning it wont be removed"+
        // " automatically after a session ends.\n\n"+
        // "\t`!kart addons keep <addon_filename>`\n\n"+
        // "\tMove an addon from the *[temporary]* section to the *[downloaded]* section.\n\n"+
        "\t`!kart addons rm <addon_filename>`\n\n"+
        "\tRemove the addon designated by the given name from the server.\n"+
        "\t⚠ this only works for addons under the *[downloaded]* section!\n\n"+
        "\t`!kart addons link`\n\n"+
        "\tGet the link to DL a zip archives that contains all of the addons\n\n"
    );
    cmdObj.msg_obj.author.send(
        "----\n*SRB2Kart server's startup config management:*\n\n"+
        "\t`!kart config get`\n\n"+
        "\tAllows to download the current `startup.cfg` config script executed when server starts\n\n"+
        "\t`!kart config set`\n\n"+
        "\tDownloads a new version of the `startup.cfg` config script onto the server\n"+
        "\t⚠ The new version of the script must be provided as a file attachment to the same message as the command, and must have `.cfg` extension.\n"+
        "\t⚠ When this config script is downloaded, some commands are filtered out of the script rendering them ineffective.\n"+
        "\t\tYou can obtain a list of said forbidden srb2kart configuration commands with the command below.\n\n"+
        "\t`!kart config filter`\n\n"+
        "\tGives a list of all forbidden srb2kart configuration commands that are filtered out of the `startup.cfg` config startup script.\n\n"
    );
    cmdObj.msg_obj.author.send(
        "----\n*SRB2Kart server's time record management:*\n\n"+
        "\t`!kart time`\n\n"+
        "\tLists all the maps that have a time record submitted.\n\n"+
        "\t`!kart time[map name]`\n\n"+
        "\tLists all the time that were submitter for a given map.\n\n"+
        "\t`!kart time add`\n\n"+
        "\tAdds a new time record on the server given the .lmp file was provided as a message attachment. (One per person per map)\n\n"+
        "\t⚠ The new time record must be provided as a file attachment to the same message as the command, and must have `.lmp` extension.\n"+
        "\t`!kart time rm [map name]`\n\n"+
        "\tRemoves a time record you have submitted for a given map.\n\n"
    );
    return true;
}


function cmd_event(eventName, utils){
    if(eventName==="channelDelete"){
        var channel= arguments[2];

        var chanKart= utils.settings.get(channel.guild, 'kart_channel');
        if(!Boolean(chanKart)) return false;

        if(channel.id===chanKart){
            if(!_isServerRunning()){
                _stopServer();
            }

            utils.settings.remove(channel.guild, 'kart_channel');
            utils.settings.remove(channel.guild, "serv_owner");

            return true;
        }

        return false;
    }
    else if(eventName==="guildMemberUpdate"){
        var member= arguments[2];

        var servOwner= utils.settings.get(member.guild, "serv_owner");
        var m_owner= undefined;
        if( Boolean(servOwner) && Boolean(await (m_owner= member.guild.fetchMember(servOwner))) && m_owner.id===member.id){
            utils.settings.remove(member.guild, "serv_owner");

            if(_isServerRunning()){
                var chanKart= utils.settings.get(member.guild, 'kart_channel');
                var channel= undefined;
                if(Boolean(chanKart) && Boolean(channel= member.guild.channels.get(chanKart))){
                    channel.send(`⚠ Le serveur SRB2Kart n'a plus d'admin désigné… 😢`+
                        `\t⚠ Il faut qu'un joueur récupère la propriété en utilisant la commande \`!kart claim\`!`
                    );
                }
            }
        }
    }
}


function cmd_guild_clear(guild){}


module.exports.name= ['kart'];
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};